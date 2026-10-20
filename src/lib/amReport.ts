/** Еженедельный отчёт для Алексея Максимовича — в точности по формату пользователя */
import { buildLessons, KIND_LABEL, type Lesson, type MoneyData } from './money';
import { addDays, parseISODate, plural } from './time';
import type { Subscription, Tariff } from '../types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 1400 → «1.400», 600 → «600» */
export const rub = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const hoursText = (h: number) => `${String(h).replace('.', ',')}ч`;

export function weekTitle(weekStart: string): string {
  const a = parseISODate(weekStart);
  const b = parseISODate(addDays(weekStart, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} - ${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} - ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

export interface AmWeek {
  weekStart: string;
  singles: Lesson[];
  singlesTribute: number;
  subs: Subscription[];
  premium: number;
  total: number;
  cancels: Lesson[];
  /** Проблемы, которые стоит поправить до отправки (в текст не идут) */
  warnings: string[];
}

export function amWeek(d: MoneyData, weekStart: string, lessons = buildLessons(d)): AmWeek {
  const end = addDays(weekStart, 6);
  const inWeek = (date: string) => date >= weekStart && date <= end;
  const am = lessons.filter((l) => l.student.source === 'am' && inWeek(l.date));
  const singles = am.filter((l) => l.status.type === 'single');
  const singlesTribute = singles.reduce((a, l) => a + ((l.status as { tariff?: Tariff }).tariff?.center ?? 0), 0);
  const amIds = new Set(d.students.filter((s) => s.source === 'am').map((s) => s.id));
  const subs = d.subs.filter((s) => amIds.has(s.studentId) && inWeek(s.start)).sort((a, b) => a.start.localeCompare(b.start));
  const premium = d.premiums.filter((p) => p.week === weekStart).reduce((a, p) => a + p.amount, 0);
  const total = singlesTribute + subs.reduce((a, s) => a + s.center, 0) - premium;
  const cancels = am.filter((l) => l.status.type === 'cancelled');
  const warnings = [
    ...singles.filter((l) => l.warn).map((l) => `${l.student.name}, ${l.date.split('-').reverse().slice(0, 2).join('.')}: ${l.warn}`),
    ...am.filter((l) => l.status.type === 'planned').length
      ? [`Ещё не прошло занятий учеников центра: ${am.filter((l) => l.status.type === 'planned').length} — они попадут в отчёт после того, как пройдут`] : [],
  ];
  return { weekStart, singles, singlesTribute, subs, premium, total, cancels, warnings };
}

export function amReportText(d: MoneyData, w: AmWeek): string {
  const byId = new Map(d.students.map((s) => [s.id, s]));
  const L: string[] = [];
  L.push(`#отчет за неделю ${weekTitle(w.weekStart)}`, '');
  L.push(`Дань за разовые: ${rub(w.singlesTribute)}₽`);
  if (w.subs.length) {
    L.push('Абонементы:');
    for (const s of w.subs) {
      const st = byId.get(s.studentId);
      L.push(`• Продал абонемент ${st?.dative || st?.name || 'ученику'} (${s.size} ${plural(s.size, 'занятие', 'занятия', 'занятий')} по ${hoursText(s.hours)} ${KIND_LABEL[s.kind]}).`);
      L.push(`Комиссия за него ${rub(s.center)}₽.`);
    }
  } else L.push('Абонементов не было');
  if (w.premium) L.push(`Премия: ${rub(w.premium)}₽`);
  L.push('');
  const nz = [w.singlesTribute, ...w.subs.map((s) => s.center)].filter((x) => x);
  const terms = nz.length ? nz : [0];
  if (terms.length > 1 || (w.premium && terms[0])) {
    L.push(`${terms.map((x) => String(Math.round(x))).join(' + ')}${w.premium ? ` - ${Math.round(w.premium)}` : ''} = ${Math.round(w.total)}₽`);
  }
  L.push(`Итого дань: ${rub(w.total)}₽`, '');
  if (w.cancels.length) {
    const n = w.cancels.length;
    L.push(`${plural(n, 'Была', 'Было', 'Было')} ${n} ${plural(n, 'отмена', 'отмены', 'отмен')}:`);
    w.cancels.forEach((l, i) => {
      const r = (l.status as { reason: string }).reason.trim() || `${l.student.name} — причина не указана`;
      L.push(`${i + 1}) ${/[.!?)]$/.test(r) ? r : r + '.'}`);
    });
  } else L.push('Отмен не было');
  return L.join('\n');
}
