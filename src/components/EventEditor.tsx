import { useState } from 'react';
import Modal from './Modal';
import type { CalEvent, EventStatus, Sphere } from '../types';
import { fmtDur, fmtTime, parseTime } from '../lib/time';

export type Draft = Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt' | 'deleted'> & { id?: string };

interface Props {
  draft: Draft;
  spheres: Sphere[];
  onSave: (d: Draft) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
}

const STATUSES: [EventStatus, string][] = [['planned', 'В плане'], ['done', 'Сделано'], ['skipped', 'Пропущено']];

export default function EventEditor({ draft, spheres, onSave, onDelete, onDuplicate, onClose }: Props) {
  const [d, setD] = useState<Draft>(draft);
  const [start, setStart] = useState(fmtTime(draft.startMin));
  const [end, setEnd] = useState(fmtTime(draft.endMin));
  const sphere = spheres.find((s) => s.id === d.sphereId);
  const sMin = parseTime(start);
  const eMin = parseTime(end);
  const error = sMin == null || eMin == null ? 'Укажи время начала и конца' : eMin <= sMin ? 'Конец должен быть позже начала' : '';

  const save = () => {
    if (error || sMin == null || eMin == null) return;
    onSave({ ...d, title: d.title.trim() || sphere?.name || 'Без названия', startMin: sMin, endMin: eMin });
  };

  return (
    <Modal
      title={draft.id ? 'Событие' : 'Новое событие'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button type="button" className="btn danger ghost" onClick={onDelete}>Удалить</button>}
          {onDuplicate && <button type="button" className="btn ghost" onClick={onDuplicate}>Копия на завтра</button>}
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={save} disabled={!!error}>Сохранить</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          <span>Название</span>
          <input data-autofocus={draft.id ? undefined : ''} value={d.title} placeholder={sphere?.name ?? 'Что будешь делать'}
            onChange={(e) => setD({ ...d, title: e.target.value })} />
        </label>

        <div className="field">
          <span>Сфера</span>
          <div className="chips">
            {spheres.filter((s) => s.inCalendar).map((s) => (
              <button key={s.id} type="button" style={{ ['--c' as string]: s.color }}
                className={'chip dot' + (s.id === d.sphereId ? ' is-on' : '')}
                aria-pressed={s.id === d.sphereId}
                onClick={() => setD({ ...d, sphereId: s.id })}>
                {s.name}
              </button>
            ))}
          </div>
          {sphere && sphere.ideas.length > 0 && (
            <div className="chips ideas">
              {sphere.ideas.map((idea) => (
                <button key={idea} type="button" className="chip subtle" onClick={() => setD({ ...d, title: idea })}>{idea}</button>
              ))}
            </div>
          )}
        </div>

        <div className="row3">
          <label className="field">
            <span>День</span>
            <input type="date" value={d.date} onChange={(e) => e.target.value && setD({ ...d, date: e.target.value })} />
          </label>
          <label className="field">
            <span>Начало</span>
            <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Конец</span>
            <input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <p className={'hint' + (error ? ' is-error' : '')}>
          {error || `Длительность ${fmtDur((eMin ?? 0) - (sMin ?? 0))}. Время до 04:00 относится к этому же дню.`}
        </p>

        <div className="field">
          <span>Статус</span>
          <div className="seg" role="radiogroup">
            {STATUSES.map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={d.status === v}
                className={d.status === v ? 'is-on' : ''} onClick={() => setD({ ...d, status: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Заметка</span>
          <textarea rows={2} value={d.notes} placeholder="Необязательно"
            onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
