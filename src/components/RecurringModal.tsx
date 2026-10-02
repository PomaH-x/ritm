import { useState } from 'react';
import Modal from './Modal';
import type { CalEvent, Sphere } from '../types';
import { fmtTime, WD_SHORT, weekday } from '../lib/time';

/** Разово: выбрать события недели, которые должны повторяться каждую неделю */
export default function RecurringModal({ events, spheres, weekLabel, onClose, onConfirm }: {
  events: CalEvent[]; spheres: Sphere[]; weekLabel: string; onClose: () => void; onConfirm: (list: CalEvent[]) => void;
}) {
  const byId = new Map(spheres.map((s) => [s.id, s]));
  const list = events.filter((e) => !e.seriesId).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const [on, setOn] = useState<Set<string>>(() => new Set(list.filter((e) => byId.get(e.sphereId ?? '')?.group === 'Работа').map((e) => e.id)));
  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal title="Повторять каждую неделю" subtitle={`Отмеченные события недели ${weekLabel} будут появляться на всех следующих неделях в те же дни и время.`}
      onClose={onClose} wide
      footer={<>
        <span className="muted">{on.size ? `Выбрано: ${on.size}` : ''}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" disabled={!on.size} onClick={() => onConfirm(list.filter((e) => on.has(e.id)))}>Повторять</button>
      </>}>
      {list.length ? (
        <ul className="rec-list">
          {list.map((e) => {
            const s = byId.get(e.sphereId ?? '');
            return (
              <li key={e.id}>
                <label className="toggle" style={{ ['--c' as string]: s?.color ?? '#8792a2' }}>
                  <input type="checkbox" checked={on.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="rec-day">{WD_SHORT[weekday(e.date) - 1]} {fmtTime(e.startMin)}–{fmtTime(e.endMin)}</span>
                  <span className="rec-dot" />
                  <span>{e.title}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : <p className="hint">На этой неделе нет событий без повтора.</p>}
      <p className="hint">Если на следующих неделях уже стоят такие же события (вручную или из старого шаблона), они заменятся повторами, чтобы не было двойных.</p>
    </Modal>
  );
}
