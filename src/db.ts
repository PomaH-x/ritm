import Dexie, { type Table } from 'dexie';
import type { CalEvent, KV, LogEntry, SectionsConfig, Settings, Sphere, Task, TemplateItem, Workout } from './types';
import { EMPTY_CONFIG } from './lib/sections';
import { defaultProgram } from './lib/sport';
import { logicalNow, weekDays, weekStartOf, weekday } from './lib/time';

class RitmDB extends Dexie {
  spheres!: Table<Sphere, string>;
  events!: Table<CalEvent, string>;
  kv!: Table<KV, string>;
  logs!: Table<LogEntry, string>;
  tasks!: Table<Task, string>;
  constructor() {
    super('ritm');
    this.version(1).stores({
      spheres: 'id, order, updatedAt',
      events: 'id, date, sphereId, updatedAt',
      kv: 'key',
    });
    this.version(2).stores({
      logs: 'id, date, section, [section+date], updatedAt',
      tasks: 'id, done, updatedAt',
    });
  }
}

export const db = new RitmDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* не https — ниже запасной вариант */ }
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  dayStartHour: 9,
  dayEndHour: 25,
  snapMin: 15,
  hourHeight: 52,
  lightWeekdays: [1, 3, 5],
  lightFromMin: 21 * 60 + 30,
  sunsetMin: 24 * 60,
  restWeekdays: [7],
};

// ---------- Настройки и шаблон недели ----------

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.kv.put({ key: 'settings', value: { ...cur, ...patch }, updatedAt: Date.now() });
}

export async function getTemplate(): Promise<TemplateItem[]> {
  const row = await db.kv.get('weekTemplate');
  return (row?.value as TemplateItem[]) ?? [];
}

export async function saveWeekAsTemplate(weekStart: string) {
  const days = weekDays(weekStart);
  const evs = (await db.events.where('date').between(days[0], days[6], true, true).toArray())
    .filter((e) => !e.deleted);
  // В шаблон попадает только работа и всё, что без нормы: регулярная «скелетная» часть недели
  const spheres = new Map((await db.spheres.toArray()).map((s) => [s.id, s]));
  const items: TemplateItem[] = evs
    .filter((e) => {
      const s = e.sphereId ? spheres.get(e.sphereId) : undefined;
      return s ? s.group === 'Работа' : false;
    })
    .map((e) => ({ weekday: weekday(e.date), startMin: e.startMin, endMin: e.endMin, sphereId: e.sphereId, title: e.title }));
  await db.kv.put({ key: 'weekTemplate', value: items, updatedAt: Date.now() });
  return items.length;
}

export async function applyTemplate(weekStart: string): Promise<number> {
  const items = await getTemplate();
  const days = weekDays(weekStart);
  const existing = (await db.events.where('date').between(days[0], days[6], true, true).toArray())
    .filter((e) => !e.deleted);
  const key = (d: string, s: number, t: string) => `${d}|${s}|${t}`;
  const have = new Set(existing.map((e) => key(e.date, e.startMin, e.title)));
  const now = Date.now();
  const toAdd: CalEvent[] = [];
  for (const it of items) {
    const date = days[it.weekday - 1];
    if (have.has(key(date, it.startMin, it.title))) continue; // не дублируем
    toAdd.push({
      id: uid(), createdAt: now, updatedAt: now, deleted: 0,
      sphereId: it.sphereId, title: it.title, date,
      startMin: it.startMin, endMin: it.endMin, status: 'planned', notes: '',
    });
  }
  await db.events.bulkAdd(toAdd);
  return toAdd.length;
}

export async function copyWeek(fromStart: string, toStart: string): Promise<number> {
  const from = weekDays(fromStart);
  const to = weekDays(toStart);
  const src = (await db.events.where('date').between(from[0], from[6], true, true).toArray())
    .filter((e) => !e.deleted);
  const now = Date.now();
  const copies: CalEvent[] = src.map((e) => ({
    ...e, id: uid(), createdAt: now, updatedAt: now,
    date: to[from.indexOf(e.date)], status: 'planned',
  }));
  await db.events.bulkAdd(copies);
  return copies.length;
}

// ---------- События ----------

export async function createEvent(e: Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
  const now = Date.now();
  const ev: CalEvent = { ...e, id: uid(), createdAt: now, updatedAt: now, deleted: 0 };
  await db.events.add(ev);
  return ev;
}

export async function updateEvent(id: string, patch: Partial<CalEvent>) {
  await db.events.update(id, { ...patch, updatedAt: Date.now() });
}

/** Мягкое удаление: запись остаётся с deleted=1 — так удаление «доедет» до других устройств */
export async function deleteEvent(id: string) {
  await updateEvent(id, { deleted: 1 });
}

// ---------- Сферы ----------

