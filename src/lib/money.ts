/**
 * Ученики и деньги: тарифы центра, моя ставка, абонементы, оплаты, дань.
 * Все суммы считаются из записей — ничего «итогового» не хранится, поэтому правки задним числом
 * (продажа абонемента, отмена, оплата) сразу корректно пересчитывают отчёты и балансы.
 */
import { db, uid } from '../db';
import type {
  CalEvent, LessonKind, LessonMark, MoneySettings, Payment, PlanKind, Premium, RateSet, Series, Student, Subscription, Tariff, TariffSet,
} from '../types';
import { addDays, isPast, logicalNow, weekStartOf } from './time';

// ---------- Тарифы по умолчанию — из регламента центра с 1 июня 2026 ----------

const t = (kind: LessonKind, hours: number, plan: PlanKind, total: number, teacher: number, center: number): Tariff =>
  ({ kind, hours, plan, total, teacher, center });

export const DEFAULT_TARIFFS: TariffSet = {
  from: '2026-06-01',
  items: [
    t('group', 1.5, 'single', 1700, 1100, 600), t('group', 1.5, 'sub4', 6300, 4100, 2200), t('group', 1.5, 'sub8', 12200, 7950, 4250),
    t('group', 2, 'single', 2000, 1300, 700), t('group', 2, 'sub4', 7400, 4800, 2600), t('group', 2, 'sub8', 14400, 9350, 5050),
    t('group', 3, 'single', 2500, 1700, 800), t('group', 3, 'sub4', 9250, 6000, 3250), t('group', 3, 'sub8', 18000, 11700, 6300),
    t('ind', 1.5, 'single', 2700, 1850, 850), t('ind', 1.5, 'sub4', 10000, 6500, 3500), t('ind', 1.5, 'sub8', 19400, 12600, 6800),
    t('ind', 2, 'single', 3200, 2200, 1000), t('ind', 2, 'sub4', 11800, 7650, 4150), t('ind', 2, 'sub8', 23000, 14950, 8050),
  ],
};

export const DEFAULT_RATE: RateSet = { from: '2000-01-01', rate: 1200 };

export const DEFAULT_MONEY: MoneySettings = { trackFrom: null, amSphereId: null, ownSphereId: null, tariffs: [DEFAULT_TARIFFS], rates: [DEFAULT_RATE] };

export async function getMoneySettings(): Promise<MoneySettings> {
  const v = (await db.kv.get('money'))?.value as Partial<MoneySettings> | undefined;
  const m = { ...DEFAULT_MONEY, ...(v ?? {}) };
  if (!m.tariffs?.length) m.tariffs = [DEFAULT_TARIFFS];
  if (!m.rates?.length) m.rates = [DEFAULT_RATE];
  return m;
}

export async function saveMoneySettings(patch: Partial<MoneySettings>) {
  const cur = await getMoneySettings();
  await db.kv.put({ key: 'money', value: { ...cur, ...patch }, updatedAt: Date.now() });
}

/** Набор, действующий на дату: последний с from ≤ date */
function effective<T extends { from: string }>(list: T[], date: string): T | undefined {
  return [...list].sort((a, b) => a.from.localeCompare(b.from)).filter((x) => x.from <= date).pop() ?? list[0];
}

export function tariffFor(m: MoneySettings, date: string, kind: LessonKind, hours: number, plan: PlanKind): Tariff | undefined {
  return effective(m.tariffs, date)?.items.find((x) => x.kind === kind && x.plan === plan && Math.abs(x.hours - hours) < 0.01);
}

export function rateFor(m: MoneySettings, date: string, s?: Student): number {
  return s?.rate ?? effective(m.rates, date)?.rate ?? DEFAULT_RATE.rate;
}

export const KIND_LABEL: Record<LessonKind, string> = { group: 'групповые', ind: 'индивидуальные' };
export const KIND_SHORT: Record<LessonKind, string> = { group: 'групп.', ind: 'инд.' };

// ---------- Склонение имени в дательный падеж (подсказка, правится вручную) ----------

