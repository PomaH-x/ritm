/** Пробные варианты ЕГЭ: баллы и задания с ошибками. Хранятся как запись дня «egeTrials». */
import type { LogEntry } from '../types';
import { plural } from './time';

export const pts = (n: number) => `${n} ${plural(n, 'балл', 'балла', 'баллов')}`;

export interface Trial { id: string; score: number; errors: number[]; at: number }
export interface DatedTrial extends Trial { date: string }

export const TRIALS = 'egeTrials';
export const TASKS = Array.from({ length: 19 }, (_, i) => i + 1);

export function trialsOf(log: LogEntry | undefined): Trial[] {
  const items = log?.values.items;
  return Array.isArray(items) ? (items as Trial[]) : [];
}

export function trialsIn(logs: LogEntry[], from: string, to: string): DatedTrial[] {
  return logs
    .filter((l) => l.section === TRIALS && !l.deleted && l.date >= from && l.date <= to)
    .flatMap((l) => trialsOf(l).map((t) => ({ ...t, date: l.date })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
}

/** Задания, в которых чаще всего ошибки: «17 (3), 19 (2)» */
export function topErrors(trials: Trial[], n = 3): string {
  const c = new Map<number, number>();
  for (const t of trials) for (const e of t.errors) c.set(e, (c.get(e) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, n).map(([k, v]) => `${k} (${v})`).join(', ');
}

export const trialText = (t: Trial) => `${pts(t.score)}${t.errors.length ? ` (ошибки: ${[...t.errors].sort((a, b) => a - b).join(', ')})` : ' (без ошибок)'}`;
