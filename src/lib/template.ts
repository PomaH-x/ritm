/**
 * Текстовые отчёты для чата с DeepSeek: ежедневный, еженедельный и разовая инструкция.
 * Отклонения размечает код по правилам плана ([серьёзно] / [мелочь]), чат только делает выводы.
 */
import type { FieldDef, SectionDef } from '../types';
import { classifiedWarnings, dayData, weekReport, type Bundle } from './report';
import { resolveSections } from './sections';
import { exerciseDone, fmtTarget, setsOf, targetFor } from './sport';
import { dur } from './stats';
import { addDays, fmtDayLong, fmtTime, fmtWeekRange, parseISODate, WD_LONG, weekday, weekStartOf } from './time';
import { PLAN_CONTEXT } from '../coach/plan';
import { TRIALS, trialsOf, trialText } from './ege';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ru = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v));
const empty = (v: unknown) => v === undefined || v === null || v === '';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Значение поля в человеческом виде */
function fieldText(f: FieldDef, v: unknown): string {
  switch (f.type) {
    case 'bool': return `${f.label} — ${v ? 'да' : 'нет'}`;
    case 'number': return `${f.label} ${ru(v)}${f.unit ? ' ' + f.unit : ''}`;
    case 'scale': return `${f.label} ${v}/10`;
    case 'time': return `${f.label} ${v}`;
    case 'note': return `${f.label}: «${String(v).trim()}»`;
    default: return `${f.label} — ${String(v).trim()}`;
  }
}

function sectionLine(sec: SectionDef, v: Record<string, unknown>): string {
  const parts: string[] = [];
  const checks = sec.fields.filter((f) => f.type === 'check');
  for (const f of sec.fields) {
    if (f.type === 'check' || f.type === 'note' || empty(v[f.key])) continue;
    parts.push(fieldText(f, v[f.key]));
  }
  if (checks.length) {
    const on = checks.filter((f) => v[f.key]).map((f) => f.label.toLowerCase());
    // Периодические дела (Garnier, мытьё головы) не считаем пропуском дня
    const off = checks.filter((f) => !v[f.key] && !/раз[а]? в /.test(f.hint ?? '')).map((f) => f.label.toLowerCase());
    if (on.length) parts.push('✓ ' + on.join(', '));
    if (off.length) parts.push('✗ ' + off.join(', '));
  }
  let line = `${sec.title}: ${parts.join('; ')}`;
  // Заметки — отдельными строками и только если что-то написано
  for (const f of sec.fields.filter((x) => x.type === 'note' && !empty(v[x.key]))) line += `\n  ${fieldText(f, v[f.key])}`;
  return line;
}

function openTasks(b: Bundle, date: string): string[] {
  const now = parseISODate(date).getTime();
  return b.tasks.filter((t) => !t.done).sort((a, z) => a.createdAt - z.createdAt).map((t) => {
    const days = Math.max(0, Math.round((now - t.createdAt) / 86400000));
    return days >= 7 ? `${t.title} (висит ${days} дн.)` : t.title;
  });
}

const dec = (x: unknown) => String(x).replace('.', ',');

function normsLine(norms: Obj): string {
  return Object.entries(norms).map(([name, x]) => {
    const n = x as Obj;
    const isHours = String(n['цель']).endsWith(' ч');
    const done = dec(String(n['сделано']).replace(/ ч$| раза?$/, ''));
    const target = dec(String(n['цель']).replace(/ раза?$/, ''));
    return `${name} ${done} из ${target}${isHours ? '' : ''}`;
  }).join(' · ');
}

// ---------- День ----------