export function dativeGuess(name: string): string {
  const base = name.replace(/\s*\d+$/, '').trim();
  const num = name.slice(base.length);
  const w = base.split(/\s+/);
  const n = w[0] ?? '';
  let d = n;
  if (/ия$/.test(n)) d = n.slice(0, -1) + 'и';            // Валерия → Валерии
  else if (/а$/.test(n)) d = n.slice(0, -1) + 'е';          // Лера → Лере, Арина → Арине
  else if (/я$/.test(n)) d = n.slice(0, -1) + 'е';          // Настя → Насте
  else if (/й$/.test(n)) d = n.slice(0, -1) + 'ю';          // Арсений → Арсению
  else if (/ь$/.test(n)) d = n.slice(0, -1) + 'ю';          // Игорь → Игорю
  else if (/[бвгджзклмнпрстфхцчшщ]$/.test(n)) d = n + 'у';  // Марк → Марку
  return [d, ...w.slice(1)].join(' ') + num;
}

// ---------- Студенты и участники занятий ----------

export function newStudent(p: Partial<Student> & { name: string; source: Student['source'] }): Student {
  const now = Date.now();
  return {
    id: uid(), createdAt: now, updatedAt: now, deleted: 0,
    dative: dativeGuess(p.name), kind: 'ind', rate: null, note: '', archived: false, ...p,
  };
}

export async function saveStudent(s: Student) {
  await db.students.put({ ...s, updatedAt: Date.now() });
}

/** Ученики занятия: свои у события или из его серии */
export function participants(e: CalEvent, seriesById: Map<string, Series>): string[] {
  if (e.students) return e.students;
  return (e.seriesId ? seriesById.get(e.seriesId)?.students : undefined) ?? [];
}

export const markId = (eventId: string, studentId: string) => `${eventId}|${studentId}`;

/** Формат занятия центра из события или его серии, если задан вручную */
export function manualKind(e: CalEvent, seriesById: Map<string, Series>): LessonKind | undefined {
  return e.amKind ?? (e.seriesId ? seriesById.get(e.seriesId)?.amKind : undefined);
}

/**
 * Формат занятия ученика центра: вручную, иначе групповое — если на занятии несколько учеников
 * или в это же время у тебя занимается другой ученик центра; иначе индивидуальное.
 */
export function lessonKind(e: CalEvent, studentIds: string[], dayAmEvents: { e: CalEvent; ids: string[] }[], seriesById: Map<string, Series>): LessonKind {
  const manual = manualKind(e, seriesById);
  if (manual) return manual;
  if (studentIds.length > 1) return 'group';
  const overlaps = dayAmEvents.some((x) => x.e.id !== e.id && x.e.startMin < e.endMin && e.startMin < x.e.endMin);
  return overlaps ? 'group' : 'ind';
}

// ---------- Данные для расчётов ----------

export interface MoneyData {
  m: MoneySettings;
  students: Student[];
  subs: Subscription[];
  marks: LessonMark[];
  payments: Payment[];
  premiums: Premium[];
  events: CalEvent[];
  series: Series[];
}

export async function loadMoney(): Promise<MoneyData> {
  const m = await getMoneySettings();
  const from = m.trackFrom ?? '9999-12-31';
  const live = <T extends { deleted: 0 | 1 }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const [students, subs, marks, payments, premiums, events, series] = await Promise.all([
    db.students.toArray(), db.subs.toArray(), db.marks.toArray(), db.payments.toArray(), db.premiums.toArray(),
    db.events.where('date').aboveOrEqual(from).toArray(), db.series.toArray(),
  ]);
  return {
    m, students: live(students), subs: live(subs), marks: live(marks), payments: live(payments), premiums: live(premiums),
    events: live(events), series: live(series),
  };
}

// ---------- Занятия и их статус ----------

