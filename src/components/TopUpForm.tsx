import { useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { addPayment, money } from '../lib/money';
import { logicalNow } from '../lib/time';
import type { Student } from '../types';

/** Пополнение баланса моего ученика: деньги вперёд или погашение долга */
export default function TopUpForm({ student, suggest, onClose }: { student: Student; suggest?: number; onClose: () => void }) {
  const [amount, setAmount] = useState(suggest && suggest > 0 ? String(suggest) : '');
  const [date, setDate] = useState(logicalNow().date);
  const n = Math.round(Number(amount) || 0);
  const save = async () => {
    if (n <= 0) { toast('Укажи сумму'); return; }
    await addPayment({ studentId: student.id, date, amount: n, income: n, kind: 'topup', eventId: null });
    toast(`${student.name}: +${money(n)}`);
    onClose();
  };
  return (
    <Modal title={`Пополнить: ${student.name}`} onClose={onClose}
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Отмена</button><button type="button" className="btn primary" disabled={n <= 0} onClick={save}>Пополнить</button></>}>
      <div className="form">
        <div className="row2">
          <label className="field">
            <span>Сумма, ₽</span>
            <input data-autofocus type="number" inputMode="numeric" min={0} step={100} value={amount} onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          </label>
          <label className="field">
            <span>Дата получения</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>
        <p className="hint">Деньги спишутся за прошедшие неоплаченные занятия по порядку, остаток пойдёт на следующие. В доход дня попадёт вся сумма.</p>
      </div>
    </Modal>
  );
}