export function dayTemplate(b: Bundle, date: string): string {
  const d = dayData(b, date);
  const wd = weekday(date);
  const sections = resolveSections(b.cfg);
  const L: string[] = [];

  const tracked = new Set(b.logs.filter((l) => !l.section.startsWith('coach') && l.date <= date && l.date > addDays(date, -7)).map((l) => l.date)).size;
  L.push(`📋 ОТЧЁТ ЗА ДЕНЬ — ${fmtDayLong(date)}`);
  L.push(`Дней с записями за неделю: ${tracked} из 7${tracked < 3 ? ' (выводов о привычках пока не делай)' : ''}`);
  const training = b.program.find((w) => !w.daily && w.weekdays.includes(wd));
  const plan = [training ? `тренировка «${training.name}»` : 'ежедневный минимум'];
  if (b.settings.lightWeekdays.includes(wd)) plan.push(`после ${fmtTime(b.settings.lightFromMin)} только лёгкие дела`);
  if (b.settings.restWeekdays.includes(wd)) plan.push('день отдыха с лёгкими полезными делами');
  if (wd === 3) plan.push('фастфуд разрешён (1 приём + салат + вода)');
  L.push(`По плану сегодня: ${plan.join('; ')}`);

  const warns = classifiedWarnings(b, date);
  L.push('', '⚠️ ОТКЛОНЕНИЯ');
  if (warns.length) {
    for (const w of warns) {
      const n = w['раз за 7 дней'] as number;
      L.push(`[${w['тяжесть']}] ${w['что']}${n >= 2 ? ` (${n}-й раз за неделю)` : ''}`);
    }
  } else L.push('нет');

  if (d.flags.good.length) {
    L.push('', '✅ ПО ПЛАНУ');
    for (const g of d.flags.good) L.push(`— ${g}`);
  }

  L.push('', '📊 ПО СФЕРАМ');
  const log = b.logs.find((l) => l.date === date && l.section === 'sport');
  for (const sec of sections) {
    if (sec.kind === 'sport') {
      if (!d.sport || !log) continue;
      const list = d.sport.workout ? d.sport.workout.exercises : b.program.filter((w) => w.daily).flatMap((w) => w.exercises);
      const ex = list.map((e) => {
        if (e.unit === 'check') return `${exerciseDone(log, e) ? '✓' : '✗'} ${e.name.toLowerCase()}`;
        const t = targetFor(e, weekStartOf(date), b.sportAll);
        const s = setsOf(log, e.id).filter((x): x is number => typeof x === 'number');
        if (!s.length) return `${e.name.toLowerCase()} — не сделано (цель ${fmtTarget(e, t.value)})`;
        const ok = s.length >= e.sets && s.every((x) => x >= t.value);
        return `${e.name.toLowerCase()} ${s.join(', ')}${e.unit === 'sec' ? ' с' : ''} (цель ${fmtTarget(e, t.value)}) ${ok ? '✓' : '✗'}`;
      });
      let line = `Спорт — ${d.sport.workout ? `«${d.sport.workout.name}»` : 'ежедневный минимум'}: ${ex.join('; ')}`;
      if (log.values.feeling) line += `\n  Самочувствие после: «${String(log.values.feeling).trim()}»`;
      L.push(line);
      continue;
    }
    const v = d.eff[sec.key];
    if (v) L.push(sectionLine(sec, v));
    if (sec.key === 'ege') {
      const tr = trialsOf(b.logs.find((l) => l.date === date && l.section === TRIALS));
      if (tr.length) L.push(`  Пробные варианты: ${tr.map(trialText).join('; ')}`);
    }
  }
  if (d.unfilled.length) L.push(`Не заполнено: ${d.unfilled.join(', ')}`);

  const week = weekReport(b, weekStartOf(date), date);
  if (isObj(week['нормы']) && Object.keys(week['нормы']).length) {
    L.push('', `📈 НЕДЕЛЯ НА СЕГОДНЯ (${wd} из 7 дней)`, normsLine(week['нормы'] as Obj));
  }

  const tomorrow = addDays(date, 1);
  const twd = weekday(tomorrow);
  const byId = new Map(b.spheres.map((s) => [s.id, s]));
  const work = b.events.filter((e) => e.date === tomorrow && e.status !== 'skipped' && byId.get(e.sphereId ?? '')?.group === 'Работа')
    .sort((x, y) => x.startMin - y.startMin);
  const tTraining = b.program.find((w) => !w.daily && w.weekdays.includes(twd));
  const tParts = [tTraining ? `тренировка «${tTraining.name}»` : 'ежедневный минимум'];
  if (work.length) tParts.push(`работа ${ru(Math.round(work.reduce((a, e) => a + dur(e), 0) / 6) / 10)} ч, первое занятие в ${fmtTime(work[0].startMin)}`);
  else tParts.push('занятий нет');
  L.push('', `📅 ЗАВТРА — ${WD_LONG[twd - 1]}: ${tParts.join('; ')}`);

  const tasks = openTasks(b, date);
  if (tasks.length) L.push('', `📌 ЗАДАЧИ: ${tasks.join('; ')}`);

  L.push('', 'Разбери день по формату: Итог — Хорошо — Срывы — Завтра.');
  return L.join('\n');
}