export type LessonStatus =
  | { type: 'cancelled'; reason: string }
  | { type: 'planned' }                               // ещё не прошло
  | { type: 'sub'; subId: string; n: number; size: number } // по абонементу
  | { type: 'single'; paid: boolean; paymentId?: string; tariff?: Tariff } // ученик центра, разовое
  | { type: 'own'; paid: boolean; via: 'payment' | 'balance' | 'none'; cost: number; paymentId?: string };

export interface Lesson {
  event: CalEvent;
  student: Student;
  date: string;
  hours: number;
  /** Формат для тарифа центра */
  kind: LessonKind;
  status: LessonStatus;
  /** Нет тарифа для такой длительности */
  warn?: string;
}

export const subEnd = (s: Subscription) => addDays(s.start, s.days - 1 + (s.extraDays || 0));

/**
 * Все занятия учеников с даты начала учёта, со статусами. Порядок: по дате и времени.
 * Абонемент покрывает прошедшие неотменённые занятия ученика в свой срок, пока не кончились уроки.
 * Деньги моего ученика: занятие с отметкой «оплатил» — оплачено; иначе покрывается пополнениями
 * баланса по порядку; если не хватило — долг.
 */
export function buildLessons(d: MoneyData, now = logicalNow()): Lesson[] {
  if (!d.m.trackFrom) return [];
  const seriesById = new Map(d.series.map((s) => [s.id, s]));
  const studentsById = new Map(d.students.map((s) => [s.id, s]));
  const marks = new Map(d.marks.map((x) => [x.id, x]));
  const lessonPay = new Map(d.payments.filter((p) => p.kind === 'lesson' && p.eventId).map((p) => [`${p.eventId}|${p.studentId}`, p]));
  const out: Lesson[] = [];
  const evs = d.events.filter((e) => e.date >= d.m.trackFrom! && e.status !== 'skipped')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);

  const subsBy = new Map<string, Subscription[]>();
  for (const s of d.subs) subsBy.set(s.studentId, [...(subsBy.get(s.studentId) ?? []), s]);
  for (const list of subsBy.values()) list.sort((a, b) => a.start.localeCompare(b.start));
  // Занятия, проведённые по абонементу до начала учёта, вписываются вручную
  const used = new Map<string, number>(d.subs.map((s) => [s.id, Math.min(s.size, s.usedBefore ?? 0)]));
  const credit = new Map<string, number>();
  for (const p of d.payments) if (p.kind === 'topup') credit.set(p.studentId, (credit.get(p.studentId) ?? 0) + p.amount);

  // Занятия с учениками центра по дням — для определения групповых
  const amByDay = new Map<string, { e: CalEvent; ids: string[] }[]>();
  for (const e of evs) {
    const ids = participants(e, seriesById).filter((id) => studentsById.get(id)?.source === 'am');
    if (ids.length) amByDay.set(e.date, [...(amByDay.get(e.date) ?? []), { e, ids }]);
  }

  for (const e of evs) {
    const hours = (e.endMin - e.startMin) / 60;
    const amIds = participants(e, seriesById).filter((id) => studentsById.get(id)?.source === 'am');
    const kind = lessonKind(e, amIds, amByDay.get(e.date) ?? [], seriesById);
    for (const sid of participants(e, seriesById)) {
      const student = studentsById.get(sid);
      if (!student) continue;
      const mark = marks.get(markId(e.id, sid));
      const base = { event: e, student, date: e.date, hours, kind };
      if (mark?.cancelled) { out.push({ ...base, status: { type: 'cancelled', reason: mark.reason } }); continue; }
      if (!isPast(e, now)) { out.push({ ...base, status: { type: 'planned' } }); continue; }

      if (student.source === 'am') {
        // Подходящий абонемент: сначала тот же формат и длительность (у ученика может быть два предмета), потом любой
        const open = (subsBy.get(sid) ?? []).filter((s) => s.start <= e.date && e.date <= subEnd(s) && (used.get(s.id) ?? 0) < s.size);
        const same = (s: Subscription) => Math.abs(s.hours - hours) < 0.01;
        const sub = open.find((s) => same(s) && s.kind === kind) ?? open.find(same) ?? open[0];
        if (sub) {
          const n = (used.get(sub.id) ?? 0) + 1;
          used.set(sub.id, n);
          out.push({ ...base, status: { type: 'sub', subId: sub.id, n, size: sub.size } });
          continue;
        }
        const tariff = tariffFor(d.m, e.date, kind, hours, 'single');
        const p = lessonPay.get(`${e.id}|${sid}`);
        out.push({
          ...base, status: { type: 'single', paid: !!p, paymentId: p?.id, tariff },
          ...(tariff ? {} : { warn: `Нет тарифа центра для ${String(hours).replace('.', ',')} ч (${KIND_LABEL[kind]})` }),
        });
      } else {
        const cost = Math.round(rateFor(d.m, e.date, student) * hours);
        const p = lessonPay.get(`${e.id}|${sid}`);
        if (p) { out.push({ ...base, status: { type: 'own', paid: true, via: 'payment', cost, paymentId: p.id } }); continue; }
        const c = credit.get(sid) ?? 0;
        if (c >= cost) { credit.set(sid, c - cost); out.push({ ...base, status: { type: 'own', paid: true, via: 'balance', cost } }); }
        else out.push({ ...base, status: { type: 'own', paid: false, via: 'none', cost } });
      }
    }
  }
  return out;
}

