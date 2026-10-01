import type { Exercise, LogEntry, SectionDef, Workout } from '../types';
import { useDraft } from '../lib/useDraft';
import { chosenWorkoutId, exerciseDone, fmtTarget, setsOf, targetFor, type SetsMap } from '../lib/sport';
import { weekday, weekStartOf } from '../lib/time';
import { CardHead, Status } from './SectionCard';

interface Props {
  def: SectionDef;
  date: string;
  stored?: LogEntry;
  program: Workout[];
  sportLogs: LogEntry[];
  onEditProgram: () => void;
  onHarder: (workoutId: string, ex: Exercise) => void;
}

export default function SportCard({ def, date, stored, program, sportLogs, onEditProgram, onHarder }: Props) {
  const { values, setField } = useDraft(date, 'sport', stored?.values);
  const week = weekStartOf(date);
  const wd = weekday(date);
  const trainings = program.filter((w) => !w.daily);
  const planned = trainings.find((w) => w.weekdays.includes(wd));
  const log = { values } as unknown as LogEntry;
  const chosenId = chosenWorkoutId(log, program, wd);
  const workout = trainings.find((w) => w.id === chosenId);
  // В день тренировки — тренировка, в остальные дни — ежедневный минимум
  const daily = workout ? [] : program.filter((w) => w.daily);
  const dailyName = program.find((w) => w.daily)?.name ?? 'Ежедневный минимум';
  const sets = (values.sets as SetsMap | undefined) ?? {};

  const setSets = (exId: string, arr: (number | null)[]) => {
    const next = { ...sets, [exId]: arr };
    if (arr.every((v) => v == null)) delete next[exId];
    setField('sets', next);
  };

  const isDone = (ex: Exercise) => exerciseDone(log, ex);

  const all = [...(workout?.exercises ?? []), ...daily.flatMap((w) => w.exercises)];
  const doneCount = all.filter(isDone).length;

  const row = (w: Workout, ex: Exercise) => {
    const t = targetFor(ex, week, sportLogs);
    const s = setsOf(log, ex.id);
    if (ex.unit === 'check') {
      const on = s[0] === 1;
      return (
        <li key={ex.id} className="ex-row is-check">
          <button type="button" className={'f-check' + (on ? ' is-on' : '')} aria-pressed={on}
            onClick={() => setSets(ex.id, on ? [] : [1])}>
            <span className="f-box" aria-hidden>{on ? '✓' : ''}</span>
            <span>{ex.name}{ex.note && <small>{ex.note}</small>}</span>
          </button>
        </li>
      );
    }
    const grown = t.prev != null && t.value > t.prev;
    return (
      <li key={ex.id} className={'ex-row' + (isDone(ex) ? ' is-done' : '')}>
        <div className="ex-name">
          <span>{ex.name}</span>
          <small>
            цель {fmtTarget(ex, t.value)}
            {grown && <b className="ex-up"> +{t.value - t.prev!} к прошлой неделе</b>}
            {ex.note && ` · ${ex.note}`}
          </small>
        </div>
        <div className="ex-sets">
          {Array.from({ length: ex.sets }, (_, i) => (
            <input key={i} inputMode="numeric" aria-label={`${ex.name}, подход ${i + 1}`}
              placeholder={String(t.value)} value={s[i] ?? ''}
              className={typeof s[i] === 'number' && (s[i] as number) < t.value ? 'is-short' : ''}
              onChange={(e) => {
                const v = e.target.value.trim() === '' ? null : Number(e.target.value);
                const next = Array.from({ length: ex.sets }, (_, j) => (j === i ? (Number.isFinite(v as number) ? v : null) : (s[j] ?? null)));
                setSets(ex.id, next);
              }} />
          ))}
          <button type="button" className="btn ghost small ex-fill" onClick={() => setSets(ex.id, Array(ex.sets).fill(t.value))}
            aria-label={`${ex.name}: все подходы по цели`}>по цели</button>
        </div>
        {t.capReached && (
          <div className="ex-cap">
            Потолок {t.value}{ex.unit === 'sec' ? ' с' : ''} взят — пора усложнить{ex.harder ? `: ${ex.harder.toLowerCase()}` : ''}.
            <button type="button" className="linklike" onClick={() => onHarder(w.id, ex)}>Усложнить</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="sc sport" style={{ ['--c' as string]: def.color }} aria-label={def.title}>
      <CardHead
        def={def}
        status={<Status filled={doneCount} total={all.length} />}
        actions={<span className="sc-actions"><button type="button" className="btn ghost small" onClick={onEditProgram}>Программа</button></span>}
      />
      <div className="sc-body">
        <div className="chips" role="radiogroup" aria-label="Тренировка дня">
          {trainings.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={chosenId === w.id}
              className={'chip' + (chosenId === w.id ? ' is-on plain' : '')}
              onClick={() => setField('workoutId', w.id)}>
              {w.name}{planned?.id === w.id && <small className="chip-note">по плану</small>}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={chosenId === 'rest'}
            className={'chip' + (chosenId === 'rest' ? ' is-on plain' : '')} onClick={() => setField('workoutId', 'rest')}>
            {dailyName}{!planned && <small className="chip-note">по плану</small>}
          </button>
        </div>

        {workout && <ul className="ex-list">{workout.exercises.map((ex) => row(workout, ex))}</ul>}

        {daily.map((w) => (
          <ul key={w.id} className="ex-list">{w.exercises.map((ex) => row(w, ex))}</ul>
        ))}

        <label className="f-col">
          <span className="f-label">Самочувствие после</span>
          <input value={(values.feeling as string) ?? ''} placeholder="Как прошло" onChange={(e) => setField('feeling', e.target.value || undefined)} />
        </label>
        <p className="hint">Цель растёт на шаг в неделю, если на прошлой неделе хотя бы раз все подходы сделаны по цели. Не сделал — цель остаётся прежней.</p>
      </div>
    </section>
  );
}