// ---------- Неделя ----------

function blockLine(o: unknown): string {
  if (!isObj(o)) return String(o);
  const vals = Object.values(o).filter((v) => !isObj(v) && !Array.isArray(v));
  if (vals.length && vals.every((v) => v === 0)) return 'записей нет';
  return Object.entries(o).filter(([, v]) => !isObj(v) && !(Array.isArray(v) && v.some(isObj)))
    .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : ru(v)}`).join('; ');
}

export function weekTemplate(b: Bundle, weekStart: string, today: string): string {
  const end = addDays(weekStart, 6);
  const upto = today < end ? today : end;
  const r = weekReport(b, weekStart, upto);
  const L: string[] = [];
  const year = parseISODate(end).getFullYear();
  L.push(`📆 ОТЧЁТ ЗА НЕДЕЛЮ — ${fmtWeekRange(weekStart)} ${year}`);
  const tracked = new Set(b.logs.filter((l) => !l.section.startsWith('coach') && l.section !== 'weekly' && l.date >= weekStart && l.date <= end).map((l) => l.date)).size;
  L.push(`Дней с записями: ${tracked} из 7${upto < end ? ` (неделя ещё идёт: ${r['дней прошло']})` : ''}`);

  if (isObj(r['нормы']) && Object.keys(r['нормы']).length) {
    L.push('', '📈 НОРМЫ');
    for (const [name, x] of Object.entries(r['нормы'] as Obj)) {
      const n = x as Obj;
      L.push(`${name}: ${dec(String(n['сделано']).replace(/ раза?$/, ''))} из ${dec(n['цель'])} (${n['выполнение']})${n['ещё запланировано'] ? `, ещё ${dec(n['ещё запланировано'])} запланировано` : ''}`);
    }
  }
  const warn = r['отклонения от плана'] as string[];
  L.push('', '⚠️ ОТКЛОНЕНИЯ ЗА НЕДЕЛЮ', ...(warn.length ? warn.map((w) => `— ${w}`) : ['нет']));
  const good = r['получилось по плану'] as string[];
  if (good.length) L.push('', '✅ ПОЛУЧИЛОСЬ', ...good.map((g) => `— ${g}`));

  const blocks: [string, string][] = [
    ['😴 СОН', 'сон'], ['🏋️ СПОРТ', 'спорт'], ['🥗 ПИТАНИЕ', 'питание'], ['💼 РАБОТА', 'работа'],
    ['📐 ЕГЭ', 'ЕГЭ'], ['♟️ ШАХМАТЫ', 'шахматы'], ['📵 ЦИФРА', 'цифровая гигиена'],
    ['💰 ФИНАНСЫ', 'финансы'], ['🚿 ГИГИЕНА', 'гигиена'],
  ];
  L.push('');
  for (const [title, key] of blocks) {
    const line = blockLine(r[key]);
    if (line) L.push(`${title}: ${line}`);
  }
  const st = r['состояние'] as Obj | undefined;
  if (st && Object.keys(st).length) {
    L.push(`🙂 СОСТОЯНИЕ: ${blockLine(st) || 'оценок нет'}`);
    const notes = st['заметки по дням'] as Obj[] | undefined;
    for (const n of notes ?? []) {
      L.push(`  ${n['день']}:${n['хорошо'] ? ` хорошо — «${n['хорошо']}»` : ''}${n['трудно'] ? `${n['хорошо'] ? ';' : ''} трудно — «${n['трудно']}»` : ''}`);
    }
  }

  const perDay = r['по дням'] as Obj[];
  if (perDay?.length) {
    L.push('', '📅 ПО ДНЯМ');
    const withLogs = new Set(b.logs.filter((l) => !l.section.startsWith('coach') && l.section !== 'weekly').map((l) => l.date));
    perDay.forEach((d, i) => {
      if (!withLogs.has(addDays(weekStart, i))) { L.push(`${d['день']}: записей нет`); return; }
      const has = (v: unknown) => v !== '—' && v !== undefined;
      const parts = [
        has(d['сон, ч']) && `сон ${ru(d['сон, ч'])} ч`,
        has(d['спорт']) && String(d['спорт']),
        has(d['ЕГЭ, мин']) && `ЕГЭ ${ru(d['ЕГЭ, мин'])} мин`,
        has(d['шахматы, мин']) && `шахматы ${ru(d['шахматы, мин'])} мин`,
        has(d['вода, л']) && `вода ${ru(d['вода, л'])} л`,
        has(d['белок, г']) && `белок ${ru(d['белок, г'])} г`,
        has(d['энергия']) && `энергия ${ru(d['энергия'])}/10`,
      ].filter(Boolean);
      L.push(`${d['день']}: ${parts.join(' · ')} (заполнено ${d['заполнено разделов']})`);
    });
  }

  const ci = r['чек-ин'] as Obj | undefined;
  if (ci && Object.keys(ci).length) {
    L.push('', '🗓️ ЧЕК-ИН');
    for (const [k, v] of Object.entries(ci)) L.push(`${k}: ${typeof v === 'number' ? `${v}/10` : `«${String(v).trim()}»`}`);
  }

  const tasks = r['задачи'] as Obj;
  const doneT = tasks['сделано за неделю'];
  const openT = openTasks(b, upto);
  if (Array.isArray(doneT) || openT.length) {
    L.push('', `📌 ЗАДАЧИ${Array.isArray(doneT) ? `\nСделано: ${doneT.join('; ')}` : ''}${openT.length ? `\nОткрыты: ${openT.join('; ')}` : ''}`);
  }

  L.push('', 'Разбери неделю по формату: Итог недели — По сферам — Закономерности — План на следующую неделю.');
  return L.join('\n');
}

// ---------- Инструкция для чата (отправляется один раз) ----------

export function instructionText(): string {
  return `Ты — мой личный коуч по плану развития. Каждый вечер я буду присылать отчёт за день, по воскресеньям — отчёт за неделю. Отчёты собирает моё приложение по правилам плана.

