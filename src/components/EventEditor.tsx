import { useState } from 'react';
import Modal from './Modal';
import DayPicker from './DayPicker';
import type { CalEvent, Sphere } from '../types';
import type { Repeat } from '../db';
import { fmtDur, fmtTime, parseTime, plural, WD_SHORT, weekday } from '../lib/time';

export type Draft = Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt' | 'deleted'> & { id?: string; repeat?: Repeat | null };

interface Props {
  draft: Draft;
  spheres: Sphere[];
  onSave: (d: Draft) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
}

const WD_ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

export function repeatSummary(r: Repeat): string {
  const days = [...r.weekdays].sort();
  const when = days.length === 1 ? WD_ACC[days[0] - 1] : `по ${days.map((d) => WD_SHORT[d - 1]).join(', ')}`;
  const every = r.interval === 1 ? '' : `каждые ${r.interval} ${plural(r.interval, 'неделю', 'недели', 'недель')} `;
  const until = r.until ? ` до ${r.until.split('-').reverse().join('.')}` : '';
  return `Повторять ${every}${when}${until}`;
}

export default function EventEditor({ draft, spheres, onSave, onDelete, onDuplicate, onClose }: Props) {
  const [d, setD] = useState<Draft>(draft);
  const [start, setStart] = useState(fmtTime(draft.startMin));
  const [end, setEnd] = useState(fmtTime(draft.endMin));
  const sphere = spheres.find((s) => s.id === d.sphereId);
  const sMin = parseTime(start);
  const eMin = parseTime(end);
  const error = sMin == null || eMin == null ? 'Укажи время начала и конца' : eMin <= sMin ? 'Конец должен быть позже начала' : '';
  const r = d.repeat;
  const setR = (patch: Partial<Repeat>) => setD({ ...d, repeat: { ...(r ?? { interval: 1, weekdays: [weekday(d.date)], until: null }), ...patch } });

  const save = () => {
    if (error || sMin == null || eMin == null) return;
    const repeat = r && r.weekdays.length ? r : r ? { ...r, weekdays: [weekday(d.date)] } : null;
    onSave({ ...d, repeat, title: d.title.trim() || sphere?.name || 'Без названия', startMin: sMin, endMin: eMin });
  };

  return (
    <Modal
      title={draft.id ? (draft.seriesId ? 'Повторяющееся событие' : 'Событие') : 'Новое событие'}
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
          {error || `Длительность ${fmtDur((eMin ?? 0) - (sMin ?? 0))}. Когда время пройдёт, событие считается сделанным; не сделал — удали его.`}
        </p>

        <div className="field">
          <span>Повторять</span>
          <div className="seg">
            <button type="button" className={!r ? 'is-on' : ''} onClick={() => setD({ ...d, repeat: null })}>Не повторять</button>
            <button type="button" className={r ? 'is-on' : ''} onClick={() => setR({})}>Повторять</button>
          </div>
          {r && (
            <div className="repeat">
              <div className="inline">
                <span>Каждую</span>
                <input type="number" min={1} max={12} value={r.interval} aria-label="Интервал в неделях" className="repeat-n"
                  onChange={(e) => setR({ interval: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} />
                <span>{plural(r.interval, 'неделю', 'недели', 'недель')}</span>
              </div>
              <DayPicker label="Дни повтора" value={r.weekdays} onChange={(v) => setR({ weekdays: v })} />
              <div className="inline">
                <label className="toggle"><input type="radio" name="until" checked={!r.until} onChange={() => setR({ until: null })} /> Всегда</label>
                <label className="toggle"><input type="radio" name="until" checked={!!r.until} onChange={() => setR({ until: r.until ?? `${Number(d.date.slice(0, 4)) + 1}-01-01` })} /> До</label>
                {r.until && <input type="date" value={r.until} style={{ width: 'auto' }} onChange={(e) => e.target.value && setR({ until: e.target.value })} />}
              </div>
              <p className="hint repeat-sum">{repeatSummary(r.weekdays.length ? r : { ...r, weekdays: [weekday(d.date)] })}</p>
            </div>
          )}
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