/** Сколько занятий использовано в каждом абонементе (с учётом вписанных вручную) */
export function subUsage(lessons: Lesson[], subs: Subscription[] = []): Map<string, number> {
  const m = new Map<string, number>(subs.map((s) => [s.id, Math.min(s.size, s.usedBefore ?? 0)]));
  for (const l of lessons) if (l.status.type === 'sub') m.set(l.status.subId, Math.max(m.get(l.status.subId) ?? 0, l.status.n));
  return m;
}

/** Состояние абонемента на дату */
export function subState(s: Subscription, used: number, today: string): 'future' | 'active' | 'done' | 'expired' {
  if (s.start > today) return 'future';
  if (used >= s.size) return 'done';
  if (subEnd(s) < today) return 'expired';
  return 'active';
}

/** Последняя дата, когда ученик платил (оплата занятия или пополнение) */
export function lastPaid(d: MoneyData, studentId: string): string | null {
  let last: string | null = null;
  for (const p of d.payments) if (p.studentId === studentId && (!last || p.date > last)) last = p.date;
  return last;
}

/** Баланс моего ученика: внесено минус стоимость проведённых занятий */
export function ownBalance(d: MoneyData, lessons: Lesson[], studentId: string): number {
  const paid = d.payments.filter((p) => p.studentId === studentId).reduce((a, p) => a + p.amount, 0);
  const cost = lessons.filter((l) => l.student.id === studentId && l.status.type === 'own').reduce((a, l) => a + (l.status as { cost: number }).cost, 0);
  return paid - cost;
}

/** Долг ученика центра по неоплаченным разовым и неоплаченным абонементам */
export function amDebt(d: MoneyData, lessons: Lesson[], studentId: string): number {
  const singles = lessons.filter((l) => l.student.id === studentId && l.status.type === 'single' && !l.status.paid)
    .reduce((a, l) => a + ((l.status as { tariff?: Tariff }).tariff?.total ?? 0), 0);
  const subs = d.subs.filter((s) => s.studentId === studentId && !s.paidDate).reduce((a, s) => a + s.total, 0);
  return singles + subs;
}

// ---------- Действия ----------

export async function setCancel(e: CalEvent, studentId: string, cancelled: boolean, reason = '') {
  const id = markId(e.id, studentId);
  const now = Date.now();
  const cur = await db.marks.get(id);
  await db.marks.put({ id, eventId: e.id, studentId, date: e.date, cancelled: cancelled ? 1 : 0, reason, createdAt: cur?.createdAt ?? now, updatedAt: now, deleted: 0 });
  await syncCancelled(e.id);
}

/** Проверить все занятия с отменами (после обновления приложения и синхронизации) */
export async function syncAllCancelled() {
  const ids = new Set((await db.marks.toArray()).map((m) => m.eventId));
  for (const ev of await db.events.filter((e) => !!e.cancelled).toArray()) ids.add(ev.id);
  for (const id of ids) await syncCancelled(id);
}

