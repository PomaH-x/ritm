/**
 * Отчёты. Один и тот же объект идёт:
 *  - нейросети (JSON с русскими подписями и единицами — самоописываемый, без справочников),
 *  - на экран и в PDF.
 * Отклонения от плана считает код по правилам из PDF-плана — нейросеть получает готовые факты.
 */
import { db, DEFAULT_SETTINGS } from '../db';
import type { CalEvent, FieldDef, LogEntry, SectionDef, SectionsConfig, Settings, Sphere, Task, Workout } from '../types';
import { EMPTY_CONFIG, resolveSections } from './sections';
import { autoValue } from './auto';
import { exerciseDone, fmtTarget, setsOf, sportDayStatus, targetFor } from './sport';
import { dur, weekProgress } from './stats';
import { addDays, fmtTime, fmtWeekRange, parseISODate, WD_LONG, WD_SHORT, weekday, weekDays } from './time';

export interface Bundle {
  logs: LogEntry[];
  events: CalEvent[];
  spheres: Sphere[];
  cfg: SectionsConfig;
  program: Workout[];
  settings: Settings;
  sportAll: LogEntry[];
  tasks: Task[];
}

export async function loadBundle(from: string, to: string): Promise<Bundle> {
  const [logs, events, spheres, cfgRow, progRow, setRow, sportAll, tasks] = await Promise.all([
    db.logs.where('date').between(from, to, true, true).toArray(),
    db.events.where('date').between(from, to, true, true).toArray(),
    db.spheres.orderBy('order').toArray(),
    db.kv.get('sectionsConfig'),
    db.kv.get('program'),
    db.kv.get('settings'),
    db.logs.where('section').equals('sport').toArray(),
    db.tasks.toArray(),
  ]);
  return {
    logs: logs.filter((l) => !l.deleted),
    events: events.filter((e) => !e.deleted),
    spheres: spheres.filter((s) => !s.deleted),
    cfg: { ...EMPTY_CONFIG, ...((cfgRow?.value as Partial<SectionsConfig>) ?? {}) },
    program: (progRow?.value as Workout[]) ?? [],
    settings: { ...DEFAULT_SETTINGS, ...((setRow?.value as Partial<Settings>) ?? {}) },
    sportAll: sportAll.filter((l) => !l.deleted),
    tasks: tasks.filter((t) => !t.deleted),
  };
}

// ---------- Вспомогательное ----------

