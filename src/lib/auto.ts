import type { CalEvent, FieldDef, SectionDef, Sphere } from '../types';
import { dur } from './stats';

const toMin = (s: unknown): number | null => {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Часы сна: «лёг» вечером или после полуночи, «встал» утром следующего дня */
export function sleepHours(bed: unknown, wake: unknown): number | null {
  const b0 = toMin(bed);
  const w0 = toMin(wake);
  if (b0 == null || w0 == null) return null;
  const b = b0 < 12 * 60 ? b0 + 1440 : b0;
  let w = w0 + 1440;
  if (w <= b) w += 1440;
  const h = (w - b) / 60;
  return h > 0 && h < 20 ? Math.round(h * 4) / 4 : null;
}

export interface AutoCtx {
  dayEvents: CalEvent[];
  spheres: Sphere[];
}

/** Значение, которое подставляется, пока поле не заполнено вручную */
export function autoValue(f: FieldDef, sec: SectionDef, values: Record<string, unknown>, ctx: AutoCtx): number | null {
  if (!f.auto) return null;
  if (f.auto === 'sleepHours') return sleepHours(values.bed, values.wake);
  if (f.auto === 'sphereMinutes') {
    if (!sec.linkSphereId) return null;
    const m = ctx.dayEvents
      .filter((e) => e.sphereId === sec.linkSphereId && e.status === 'done')
      .reduce((a, e) => a + dur(e), 0);
    return m > 0 ? m : null;
  }
  if (f.auto === 'groupHours') {
    const ids = new Set(ctx.spheres.filter((s) => s.group === sec.linkGroup).map((s) => s.id));
    const m = ctx.dayEvents
      .filter((e) => e.sphereId && ids.has(e.sphereId) && e.status !== 'skipped')
      .reduce((a, e) => a + dur(e), 0);
    return m > 0 ? Math.round((m / 60) * 4) / 4 : null;
  }
  return null;
}

export function autoLabel(f: FieldDef): string {
  if (f.auto === 'sleepHours') return 'посчитано по времени';
  if (f.auto === 'sphereMinutes') return 'из расписания, отмечено «сделано»';
  if (f.auto === 'groupHours') return 'из расписания';
  return '';
}
