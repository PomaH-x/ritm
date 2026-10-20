import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { applyImport, defaultNames, guessSpheres, needsSplit, scanSchedule, type Occurrence } from '../lib/importStudents';
import { getMoneySettings } from '../lib/money';
import { useSpheres } from '../lib/hooks';
import { db } from '../db';
import { fmtTime, logicalNow, parseTime, WD_SHORT, weekStartOf } from '../lib/time';

const SRC_LABEL = { am: 'центр', own: 'мой' } as const;

export default function ImportWizard({ onClose }: { onClose: () => void }) {
  const spheres = useSpheres() ?? [];
  const [from, setFrom] = useState(weekStartOf(logicalNow().date));
  const [am, setAm] = useState<string | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [occ, setOcc] = useState<Occurrence[] | null>(null);
  const [split, setSplit] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>([]);

  // Сферы: сохранённые в настройках или «Офлайн» / «Онлайн»
  useEffect(() => {
    if (!spheres.length || am !== null || own !== null) return;
    getMoneySettings().then((m) => {
      const g = guessSpheres(spheres);
      setAm(m.amSphereId ?? g.am ?? '');
      setOwn(m.ownSphereId ?? g.own ?? '');
      if (m.trackFrom) setFrom((f) => (m.trackFrom! > f ? m.trackFrom! : f));
    });
  }, [spheres, am, own]);

  useEffect(() => {
    if (am === null || own === null) return;
    let alive = true;
    Promise.all([scanSchedule(from, am || null, own || null), db.students.toArray()]).then(([o, st]) => {
      if (!alive) return;
      const live = st.filter((s) => !s.deleted);
      setOcc(defaultNames(o, live));
      setNames(live.map((s) => s.name));
    });
    return () => { alive = false; };
  }, [from, am, own]);

  const setRow = (key: string, i: number, patch: Partial<Occurrence['rows'][number]>) =>
    setOcc((list) => list?.map((o) => (o.key !== key ? o : { ...o, rows: o.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })) ?? null);

  const allNames = useMemo(() => {
    const s = new Set(names);
    for (const o of occ ?? []) for (const r of o.rows) if (r.name.trim()) s.add(r.name.trim());
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [occ, names]);
  const newCount = allNames.filter((n) => !names.includes(n)).length;

  const apply = async () => {
    if (!occ) return;
    setBusy(true);
    try {
      const r = await applyImport(occ, split, from, am || null, own || null);
      toast(`Учеников добавлено: ${r.students}${r.split ? `, отдельных занятий создано: ${r.split}` : ''}`);
      onClose();
    } catch (e) {
      toast('Не получилось: ' + (e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  };

  return (
    <Modal title="Найти учеников в расписании" wide onClose={onClose}
      subtitle="Ученики берутся из названий занятий. Проверь имена и время — у каждого ученика может быть своё время внутри общего занятия."
      footer={<>
        <span className="muted">{occ ? `Занятий: ${occ.length} · новых учеников: ${newCount}` : ''}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" disabled={!occ?.length || busy} onClick={apply}>{busy ? 'Сохраняю…' : 'Готово'}</button>
      </>}>
      <div className="form">
        <div className="row3">
          <label className="field">
            <span>Вести учёт с</span>
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Ученики центра (АМ)</span>
            <select value={am ?? ''} onChange={(e) => setAm(e.target.value)}>
              <option value="">—</option>
              {spheres.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Мои ученики</span>
            <select value={own ?? ''} onChange={(e) => setOwn(e.target.value)}>
              <option value="">—</option>
              {spheres.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <p className="hint">Занятия до этой даты в учёт не попадут и останутся как были. Саша и остальные сферы не учитываются.</p>

        {!occ ? <p className="muted">Ищу…</p> : !occ.length ? (
          <p className="empty-note">Новых занятий без учеников не нашлось.</p>
        ) : (
          <div className="imp-list">
            {occ.map((o) => {
              const multi = o.rows.length > 1;
              const isSplit = needsSplit(o, split.has(o.key));
              return (
                <div key={o.key} className={'imp ' + (o.source === 'am' ? 'is-am' : 'is-own')}>
                  <div className="imp-head">
                    <b>{o.weekdays.map((w) => WD_SHORT[w - 1]).join(', ')} {fmtTime(o.startMin)}–{fmtTime(o.endMin)}</b>
                    <span className="tag">{SRC_LABEL[o.source]}</span>
                    <span className="muted imp-title">«{o.title}»{o.series ? (o.interval > 1 ? ` · раз в ${o.interval} нед.` : '') : ` · ${o.firstDate.split('-').reverse().slice(0, 2).join('.')}, без повтора`}</span>
                  </div>
                  {o.rows.map((r, i) => (
                    <div key={i} className="imp-row">
                      <input value={r.name} list="imp-names" aria-label="Ученик" onChange={(e) => setRow(o.key, i, { name: e.target.value })} />
                      <input type="time" value={fmtTime(r.startMin)} aria-label="Начало"
                        onChange={(e) => { const v = parseTime(e.target.value); if (v != null) setRow(o.key, i, { startMin: v }); }} />
                      <input type="time" value={fmtTime(r.endMin)} aria-label="Конец"
                        onChange={(e) => { const v = parseTime(e.target.value); if (v != null) setRow(o.key, i, { endMin: v }); }} />
                      {o.rows.length > 1 && (
                        <button type="button" className="icon-btn small" aria-label={`Убрать ${r.name}`}
                          onClick={() => setOcc((l) => l?.map((x) => (x.key !== o.key ? x : { ...x, rows: x.rows.filter((_, j) => j !== i) })) ?? null)}>✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="linklike imp-add" onClick={() => setOcc((l) => l?.map((x) => (x.key !== o.key ? x
                    : { ...x, rows: [...x.rows, { name: '', startMin: x.startMin, endMin: x.endMin }] })) ?? null)}>+ ученик</button>
                  {multi && (
                    <label className="toggle imp-split">
                      <input type="checkbox" checked={isSplit} disabled={isSplit && !split.has(o.key)}
                        onChange={(e) => setSplit((s) => { const n = new Set(s); if (e.target.checked) n.add(o.key); else n.delete(o.key); return n; })} />
                      Разделить на отдельные занятия{isSplit && !split.has(o.key) ? ' — у учеников разное время' : ''}
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <datalist id="imp-names">{allNames.map((n) => <option key={n} value={n} />)}</datalist>
        <p className="hint">
          Одинаковые имена — один ученик. Чтобы разделить тёзок, поменяй имя в строке (например, «Марк 3»). Если имя есть и у центра, и у тебя, оно уже пронумеровано.
          Разделённое занятие превращается в отдельные занятия каждого ученика с этой даты; прошлые не меняются.
        </p>
      </div>
    </Modal>
  );
}