export async function saveSphere(s: Sphere) {
  await db.spheres.put({ ...s, updatedAt: Date.now() });
}

export function newSphere(order: number): Sphere {
  const now = Date.now();
  return {
    id: uid(), createdAt: now, updatedAt: now, deleted: 0,
    name: 'Новая сфера', emoji: '✨', color: '#7FB7BE', order, group: '',
    normKind: 'minutes', normTarget: 120, intensity: 'focus',
    minBlock: 30, defaultBlock: 60, windowFrom: null, windowTo: null,
    inCalendar: true, suggest: true, archived: false, ideas: [],
  };
}

// ---------- Первый запуск ----------

type SeedSphere = Omit<Sphere, 'id' | 'createdAt' | 'updatedAt' | 'deleted' | 'order'> & { key: string };

const base = { windowFrom: null, windowTo: null, inCalendar: true, archived: false } as const;

const SEED_SPHERES: SeedSphere[] = [
  { ...base, key: 'off', name: 'Офлайн', emoji: '🏫', color: '#4F8CFF', group: 'Работа', normKind: 'none', normTarget: 0, intensity: 'focus', minBlock: 60, defaultBlock: 60, suggest: false, ideas: [] },
  { ...base, key: 'on', name: 'Онлайн', emoji: '💻', color: '#E5534B', group: 'Работа', normKind: 'none', normTarget: 0, intensity: 'focus', minBlock: 60, defaultBlock: 60, suggest: false, ideas: [] },
  { ...base, key: 'sis', name: 'Саша', emoji: '👧', color: '#3FB27F', group: 'Работа', normKind: 'none', normTarget: 0, intensity: 'focus', minBlock: 60, defaultBlock: 60, suggest: false, ideas: ['Саша (Математика)', 'Саша (Шахматы)'] },
  { ...base, key: 'ege', name: 'ЕГЭ', emoji: '📐', color: '#EC6FCF', group: '', normKind: 'minutes', normTarget: 600, intensity: 'focus', minBlock: 30, defaultBlock: 90, suggest: true,
    ideas: ['Полный вариант + разбор', 'Первая часть', 'Задания 14, 16, 17', 'Разбор ошибок'] },
  { ...base, key: 'chess', name: 'Шахматы', emoji: '♟️', color: '#A98BFF', group: '', normKind: 'minutes', normTarget: 300, intensity: 'focus', minBlock: 15, defaultBlock: 60, suggest: true,
    ideas: ['Тактика (unichess)', 'Рапид 2 партии + разбор', 'Эндшпиль', 'Классика + разбор', 'Дебюты / стратегия', 'Турнир с обсчётом'] },
  { ...base, key: 'sport', name: 'Спорт', emoji: '🏋️', color: '#FF8A3D', group: '', normKind: 'count', normTarget: 3, intensity: 'active', minBlock: 40, defaultBlock: 60, suggest: true,
    ideas: ['Верх (дома)', 'Низ + спина (улица)', 'Ежедневный минимум'] },
  { ...base, key: 'proj', name: 'Проект', emoji: '🚀', color: '#2DD4BF', group: '', normKind: 'minutes', normTarget: 240, intensity: 'focus', minBlock: 45, defaultBlock: 90, suggest: true,
    ideas: ['MVP «Стены стыда»'] },
  { ...base, key: 'rest', name: 'Отдых', emoji: '☕', color: '#F2C94C', group: '', normKind: 'none', normTarget: 0, intensity: 'rest', minBlock: 15, defaultBlock: 60, suggest: true,
    ideas: ['Прогулка', 'Время с Ксюшей', 'Прогулка + обед', 'Книга'] },
  { ...base, key: 'home', name: 'Быт', emoji: '🧺', color: '#B08D74', group: '', normKind: 'none', normTarget: 0, intensity: 'light', minBlock: 15, defaultBlock: 45, suggest: true,
    ideas: ['Готовка на 2–3 дня', 'Разобрать шкаф', 'Покупки', 'Анализы / стоматолог'] },
  { ...base, key: 'sleep', name: 'Сон', emoji: '🌙', color: '#8FA3C8', group: '', normKind: 'none', normTarget: 0, intensity: 'rest', minBlock: 15, defaultBlock: 30, suggest: true,
    windowFrom: 23 * 60, windowTo: 26 * 60, ideas: ['Ритуал перед сном'] },
];

