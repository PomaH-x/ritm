import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, logId, saveLog, uid } from '../db';
import { pts, TASKS, TRIALS, trialsOf, type Trial } from '../lib/ege';
import { toast } from './Toast';

/** Пробные варианты за день — внутри карточки ЕГЭ */
export default function EgeTrials({ date }: { date: string }) {
  const items = useLiveQuery(async () => trialsOf(await db.logs.get(logId(TRIALS, date))), [date]) ?? [];
  const [form, setForm] = useState<{ score: string; errors: number[] } | null>(null);
  const save = async (next: Trial[]) => saveLog(date, TRIALS, { items: next });

  const add = async () => {
    if (!form) return;
    const score = Number(form.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) { toast('Балл — число от 0 до 100'); return; }
    await save([...items, { id: uid(), score: Math.round(score), errors: [...form.errors].sort((a, b) => a - b), at: Date.now() }]);
    setForm(null);
  };

  return (
    <div className="trials">
      <h3 className="sc-sub">Пробные варианты</h3>
      {items.map((t, i) => (
        <div key={t.id} className="trial">
          <span><b>{t.score}</b> {pts(t.score).split(' ')[1]}</span>
          <span className="muted">{t.errors.length ? `ошибки: ${t.errors.join(', ')}` : 'без ошибок'}</span>
          <button type="button" className="icon-btn small" aria-label={`Удалить вариант ${i + 1}`}
            onClick={async () => {
              const prev = items;
              await save(items.filter((x) => x.id !== t.id));
              toast('Вариант удалён', { label: 'Отменить', run: () => save(prev) });
            }}>✕</button>
        </div>
      ))}
      {form ? (
        <div className="trial-form">
          <label className="f-row">
            <span className="f-label">Тестовый балл</span>
            <input className="trial-score" inputMode="numeric" value={form.score} data-autofocus placeholder="0–100"
              onChange={(e) => setForm({ ...form, score: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </label>
          <span className="f-label">Задания с ошибками</span>
          <div className="trial-tasks">
            {TASKS.map((n) => {
              const on = form.errors.includes(n);
              return (
                <button key={n} type="button" aria-pressed={on} className={on ? 'is-on' : ''}
                  onClick={() => setForm({ ...form, errors: on ? form.errors.filter((x) => x !== n) : [...form.errors, n] })}>{n}</button>
              );
            })}
          </div>
          <div className="btn-row">
            <button type="button" className="btn primary small" disabled={!form.score} onClick={add}>Сохранить</button>
            <button type="button" className="btn ghost small" onClick={() => setForm(null)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn ghost small trial-add" onClick={() => setForm({ score: '', errors: [] })}>Добавить пробный вариант</button>
      )}
    </div>
  );
}
