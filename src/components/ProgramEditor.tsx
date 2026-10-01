import { useState } from 'react';
import Modal from './Modal';
import DayPicker from './DayPicker';
import { saveProgram, uid } from '../db';
import type { Exercise, ExerciseUnit, Workout } from '../types';
import { toast } from './Toast';

const UNITS: [ExerciseUnit, string][] = [['reps', 'повторы'], ['sec', 'секунды'], ['check', 'отметка']];

export default function ProgramEditor({ program, week, onClose }: { program: Workout[]; week: string; onClose: () => void }) {
  const [p, setP] = useState<Workout[]>(() => JSON.parse(JSON.stringify(program)));
  const setW = (i: number, patch: Partial<Workout>) => setP((x) => x.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const setEx = (i: number, k: number, patch: Partial<Exercise>) =>
    setW(i, { exercises: p[i].exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) });

  const save = async () => {
    await saveProgram(p.map((w) => ({ ...w, name: w.name.trim() || 'Тренировка', exercises: w.exercises.filter((e) => e.name.trim()) })));
    toast('Программа сохранена');
    onClose();
  };

  return (
    <Modal title="Программа тренировок" subtitle="Старт — цель первой недели. Прибавка — на сколько растёт цель после выполненной недели." onClose={onClose} wide
      footer={<>
        <button type="button" className="btn ghost" onClick={() => setP((x) => [...x.filter((w) => !w.daily), { id: uid(), name: 'Новая тренировка', weekdays: [], daily: false, exercises: [] }, ...x.filter((w) => w.daily)])}>Добавить тренировку</button>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" onClick={save}>Сохранить</button>
      </>}>
      <div className="prog">
        {p.map((w, i) => (
          <section key={w.id} className="prog-w">
            <div className="prog-head">
              <input className="prog-name" value={w.name} aria-label="Название тренировки" onChange={(e) => setW(i, { name: e.target.value })} />
              {!w.daily && <DayPicker label="Дни тренировки" value={w.weekdays} onChange={(v) => setW(i, { weekdays: v })} />}
              {w.daily && <span className="muted">в дни без тренировки</span>}
              {!w.daily && (
                <button type="button" className="icon-btn small" aria-label={`Удалить тренировку ${w.name}`}
                  onClick={() => setP((x) => x.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
            <div className="prog-table" role="table">
              <div className="prog-row prog-th" role="row">
                <span>Упражнение</span><span>Подходы</span><span>Старт</span><span>Единицы</span><span>Прибавка</span><span>Потолок</span><span />
              </div>
              {w.exercises.map((e, k) => (
                <div key={e.id} className="prog-row" role="row">
                  <input value={e.name} aria-label="Упражнение" onChange={(ev) => setEx(i, k, { name: ev.target.value })} />
                  <input type="number" min={1} value={e.sets} aria-label="Подходы" disabled={e.unit === 'check'}
                    onChange={(ev) => setEx(i, k, { sets: Math.max(1, Number(ev.target.value) || 1) })} />
                  <input type="number" min={0} value={e.base} aria-label="Старт" disabled={e.unit === 'check'}
                    onChange={(ev) => setEx(i, k, { base: Math.max(0, Number(ev.target.value) || 0), startWeek: week })} />
                  <select value={e.unit} aria-label="Единицы" onChange={(ev) => setEx(i, k, { unit: ev.target.value as ExerciseUnit, ...(ev.target.value === 'check' ? { sets: 1 } : {}) })}>
                    {UNITS.map(([u, l]) => <option key={u} value={u}>{l}</option>)}
                  </select>
                  <input type="number" min={0} value={e.inc} aria-label="Прибавка в неделю" disabled={e.unit === 'check'}
                    onChange={(ev) => setEx(i, k, { inc: Math.max(0, Number(ev.target.value) || 0) })} />
                  <input type="number" min={0} value={e.cap ?? ''} placeholder="нет" aria-label="Потолок" disabled={e.unit === 'check'}
                    onChange={(ev) => setEx(i, k, { cap: ev.target.value === '' ? null : Number(ev.target.value) })} />
                  <button type="button" className="icon-btn small" aria-label={`Удалить ${e.name}`}
                    onClick={() => setW(i, { exercises: w.exercises.filter((_, j) => j !== k) })}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="linklike" onClick={() => setW(i, {
              exercises: [...w.exercises, { id: uid(), name: '', sets: 3, base: 10, unit: 'reps', inc: 1, cap: null, startWeek: week }],
            })}>Добавить упражнение</button>
          </section>
        ))}
      </div>
      <p className="hint">Если поменять старт, отсчёт прогрессии начнётся заново с этой недели. Сделанные подходы не теряются.</p>
    </Modal>
  );
}

export function HarderModal({ program, workoutId, ex, week, onClose }: { program: Workout[]; workoutId: string; ex: Exercise; week: string; onClose: () => void }) {
  const [name, setName] = useState(ex.harder ?? ex.name);
  const [base, setBase] = useState(ex.unit === 'sec' ? Math.round(ex.base * 0.7) : Math.max(1, Math.round(ex.base * 0.6)));
  const [cap, setCap] = useState<number | null>(ex.cap);
  const save = async () => {
    await saveProgram(program.map((w) => w.id !== workoutId ? w : {
      ...w,
      exercises: w.exercises.map((e) => e.id !== ex.id ? e : { ...e, id: uid(), name: name.trim() || e.name, base, cap, startWeek: week, harder: undefined }),
    }));
    toast(`Теперь в программе: ${name}`);
    onClose();
  };
  return (
    <Modal title="Усложнить упражнение" subtitle={`${ex.name}: потолок взят. Новое упражнение начнётся с меньшей цели и снова будет расти.`} onClose={onClose}
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Отмена</button><button type="button" className="btn primary" onClick={save}>Заменить</button></>}>
      <div className="form">
        <label className="field"><span>Новое упражнение</span><input data-autofocus value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="row2">
          <label className="field"><span>Старт, {ex.unit === 'sec' ? 'сек' : 'повторов'}</span><input type="number" value={base} onChange={(e) => setBase(Number(e.target.value) || 1)} /></label>
          <label className="field"><span>Потолок</span><input type="number" value={cap ?? ''} placeholder="нет" onChange={(e) => setCap(e.target.value === '' ? null : Number(e.target.value))} /></label>
        </div>
      </div>
    </Modal>
  );
}
