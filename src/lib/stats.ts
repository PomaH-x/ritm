import type { CalEvent, Sphere } from '../types';
import { isPast, logicalNow } from './time';

export interface Progress {
  /** В единицах нормы: минуты или разы */
  done: number;
  planned: number;
  /** Всего минут (для сфер без нормы и для групп) */
  minutes: number;
}

export const dur = (e: Pick<CalEvent, 'startMin' | 'endMin'>) => e.endMin - e.startMin;

/**
 * Прогресс недели по каждой сфере. Пропущенные события не считаются.
 * extraDone — дни, когда дело отмечено в учёте (например, тренировка на странице «День»),
 * даже если в расписании события не было. Для норм «разы» считаем по дням.
 */
export function weekProgress(spheres: Sphere[], events: CalEvent[], extraDone?: Map<string, Set<string>>): Map<string, Progress> {
  const byId = new Map(spheres.map((s) => [s.id, s]));
  const now = logicalNow();
  const res = new Map<string, Progress>(spheres.map((s) => [s.id, { done: 0, planned: 0, minutes: 0 }]));
  for (const e of events) {
    if (e.status === 'skipped' || !e.sphereId) continue;
    const s = byId.get(e.sphereId);
    const p = res.get(e.sphereId);
    if (!s || !p) continue;
    const v = s.normKind === 'count' ? 1 : dur(e);
    // Прошедшее событие = сделано, будущее = в плане
    if (isPast(e, now)) p.done += v; else p.planned += v;
    p.minutes += dur(e);
  }
  if (extraDone) {
    for (const s of spheres) {
      const extra = extraDone.get(s.id);
      if (!extra || s.normKind !== 'count') continue;
      const mine = events.filter((e) => e.sphereId === s.id && e.status !== 'skipped');
      const doneDays = new Set([...extra, ...mine.filter((e) => isPast(e, now)).map((e) => e.date)]);
      const p = res.get(s.id)!;
      p.done = doneDays.size;
      p.planned = mine.filter((e) => !isPast(e, now) && !doneDays.has(e.date)).length;
    }
  }
  return res;
}

/**
 * Сколько времени занято на самом деле: одновременные занятия считаются один раз.
 * Марк 16:00–19:00 и Настя 17:30–19:00 в одно время — это 3 часа работы, а не 4,5.
 */
export function unionMinutes(list: Pick<CalEvent, 'date' | 'startMin' | 'endMin'>[]): number {
  const byDay = new Map<string, [number, number][]>();
  for (const e of list) byDay.set(e.date, [...(byDay.get(e.date) ?? []), [e.startMin, e.endMin]]);
  let total = 0;
  for (const spans of byDay.values()) {
    spans.sort((x, y) => x[0] - y[0]);
    let [cs, ce] = spans[0];
    for (const [s, e] of spans.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else { total += ce - cs; [cs, ce] = [s, e]; }
    }
    total += ce - cs;
  }
  return total;
}

/** Часы по группам сфер (например, «Работа») с учётом одновременных занятий */
export function groupMinutes(spheres: Sphere[], events: CalEvent[]): { group: string; minutes: number; color: string }[] {
  const out = new Map<string, { group: string; minutes: number; color: string }>();
  for (const s of spheres) {
    if (!s.group || out.has(s.group)) continue;
    const ids = new Set(spheres.filter((x) => x.group === s.group).map((x) => x.id));
    const minutes = unionMinutes(events.filter((e) => e.status !== 'skipped' && e.sphereId && ids.has(e.sphereId)));
    out.set(s.group, { group: s.group, minutes, color: s.color });
  }
  return [...out.values()];
}
