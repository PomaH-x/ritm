import { useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { ask } from './Confirm';
import { amDebt, money, ownBalance, rateFor, removePayment, statusText, subEnd, subState, subUsage, type Lesson, type MoneyData } from '../lib/money';
import { fmtTime, logicalNow, plural } from '../lib/time';
import type { Student, Subscription } from '../types';

const dmy = (d: string) => d.split('-').reverse().join('.');
const short = (d: string) => d.split('-').reverse().slice(0, 2).join('.');

/** Карточка ученика: деньги, абонементы, последние занятия */
export default function StudentCard({ student, data, lessons, onEdit, onTopUp, onSellSub, onOpenSub, onClose }: {
  student: Student;
  data: MoneyData;
  lessons: Lesson[];
  onEdit: () => void;
  onTopUp: (suggest?: number) => void;
  onSellSub: () => void;
  onOpenSub: (s: Subscription) => void;
  onClose: () => void;
}) {
  const [more, setMore] = useState(false);
  const today = logicalNow().date;
  const mine = lessons.filter((l) => l.student.id === student.id);
  const subsById = new Map(data.subs.map((s) => [s.id, s]));
  const used = subUsage(lessons, data.subs);
  const subs = data.subs.filter((s) => s.studentId === student.id).sort((a, b) => b.start.localeCompare(a.start));
  const topups = data.payments.filter((p) => p.studentId === student.id && p.kind === 'topup').sort((a, b) => b.date.localeCompare(a.date));
  const past = mine.filter((l) => l.status.type !== 'planned').reverse();
  const next = mine.find((l) => l.status.type === 'planned');
  const shown = more ? past : past.slice(0, 8);
  const isOwn = student.source === 'own';
  const bal = isOwn ? ownBalance(data, lessons, student.id) : 0;
  const debt = isOwn ? 0 : amDebt(data, lessons, student.id);

  return (
    <Modal title={student.name} subtitle={isOwn ? `Мой ученик · ${money(rateFor(data.m, today, student))}/ч` : 'Ученик центра'} onClose={onClose}
      footer={<>
        <button type="button" className="btn ghost" onClick={onEdit}>Изменить данные</button>
        <span className="spacer" />
        {isOwn
          ? <button type="button" className="btn primary" onClick={() => onTopUp(bal < 0 ? -bal : undefined)}>Пополнить</button>
          : <button type="button" className="btn primary" onClick={onSellSub}>Продать абонемент</button>}
      </>}>
      <div className="sc-money">
        {isOwn ? (
          <div className={'sc-big ' + (bal < 0 ? 'bad' : bal > 0 ? 'ok' : '')}>
            <span>{bal < 0 ? 'Долг' : 'Баланс'}</span>
            <b>{money(Math.abs(bal))}</b>
          </div>
        ) : (
          <div className={'sc-big ' + (debt ? 'bad' : 'ok')}>
            <span>Не оплачено</span>
            <b>{money(debt)}</b>
          </div>
        )}
        {next && <p className="hint">Следующее занятие: {short(next.date)}, {fmtTime(next.event.startMin)}–{fmtTime(next.event.endMin)}</p>}
      </div>

      {!isOwn && (
        <section className="sc-sec">
          <h3 className="sc-sub">Абонементы</h3>
          {subs.length ? (
            <ul className="sc-list">
              {subs.map((s) => {
                const n = used.get(s.id) ?? 0;
                const end = subEnd(s);
                const state = subState(s, n, today);
                const note = { future: ' · начнётся ' + dmy(s.start).slice(0, 5), active: '', done: ' · все занятия прошли', expired: ' · срок вышел' }[state];
                return (
                  <li key={s.id}>
                    <button type="button" className="sc-line" onClick={() => onOpenSub(s)}>
                      <span><b>{s.size} {plural(s.size, 'занятие', 'занятия', 'занятий')}</b> по {String(s.hours).replace('.', ',')} ч · {dmy(s.start)}–{dmy(end)}{note && <span className="muted">{note}</span>}</span>
                      <span className="sc-r">
                        <span>{n} из {s.size}</span>
                        {s.paidDate ? <span className="ok">оплачен</span> : <span className="bad">не оплачен</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted">Абонементов не было — занятия считаются разовыми.</p>}
        </section>
      )}

      {isOwn && topups.length > 0 && (
        <section className="sc-sec">
          <h3 className="sc-sub">Пополнения</h3>
          <ul className="sc-list">
            {topups.slice(0, more ? undefined : 5).map((p) => (
              <li key={p.id} className="sc-line is-static">
                <span>{dmy(p.date)}</span>
                <span className="sc-r">
                  <b className="ok">+{money(p.amount)}</b>
                  <button type="button" className="icon-btn small" aria-label="Удалить пополнение" onClick={async () => {
                    if (!(await ask(`Удалить пополнение ${money(p.amount)} от ${dmy(p.date)}?`, 'Удалить', true))) return;
                    await removePayment(p.id); toast('Пополнение удалено');
                  }}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sc-sec">
        <h3 className="sc-sub">Занятия</h3>
        {past.length ? (
          <ul className="sc-list">
            {shown.map((l) => {
              const t = statusText(l, subsById);
              return (
                <li key={l.event.id} className="sc-line is-static">
                  <span>{short(l.date)} · {fmtTime(l.event.startMin)}–{fmtTime(l.event.endMin)}</span>
                  <span className={'sc-r ' + t.tone}>{t.text}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">С начала учёта занятий ещё не было.</p>}
        {past.length > 8 && !more && <button type="button" className="linklike" onClick={() => setMore(true)}>Показать все: {past.length}</button>}
        <p className="hint">Отметить оплату или отмену — нажми на занятие в расписании.</p>
      </section>
    </Modal>
  );
}