/** Если занятие отменили все ученики — помечаем само событие, чтобы оно не шло в часы работы */
export async function syncCancelled(eventId: string) {
  const ev = await db.events.get(eventId);
  if (!ev) return;
  const s = ev.seriesId ? await db.series.get(ev.seriesId) : undefined;
  const ids = ev.students ?? s?.students ?? [];
  const marks = await db.marks.where('eventId').equals(eventId).toArray();
  const all = ids.length > 0 && ids.every((sid) => marks.some((m) => m.studentId === sid && !m.deleted && m.cancelled));
  if (all !== !!ev.cancelled) await db.events.update(eventId, { cancelled: all ? 1 : undefined, updatedAt: Date.now() });
}

export async function addPayment(p: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
  const now = Date.now();
  await db.payments.add({ ...p, id: uid(), createdAt: now, updatedAt: now, deleted: 0 });
}

export async function removePayment(id: string) {
  await db.payments.update(id, { deleted: 1, updatedAt: Date.now() });
}

/** Отметить занятие оплаченным: для ученика центра — разовая цена, доход без дани; для моего — стоимость по ставке */
export async function markLessonPaid(l: Lesson, date = logicalNow().date) {
  if (l.status.type === 'single') {
    const tr = l.status.tariff;
    await addPayment({ studentId: l.student.id, date, amount: tr?.total ?? 0, income: tr?.teacher ?? 0, kind: 'lesson', eventId: l.event.id });
  } else if (l.status.type === 'own') {
    await addPayment({ studentId: l.student.id, date, amount: l.status.cost, income: l.status.cost, kind: 'lesson', eventId: l.event.id });
  }
}

export async function saveSub(s: Subscription) {
  await db.subs.put({ ...s, updatedAt: Date.now() });
}

export function newSub(m: MoneySettings, p: Pick<Subscription, 'studentId' | 'size' | 'days' | 'start' | 'kind' | 'hours'> & { paidDate?: string | null }): Subscription | null {
  const tr = tariffFor(m, p.start, p.kind, p.hours, p.size === 4 ? 'sub4' : 'sub8');
  if (!tr) return null;
  const now = Date.now();
  return {
    id: uid(), createdAt: now, updatedAt: now, deleted: 0, extraDays: 0, note: '', paidDate: null, ...p,
    total: tr.total, teacher: tr.teacher, center: tr.center,
  };
}

export async function savePremium(p: Omit<Premium, 'id' | 'createdAt' | 'updatedAt' | 'deleted'> & { id?: string }) {
  const now = Date.now();
  const cur = p.id ? await db.premiums.get(p.id) : undefined;
  await db.premiums.put({ ...p, id: p.id ?? uid(), createdAt: cur?.createdAt ?? now, updatedAt: now, deleted: 0 });
}

// ---------- Доход по дням (для «Финансов») ----------

/** Мой доход по дате получения денег: оплаты занятий и пополнения + оплаченные абонементы (без дани) */
export function incomeByDate(d: MoneyData): Map<string, number> {
  const out = new Map<string, number>();
  const add = (date: string, v: number) => out.set(date, (out.get(date) ?? 0) + v);
  for (const p of d.payments) add(p.date, p.income);
  for (const s of d.subs) if (s.paidDate) add(s.paidDate, s.teacher);
  return out;
}

export async function loadIncomeByDate(): Promise<Map<string, number>> {
  return incomeByDate(await loadMoney());
}

// ---------- Неделя ----------

export function weekRange(weekStart: string): [string, string] {
  const ws = weekStartOf(weekStart);
  return [ws, addDays(ws, 6)];
}

// ---------- Объединение тёзок ----------

