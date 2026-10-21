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
  /** Ученики занятия. Не задано — берутся из серии */
  students?: string[];
  /** Формат для тарифа центра, если задан вручную */
  amKind?: LessonKind;
  /** Все ученики отменили занятие — в часы работы не идёт */
  cancelled?: 1;
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
  students?: string[];
  amKind?: LessonKind;
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
export type AutoKind = 'sleepHours' | 'sphereMinutes' | 'groupHours' | 'trialsCount' | 'workIncome';

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

// ---------- Ученики и оплаты ----------

/** am — ученик центра (дань Алексею Максимовичу), own — мой ученик */
export type StudentSource = 'am' | 'own';
export type LessonKind = 'group' | 'ind';
export type PlanKind = 'single' | 'sub4' | 'sub8';

export interface Student extends Base {
  name: string;
  /** Как писать в отчёте: «продал абонемент Иосифу» */
  dative: string;
  source: StudentSource;
  /** Устарело: формат теперь определяется у каждого занятия */
  kind: LessonKind;
  /** Своя ставка за час у моего ученика; null — общая */
  rate: number | null;
  note: string;
  archived: boolean;
}

export interface Tariff { kind: LessonKind; hours: number; plan: PlanKind; total: number; teacher: number; center: number }
/** Тарифы центра, действующие с даты */
export interface TariffSet { from: string; items: Tariff[] }
/** Моя ставка за час, действующая с даты */
export interface RateSet { from: string; rate: number }

export interface Subscription extends Base {
  studentId: string;
  size: 4 | 8;
  /** Срок в днях: 30 или 60 */
  days: number;
  /** Дата продажи и активации */
  start: string;
  /** Продление за болезнь преподавателя или праздники */
  extraDays: number;
  kind: LessonKind;
  hours: number;
  /** Цены на момент продажи */
  total: number;
  teacher: number;
  center: number;
  /** Когда получены деньги; null — ещё не оплачен */
  paidDate: string | null;
  /** Занятий, проведённых по абонементу до начала учёта (вписывается вручную) */
  usedBefore?: number;
  note: string;
}

/** Отметка ученика на занятии. id = событие|ученик */
export interface LessonMark extends Base {
  eventId: string;
  studentId: string;
  date: string;
  cancelled: 0 | 1;
  reason: string;
}

/** Деньги от ученика. lesson — за конкретное занятие, topup — пополнение баланса */
export interface Payment extends Base {
  studentId: string;
  date: string;
  amount: number;
  /** Сколько из этого — мой доход (для учеников центра — без дани) */
  income: number;
  kind: 'lesson' | 'topup';
  eventId: string | null;
}

export interface Premium extends Base {
  /** Понедельник недели, в которой премия уменьшает дань */
  week: string;
  /** За какой месяц премия: YYYY-MM */
  month?: string;
  amount: number;
  note: string;
}

export interface MoneySettings {
  /** С какой даты вести учёт оплат и дани */
  trackFrom: string | null;
  amSphereId: string | null;
  ownSphereId: string | null;
  tariffs: TariffSet[];
  rates: RateSet[];
}
