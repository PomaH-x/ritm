import { useState } from 'react';
import { db, newSphere, saveSphere } from '../db';
import { useSpheres } from '../lib/hooks';
import { fmtTime, parseTime } from '../lib/time';
import type { Intensity, NormKind, Sphere } from '../types';
import { toast } from '../components/Toast';

const PALETTE = ['#4F8CFF', '#E5534B', '#3FB27F', '#EC6FCF', '#A98BFF', '#FF8A3D', '#2DD4BF', '#F2C94C', '#B08D74', '#8FA3C8', '#7FB7BE', '#E0A96D'];

const INTENSITY: [Intensity, string, string][] = [
  ['focus', 'Концентрация', 'учёба, работа, проект'],
  ['active', 'Физическая', 'тренировки'],
  ['light', 'Лёгкая', 'дела по дому, мелочи'],
  ['rest', 'Отдых', 'восстановление, сон'],
];

function normLabel(s: Sphere) {
  if (s.normKind === 'none' || !s.normTarget) return 'без нормы';
  if (s.normKind === 'count') return `${s.normTarget} раза в неделю`;
  return `${String(Math.round(s.normTarget / 6) / 10).replace('.', ',')} ч в неделю`;
}

function SphereForm({ sphere, onDone }: { sphere: Sphere; onDone: () => void }) {
  const [s, setS] = useState<Sphere>(sphere);
  const [ideas, setIdeas] = useState(sphere.ideas.join('\n'));
  const [winFrom, setWinFrom] = useState(sphere.windowFrom != null ? fmtTime(sphere.windowFrom) : '');
  const [winTo, setWinTo] = useState(sphere.windowTo != null ? fmtTime(sphere.windowTo) : '');
  const set = <K extends keyof Sphere>(k: K, v: Sphere[K]) => setS((x) => ({ ...x, [k]: v }));

  const normInput = s.normKind === 'minutes' ? Math.round(s.normTarget / 6) / 10 : s.normTarget;

  const save = async () => {
    const wf = winFrom ? parseTime(winFrom) : null;
    let wt = winTo ? parseTime(winTo) : null;
    if (wf != null && wt != null && wt <= wf) wt += 1440;
    await saveSphere({
      ...s,
      name: s.name.trim() || 'Без названия',
      ideas: ideas.split('\n').map((x) => x.trim()).filter(Boolean),
      windowFrom: wf, windowTo: wf != null ? wt : null,
    });
    toast('Сохранено');
    onDone();
  };

  return (
    <form className="form sphere-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="row2">
        <label className="field">
          <span>Название</span>
          <input value={s.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field narrow">
          <span>Значок</span>
          <input value={s.emoji} maxLength={4} onChange={(e) => set('emoji', e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Цвет</span>
        <div className="swatches">
          {PALETTE.map((c) => (
            <button key={c} type="button" className={'swatch' + (s.color.toLowerCase() === c.toLowerCase() ? ' is-on' : '')}
              style={{ background: c }} aria-label={`Цвет ${c}`} onClick={() => set('color', c)} />
          ))}
          <label className="swatch custom" style={{ background: s.color }} title="Свой цвет">
            <input type="color" value={s.color} onChange={(e) => set('color', e.target.value)} aria-label="Свой цвет" />
          </label>
        </div>
      </div>

      <div className="field">
        <span>Норма на неделю</span>
        <div className="norm-edit">
          <div className="seg">
            {([['minutes', 'Часы'], ['count', 'Разы'], ['none', 'Без нормы']] as [NormKind, string][]).map(([k, l]) => (
              <button key={k} type="button" className={s.normKind === k ? 'is-on' : ''}
                onClick={() => setS((x) => ({ ...x, normKind: k, normTarget: k === 'minutes' ? (x.normKind === 'count' ? 120 : x.normTarget || 120) : k === 'count' ? 3 : 0 }))}>
                {l}
              </button>
            ))}
          </div>
          {s.normKind !== 'none' && (
            <input type="number" inputMode="decimal" min={0} step={s.normKind === 'minutes' ? 0.5 : 1} value={normInput}
              aria-label="Величина нормы"
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value.replace(',', '.')) || 0);
                set('normTarget', s.normKind === 'minutes' ? Math.round(v * 60) : Math.round(v));
              }} />
          )}
          {s.normKind !== 'none' && <span className="muted">{s.normKind === 'minutes' ? 'ч' : 'раз'}</span>}
        </div>
      </div>

      <div className="field">
        <span>Тип нагрузки</span>
        <div className="seg wrap">
          {INTENSITY.map(([k, l, hint]) => (
            <button key={k} type="button" title={hint} className={s.intensity === k ? 'is-on' : ''} onClick={() => set('intensity', k)}>{l}</button>
          ))}
        </div>
        <p className="hint">Вечером в «лёгкие» дни и после цифрового заката тяжёлое не предлагается.</p>
      </div>

      <div className="row3">
        <label className="field">
          <span>Минимальный блок, мин</span>
          <input type="number" min={5} step={5} value={s.minBlock} onChange={(e) => set('minBlock', Number(e.target.value) || 5)} />
        </label>
        <label className="field">
          <span>Обычный блок, мин</span>
          <input type="number" min={5} step={5} value={s.defaultBlock} onChange={(e) => set('defaultBlock', Number(e.target.value) || 5)} />
        </label>
        <label className="field">
          <span>Группа</span>
          <input value={s.group} placeholder="например, Работа" onChange={(e) => set('group', e.target.value)} />
        </label>
      </div>

      <div className="row2">
        <label className="field">
          <span>Предлагать с</span>
          <input type="time" value={winFrom} onChange={(e) => setWinFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>до</span>
          <input type="time" value={winTo} onChange={(e) => setWinTo(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Быстрые названия, по одному в строке</span>
        <textarea rows={3} value={ideas} onChange={(e) => setIdeas(e.target.value)} />
      </label>

      <div className="toggles">
        <label className="toggle"><input type="checkbox" checked={s.inCalendar} onChange={(e) => set('inCalendar', e.target.checked)} /> Показывать в расписании</label>
        <label className="toggle"><input type="checkbox" checked={s.suggest} onChange={(e) => set('suggest', e.target.checked)} /> Предлагать в свободное время</label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn ghost danger" onClick={async () => {
          await saveSphere({ ...sphere, archived: !sphere.archived });
          toast(sphere.archived ? 'Сфера возвращена' : 'Сфера в архиве, события остались');
          onDone();
        }}>{sphere.archived ? 'Вернуть из архива' : 'В архив'}</button>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onDone}>Отмена</button>
        <button type="submit" className="btn primary">Сохранить</button>
      </div>
    </form>
  );
}