type Eff = Record<string, Record<string, unknown>>; // раздел → поле → значение с учётом автоподсчёта
type Obj = Record<string, unknown>;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Число для текста: 8,25 */
const ru = (v: unknown) => String(v).replace('.', ',');
const hrs = (min: number) => r1(min / 60);
const label = (f: FieldDef) => (f.unit ? `${f.label}, ${f.unit}` : f.label);
const ddmm = (d: string) => { const x = parseISODate(d); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}`; };
const toMin = (s: unknown) => { const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(s) : null; return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const bedAbs = (s: unknown) => { const m = toMin(s); return m == null ? null : m < 12 * 60 ? m + 1440 : m; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const empty = (v: unknown) => v === undefined || v === null || v === '';

function outValue(f: FieldDef, v: unknown): unknown {
  if (f.type === 'bool' || f.type === 'check') return v ? 'да' : 'нет';
  return v;
}

/** Действующие значения раздела за день: ввод пользователя или автоподсчёт */
function effective(sec: SectionDef, log: LogEntry | undefined, dayEvents: CalEvent[], spheres: Sphere[]) {
  const values = log?.values ?? {};
  const out: Record<string, unknown> = {};
  let any = false;
  for (const f of sec.fields) {
    const v = empty(values[f.key]) ? autoValue(f, sec, values, { dayEvents, spheres }) : values[f.key];
    if (!empty(v)) { out[f.key] = v; any = true; }
  }
  // Неотмеченная галочка в заполненном разделе = «нет»
  if (any) for (const f of sec.fields) if (f.type === 'check' && empty(out[f.key])) out[f.key] = false;
  return { values: out, any };
}

// ---------- Правила из плана ----------

export interface Flags { warn: string[]; good: string[] }

function dayFlags(date: string, E: Eff, sport: ReturnType<typeof sportDayStatus> | null, plannedTraining: string | null): Flags {
  const warn: string[] = [];
  const good: string[] = [];
  const wd = weekday(date);
  const S = E.sleep, F = E.food, W = E.work, D = E.digital, C = E.chess, G = E.ege, H = E.hygiene, M = E.finance, St = E.state;

  if (S) {
    const h = num(S.hours);
    if (h != null) (h < 8 ? warn : good).push(h < 8 ? `Сон ${ru(h)} ч при цели 8–8,5 ч` : `Сон ${ru(h)} ч — в норме`);
    const b = bedAbs(S.bed);
    if (b != null && b > 25 * 60) warn.push(`Отбой в ${S.bed}, крайний срок по плану 01:00`);
    const w = toMin(S.wake);
    if (w != null && w > 9 * 60 + 45) warn.push(`Подъём в ${S.wake} вместо 9:30`);
    if (S.phone === false) warn.push('Телефон в первые 30 минут после подъёма');
    if (S.sunset === false) warn.push('Цифровой закат в 00:00 не соблюдён');
    if (S.morning === true && S.phone === true) good.push('Утренний старт без телефона');
  }
  if (sport) {
    if (plannedTraining && !sport.trained) warn.push(`Тренировка по плану («${plannedTraining}») не выполнена: ${sport.done} из ${sport.total} упражнений`);
    if (sport.workout && sport.trained) good.push(`Тренировка «${sport.workout.name}»: ${sport.done} из ${sport.total} упражнений`);
    if (!sport.workout) {
      if (sport.done >= sport.total) good.push('Ежедневный минимум выполнен полностью');
      else warn.push(`Ежедневный минимум: ${sport.done} из ${sport.total}`);
    }
  }
  if (F) {
    const water = num(F.water), prot = num(F.protein);
    if (water != null) (water < 1.5 ? warn : good).push(water < 1.5 ? `Вода ${ru(water)} л при цели 1,5–2 л` : `Вода ${ru(water)} л`);
    if (prot != null) (prot < 100 ? warn : good).push(prot < 100 ? `Белок ~${prot} г при цели 100–120 г` : `Белок ~${prot} г`);
    if (F.fastfood === 'да' || F.fastfood === true) {
      if (wd !== 3) warn.push('Фастфуд не в среду (по плану — только среда)');
      if (F.sweets && F.sweets !== 'нет') warn.push('Сладкое в день фастфуда — по плану нельзя');
    }
    if ((num(F.icetea) ?? 0) > 1) warn.push(`Ice Tea: ${F.icetea} стак., лимит 1`);
    if ((num(F.kvass) ?? 0) > 1) warn.push(`Квас: ${F.kvass} стак., лимит 1`);
    if (F.sweets === 'больше нормы') warn.push('Сладкое больше нормы');
  }
  if (W && W.breaks === false && (num(W.hours) ?? 0) >= 4) warn.push('Не было перерывов с движением при рабочем дне');
  if (D) {
    const yt = num(D.youtube), wt = num(D.wt);
    if (yt != null && yt > 60) warn.push(`YouTube ${yt} мин при лимите 60`);
    if (wt != null && wt > 120) warn.push(`War Thunder ${wt} мин, по плану до 2 часов за вечер`);
    if (D.onetouch === false) warn.push('Правило «одно касание» нарушено');
  }
  if (C) {
    const t = num(C.tactics);
    if (t != null) (t < 15 ? warn : good).push(t < 15 ? `Тактика ${t} мин при норме 15` : `Тактика ${t} мин`);
  }
  if (G) {
    const m = num(G.minutes);
    if (m != null && m >= 85) good.push(`ЕГЭ ${m} мин`);
  }
  if (H) {
    const teeth = (H.teethAm ? 1 : 0) + (H.teethPm ? 1 : 0);
    if (teeth < 2) warn.push(`Зубы: ${teeth} раз из 2`);
  }
  if (M && (num(M.income) ?? 0) > 0 && M.saved !== true) warn.push('С дохода не отложено 20%');
  if (St) {
    const e = num(St.energy), mo = num(St.mood);
    if (e != null && e <= 4) warn.push(`Низкая энергия: ${e}/10`);
    if (mo != null && mo <= 4) warn.push(`Низкое настроение: ${mo}/10`);
  }
  return { warn, good };
}

// ---------- День ----------

export interface DayData {
  eff: Eff;
  sport: ReturnType<typeof sportDayStatus> | null;
  filled: string[];
  unfilled: string[];
  flags: Flags;
}

function dayData(b: Bundle, date: string): DayData {
  const sections = resolveSections(b.cfg);
  const dayEvents = b.events.filter((e) => e.date === date);
  const logs = new Map(b.logs.filter((l) => l.date === date).map((l) => [l.section, l]));
  const eff: Eff = {};
  const filled: string[] = [];
  const unfilled: string[] = [];
  let sport: DayData['sport'] = null;
  const wd = weekday(date);
  const planned = b.program.find((w) => !w.daily && w.weekdays.includes(wd))?.name ?? null;
  for (const sec of sections) {
    if (sec.kind === 'sport') {
      const log = logs.get('sport');
      if (log) { sport = sportDayStatus(log, b.program, wd); filled.push(sec.title); } else unfilled.push(sec.title);
      continue;
    }
    const { values, any } = effective(sec, logs.get(sec.key), dayEvents, b.spheres);
    if (any) { eff[sec.key] = values; filled.push(sec.title); } else unfilled.push(sec.title);
  }
  return { eff, sport, filled, unfilled, flags: dayFlags(date, eff, sport, planned) };
}

export function dayReport(b: Bundle, date: string): Obj {
  const d = dayData(b, date);
  const wd = weekday(date);
  const sections = resolveSections(b.cfg);
  const plannedTraining = b.program.find((w) => !w.daily && w.weekdays.includes(wd));
  const planToday: string[] = [plannedTraining ? `Тренировка: ${plannedTraining.name}` : 'Ежедневный минимум (нет тренировки)'];
  if (b.settings.lightWeekdays.includes(wd)) planToday.push(`После ${fmtTime(b.settings.lightFromMin)} только лёгкие дела`);
  if (b.settings.restWeekdays.includes(wd)) planToday.push('День отдыха с лёгкими полезными делами');
  if (wd === 3) planToday.push('Фастфуд разрешён: 1 приём + овощной салат + вода');

  const byId = new Map(b.spheres.map((s) => [s.id, s]));
  const dayEvents = b.events.filter((e) => e.date === date && e.status !== 'skipped').sort((a, z) => a.startMin - z.startMin);
  const workMin = sum(dayEvents.filter((e) => byId.get(e.sphereId ?? '')?.group === 'Работа').map(dur));
  const other = dayEvents.filter((e) => byId.get(e.sphereId ?? '')?.group !== 'Работа').map((e) =>
    `${fmtTime(e.startMin)}–${fmtTime(e.endMin)} ${byId.get(e.sphereId ?? '')?.name ?? 'без сферы'}: ${e.title} (${e.status === 'done' ? 'сделано' : 'не отмечено'})`);

  const out: Obj = {
    'тип': 'отчёт за день',
    'дата': date,
    'день недели': WD_LONG[wd - 1],
    'по плану в этот день': planToday,
    'расписание': { 'работа (занятия), ч': hrs(workMin), 'остальные события': other.length ? other : 'нет' },
  };
  const secs: Obj = {};
  for (const sec of sections) {
    if (sec.kind === 'sport') {
      if (!d.sport) continue;
      const log = b.logs.find((l) => l.date === date && l.section === 'sport');
      const list = d.sport.workout ? d.sport.workout.exercises : b.program.filter((w) => w.daily).flatMap((w) => w.exercises);
      const week = addDays(date, 1 - wd);
      secs[sec.title] = {
        'что делал': d.sport.workout ? `тренировка «${d.sport.workout.name}»` : 'ежедневный минимум',
        'упражнения': list.map((e) => {
          const t = targetFor(e, week, b.sportAll);
          const s = setsOf(log, e.id).filter((v) => typeof v === 'number');
          return e.unit === 'check'
            ? { 'упражнение': e.name, 'сделано': exerciseDone(log, e) ? 'да' : 'нет' }
            : { 'упражнение': e.name, 'цель': fmtTarget(e, t.value), 'сделано': s.length ? s.join(', ') : 'нет', 'по цели': exerciseDone(log, e) && s.every((v) => (v as number) >= t.value) ? 'да' : 'нет' };
        }),
        ...(log?.values.feeling ? { 'самочувствие': log.values.feeling } : {}),
      };
      continue;
    }
    const v = d.eff[sec.key];
    if (!v) continue;
    const o: Obj = {};
    for (const f of sec.fields) if (!empty(v[f.key])) o[label(f)] = outValue(f, v[f.key]);
    secs[sec.title] = o;
  }
  out['разделы'] = secs;
  if (d.unfilled.length) out['не заполнено'] = d.unfilled;
  out['отклонения от плана'] = d.flags.warn;
  out['получилось по плану'] = d.flags.good;
  return out;
}

// ---------- Неделя ----------

export function weekReport(b: Bundle, weekStart: string, today: string): Obj {
  const days = weekDays(weekStart).filter((d) => d <= today);
  const all = days.map((d) => ({ date: d, ...dayData(b, d) }));
  const E = (k: string) => all.map((x) => x.eff[k]).filter(Boolean) as Record<string, unknown>[];
  const nums = (k: string, f: string) => E(k).map((v) => num(v[f])).filter((x): x is number => x != null);
  const count = (k: string, f: string, val: unknown) => E(k).filter((v) => v[f] === val).length;
  const warn: string[] = [];
  const good: string[] = [];
  const weekEnded = today >= addDays(weekStart, 6);

  // Нормы: для ЕГЭ и шахмат — минуты из учёта дня (там же учтено расписание), спорт — по дням
  const sportId = b.cfg.links.sport ?? null;
  const extra = new Map<string, Set<string>>();
  if (sportId) extra.set(sportId, new Set(all.filter((x) => x.sport?.trained).map((x) => x.date)));
  const prog = weekProgress(b.spheres, b.events.filter((e) => days.includes(e.date)), extra);
  const linked = new Map(Object.entries(b.cfg.links).filter(([, id]) => id).map(([k, id]) => [id as string, k]));
  const norms: Obj = {};
  const expectedShare = days.length / 7;
  for (const s of b.spheres.filter((x) => x.normKind !== 'none' && x.normTarget > 0 && !x.archived)) {
    const p = prog.get(s.id)!;
    let done = p.done;
    const sec = linked.get(s.id);
    if (s.normKind === 'minutes' && sec && sec !== 'sport') done = Math.max(done, sum(nums(sec, 'minutes')));
    const pct = Math.round((done / s.normTarget) * 100);
    const isMin = s.normKind === 'minutes';
    norms[s.name] = {
      'цель': isMin ? `${hrs(s.normTarget)} ч` : `${s.normTarget} раз`,
      'сделано': isMin ? `${hrs(done)} ч` : `${done} раз`,
      ...(p.planned > 0 ? { 'стоит в расписании, не отмечено': isMin ? `${hrs(p.planned)} ч` : `${p.planned} раз` } : {}),
      'выполнение': `${pct}%`,
    };
    if (done >= s.normTarget) good.push(`Норма «${s.name}» выполнена (${pct}%)`);
    else if (weekEnded) warn.push(`Норма «${s.name}» не выполнена: ${pct}%`);
    else if (pct < expectedShare * 100 * 0.75) warn.push(`«${s.name}» отстаёт от темпа: ${pct}% при ${days.length} из 7 дней`);
  }

  // Сон
  const sleepH = nums('sleep', 'hours');
  const beds = E('sleep').map((v) => bedAbs(v.bed)).filter((x): x is number => x != null);
  const sleep: Obj = {
    'ночей записано': sleepH.length,
    ...(sleepH.length ? { 'средний сон, ч': r1(avg(sleepH)!), 'ночей меньше 8 ч': sleepH.filter((h) => h < 8).length } : {}),
    ...(beds.length ? { 'средний отбой': fmtTime(Math.round(avg(beds)!)), 'отбоев позже 01:00': beds.filter((x) => x > 1500).length } : {}),
    'телефон в первые 30 минут, дней': count('sleep', 'phone', false),
    'цифровой закат нарушен, дней': count('sleep', 'sunset', false),
  };
  if (sleepH.length && avg(sleepH)! < 8) warn.push(`Средний сон ${ru(r1(avg(sleepH)!))} ч при цели 8–8,5 ч`);
  if (sleepH.length >= 3 && sleepH.every((h) => h >= 8)) good.push('Все записанные ночи — 8 часов и больше');

  // Спорт
  const trainingDays = days.filter((d) => b.program.some((w) => !w.daily && w.weekdays.includes(weekday(d))));
  const trained = all.filter((x) => x.sport?.trained);
  const minDays = all.filter((x) => x.sport && !x.sport.workout);
  const nextWeek = addDays(weekStart, 7);
  const growing = b.program.flatMap((w) => w.exercises).filter((e) => e.unit !== 'check').map((e) => {
    const now = targetFor(e, weekStart, b.sportAll).value;
    const next = targetFor(e, nextWeek, b.sportAll).value;
    return next > now ? `${e.name}: ${fmtTarget(e, next)}` : null;
  }).filter(Boolean);
  const sport: Obj = {
    'тренировок': `${trained.length} из ${trainingDays.length} по плану на эти дни`,
    'ежедневный минимум полностью': `${minDays.filter((x) => x.sport!.done >= x.sport!.total).length} из ${days.length - trainingDays.length} дней`,
    ...(weekEnded ? { 'цели на следующую неделю выросли': growing.length ? growing : 'нет' } : {}),
  };
  if (trained.length < trainingDays.length) warn.push(`Тренировок ${trained.length} из ${trainingDays.length}`);
  else if (trainingDays.length) good.push(`Все тренировки по плану: ${trained.length}`);

  // Питание
  const water = nums('food', 'water'), prot = nums('food', 'protein');
  const ffDays = all.filter((x) => x.eff.food?.fastfood === true).map((x) => WD_SHORT[weekday(x.date) - 1]);
  const food: Obj = {
    'дней записано': E('food').length,
    ...(water.length ? { 'вода в среднем, л': r1(avg(water)!) } : {}),
    ...(prot.length ? { 'белок в среднем, г': Math.round(avg(prot)!), 'дней с белком от 100 г': prot.filter((p) => p >= 100).length } : {}),
    'фастфуд': ffDays.length ? `${ffDays.length} раз (${ffDays.join(', ')})` : 'не было',
    'Ice Tea, стаканов': sum(nums('food', 'icetea')),
    'квас, стаканов': sum(nums('food', 'kvass')),
    'сладкое больше нормы, дней': count('food', 'sweets', 'больше нормы'),
  };
  if (ffDays.length > 1) warn.push(`Фастфуд ${ffDays.length} раза за неделю при норме 1`);
  if (prot.length && avg(prot)! < 100) warn.push(`Белок в среднем ${Math.round(avg(prot)!)} г при цели 100–120 г`);

  // Работа, учёба, шахматы, цифра
  const workH = nums('work', 'hours');
  const work: Obj = { 'часов': r1(sum(workH)), 'перерывы с движением, дней': `${count('work', 'breaks', true)} из ${E('work').filter((v) => !empty(v.breaks)).length || E('work').length}` };
  const ege: Obj = { 'минут': sum(nums('ege', 'minutes')), 'вариантов решено': sum(nums('ege', 'variants')), 'первая часть, дней': count('ege', 'part1', true) };
  const tactics = nums('chess', 'tactics');
  const chess: Obj = {
    'минут': sum(nums('chess', 'minutes')), 'тактика, мин': sum(tactics), 'дней с тактикой от 15 мин': tactics.filter((t) => t >= 15).length,
    'партий': sum(nums('chess', 'games')), 'разбор партий, дней': count('chess', 'analysis', true),
    'эндшпиль, мин': sum(nums('chess', 'endgame')), 'дебюты и стратегия, мин': sum(nums('chess', 'openings')),
  };
  const yt = nums('digital', 'youtube'), wt = nums('digital', 'wt');
  const wtEvenings = wt.filter((x) => x > 0).length;
  const digital: Obj = {
    'YouTube всего, мин': sum(yt), 'дней сверх 60 мин': yt.filter((x) => x > 60).length,
    'War Thunder всего, мин': sum(wt), 'вечеров War Thunder': wtEvenings,
    'нарушений «одного касания»': count('digital', 'onetouch', false),
  };
  if (wtEvenings > 3) warn.push(`War Thunder ${wtEvenings} вечеров при норме 3`);

  // Финансы
  const inc = nums('finance', 'income'), exp = nums('finance', 'expenses');
  const incDays = E('finance').filter((v) => (num(v.income) ?? 0) > 0);
  const finance: Obj = {
    'доход, ₽': sum(inc), 'расходы, ₽': sum(exp), 'разница, ₽': sum(inc) - sum(exp),
    'отложено 20%': `${incDays.filter((v) => v.saved === true).length} из ${incDays.length} дней с доходом`,
  };
  if (incDays.some((v) => v.saved !== true)) warn.push('Не со всех доходов отложено 20%');

  // Гигиена и состояние
  const hyg = E('hygiene');
  const hygiene: Obj = {
    'дней записано': hyg.length,
    'зубы 2 раза, дней': hyg.filter((v) => v.teethAm && v.teethPm).length,
    'Garnier, раз': hyg.filter((v) => v.garnier).length,
  };
  if (hyg.length >= 3 && hyg.filter((v) => v.garnier).length < 2 && weekEnded) warn.push('Garnier меньше 2 раз за неделю');
  const en = nums('state', 'energy'), mo = nums('state', 'mood');
  const notes = all.filter((x) => x.eff.state?.good || x.eff.state?.hard).map((x) => ({
    'день': `${WD_SHORT[weekday(x.date) - 1]} ${ddmm(x.date)}`,
    ...(x.eff.state!.good ? { 'хорошо': x.eff.state!.good } : {}),
    ...(x.eff.state!.hard ? { 'трудно': x.eff.state!.hard } : {}),
  }));
  const state: Obj = {
    ...(en.length ? { 'энергия в среднем': r1(avg(en)!) } : {}),
    ...(mo.length ? { 'настроение в среднем': r1(avg(mo)!) } : {}),
    ...(notes.length ? { 'заметки по дням': notes } : {}),
  };

  // Задачи
  const doneTasks = b.tasks.filter((t) => t.done && t.doneDate && t.doneDate >= weekStart && t.doneDate <= addDays(weekStart, 6)).map((t) => t.title);
  const openTasks = b.tasks.filter((t) => !t.done).map((t) => t.title);

  // По дням — короткая таблица
  const perDay = all.map((x) => ({
    'день': `${WD_SHORT[weekday(x.date) - 1]} ${ddmm(x.date)}`,
    'сон, ч': num(x.eff.sleep?.hours) ?? '—',
    'спорт': x.sport ? (x.sport.workout ? `${x.sport.workout.name} ${x.sport.done}/${x.sport.total}` : `минимум ${x.sport.done}/${x.sport.total}`) : '—',
    'ЕГЭ, мин': num(x.eff.ege?.minutes) ?? '—',
    'шахматы, мин': num(x.eff.chess?.minutes) ?? '—',
    'вода, л': num(x.eff.food?.water) ?? '—',
    'белок, г': num(x.eff.food?.protein) ?? '—',
    'энергия': num(x.eff.state?.energy) ?? '—',
    'заполнено разделов': `${x.filled.length} из ${x.filled.length + x.unfilled.length}`,
  }));
  const emptyDays = all.filter((x) => x.filled.length === 0).length;
  if (emptyDays) warn.push(`Дней без отчёта: ${emptyDays}`);

  // Чек-ин недели
  const ci = b.logs.find((l) => l.section === 'weekly' && l.date === weekStart)?.values ?? {};
  const checkin: Obj = {};
  for (const f of WEEKLY_FIELDS) if (!empty(ci[f.key])) checkin[f.label] = ci[f.key];

  const yr = parseISODate(addDays(weekStart, 6)).getFullYear();
  return {
    'тип': 'отчёт за неделю',
    'неделя': `${fmtWeekRange(weekStart)} ${yr}`,
    'дней прошло': `${days.length} из 7`,
    'нормы': norms,
    'сон': sleep, 'спорт': sport, 'питание': food, 'работа': work, 'ЕГЭ': ege, 'шахматы': chess,
    'цифровая гигиена': digital, 'финансы': finance, 'гигиена': hygiene, 'состояние': state,
    'задачи': { 'сделано за неделю': doneTasks.length ? doneTasks : 'нет', 'открытые': openTasks.length ? openTasks : 'нет' },
    'по дням': perDay,
    ...(Object.keys(checkin).length ? { 'чек-ин': checkin } : {}),
    'отклонения от плана': [...warn, ...collectDayWarnings(all)],
    'получилось по плану': good,
  };
}

/** Повторяющиеся дневные срывы — одной строкой, чтобы нейросеть видела закономерность */
function collectDayWarnings(all: { date: string; flags: Flags }[]): string[] {
  const counts = new Map<string, { days: string[]; example: string }>();
  for (const x of all) {
    for (const w of x.flags.warn) {
      const key = w.replace(/[\d,.~:]+/g, '#');
      const cur = counts.get(key) ?? { days: [], example: w };
      cur.days.push(WD_SHORT[weekday(x.date) - 1]);
      counts.set(key, cur);
    }
  }
  return [...counts.values()].filter((c) => c.days.length >= 2)
    .map((c) => `Повторялось ${c.days.length} раза (${c.days.join(', ')}), например: ${c.example}`);
}

export const WEEKLY_FIELDS: FieldDef[] = [
  { key: 'rating', label: 'Оценка недели', type: 'scale' },
  { key: 'good', label: 'Что получилось', type: 'note' },
  { key: 'hard', label: 'Что мешало, где сорвался', type: 'note' },
  { key: 'projects', label: 'Проекты (Claude): что сделано', type: 'note' },
  { key: 'improve', label: 'Что улучшить на следующей неделе', type: 'note' },
];

export const WEEKLY_SECTION: SectionDef = {
  key: 'weekly', title: 'Чек-ин недели', emoji: '🗓️', color: '#A98BFF', kind: 'generic', fields: WEEKLY_FIELDS,
  hint: 'Воскресенье вечером',
};
