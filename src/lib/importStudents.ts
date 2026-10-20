/** «Найти учеников в расписании»: из названий занятий в сферах центра и своих — ученики и привязка к занятиям */
import { createEvent, createSeries, db, deleteEvent, endSeriesFrom, seriesDates } from '../db';
import type { CalEvent, LessonKind, Series, Sphere, Student, StudentSource } from '../types';
import { getMoneySettings, newStudent, saveMoneySettings } from './money';
import { addDays, weekday } from './time';

export interface ImportRow { name: string; startMin: number; endMin: number }

export interface Occurrence {
  key: string;
  source: StudentSource;
  sphereId: string;
  title: string;
  startMin: number;
  endMin: number;
  /** Повторяющееся занятие */
  series?: Series;
  /** Разовые занятия (без повтора) */
  events: CalEvent[];
  firstDate: string;
  weekdays: number[];
  interval: number;
  rows: ImportRow[];
}

/** «Марк, Валерия, Настя» → [Марк, Валерия, Настя]; «Саша (Математика)» → [Саша] */
export function parseNames(title: string): string[] {
  return title.replace(/\([^)]*\)/g, ' ').split(/,|;|\+|\s+и\s+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function guessSpheres(spheres: Sphere[]): { am: string | null; own: string | null } {
  const find = (n: string) => spheres.find((s) => !s.deleted && s.name.trim().toLowerCase() === n)?.id ?? null;
  return { am: find('офлайн'), own: find('онлайн') };
}

/** Занятия с даты учёта, у которых ещё не указаны ученики */
export async function scanSchedule(from: string, amSphere: string | null, ownSphere: string | null): Promise<Occurrence[]> {
  const src = (sid: string | null): StudentSource | null => (sid && sid === amSphere ? 'am' : sid && sid === ownSphere ? 'own' : null);
  const out: Occurrence[] = [];
  const horizon = addDays(from, 7 * 12);
  for (const s of (await db.series.toArray()).filter((x) => !x.deleted && !x.students?.length)) {
    const source = src(s.sphereId);
    if (!source) continue;
    const dates = seriesDates(s, from, horizon);
    if (!dates.length) continue;
    const names = parseNames(s.title);
    out.push({
      key: 's:' + s.id, source, sphereId: s.sphereId!, title: s.title, startMin: s.startMin, endMin: s.endMin, series: s, events: [],
      firstDate: dates[0], weekdays: s.weekdays, interval: s.interval,
      rows: (names.length ? names : [s.title]).map((name) => ({ name, startMin: s.startMin, endMin: s.endMin })),
    });
  }
  const singles = (await db.events.where('date').aboveOrEqual(from).toArray())
    .filter((e) => !e.deleted && !e.seriesId && !e.students?.length && src(e.sphereId));
  for (const e of singles) {
    const names = parseNames(e.title);
    out.push({
      key: 'e:' + e.id, source: src(e.sphereId)!, sphereId: e.sphereId!, title: e.title, startMin: e.startMin, endMin: e.endMin, events: [e],
      firstDate: e.date, weekdays: [weekday(e.date)], interval: 0,
      rows: (names.length ? names : [e.title]).map((name) => ({ name, startMin: e.startMin, endMin: e.endMin })),
    });
  }
  return out.sort((a, b) => (a.weekdays[0] - b.weekdays[0]) || a.startMin - b.startMin || a.firstDate.localeCompare(b.firstDate));
}

/**
 * Имена по умолчанию: одно и то же имя у учеников центра — один ученик, у моих — один ученик.
 * Если имя встречается и там и там — нумеруем: «Марк 1» (центр), «Марк 2» (мой). Уже существующих учеников не плодим.
 */
export function defaultNames(occ: Occurrence[], existing: Student[]): Occurrence[] {
  const sources = new Map<string, Set<StudentSource>>();
  for (const o of occ) for (const r of o.rows) sources.set(r.name, (sources.get(r.name) ?? new Set()).add(o.source));
  const has = (name: string, source: StudentSource) => existing.some((s) => s.name === name && s.source === source);
  return occ.map((o) => ({
    ...o,
    rows: o.rows.map((r) => {
      if (has(r.name, o.source)) return r;
      const both = (sources.get(r.name)?.size ?? 0) > 1;
      return both ? { ...r, name: `${r.name} ${o.source === 'am' ? 1 : 2}` } : r;
    }),
  }));
}

export const needsSplit = (o: Occurrence, split: boolean) =>
  split || o.rows.some((r) => r.startMin !== o.startMin || r.endMin !== o.endMin);

/** Применить: создать учеников, привязать к занятиям, при необходимости разделить занятие на отдельные */
export async function applyImport(occ: Occurrence[], splitKeys: Set<string>, from: string, amSphere: string | null, ownSphere: string | null) {
  const students = (await db.students.toArray()).filter((s) => !s.deleted);
  const byKey = new Map(students.map((s) => [`${s.source}|${s.name}`, s]));
  const groupNames = new Set<string>();
  for (const o of occ) if (o.rows.length > 1) for (const r of o.rows) groupNames.add(`${o.source}|${r.name.trim()}`);
  const idFor = async (name: string, source: StudentSource): Promise<string> => {
    const k = `${source}|${name.trim()}`;
    let s = byKey.get(k);
    if (!s) {
      const kind: LessonKind = groupNames.has(k) ? 'group' : 'ind';
      s = newStudent({ name: name.trim(), source, kind });
      await db.students.add(s);
      byKey.set(k, s);
    }
    return s.id;
  };

  let created = 0;
  for (const o of occ) {
    const ids = [];
    for (const r of o.rows) if (r.name.trim()) ids.push(await idFor(r.name, o.source));
    if (!ids.length) continue;
    const now = Date.now();
    if (!needsSplit(o, splitKeys.has(o.key))) {
      if (o.series) await db.series.update(o.series.id, { students: ids, updatedAt: now });
      for (const e of o.events) await db.events.update(e.id, { students: ids, updatedAt: now });
      continue;
    }
    // Разделить: у каждого ученика своё занятие со своим временем; прошлые занятия остаются как были
    for (let i = 0; i < o.rows.length; i++) {
      const r = o.rows[i];
      if (!r.name.trim()) continue;
      const base = { sphereId: o.sphereId, title: r.name.trim(), startMin: r.startMin, endMin: r.endMin, notes: o.series?.notes ?? o.events[0]?.notes ?? '', students: [ids[i]] };
      if (o.series) {
        await createSeries({ ...base, date: o.firstDate }, { interval: o.series.interval, weekdays: o.series.weekdays, until: o.series.until });
      } else {
        for (const e of o.events) await createEvent({ ...base, date: e.date, status: 'planned' });
      }
      created++;
    }
    if (o.series) await endSeriesFrom(o.series.id, from);
    for (const e of o.events) await deleteEvent(e.id);
  }
  const m = await getMoneySettings();
  await saveMoneySettings({ trackFrom: m.trackFrom && m.trackFrom < from ? m.trackFrom : from, amSphereId: amSphere, ownSphereId: ownSphere });
  return { students: byKey.size - students.length, split: created };
}
