import type { ReactNode } from 'react';
import type { LogEntry, SectionDef } from '../types';
import { CheckGroup, FieldInput, isEmpty } from './Fields';
import { autoLabel, autoValue, type AutoCtx } from '../lib/auto';
import { useDraft } from '../lib/useDraft';

export function filledCount(def: SectionDef, values: Record<string, unknown>, ctx: AutoCtx) {
  let filled = 0;
  for (const f of def.fields) {
    if (!isEmpty(values[f.key]) || autoValue(f, def, values, ctx) != null) filled++;
  }
  return { filled, total: def.fields.length };
}

export function CardHead({ def, status, actions }: { def: SectionDef; status: ReactNode; actions?: ReactNode }) {
  return (
    <header className="sc-head">
      <span className="sc-emoji" aria-hidden>{def.emoji}</span>
      <div className="sc-titles">
        <h2>{def.title}</h2>
        {def.hint && <span className="sc-hint">{def.hint}</span>}
      </div>
      {status}
      {actions}
    </header>
  );
}

export function Status({ filled, total }: { filled: number; total: number }) {
  const cls = filled === 0 ? 'is-empty' : filled >= total ? 'is-full' : 'is-part';
  return <span className={'sc-status ' + cls}>{filled >= total && total > 0 ? 'готово' : `${filled} из ${total}`}</span>;
}

interface Props {
  def: SectionDef;
  date: string;
  stored?: LogEntry;
  yesterday?: LogEntry;
  ctx: AutoCtx;
  onEditFields: () => void;
  hideGear?: boolean;
  children?: ReactNode;
}

export default function SectionCard({ def, date, stored, yesterday, ctx, onEditFields, hideGear, children }: Props) {
  const { values, setField, setAll } = useDraft(date, def.key, stored?.values);
  const { filled, total } = filledCount(def, values, ctx);
  const canCopy = filled === 0 && yesterday && Object.keys(yesterday.values).length > 0;

  // Отметки идут одной группой там, где встретилась первая из них
  const blocks: ReactNode[] = [];
  const checks = def.fields.filter((f) => f.type === 'check');
  let checksPlaced = false;
  for (const f of def.fields) {
    if (f.type === 'check') {
      if (!checksPlaced) {
        blocks.push(<CheckGroup key="__checks" fields={checks} values={values} onChange={setField} />);
        checksPlaced = true;
      }
      continue;
    }
    blocks.push(
      <FieldInput key={f.key} def={f} value={values[f.key]} onChange={(v) => setField(f.key, v)}
        auto={autoValue(f, def, values, ctx)} autoLabel={autoLabel(f)} />,
    );
  }

  return (
    <section className="sc" style={{ ['--c' as string]: def.color }} aria-label={def.title}>
      <CardHead
        def={def}
        status={<Status filled={filled} total={total} />}
        actions={
          <span className="sc-actions">
            {canCopy && (
              <button type="button" className="btn ghost small" onClick={() => setAll({ ...yesterday!.values })}>как вчера</button>
            )}
            {!hideGear && <button type="button" className="icon-btn small" onClick={onEditFields} aria-label={`Настроить поля: ${def.title}`} title="Настроить поля">⚙</button>}
          </span>
        }
      />
      <div className="sc-body">
        {blocks.length ? blocks : <p className="hint">Полей пока нет. Добавь их через ⚙.</p>}
        {children}
      </div>
    </section>
  );
}
