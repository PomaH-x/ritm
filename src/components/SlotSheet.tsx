import { useMemo } from 'react';
import Modal from './Modal';
import type { CalEvent, Settings, Sphere } from '../types';
import { recommend, type Slot } from '../lib/recommend';
import { fmtDayLong, fmtDur, fmtTime } from '../lib/time';

interface Props {
  slot: Slot;
  spheres: Sphere[];
  weekEvents: CalEvent[];
  settings: Settings;
  onCreate: (sphere: Sphere, title: string, startMin: number, endMin: number) => void;
  onCustom: () => void;
  onClose: () => void;
  extraDone?: Map<string, Set<string>>;
}

export default function SlotSheet({ slot, spheres, weekEvents, settings, onCreate, onCustom, onClose, extraDone }: Props) {
  const len = slot.endMin - slot.startMin;
  const res = useMemo(() => recommend(slot, spheres, weekEvents, settings, settings.snapMin, extraDone), [slot, spheres, weekEvents, settings, extraDone]);
  const topIds = new Set(res.top.map((t) => t.sphere.id));
  const others = spheres.filter((s) => s.inCalendar && !topIds.has(s.id));

  return (
    <Modal
      title={`Свободно ${fmtDur(len)}`}
      subtitle={`${fmtDayLong(slot.date)}, ${fmtTime(slot.startMin)}–${fmtTime(slot.endMin)}`}
      onClose={onClose}
      footer={<button type="button" className="btn ghost" onClick={onCustom}>Своё событие…</button>}
    >
      {res.top.length > 0 ? (
        <div className="sugg-list">
          {res.top.map((t, i) => (
            <div key={t.sphere.id} className={'sugg' + (i === 0 ? ' is-first' : '')} style={{ ['--c' as string]: t.sphere.color }}>
              <div className="sugg-main">
                <div className="sugg-name">
                  <span className="sugg-emoji" aria-hidden>{t.sphere.emoji}</span>
                  {t.sphere.name}
                </div>
                {t.reasons.length > 0 && <div className="sugg-why">{t.reasons.join('; ')}</div>}
                {t.sphere.ideas.length > 0 && (
                  <div className="chips">
                    {t.sphere.ideas.slice(0, 4).map((idea) => (
                      <button key={idea} type="button" className="chip"
                        onClick={() => onCreate(t.sphere, idea, slot.startMin, slot.startMin + t.duration)}>
                        {idea}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="sugg-actions">
                <button type="button" className="btn sphere" data-autofocus={i === 0 ? '' : undefined}
                  onClick={() => onCreate(t.sphere, t.sphere.name, slot.startMin, slot.startMin + t.duration)}>
                  {fmtDur(t.duration)}
                </button>
                {t.duration < len && (
                  <button type="button" className="btn ghost small"
                    onClick={() => onCreate(t.sphere, t.sphere.name, slot.startMin, slot.endMin)}>
                    весь слот
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-note">Все недельные нормы набраны. Можно отдохнуть или взять что-то сверх плана.</p>
      )}

      {res.skipped.length > 0 && (
        <p className="sugg-skipped">
          Не предлагаю: {res.skipped.map((s) => `${s.sphere.name.toLowerCase()} — ${s.reason}`).join('; ')}.
        </p>
      )}

      {others.length > 0 && (
        <>
          <h3 className="section-title">Другое, на весь слот</h3>
          <div className="chips">
            {others.map((s) => (
              <button key={s.id} type="button" className="chip dot" style={{ ['--c' as string]: s.color }}
                onClick={() => onCreate(s, s.name, slot.startMin, slot.endMin)}>
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
