import type { FieldDef, SectionDef, SectionsConfig } from '../types';

const n = (key: string, label: string, unit: string, step: number, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label, type: 'number', unit, step, ...extra });
const b = (key: string, label: string, hint?: string): FieldDef => ({ key, label, type: 'bool', hint });
const c = (key: string, label: string, hint?: string): FieldDef => ({ key, label, type: 'check', hint });
const t = (key: string, label: string): FieldDef => ({ key, label, type: 'text' });

/** Встроенные разделы — по образцу ежедневного отчёта из плана */
export const BUILTIN_SECTIONS: SectionDef[] = [
  {
    key: 'sleep', title: 'Сон', emoji: '🌙', color: '#8FA3C8', kind: 'generic',
    hint: 'Ночь перед этим днём',
    fields: [
      { key: 'bed', label: 'Лёг', type: 'time' },
      { key: 'wake', label: 'Встал', type: 'time' },
      n('hours', 'Часов сна', 'ч', 0.25, { auto: 'sleepHours' }),
      b('morning', 'Встал сразу, умылся, стакан воды'),
      b('phone', 'Без телефона первые 30 минут'),
      b('sunset', 'Цифровой закат в 00:00'),
      { key: 'feeling', label: 'Самочувствие утром', type: 'scale' },
    ],
  },
  { key: 'sport', title: 'Спорт', emoji: '🏋️', color: '#FF8A3D', kind: 'sport', fields: [] },
  {
    key: 'food', title: 'Питание', emoji: '🥗', color: '#3FB27F', kind: 'generic',
    fields: [
      t('breakfast', 'Завтрак'), t('lunch', 'Обед'), t('snack', 'Перекус'), t('dinner', 'Ужин'),
      n('water', 'Вода', 'л', 0.25, { hint: 'цель 1,5–2 л' }),
      n('protein', 'Белок, примерно', 'г', 10, { hint: 'цель 100 → 120 г' }),
      { key: 'sweets', label: 'Сладкое', type: 'choice', options: ['нет', '1–3 конфеты', 'тёмный шоколад', 'больше нормы'] },
      n('icetea', 'Ice Tea', 'стак.', 1, { hint: 'не больше 1, лучше через день' }),
      n('kvass', 'Квас', 'стак.', 1, { hint: 'не больше 1' }),
      b('fastfood', 'Фастфуд', 'по плану — только в среду'),
    ],
  },
  {
    key: 'work', title: 'Работа', emoji: '💼', color: '#4F8CFF', kind: 'generic', linkGroup: 'Работа',
    fields: [
      n('hours', 'Работал', 'ч', 0.5, { auto: 'groupHours' }),
      b('breaks', 'Перерыв = движение', 'встал, 20 приседаний, вода, окно, проветрить'),
    ],
  },
  {
    key: 'ege', title: 'ЕГЭ', emoji: '📐', color: '#EC6FCF', kind: 'generic',
    fields: [
      n('minutes', 'Занимался', 'мин', 15, { auto: 'sphereMinutes' }),
      n('variants', 'Решено вариантов', 'шт.', 1, { auto: 'trialsCount' }),
      b('part1', 'Первая часть 20–30 минут'),
      t('topics', 'Что разбирал'),
    ],
  },
  {
    key: 'chess', title: 'Шахматы', emoji: '♟️', color: '#A98BFF', kind: 'generic',
    fields: [
      n('minutes', 'Всего', 'мин', 15, { auto: 'sphereMinutes' }),
      n('tactics', 'Тактика', 'мин', 5, { hint: 'норма 15 мин в день' }),
      n('games', 'Партий сыграно', 'шт.', 1),
      b('analysis', 'Разбор партий'),
      n('endgame', 'Эндшпиль', 'мин', 5),
      n('openings', 'Дебюты и стратегия', 'мин', 5),
      t('what', 'Что делал'),
    ],
  },
  {
    key: 'digital', title: 'Цифровая гигиена', emoji: '📵', color: '#7FB7BE', kind: 'generic',
    fields: [
      n('youtube', 'YouTube', 'мин', 5, { hint: 'лимит 60 мин' }),
      n('wt', 'War Thunder', 'мин', 15, { hint: '3 вечера в неделю по 2 часа' }),
      b('onetouch', 'Правило «одно касание»'),
    ],
  },
  {
    key: 'finance', title: 'Финансы', emoji: '💰', color: '#F2C94C', kind: 'finance',
    fields: [
      n('income', 'Доход', '₽', 100),
      n('expenses', 'Расходы', '₽', 100),
      b('saved', 'Отложил 20%'),
      t('note', 'На что ушло'),
    ],
  },
  {
    key: 'hygiene', title: 'Гигиена', emoji: '🚿', color: '#2DD4BF', kind: 'generic',
    fields: [
      c('teethAm', 'Зубы утром'), c('teethPm', 'Зубы вечером'), c('floss', 'Нить и ополаскиватель'),
      c('wash', 'Умывание пенкой'), c('garnier', 'Garnier 3-в-1', '2–3 раза в неделю'),
      c('shower', 'Душ'), c('hair', 'Мытьё головы', 'раз в 2–3 дня'),
    ],
  },
  {
    key: 'state', title: 'Состояние', emoji: '🙂', color: '#E0A96D', kind: 'generic',
    fields: [
      { key: 'energy', label: 'Энергия', type: 'scale' },
      { key: 'mood', label: 'Настроение', type: 'scale' },
      { key: 'good', label: 'Что получилось хорошо', type: 'note' },
      { key: 'hard', label: 'Что было трудно, что сорвалось', type: 'note' },
    ],
  },
];

export const EMPTY_CONFIG: SectionsConfig = { hiddenFields: {}, extraFields: {}, customSections: [], hiddenSections: [], links: {} };

/** Встроенные разделы + настройки пользователя = то, что показываем */
export function resolveSections(cfg: SectionsConfig, includeHidden = false): SectionDef[] {
  const all = [...BUILTIN_SECTIONS, ...cfg.customSections].map((s) => {
    const hidden = new Set(cfg.hiddenFields[s.key] ?? []);
    const fields = [...s.fields, ...(cfg.extraFields[s.key] ?? [])].filter((f) => includeHidden || !hidden.has(f.key));
    return { ...s, fields, linkSphereId: cfg.links[s.key] ?? s.linkSphereId ?? null };
  });
  return includeHidden ? all : all.filter((s) => !cfg.hiddenSections.includes(s.key));
}

export const FIELD_TYPES: [FieldDef['type'], string][] = [
  ['number', 'Число'], ['check', 'Отметка'], ['bool', 'Да / нет'], ['scale', 'Шкала 1–10'],
  ['time', 'Время'], ['choice', 'Выбор из вариантов'], ['text', 'Строка'], ['note', 'Заметка'],
];