ТОН. В отчёте у каждого отклонения уже стоит пометка — опирайся на неё, не переоценивай:
— [серьёзно] — грубое нарушение правила плана или повтор 2+ раза за неделю: говори как жёсткий тренер. Прямо, коротко, без смягчений и без оправданий за меня, назови, чем это мешает цели.
— [мелочь] — единичный небольшой промах: как поддерживающий наставник. Спокойно, одной фразой, с подсказкой, как поправить.
— То, что получилось, — коротко отметь и похвали по делу.
Запреты: критикуй поступок, а не характер (никаких «распущенность», «лень»); слова «системно», «постоянно», «опять» — только если в отчёте есть повтор; не раздувай последствия одного дня; цели и пределы бери из плана точно (отбой 00:30 — цель, 01:00 — крайний срок). Если несколько дней подряд низкие энергия и настроение — не дави, сначала восстановление; при признаках проблем со здоровьем советуй врача.

ФОРМАТ ДНЯ (до 180 слов): Итог дня — 1–2 предложения. Хорошо — 1–3 пункта. Срывы — что не так и чем мешает цели. Завтра — 1–3 конкретных действия с привязкой к завтрашнему расписанию.
ФОРМАТ НЕДЕЛИ (до 350 слов): Итог недели — оценка 1–10 и 1–2 предложения. По сферам — по строке на сферу с ✅/⚠️/❌. Закономерности. План на следующую неделю — ровно 3 пункта.

ПЛАН. Если видишь системную проблему, предложи изменить норму сферы или добавить задачу — но только советом: нормы я меняю сам. Опирайся только на план и данные отчёта, ничего не выдумывай.

${PLAN_CONTEXT}`;
}

export const capFirst = cap;
