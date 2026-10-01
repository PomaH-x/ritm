/** ИИ-коуч: собирает контекст, просит разбор, хранит историю и предложения по плану */
import { addTask, db, saveLog, saveSphere } from '../db';
import { dayReport, loadBundle, recentRepeats, weekReport } from '../lib/report';
import { dur } from '../lib/stats';
import { addDays, fmtDayLong, fmtWeekRange, logicalNow, WD_LONG, weekday, weekStartOf } from '../lib/time';
import type { LogEntry } from '../types';
import { chat, getCoachConfig, LlmError, type Msg } from './llm';
import { egeFocus, PLAN_CONTEXT } from './plan';

export type Kind = 'day' | 'week';

export interface Proposal {
  type: 'norm' | 'task';
  sphere?: string;
  value?: number;
  title?: string;
  reason?: string;
  status?: 'new' | 'applied' | 'dismissed';
}

export interface CoachLog {
  text: string;
  proposals: Proposal[];
  thread: { q: string; a: string }[];
  model: string;
  at: number;
}

export const coachSection = (k: Kind) => (k === 'day' ? 'coach-day' : 'coach-week');

const TONE = `Тон зависит от состояния каждой сферы.
— Жёсткий тренер: если в сфере просрочка (норма недели не выполнена или сильно отстаёт, задача висит больше недели, пропущена тренировка по плану), грубое нарушение правила плана или срыв повторяется два раза и чаще за неделю. Говори прямо и коротко, без смягчений и без оправданий за него, называй цену срыва для цели. Без унижений и оскорблений.
— Поддерживающий наставник: если в сфере всё хорошо или промах единичный и небольшой. Отметь, что получилось, спокойно подскажи, как поправить.
В одном разборе тоны сочетаются: жёстко про провалы, тепло про успехи.
Если несколько дней подряд низкие энергия и настроение или сон сильно меньше нормы — не дави, сначала восстановление; при признаках проблем со здоровьем советуй врача. Медицинских диагнозов не ставь.`;

function system(kind: Kind, date: string) {
  const format = kind === 'day'
    ? `Формат ответа (Markdown, не больше 180 слов):
**Итог дня** — 1–2 предложения.
**Хорошо** — 1–3 пункта.
**Срывы** — пункты: что не так и чем это мешает цели. Если срывов нет — пропусти раздел.
**Завтра** — 1–3 конкретных действия с привязкой к расписанию завтрашнего дня.`
    : `Формат ответа (Markdown, не больше 350 слов):
**Итог недели** — оценка 1–10 и 1–2 предложения.
**По сферам** — по одной строке на сферу: ✅, ⚠️ или ❌, затем вывод.
**Закономерности** — что повторяется и почему, если видно по данным.
**План на следующую неделю** — ровно 3 конкретных пункта.`;
  return `Ты — личный коуч Романа по его плану развития. Отвечай по-русски, на «ты». Опирайся только на план и присланные данные, ничего не выдумывай; если данных по сфере нет — так и скажи одной фразой и попроси заполнять. Отклонения уже посчитаны по правилам плана — не пересчитывай, а делай выводы и давай действия. Не пересказывай цифры подряд.

${TONE}

${format}

Правки плана. Если видишь системную проблему (несколько дней подряд или вся неделя), можешь предложить изменить недельную норму сферы или добавить задачу. Тогда в самом конце ответа добавь блок:
\`\`\`json
{"proposals":[{"type":"norm","sphere":"ЕГЭ","value":8,"reason":"почему"},{"type":"task","title":"что сделать","reason":"почему"}]}
\`\`\`
value — часы в неделю для часовых норм или количество раз для норм «раз». Без явной причины блок не добавляй.

Сейчас фокус подготовки к ЕГЭ: ${egeFocus(date)}.

${PLAN_CONTEXT}`;
}

/** Контекст для нейросети: отчёт + то, что нужно для выводов */
export async function buildPayload(kind: Kind, date: string): Promise<Record<string, unknown>> {
  if (kind === 'day') {
    const b = await loadBundle(addDays(date, -6), addDays(date, 1));
    const report = dayReport(b, date);
    const week = weekReport(b, weekStartOf(date), date);
    const tomorrow = addDays(date, 1);
    const wd = weekday(tomorrow);
    const byId = new Map(b.spheres.map((s) => [s.id, s]));
    const workMin = b.events.filter((e) => e.date === tomorrow && e.status !== 'skipped' && byId.get(e.sphereId ?? '')?.group === 'Работа')
      .reduce((a, e) => a + dur(e), 0);
    const firstWork = b.events.filter((e) => e.date === tomorrow && byId.get(e.sphereId ?? '')?.group === 'Работа').sort((x, y) => x.startMin - y.startMin)[0];
    return {
      ...report,
      'нормы недели на сегодня': week['нормы'],
      'повторяющиеся срывы за 7 дней': recentRepeats(b, date),
      'открытые задачи': openTasks(b.tasks, date),
      'завтра': {
        'день': WD_LONG[wd - 1],
        'спорт по плану': b.program.find((w) => !w.daily && w.weekdays.includes(wd))?.name ?? 'ежедневный минимум',
        'работа, ч': Math.round((workMin / 60) * 10) / 10,
        ...(firstWork ? { 'первое занятие': `${String(Math.floor(firstWork.startMin / 60)).padStart(2, '0')}:${String(firstWork.startMin % 60).padStart(2, '0')}` } : {}),
      },
    };
  }
  const b = await loadBundle(date, addDays(date, 6));
  const today = logicalNow().date;
  const report = weekReport(b, date, today < addDays(date, 6) ? today : addDays(date, 6));
  const json = JSON.stringify(report);
  // Бесплатные модели ограничивают размер запроса — таблицу по дням отдаём только если влезает
  if (json.length > 11000) delete report['по дням'];
  return { ...report, 'открытые задачи': openTasks(b.tasks, today) };
}