// Рабочая неделя со скриншота календаря (5–11 октября)
const h = (s: string) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
const SEED_TEMPLATE: [number, string, string, string, string][] = [
  [1, '11:30', '14:00', 'off', 'Ринат, Лёва'],
  [1, '15:00', '17:00', 'off', 'Настя, Арсений, Валерия'],
  [1, '17:00', '18:30', 'off', 'Марианна'],
  [1, '18:30', '20:00', 'off', 'Марк'],
  [1, '20:00', '21:30', 'off', 'Егор'],
  [2, '17:00', '18:00', 'on', 'Марк'],
  [2, '18:00', '19:00', 'on', 'Лера'],
  [2, '19:30', '20:30', 'on', 'Женя'],
  [3, '11:00', '12:00', 'on', 'Арина'],
  [3, '15:00', '16:00', 'on', 'Таисия'],
  [3, '16:00', '17:00', 'on', 'Герман'],
  [3, '17:00', '18:00', 'on', 'Марк'],
  [3, '18:00', '19:30', 'on', 'Полина'],
  [3, '19:30', '20:30', 'on', 'Илья'],
  [3, '20:30', '22:00', 'sis', 'Саша (Математика)'],
  [4, '16:00', '19:00', 'off', 'Марк, Валерия, Настя'],
  [4, '19:00', '20:30', 'off', 'Егор'],
  [5, '16:00', '19:00', 'off', 'Сергей, Иосиф, Платон'],
  [5, '19:00', '20:30', 'off', 'Марк'],
  [5, '21:00', '22:00', 'sis', 'Саша (Шахматы)'],
  [6, '10:00', '11:00', 'on', 'Кира'],
  [6, '11:00', '12:00', 'on', 'Арина'],
  [6, '12:00', '13:00', 'on', 'Марк'],
  [6, '13:00', '14:00', 'on', 'Женя'],
  [7, '10:30', '12:00', 'sis', 'Саша (Шахматы)'],
];

let seeding: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  if (!seeding) seeding = doSeed().then(seedV2).then(seedV3);
  return seeding;
}

const PLAN_TASKS = [
  'Сдать ОАК + ферритин + ТТГ',
  'Записаться к стоматологу на профчистку',
  'Купить пенку для умывания и Garnier 3-в-1',
  'Начать учёт расходов',
  'Открыть накопительный счёт',
  'Открыть брокерский счёт (пока не вкладывать)',
  'Собрать базовый гардероб: рубашки, джинсы, чиносы, носки, бельё, ремень',
  'Разобрать шкаф',
  'Сделать MVP «Стены стыда»',
];

/** Данные для этапа 2: разделы учёта, программа тренировок, задачи из плана */
async function seedV2() {
  if (await db.kv.get('seededV2')) return;
  const now = Date.now();
  const spheres = await db.spheres.toArray();
  const byName = (n: string) => spheres.find((s) => s.name === n && !s.deleted)?.id ?? null;
  const cfg: SectionsConfig = { ...EMPTY_CONFIG, links: { ege: byName('ЕГЭ'), chess: byName('Шахматы'), sport: byName('Спорт') } };
  const tasks: Task[] = PLAN_TASKS.map((title, i) => ({
    id: uid(), createdAt: now + i, updatedAt: now + i, deleted: 0, title, done: 0, doneDate: null,
  }));
  await db.transaction('rw', db.kv, db.tasks, async () => {
    if (!(await db.kv.get('sectionsConfig'))) await db.kv.put({ key: 'sectionsConfig', value: cfg, updatedAt: now });
    if (!(await db.kv.get('program'))) await db.kv.put({ key: 'program', value: defaultProgram(weekStartOf(logicalNow().date)), updatedAt: now });
    if ((await db.tasks.count()) === 0) await db.tasks.bulkAdd(tasks);
    await db.kv.put({ key: 'seededV2', value: true, updatedAt: now });
  });
}

/**
 * Уточнения после этапа 2: четверг и воскресенье — одна и та же тренировка на улице,
 * в дни без тренировки — ежедневный минимум. Спорт в расписании связан с учётом.
 */
async function seedV3() {
  if (await db.kv.get('seededV3')) return;
  const now = Date.now();
  const prog = ((await db.kv.get('program'))?.value as Workout[] | undefined) ?? [];
  if (prog.some((w) => w.id === 'w-sun')) {
    const next = prog
      .filter((w) => w.id !== 'w-sun')
      .map((w) => {
        if (w.id === 'w-bottom') return { ...w, name: w.name === 'Низ + спина, на улице' ? 'Низ + спина (улица)' : w.name, weekdays: [...new Set([...w.weekdays, 7])].sort() };
        if (w.id === 'w-top') return { ...w, name: w.name === 'Верх' ? 'Верх (дома)' : w.name };
        if (w.daily) return { ...w, weekdays: [1, 3, 5, 6] };
        return w;
      });
    await db.kv.put({ key: 'program', value: next, updatedAt: now });
  }
  const spheres = await db.spheres.toArray();
  const sport = spheres.find((s) => s.name === 'Спорт' && !s.deleted);
  if (sport && sport.ideas.join('|') === 'Верх|Низ + спина (улица)|Турники + растяжка с Ксюшей') {
    await db.spheres.put({ ...sport, ideas: ['Верх (дома)', 'Низ + спина (улица)', 'Ежедневный минимум'], updatedAt: now });
  }
  const cfg = await getSectionsConfig();
  if (sport && !cfg.links.sport) await saveSectionsConfig({ ...cfg, links: { ...cfg.links, sport: sport.id } });
  await db.kv.put({ key: 'seededV3', value: true, updatedAt: now });
}

