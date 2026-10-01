import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '../db';
import type { CalEvent, LogEntry, SectionsConfig, Settings, Sphere, Task, Workout } from '../types';
import { EMPTY_CONFIG } from './sections';
import { logicalNow } from './time';

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), []);
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export function useSpheres(includeArchived = false): Sphere[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.spheres.orderBy('order').toArray();
    return all.filter((s) => !s.deleted && (includeArchived || !s.archived));
  }, [includeArchived]);
}

export function useEventsBetween(from: string, to: string): CalEvent[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.events.where('date').between(from, to, true, true).toArray();
    return rows.filter((e) => !e.deleted);
  }, [from, to]);
}

/** Текущее время, обновляется раз в минуту */
export function useNow() {
  const [now, setNow] = useState(() => logicalNow());
  useEffect(() => {
    const t = setInterval(() => setNow(logicalNow()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

export type Route = 'week' | 'day' | 'reports' | 'spheres' | 'settings';

export function useRoute(): [Route, (r: Route) => void] {
  const read = (): Route => {
    const h = location.hash.replace('#/', '').split('/')[0];
    return h === 'spheres' || h === 'settings' || h === 'day' || h === 'reports' ? h : 'week';
  };
  const [r, setR] = useState<Route>(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [r, (x) => { location.hash = '#/' + x; }];
}

// ---------- Этап 2 ----------

export function useSectionsConfig(): SectionsConfig | undefined {
  return useLiveQuery(async () => {
    const row = await db.kv.get('sectionsConfig');
    return { ...EMPTY_CONFIG, ...((row?.value as Partial<SectionsConfig>) ?? {}) };
  }, []);
}

export function useProgram(): Workout[] | undefined {
  return useLiveQuery(async () => ((await db.kv.get('program'))?.value as Workout[]) ?? [], []);
}

export function useLogsOn(date: string): Map<string, LogEntry> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.logs.where('date').equals(date).toArray();
    return new Map(rows.filter((r) => !r.deleted).map((r) => [r.section, r]));
  }, [date]);
}

export function useSectionLogs(section: string, from = '0000', to = '9999'): LogEntry[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.logs.where('[section+date]').between([section, from], [section, to], true, true).toArray();
    return rows.filter((r) => !r.deleted);
  }, [section, from, to]);
}

export function useTasks(): Task[] | undefined {
  return useLiveQuery(async () => (await db.tasks.toArray()).filter((t) => !t.deleted).sort((a, b) => a.createdAt - b.createdAt), []);
}