function openTasks(tasks: { title: string; done: 0 | 1; createdAt: number }[], date: string) {
  const now = new Date(date + 'T12:00:00').getTime();
  const list = tasks.filter((t) => !t.done).map((t) => {
    const days = Math.max(0, Math.round((now - t.createdAt) / 86400000));
    return days >= 7 ? `${t.title} (висит ${days} дн.)` : t.title;
  });
  return list.length ? list : 'нет';
}

function splitProposals(text: string): { text: string; proposals: Proposal[] } {
  const m = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
  if (!m) return { text, proposals: [] };
  let proposals: Proposal[] = [];
  try {
    const j = JSON.parse(m[1]) as { proposals?: Proposal[] };
    proposals = (j.proposals ?? []).filter((p) => (p.type === 'norm' && p.sphere && typeof p.value === 'number') || (p.type === 'task' && p.title))
      .map((p) => ({ ...p, status: 'new' as const }));
  } catch { /* блок не разобрался — покажем только текст */ }
  return { text: text.replace(m[0], '').trim(), proposals };
}

function contextMessage(kind: Kind, date: string, payload: unknown): Msg {
  const what = kind === 'day' ? `Разбери мой день: ${fmtDayLong(date)}.` : `Разбери мою неделю: ${fmtWeekRange(date)}.`;
  return { role: 'user', content: `${what}\nДанные:\n${JSON.stringify(payload)}` };
}

async function store(kind: Kind, date: string, v: CoachLog) {
  await saveLog(date, coachSection(kind), v as unknown as Record<string, unknown>);
}

export async function getCoachLog(kind: Kind, date: string): Promise<CoachLog | null> {
  const l = (await db.logs.get(`${coachSection(kind)}@${date}`)) as LogEntry | undefined;
  return l && !l.deleted ? (l.values as unknown as CoachLog) : null;
}

export async function review(kind: Kind, date: string): Promise<void> {
  const cfg = await getCoachConfig();
  const payload = await buildPayload(kind, date);
  const raw = await chat([{ role: 'system', content: system(kind, date) }, contextMessage(kind, date, payload)], cfg);
  const { text, proposals } = splitProposals(raw);
  await store(kind, date, { text, proposals, thread: [], model: cfg.model, at: Date.now() });
}

export async function ask(kind: Kind, date: string, question: string): Promise<void> {
  const cur = await getCoachLog(kind, date);
  if (!cur) throw new LlmError('Сначала запроси разбор.');
  const cfg = await getCoachConfig();
  const payload = await buildPayload(kind, date);
  const msgs: Msg[] = [
    { role: 'system', content: system(kind, date) + '\n\nСейчас отвечай на уточняющий вопрос: коротко, по делу, до 150 слов, формат разбора не повторяй.' },
    contextMessage(kind, date, payload),
    { role: 'assistant', content: cur.text },
    ...cur.thread.slice(-3).flatMap((t) => [{ role: 'user', content: t.q } as Msg, { role: 'assistant', content: t.a } as Msg]),
    { role: 'user', content: question },
  ];
  const raw = await chat(msgs, cfg, 1800);
  const { text, proposals } = splitProposals(raw);
  await store(kind, date, { ...cur, thread: [...cur.thread, { q: question, a: text }], proposals: [...cur.proposals, ...proposals] });
}

export async function setProposalStatus(kind: Kind, date: string, i: number, status: 'applied' | 'dismissed') {
  const cur = await getCoachLog(kind, date);
  if (!cur) return;
  const p = cur.proposals[i];
  if (status === 'applied') {
    if (p.type === 'task' && p.title) await addTask(p.title);
    if (p.type === 'norm' && p.sphere && typeof p.value === 'number') {
      const spheres = (await db.spheres.toArray()).filter((s) => !s.deleted);
      const s = spheres.find((x) => x.name.toLowerCase() === p.sphere!.toLowerCase())
        ?? spheres.find((x) => x.name.toLowerCase().includes(p.sphere!.toLowerCase()));
      if (!s) throw new LlmError(`Не нашёл сферу «${p.sphere}»`);
      const kindN = s.normKind === 'none' ? 'minutes' : s.normKind;
      await saveSphere({ ...s, normKind: kindN, normTarget: kindN === 'minutes' ? Math.round(p.value * 60) : Math.round(p.value) });
    }
  }
  const proposals = cur.proposals.map((x, j) => (j === i ? { ...x, status } : x));
  await store(kind, date, { ...cur, proposals });
}
