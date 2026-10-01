/** Всё, что касается дат. Даты храним строками YYYY-MM-DD в локальном времени. */

export const CUTOFF_HOUR = 4; // до 04:00 — это ещё «вчера»

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // полдень — чтобы переходы на летнее время не сдвигали день
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 1..7, понедельник = 1 */
export function weekday(s: string): number {
  const w = parseISODate(s).getDay();
  return w === 0 ? 7 : w;
}

export function weekStartOf(s: string): string {
  return addDays(s, 1 - weekday(s));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** ISO-номер недели */
export function isoWeek(s: string): number {
  const d = parseISODate(s);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1, 12);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Текущий логический день и минута в нём */
export function logicalNow(now = new Date()): { date: string; min: number } {
  const h = now.getHours();
  const m = h * 60 + now.getMinutes();
  if (h < CUTOFF_HOUR) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { date: toISODate(y), min: m + 1440 };
  }
  return { date: toISODate(now), min: m };
}

export function fmtTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "00:30" → 1470 (после полуночи считаем продолжением дня) */
export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (v >= 1440) return null;
  return v < CUTOFF_HOUR * 60 ? v + 1440 : v;
}

export function fmtDur(min: number): string {
  const sign = min < 0 ? '−' : '';
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h && m) return `${sign}${h} ч ${m} мин`;
  if (h) return `${sign}${h} ч`;
  return `${sign}${m} мин`;
}

/** Короткий формат для тесных мест: 4,5 ч / 45 м */
export function fmtHours(min: number): string {
  if (Math.abs(min) < 60) return `${Math.round(min)} м`;
  const h = Math.round((min / 60) * 10) / 10;
  return `${String(h).replace('.', ',')} ч`;
}

export const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const WD_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function dayNum(s: string): number {
  return parseISODate(s).getDate();
}

export function fmtDayLong(s: string): string {
  const d = parseISODate(s);
  return `${WD_LONG[weekday(s) - 1]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function fmtWeekRange(start: string): string {
  const a = parseISODate(start);
  const b = parseISODate(addDays(start, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

export function monthName(s: string): string {
  return MONTHS_NOM[parseISODate(s).getMonth()];
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