/** Всё, что было у ученика from, переходит к into; from удаляется */
export async function mergeStudents(fromId: string, intoId: string) {
  if (fromId === intoId) return;
  const now = Date.now();
  const swap = (list?: string[]) => (list ? [...new Set(list.map((x) => (x === fromId ? intoId : x)))] : list);
  await db.transaction('rw', [db.series, db.events, db.subs, db.marks, db.payments, db.students], async () => {
    for (const s of await db.series.toArray()) if (s.students?.includes(fromId)) await db.series.update(s.id, { students: swap(s.students), updatedAt: now });
    for (const e of await db.events.toArray()) if (e.students?.includes(fromId)) await db.events.update(e.id, { students: swap(e.students), updatedAt: now });
    for (const x of await db.subs.where('studentId').equals(fromId).toArray()) await db.subs.update(x.id, { studentId: intoId, updatedAt: now });
    for (const p of await db.payments.where('studentId').equals(fromId).toArray()) await db.payments.update(p.id, { studentId: intoId, updatedAt: now });
    for (const mk of await db.marks.where('studentId').equals(fromId).toArray()) {
      await db.marks.update(mk.id, { deleted: 1, updatedAt: now });
      const id = markId(mk.eventId, intoId);
      if (!(await db.marks.get(id))) await db.marks.put({ ...mk, id, studentId: intoId, createdAt: now, updatedAt: now, deleted: 0 });
    }
    await db.students.update(fromId, { deleted: 1, updatedAt: now });
  });
}

/** Сколько занятий ученика в неделю по расписанию (по повторяющимся занятиям) */
export function weeklyCount(series: Series[], studentId: string): number {
  return series.filter((s) => !s.deleted && s.students?.includes(studentId) && (!s.until || s.until >= logicalNow().date))
    .reduce((a, s) => a + s.weekdays.length / Math.max(1, s.interval), 0);
}

// ---------- Значок оплаты на карточке ----------

export type Badge = 'paid' | 'unpaid' | 'cancelled';

/** Всё отменено — зачёркнуто; кто-то должен (разовое, моё или неоплаченный абонемент) — красный ₽; всё оплачено — зелёный ₽ */
export function eventBadge(ls: Lesson[], subsById: Map<string, Subscription>): Badge | null {
  if (!ls.length) return null;
  if (ls.every((l) => l.status.type === 'cancelled')) return 'cancelled';
  const live = ls.filter((l) => l.status.type !== 'cancelled' && l.status.type !== 'planned');
  if (!live.length) return null;
  const owes = live.some((l) => (l.status.type === 'single' && !l.status.paid) || (l.status.type === 'own' && !l.status.paid)
    || (l.status.type === 'sub' && !subsById.get(l.status.subId)?.paidDate));
  return owes ? 'unpaid' : 'paid';
}

export const money = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

/** Короткий статус занятия для списков */
export function statusText(l: Lesson, subsById: Map<string, Subscription>): { text: string; tone: '' | 'ok' | 'bad' } {
  const st = l.status;
  switch (st.type) {
    case 'cancelled': return { text: st.reason ? `отмена: ${st.reason}` : 'отмена', tone: '' };
    case 'planned': return { text: 'впереди', tone: '' };
    case 'sub': {
      const s = subsById.get(st.subId);
      return { text: `абонемент ${st.n}/${st.size}${s && !s.paidDate ? ', не оплачен' : ''}`, tone: s && !s.paidDate ? 'bad' : 'ok' };
    }
    case 'single': return { text: `разовое ${st.tariff ? money(st.tariff.total) : ''}${st.paid ? '' : ', не оплачено'}`, tone: st.paid ? 'ok' : 'bad' };
    case 'own': return { text: `${money(st.cost)}${st.paid ? (st.via === 'balance' ? ', с баланса' : ', оплачено') : ', не оплачено'}`, tone: st.paid ? 'ok' : 'bad' };
  }
}

/** Абонемент, действующий на дату (последний начатый) */
export function activeSub(d: MoneyData, studentId: string, date: string): Subscription | undefined {
  return d.subs.filter((s) => s.studentId === studentId && s.start <= date && date <= subEnd(s)).sort((a, b) => b.start.localeCompare(a.start))[0];
}
