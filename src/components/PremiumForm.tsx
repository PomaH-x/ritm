import { useMemo, useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { ask } from './Confirm';
import { db } from '../db';
import { weekTitle } from '../lib/amReport';
import { money, savePremium } from '../lib/money';
import { addDays, logicalNow, weekStartOf } from '../lib/time';
import type { Premium } from '../types';

export const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const monthName = (ym: string) => MONTH_NOM[Number(ym.slice(5, 7)) - 1] ?? ym;

/** Прошлый месяц: премию за него обычно сообщают в начале следующего */
function prevMonth(today: string) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Премия за месяц, вычитается из дани выбранной недели */
export default function PremiumForm({ premium, week, trackFrom, onClose }: {
  premium?: Premium; week: string; trackFrom: string | null; onClose: () => void;
}) {
  const today = logicalNow().date;
  const [month, setMonth] = useState(premium?.month ?? prevMonth(today));
  const [amount, setAmount] = useState(premium ? String(premium.amount) : '');
  const [target, setTarget] = useState(premium?.week ?? week);
  const n = Math.round(Number(amount) || 0);
  // Месяцы на выбор: текущий и полгода назад
  const months = useMemo(() => {
    const out: string[] = [];
    let ym = today.slice(0, 7);
    for (let i = 0; i < 7; i++) { out.push(ym); ym = prevMonth(ym + '-01'); }
    if (!out.includes(month)) out.push(month);
    return out;
  }, [today, month]);

  // Недели на выбор: от начала учёта (или 8 недель назад) до 4 недель вперёд
  const weeks = useMemo(() => {
    const cur = weekStartOf(today);
    let from = addDays(cur, -7 * 8);
    if (trackFrom && weekStartOf(trackFrom) > from) from = weekStartOf(trackFrom);
    const out: string[] = [];
    for (let w = from; w <= addDays(cur, 28); w = addDays(w, 7)) out.push(w);
    if (!out.includes(target)) out.push(target);
    return out.sort().reverse();
  }, [today, trackFrom, target]);

  const save = async () => {
    if (n <= 0) { toast('Укажи сумму'); return; }
    await savePremium({ id: premium?.id, week: target, month, amount: n, note: premium?.note ?? '' });
    toast(`Премия за ${monthName(month)} ${money(n)} — в отчёте за ${weekTitle(target)}`);
    onClose();
  };

  return (
    <Modal title={premium ? 'Премия' : 'Премия за месяц'} onClose={onClose}
      footer={<>
        {premium && <button type="button" className="btn ghost danger" onClick={async () => {
          if (!(await ask(`Удалить премию за ${monthName(premium.month ?? month)}?`, 'Удалить', true))) return;
          await db.premiums.update(premium.id, { deleted: 1, updatedAt: Date.now() });
          toast('Премия удалена'); onClose();
        }}>Удалить</button>}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" disabled={n <= 0} onClick={save}>Сохранить</button>
      </>}>
      <div className="form">
        <div className="row2">
          <label className="field">
            <span>За месяц</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((x) => <option key={x} value={x}>{monthName(x)} {x.slice(0, 4)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Сумма, ₽</span>
            <input data-autofocus type="number" inputMode="numeric" min={0} step={100} value={amount} onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          </label>
        </div>
        <label className="field">
          <span>Вычесть из дани недели</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {weeks.map((w) => <option key={w} value={w}>{weekTitle(w)}{w === weekStartOf(today) ? ' — текущая' : ''}</option>)}
          </select>
        </label>
        <p className="hint">В отчёте появится строка «Премия: …₽», и итог дани за эту неделю уменьшится.</p>
      </div>
    </Modal>
  );
}
