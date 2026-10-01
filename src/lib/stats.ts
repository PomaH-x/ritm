import type { CalEvent, Sphere } from '../types';

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
  const res = new Map<string, Progress>(spheres.map((s) => [s.id, { done: 0, planned: 0, minutes: 0 }]));
  for (const e of events) {
    if (e.status === 'skipped' || !e.sphereId) continue;
    const s = byId.get(e.sphereId);
    const p = res.get(e.sphereId);
    if (!s || !p) continue;
    const v = s.normKind === 'count' ? 1 : dur(e);
    if (e.status === 'done') p.done += v; else p.planned += v;
    p.minutes += dur(e);
  }
  if (extraDone) {
    for (const s of spheres) {
      const extra = extraDone.get(s.id);
      if (!extra || s.normKind !== 'count') continue;
      const mine = events.filter((e) => e.sphereId === s.id && e.status !== 'skipped');
      const doneDays = new Set([...extra, ...mine.filter((e) => e.status === 'done').map((e) => e.date)]);
      const p = res.get(s.id)!;
      p.done = doneDays.size;
      p.planned = mine.filter((e) => e.status === 'planned' && !doneDays.has(e.date)).length;
    }
  }
  return res;
}

export function groupMinutes(spheres: Sphere[], progress: Map<string, Progress>): { group: string; minutes: number; color: string }[] {
  const out = new Map<string, { group: string; minutes: number; color: string }>();
  for (const s of spheres) {
    if (!s.group) continue;
    const g = out.get(s.group) ?? { group: s.group, minutes: 0, color: s.color };
    g.minutes += progress.get(s.id)?.minutes ?? 0;
    out.set(s.group, g);
  }
  return [...out.values()];
}
