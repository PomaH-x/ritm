import type { Exercise, LogEntry, Workout } from '../types';
import { addDays, weekStartOf } from './time';

export type SetsMap = Record<string, (number | null)[]>;

export function setsOf(log: LogEntry | undefined, exId: string): (number | null)[] {
  const s = (log?.values.sets as SetsMap | undefined)?.[exId];
  return Array.isArray(s) ? s : [];
}

function weekDone(ex: Exercise, target: number, logs: LogEntry[]): boolean {
  return logs.some((l) => {
    const filled = setsOf(l, ex.id).filter((v): v is number => typeof v === 'number');
    return filled.length >= ex.sets && filled.every((v) => v >= target);
  });
}

export interface Target {
  value: number;
  prev: number | null;
  capReached: boolean;
}

/**
 * Цель на неделю. Начинаем с base и за каждую неделю, где цель была выполнена
 * (хотя бы в один день все подходы не меньше цели), прибавляем inc.
 * Неделя без выполнения — цель не растёт. На потолке предлагаем усложнение.
 */
export function targetFor(ex: Exercise, weekStart: string, sportLogs: LogEntry[]): Target {
  if (ex.unit === 'check') return { value: 0, prev: null, capReached: false };
  const byWeek = new Map<string, LogEntry[]>();
  for (const l of sportLogs) {
    const w = weekStartOf(l.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), l]);
  }
  let t = ex.base;
  let prev: number | null = null;
  let w = weekStartOf(ex.startWeek);
  let guard = 0;
  while (w < weekStart && guard++ < 520) {
    prev = t;
    if (ex.cap != null && t >= ex.cap) break;
    if (weekDone(ex, t, byWeek.get(w) ?? [])) t = Math.min(ex.cap ?? Infinity, t + ex.inc);
    w = addDays(w, 7);
  }
  return { value: t, prev, capReached: ex.cap != null && t >= ex.cap };
}

export function fmtTarget(ex: Exercise, v: number) {
  if (ex.unit === 'check') return '';
  return `${ex.sets} × ${v}${ex.unit === 'sec' ? ' с' : ''}`;
}

let n = 0;
const ex = (name: string, sets: number, base: number, unit: Exercise['unit'], inc: number, cap: number | null, startWeek: string, extra: Partial<Exercise> = {}): Exercise =>
  ({ id: `ex${++n}`, name, sets, base, unit, inc, cap, startWeek, ...extra });

export function defaultProgram(startWeek: string): Workout[] {
  n = 0;
  return [
    {
      id: 'w-top', name: 'Верх (дома)', weekdays: [2], daily: false, exercises: [
        ex('Разминка', 1, 0, 'check', 0, null, startWeek),
        ex('Отжимания от пола', 3, 20, 'reps', 1, 30, startWeek, { harder: 'Отжимания с ногами на возвышении' }),
        ex('Отжимания узкие (трицепс)', 3, 10, 'reps', 1, 20, startWeek, { harder: 'Алмазные отжимания' }),
        ex('Планка', 3, 60, 'sec', 5, 120, startWeek, { harder: 'Планка с подъёмом руки' }),
        ex('Лодочка (спина)', 3, 30, 'sec', 5, 60, startWeek),
      ],
    },
    {
      id: 'w-bottom', name: 'Низ + спина (улица)', weekdays: [4, 7], daily: false, exercises: [
        ex('Разминка', 1, 0, 'check', 0, null, startWeek),
        ex('Приседания', 3, 15, 'reps', 1, 25, startWeek, { harder: 'Приседания с паузой внизу или выпрыгивания' }),
        ex('Подтягивания', 4, 6, 'reps', 1, 12, startWeek, { harder: 'Подтягивания с медленным опусканием' }),
        ex('Австралийские подтягивания', 3, 10, 'reps', 1, 20, startWeek),
        ex('Отжимания на брусьях', 3, 10, 'reps', 1, 20, startWeek),
        ex('Вис на турнике', 3, 20, 'sec', 5, 60, startWeek, { note: 'после каждого круга' }),
      ],
    },
    {
      id: 'w-daily', name: 'Ежедневный минимум', weekdays: [1, 3, 5, 6], daily: true, exercises: [
        ex('Отжимания', 1, 25, 'reps', 1, 40, startWeek),
        ex('Скручивания', 2, 25, 'reps', 1, 35, startWeek, { note: 'медленно' }),
        ex('Приседания', 1, 15, 'reps', 1, 30, startWeek),
        ex('Планка', 3, 60, 'sec', 5, 120, startWeek),
        ex('Ягодичный мост', 4, 20, 'reps', 1, 30, startWeek, { note: '2 подхода утром, 2 вечером' }),
        ex('Dead bug', 1, 0, 'check', 0, null, startWeek, { note: 'до полного отказа' }),
      ],
    },
  ];
}

/** Какая тренировка выбрана в записи дня: явный выбор или по расписанию программы */
export function chosenWorkoutId(log: LogEntry | undefined, program: Workout[], weekdayNum: number): string {
  const explicit = log?.values.workoutId as string | undefined;
  if (explicit) return explicit;
  return program.find((w) => !w.daily && w.weekdays.includes(weekdayNum))?.id ?? 'rest';
}

export function exerciseDone(log: LogEntry | undefined, e: Exercise): boolean {
  const s = setsOf(log, e.id);
  if (e.unit === 'check') return s[0] === 1;
  return s.filter((v) => typeof v === 'number').length >= e.sets;
}

/** Выполнение дня: тренировка (если выбрана) или ежедневный минимум */
export function sportDayStatus(log: LogEntry | undefined, program: Workout[], weekdayNum: number) {
  const id = chosenWorkoutId(log, program, weekdayNum);
  const workout = program.find((w) => w.id === id && !w.daily);
  const list = workout ? workout.exercises : program.filter((w) => w.daily).flatMap((w) => w.exercises);
  const done = list.filter((e) => exerciseDone(log, e)).length;
  // Тренировка засчитана, если сделано больше половины упражнений
  const trained = !!workout && done > 0 && done >= Math.ceil(list.length / 2);
  return { workout: workout ?? null, done, total: list.length, trained };
}