// ---------- Учёт по дням ----------

export const logId = (section: string, date: string) => `${section}@${date}`;

export async function saveLog(date: string, section: string, values: Record<string, unknown>) {
  const id = logId(section, date);
  const now = Date.now();
  const cur = await db.logs.get(id);
  await db.logs.put({ id, date, section, values, createdAt: cur?.createdAt ?? now, updatedAt: now, deleted: 0 });
}

export async function getSectionsConfig(): Promise<SectionsConfig> {
  const row = await db.kv.get('sectionsConfig');
  return { ...EMPTY_CONFIG, ...((row?.value as Partial<SectionsConfig>) ?? {}) };
}

export async function saveSectionsConfig(cfg: SectionsConfig) {
  await db.kv.put({ key: 'sectionsConfig', value: cfg, updatedAt: Date.now() });
}

export async function saveProgram(p: Workout[]) {
  await db.kv.put({ key: 'program', value: p, updatedAt: Date.now() });
}

export async function addTask(title: string) {
  const now = Date.now();
  await db.tasks.add({ id: uid(), createdAt: now, updatedAt: now, deleted: 0, title, done: 0, doneDate: null });
}

export async function updateTask(id: string, patch: Partial<Task>) {
  await db.tasks.update(id, { ...patch, updatedAt: Date.now() });
}

async function doSeed() {
  const done = await db.kv.get('seeded');
  if (done) return;
  const now = Date.now();
  const ids: Record<string, string> = {};
  const spheres: Sphere[] = SEED_SPHERES.map(({ key, ...s }, i) => {
    const id = uid();
    ids[key] = id;
    return { ...s, id, order: i, createdAt: now, updatedAt: now, deleted: 0 };
  });
  const template: TemplateItem[] = SEED_TEMPLATE.map(([wd, a, b, k, title]) => ({
    weekday: wd, startMin: h(a), endMin: h(b), sphereId: ids[k], title,
  }));
  await db.transaction('rw', db.spheres, db.kv, async () => {
    await db.spheres.bulkAdd(spheres);
    await db.kv.put({ key: 'settings', value: DEFAULT_SETTINGS, updatedAt: now });
    await db.kv.put({ key: 'weekTemplate', value: template, updatedAt: now });
    await db.kv.put({ key: 'seeded', value: true, updatedAt: now });
  });
  await applyTemplate(weekStartOf(logicalNow().date));
}

// ---------- Резервная копия ----------

export interface Backup {
  app: 'ritm';
  version: 1;
  exportedAt: string;
  spheres: Sphere[];
  events: CalEvent[];
  kv: KV[];
  logs?: LogEntry[];
  tasks?: Task[];
}

export async function exportAll(): Promise<Backup> {
  return {
    app: 'ritm', version: 1, exportedAt: new Date().toISOString(),
    spheres: await db.spheres.toArray(),
    events: await db.events.toArray(),
    kv: await db.kv.toArray(),
    logs: await db.logs.toArray(),
    tasks: await db.tasks.toArray(),
  };
}

/** Слияние по правилу «побеждает более свежая правка» — тот же принцип будет у синхронизации */
export async function importAll(data: Backup): Promise<{ added: number; updated: number }> {
  if (data?.app !== 'ritm') throw new Error('Это не резервная копия Ритма');
  let added = 0;
  let updated = 0;
  await db.transaction('rw', [db.spheres, db.events, db.kv, db.logs, db.tasks], async () => {
    const merge = async <T extends { updatedAt: number }>(table: Table<T, string>, rows: T[], keyOf: (r: T) => string) => {
      for (const r of rows ?? []) {
        const cur = await table.get(keyOf(r));
        if (!cur) { await table.put(r); added++; }
        else if (r.updatedAt > cur.updatedAt) { await table.put(r); updated++; }
      }
    };
    await merge(db.spheres, data.spheres, (r) => r.id);
    await merge(db.events, data.events, (r) => r.id);
    await merge(db.kv, data.kv, (r) => r.key);
    await merge(db.logs, data.logs ?? [], (r) => r.id);
    await merge(db.tasks, data.tasks ?? [], (r) => r.id);
  });
  return { added, updated };
}

export async function resetAll() {
  await db.delete();
  location.reload();
}
