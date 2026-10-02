export type NormKind = 'minutes' | 'count' | 'none';
/** Насколько дело «тяжёлое»: влияет на рекомендации (вечером — только лёгкое и т. д.) */
export type Intensity = 'focus' | 'active' | 'light' | 'rest';
export type EventStatus = 'planned' | 'done' | 'skipped';

/** Общие поля всех записей — понадобятся для синхронизации (last-write-wins). */
export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
}

export interface Sphere extends Base {
  name: string;
  emoji: string;
  color: string;
  order: number;
  /** Группа для сводки (например, три вида работы → «Работа») */
  group: string;
  normKind: NormKind;
  /** минуты — для 'minutes', количество раз — для 'count' */
  normTarget: number;
  intensity: Intensity;
  /** Меньше этого блока заниматься сферой неэффективно, мин */
  minBlock: number;
  /** Типичная длительность одного блока, мин */
  defaultBlock: number;
  /** Окно времени, в которое сферу имеет смысл предлагать (минуты логического дня) */
  windowFrom: number | null;
  windowTo: number | null;
  inCalendar: boolean;
  suggest: boolean;
  archived: boolean;
  /** Быстрые названия для событий */
  ideas: string[];
}

export interface CalEvent extends Base {
  sphereId: string | null;
  title: string;
  /** Логический день YYYY-MM-DD (всё до 04:00 относится к предыдущему дню) */
  date: string;
  /** Минуты от 00:00 логического дня; могут быть > 1440 (00:30 ночи = 1470) */
  startMin: number;
  endMin: number;
  status: EventStatus;
  notes: string;
  /** Если событие — повторение серии */
  seriesId?: string;
}

/** Повторяющееся событие: каждые interval недель по выбранным дням */
export interface Series extends Base {
  sphereId: string | null;
  title: string;
  startMin: number;
  endMin: number;
  weekdays: number[];
  interval: number;
  startDate: string;
  until: string | null;
  notes: string;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  dayStartHour: number;
  dayEndHour: number; // может быть > 24 (25 = 01:00)
  snapMin: number;
  hourHeight: number;
  /** Дни недели 1..7 (Пн..Вс), в которые после lightFromMin только лёгкие дела */
  lightWeekdays: number[];
  lightFromMin: number;
  /** Цифровой закат, минуты логического дня */
  sunsetMin: number;
  restWeekdays: number[];
}

export interface TemplateItem {
  weekday: number; // 1..7
  startMin: number;
  endMin: number;
  sphereId: string | null;
  title: string;
}

export interface KV {
  key: string;
  value: unknown;
  updatedAt: number;
}

// ---------- Этап 2: учёт по сферам ----------

export type FieldType = 'number' | 'time' | 'bool' | 'check' | 'scale' | 'choice' | 'text' | 'note';

/** Значение, которое можно посчитать само: из расписания или из других полей */
export type AutoKind = 'sleepHours' | 'sphereMinutes' | 'groupHours' | 'trialsCount';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  step?: number;
  hint?: string;
  options?: string[];
  auto?: AutoKind;
  /** Добавлено пользователем */
  custom?: boolean;
}

export type SectionKind = 'generic' | 'sport' | 'finance';

export interface SectionDef {
  key: string;
  title: string;
  emoji: string;
  color: string;
  kind: SectionKind;
  hint?: string;
  fields: FieldDef[];
  /** Для автоподсчёта минут из расписания */
  linkSphereId?: string | null;
  linkGroup?: string;
  custom?: boolean;
}

export interface SectionsConfig {
  hiddenFields: Record<string, string[]>;
  extraFields: Record<string, FieldDef[]>;
  customSections: SectionDef[];
  hiddenSections: string[];
  links: Record<string, string | null>;
}

/** Запись учёта за день по одному разделу. id = раздел@дата — одинаковый на всех устройствах */
export interface LogEntry extends Base {
  date: string;
  section: string;
  values: Record<string, unknown>;
}

export interface Task extends Base {
  title: string;
  done: 0 | 1;
  doneDate: string | null;
}

export type ExerciseUnit = 'reps' | 'sec' | 'check';

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  base: number;
  unit: ExerciseUnit;
  /** Прибавка за неделю, если цель прошлой недели выполнена */
  inc: number;
  /** Потолок: дальше не прибавляем, а предлагаем усложнить */
  cap: number | null;
  /** Неделя (понедельник), с которой считается прогрессия */
  startWeek: string;
  note?: string;
  harder?: string;
}

export interface Workout {
  id: string;
  name: string;
  weekdays: number[];
  daily: boolean;
  exercises: Exercise[];
}