export default function SpheresPage() {
  const all = useSpheres(true) ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<Sphere | null>(null);
  const active = all.filter((s) => !s.archived);
  const archived = all.filter((s) => s.archived);

  const move = async (i: number, dir: -1 | 1) => {
    const a = active[i];
    const b = active[i + dir];
    if (!a || !b) return;
    await db.transaction('rw', db.spheres, async () => {
      await saveSphere({ ...a, order: b.order });
      await saveSphere({ ...b, order: a.order });
    });
  };

  const row = (s: Sphere, i: number, list: Sphere[]) => (
    <li key={s.id} className={'sphere-row' + (open === s.id ? ' is-open' : '')} style={{ ['--c' as string]: s.color }}>
      <div className="sphere-line">
        <span className="sphere-dot" aria-hidden />
        <button type="button" className="sphere-open" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
          <span className="sphere-emoji" aria-hidden>{s.emoji}</span>
          <span className="sphere-name">{s.name}</span>
          {s.group && <span className="tag">{s.group}</span>}
          <span className="sphere-norm">{normLabel(s)}</span>
        </button>
        {!s.archived && (
          <span className="order-btns">
            <button type="button" className="icon-btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">↑</button>
            <button type="button" className="icon-btn small" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">↓</button>
          </span>
        )}
      </div>
      {open === s.id && <SphereForm sphere={s} onDone={() => setOpen(null)} />}
    </li>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Сферы и нормы</h1>
        <button type="button" className="btn primary" onClick={() => setDraftNew(newSphere((all[all.length - 1]?.order ?? 0) + 1))}>Новая сфера</button>
      </div>
      <p className="page-lead">Нормы задают, сколько времени в неделю ты хочешь отдавать каждой сфере. По ним считается прогресс и строятся подсказки в расписании.</p>

      {draftNew && (
        <div className="sphere-row is-open" style={{ ['--c' as string]: draftNew.color }}>
          <SphereForm sphere={draftNew} onDone={() => setDraftNew(null)} />
        </div>
      )}

      <ul className="sphere-list">{active.map((s, i) => row(s, i, active))}</ul>

      {archived.length > 0 && (
        <>
          <h2 className="section-title">Архив</h2>
          <ul className="sphere-list is-archive">{archived.map((s, i) => row(s, i, archived))}</ul>
        </>
      )}
    </div>
  );
}
