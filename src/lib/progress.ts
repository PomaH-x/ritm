/** Данные для графиков страницы «Прогресс» */
import { db } from '../db';
import { dayData, loadBundle, type Bundle } from './report';
import { sportDayStatus, targetFor, setsOf } from './sport';
import { dur } from './stats';
import { addDays, logicalNow, parseISODate, weekday, weekStartOf, toISODate } from './time';
import type { Exercise } from '../types';

export type Period = '7' | '30' | 'all';

export interface Series { name: string; color: string; values: (number | null)[] }
export interface ChartData { labels: string[]; tips?: string[]; series: Series[]; refs: { value: number; label: string }[] }

const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dm = (d: string) => { const x = parseISODate(d); return `${x.getDate()}.${String(x.getMonth() + 1).padStart(2, '0')}`; };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toMin = (s: unknown) => { const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(s) : null; return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface Ctx {
  b: Bundle;
  days: string[];
  weeks: string[];
  today: string;
  period: Period;
  data: Map<string, ReturnType<typeof dayData>>;
}

export async function loadCtx(period: Period): Promise<Ctx> {
  const today = logicalNow().date;
  let from = addDays(today, period === '7' ? -6 : -29);
  if (period === 'all') {
    const first = await db.logs.orderBy('date').first();
    if (first && first.date < from) from = first.date;
  }
  const b = await loadBundle(addDays(weekStartOf(from), 0), today);
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  const weeks = [...new Set(days.map(weekStartOf))];
  const data = new Map(days.map((d) => [d, dayData(b, d)]));
  return { b, days, weeks, today, period, data };
}

/** Длинные периоды показываем по неделям, короткие — по дням */
const byWeek = (c: Ctx) => c.days.length > 45;

// ---------- Сон ----------

export function sleepCharts(c: Ctx) {
  const hours = c.days.map((d) => num(c.data.get(d)?.eff.sleep?.hours));
  const bed = c.days.map((d) => { const m = toMin(c.data.get(d)?.eff.sleep?.bed); return m == null ? null : m < 12 * 60 ? m + 1440 : m; });
  const known = hours.filter((h): h is number => h != null);
  const beds = bed.filter((x): x is number => x != null);
  const stats = {
    avg: avg(known),
    under: known.filter((h) => h < 8).length,
    nights: known.length,
    late: beds.filter((x) => x > 25 * 60).length,
    avgBed: avg(beds),
  };
  if (byWeek(c)) {
    const wk = (vals: (number | null)[]) => c.weeks.map((w) => avg(vals.filter((_, i) => weekStartOf(c.days[i]) === w).filter((x): x is number => x != null)));
    return {
      stats,
      hours: { labels: c.weeks.map(dm), tips: c.weeks.map((w) => `неделя с ${dm(w)}`), series: [{ name: 'Сон в среднем, ч', color: '#8FA3C8', values: wk(hours) }], refs: [{ value: 8, label: '8 ч' }] } as ChartData,
      bed: { labels: c.weeks.map(dm), tips: c.weeks.map((w) => `неделя с ${dm(w)}`), series: [{ name: 'Отбой в среднем', color: '#A98BFF', values: wk(bed) }], refs: [{ value: 1470, label: '00:30' }, { value: 1500, label: '01:00' }] } as ChartData,
    };
  }
  return {
    stats,
    hours: { labels: c.days.map(dm), series: [{ name: 'Сон, ч', color: '#8FA3C8', values: hours }], refs: [{ value: 8, label: '8 ч' }] } as ChartData,
    bed: { labels: c.days.map(dm), series: [{ name: 'Отбой', color: '#A98BFF', values: bed }], refs: [{ value: 1470, label: '00:30' }, { value: 1500, label: '01:00' }] } as ChartData,
  };
}

// ---------- Нормы ----------

/** Сколько сделано по сфере за день: минуты (часовые нормы) или 0/1 (нормы «разы») */
function sphereDay(c: Ctx, sphereId: string, kind: 'minutes' | 'count', date: string): number {
  const linked = Object.entries(c.b.cfg.links).find(([, id]) => id === sphereId)?.[0];
  const dd = c.data.get(date);
  if (kind === 'minutes') {
    if (linked && linked !== 'sport') return num(dd?.eff[linked]?.minutes) ?? 0;
    return c.b.events.filter((e) => e.date === date && e.sphereId === sphereId && e.status === 'done').reduce((a, e) => a + dur(e), 0);
  }
  const cal = c.b.events.some((e) => e.date === date && e.sphereId === sphereId && e.status === 'done');
  const log = linked === 'sport' ? c.b.logs.find((l) => l.date === date && l.section === 'sport') : undefined;
  const trained = log ? sportDayStatus(log, c.b.program, weekday(date)).trained : false;
  return cal || trained ? 1 : 0;
}

export function normCharts(c: Ctx) {
  const spheres = c.b.spheres.filter((s) => !s.archived && s.normKind !== 'none' && s.normTarget > 0);
  return spheres.map((s) => {
    const kind = s.normKind as 'minutes' | 'count';
    const toUnit = (v: number) => (kind === 'minutes' ? Math.round((v / 60) * 10) / 10 : v);
    const target = kind === 'minutes' ? s.normTarget / 60 : s.normTarget;
    const unit = kind === 'minutes' ? 'ч' : 'раз';
    if (c.period === '7') {
      const vals = c.days.map((d) => toUnit(sphereDay(c, s.id, kind, d)));
      return {
        sphere: s, unit, target, mode: 'day' as const,
        total: vals.reduce((a, b) => a + b, 0),
        chart: { labels: c.days.map(dm), series: [{ name: s.name, color: s.color, values: vals }], refs: kind === 'minutes' ? [{ value: Math.round((target / 7) * 10) / 10, label: 'в среднем в день' }] : [] } as ChartData,
      };
    }
    const vals = c.weeks.map((w) => toUnit(c.days.filter((d) => weekStartOf(d) === w).reduce((a, d) => a + sphereDay(c, s.id, kind, d), 0)));
    const full = vals.slice(0, c.weeks[c.weeks.length - 1] === weekStartOf(c.today) ? -1 : undefined);
    return {
      sphere: s, unit, target, mode: 'week' as const,
      met: full.filter((v) => v >= target).length, weeksFull: full.length,
      chart: { labels: c.weeks.map(dm), tips: c.weeks.map((w) => `неделя с ${dm(w)}`), series: [{ name: s.name, color: s.color, values: vals }], refs: [{ value: target, label: `норма ${String(target).replace('.', ',')} ${unit}` }] } as ChartData,
    };
  });
}

// ---------- Упражнения ----------

export function exerciseList(c: Ctx): { ex: Exercise; workout: string }[] {
  return c.b.program.flatMap((w) => w.exercises.filter((e) => e.unit !== 'check').map((ex) => ({ ex, workout: w.name })));
}

/** Факт за день — среднее по подходам, если сделаны все подходы */
function dayActual(c: Ctx, ex: Exercise, date: string): number | null {
  const log = c.b.logs.find((l) => l.date === date && l.section === 'sport');
  const s = setsOf(log, ex.id).filter((x): x is number => typeof x === 'number');
  if (!s.length) return null;
  return Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10;
}

export function exerciseChart(c: Ctx, ex: Exercise): ChartData {
  const unit = ex.unit === 'sec' ? 'с' : 'повт.';
  if (c.period === '7') {
    return {
      labels: c.days.map(dm),
      series: [
        { name: `Цель недели, ${unit}`, color: '#8E99AF', values: c.days.map((d) => targetFor(ex, weekStartOf(d), c.b.sportAll).value) },
        { name: `Сделано в среднем за подход, ${unit}`, color: '#FF8A3D', values: c.days.map((d) => dayActual(c, ex, d)) },
      ],
      refs: ex.cap ? [{ value: ex.cap, label: `потолок ${ex.cap}` }] : [],
    };
  }
  return {
    labels: c.weeks.map(dm), tips: c.weeks.map((w) => `неделя с ${dm(w)}`),
    series: [
      { name: `Цель недели, ${unit}`, color: '#8E99AF', values: c.weeks.map((w) => targetFor(ex, w, c.b.sportAll).value) },
      { name: `Лучший день, в среднем за подход, ${unit}`, color: '#FF8A3D', values: c.weeks.map((w) => {
        const xs = c.days.filter((d) => weekStartOf(d) === w).map((d) => dayActual(c, ex, d)).filter((x): x is number => x != null);
        return xs.length ? Math.max(...xs) : null;
      }) },
    ],
    refs: ex.cap ? [{ value: ex.cap, label: `потолок ${ex.cap}` }] : [],
  };
}

// ---------- Деньги ----------

export function moneyChart(c: Ctx) {
  const inc = (d: string) => num(c.data.get(d)?.eff.finance?.income);
  const exp = (d: string) => num(c.data.get(d)?.eff.finance?.expenses);
  const totalInc = c.days.reduce((a, d) => a + (inc(d) ?? 0), 0);
  const totalExp = c.days.reduce((a, d) => a + (exp(d) ?? 0), 0);
  if (c.period === 'all') {
    const months = [...new Set(c.days.map((d) => d.slice(0, 7)))];
    const sumM = (m: string, f: (d: string) => number | null) => c.days.filter((d) => d.startsWith(m)).reduce((a, d) => a + (f(d) ?? 0), 0);
    return {
      totalInc, totalExp, mode: 'month' as const,
      chart: {
        labels: months.map((m) => `${MON[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`),
        series: [
          { name: 'Доход, ₽', color: '#3FB27F', values: months.map((m) => sumM(m, inc)) },
          { name: 'Расходы, ₽', color: '#E5534B', values: months.map((m) => sumM(m, exp)) },
        ],
        refs: [{ value: 200000, label: 'цель 200 тыс.' }],
      } as ChartData,
    };
  }
  return {
    totalInc, totalExp, mode: 'day' as const,
    chart: {
      labels: c.days.map(dm),
      series: [
        { name: 'Доход, ₽', color: '#3FB27F', values: c.days.map(inc) },
        { name: 'Расходы, ₽', color: '#E5534B', values: c.days.map(exp) },
      ],
      refs: [],
    } as ChartData,
  };
}

export const todayISO = () => toISODate(new Date());
