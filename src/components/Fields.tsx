import { useEffect, useRef, useState } from 'react';
import type { FieldDef } from '../types';

export const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

const numStr = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

export function fmtValue(f: FieldDef, v: unknown): string {
  if (isEmpty(v)) return '—';
  if (f.type === 'bool') return v ? 'да' : 'нет';
  if (f.type === 'check') return v ? '✓' : '—';
  if (f.type === 'number') return `${numStr(v as number)}${f.unit ? ' ' + f.unit : ''}`;
  if (f.type === 'scale') return `${v}/10`;
  return String(v);
}

interface Props {
  def: FieldDef;
  value: unknown;
  auto?: number | null;
  autoLabel?: string;
  onChange: (v: unknown) => void;
}

function NumberField({ def, value, auto, autoLabel, onChange }: Props) {
  const step = def.step ?? 1;
  const [text, setText] = useState(isEmpty(value) ? '' : numStr(value as number));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(isEmpty(value) ? '' : numStr(value as number)); }, [value]);
  const usingAuto = isEmpty(value) && auto != null;
  const cur = isEmpty(value) ? (auto ?? 0) : (value as number);
  const commit = (s: string) => {
    if (s.trim() === '') { onChange(undefined); return; }
    const v = Number(s.replace(',', '.').replace(/\s/g, ''));
    if (Number.isFinite(v)) onChange(Math.max(0, v));
  };
  const bump = (d: number) => onChange(Math.max(0, Math.round((cur + d) * 100) / 100));
  return (
    <div className="f-row">
      <span className="f-label">
        {def.label}
        {(def.hint || usingAuto) && <small>{usingAuto ? autoLabel : def.hint}</small>}
      </span>
      <div className="f-num">
        <button type="button" className="f-step" aria-label={`Уменьшить: ${def.label}`} onClick={() => bump(-step)}>−</button>
        <input
          inputMode="decimal" value={text} aria-label={def.label}
          placeholder={auto != null ? numStr(auto) : '0'}
          className={usingAuto ? 'is-auto' : ''}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
          onBlur={(e) => { focused.current = false; commit(e.target.value); setText(e.target.value.trim() === '' ? '' : e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <button type="button" className="f-step" aria-label={`Увеличить: ${def.label}`} onClick={() => bump(step)}>+</button>
        {def.unit && <span className="f-unit">{def.unit}</span>}
      </div>
    </div>
  );
}

export function FieldInput(p: Props) {
  const { def, value, onChange } = p;
  switch (def.type) {
    case 'number':
      return <NumberField {...p} />;
    case 'time':
      return (
        <label className="f-row">
          <span className="f-label">{def.label}{def.hint && <small>{def.hint}</small>}</span>
          <input type="time" className="f-time" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
        </label>
      );
    case 'bool':
      return (
        <div className="f-row">
          <span className="f-label">{def.label}{def.hint && <small>{def.hint}</small>}</span>
          <div className="seg f-yn" role="radiogroup" aria-label={def.label}>
            {([[true, 'да'], [false, 'нет']] as const).map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={value === v}
                className={value === v ? `is-on ${v ? 'yes' : 'no'}` : ''}
                onClick={() => onChange(value === v ? undefined : v)}>{l}</button>
            ))}
          </div>
        </div>
      );
    case 'scale':
      return (
        <div className="f-col">
          <span className="f-label">{def.label}{def.hint && <small>{def.hint}</small>}</span>
          <div className="f-scale" role="radiogroup" aria-label={def.label}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={value === n}
                className={value === n ? 'is-on' : (typeof value === 'number' && n < value ? 'is-under' : '')}
                onClick={() => onChange(value === n ? undefined : n)}>{n}</button>
            ))}
          </div>
        </div>
      );
    case 'choice':
      return (
        <div className="f-col">
          <span className="f-label">{def.label}{def.hint && <small>{def.hint}</small>}</span>
          <div className="chips">
            {(def.options ?? []).map((o) => (
              <button key={o} type="button" aria-pressed={value === o} className={'chip' + (value === o ? ' is-on plain' : '')}
                onClick={() => onChange(value === o ? undefined : o)}>{o}</button>
            ))}
          </div>
        </div>
      );
    case 'note':
      return (
        <label className="f-col">
          <span className="f-label">{def.label}</span>
          <TextBox multiline value={(value as string) ?? ''} onCommit={(v) => onChange(v || undefined)} />
        </label>
      );
    case 'text':
      return (
        <label className="f-col">
          <span className="f-label">{def.label}{def.hint && <small>{def.hint}</small>}</span>
          <TextBox value={(value as string) ?? ''} onCommit={(v) => onChange(v || undefined)} />
        </label>
      );
    default:
      return null;
  }
}

/** Текст сохраняем по мере набора, но без лишних перерисовок */
function TextBox({ value, onCommit, multiline }: { value: string; onCommit: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const props = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setV(e.target.value); onCommit(e.target.value); },
  };
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
}

/** Группа отметок одним рядом: зубы, душ и т. п. */
export function CheckGroup({ fields, values, onChange }: { fields: FieldDef[]; values: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="f-checks">
      {fields.map((f) => (
        <button key={f.key} type="button" aria-pressed={!!values[f.key]} title={f.hint}
          className={'f-check' + (values[f.key] ? ' is-on' : '')}
          onClick={() => onChange(f.key, values[f.key] ? undefined : true)}>
          <span className="f-box" aria-hidden>{values[f.key] ? '✓' : ''}</span>
          <span>{f.label}{f.hint && <small>{f.hint}</small>}</span>
        </button>
      ))}
    </div>
  );
}
