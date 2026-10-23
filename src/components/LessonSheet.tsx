import { useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { ask } from './Confirm';
import { db } from '../db';
import { addPayment, KIND_LABEL, markLessonPaid, money, ownBalance, rateFor, removePayment, saveSub, setCancel, subEnd, type Lesson, type MoneyData } from '../lib/money';
import { fmtDayLong, fmtTime } from '../lib/time';
import type { CalEvent, Subscription } from '../types';

const dmy = (d: string) => d.split('-').reverse().join('.');
const hrs = (h: number) => `${String(Math.round(h * 100) / 100).replace('.', ',')} ч`;

/**
 * Лист занятия: кто был, кто оплатил, кто отменил. Открывается по нажатию на занятие с учениками.
 * Деньги записываются датой получения — по умолчанию сегодня.
 */
export default function LessonSheet({ event, lessons, all, data, onEdit, onSellSub, onOpenSub, onClose }: {
  event: CalEvent;
  lessons: Lesson[];
  /** Все занятия — для баланса моих учеников */
  all: Lesson[];
  data: MoneyData;
  onEdit: () => void;
  onSellSub: (l: Lesson) => void;
  onOpenSub: (s: Subscription) => void;
  onClose: () => void;
}) {
  // Дата получения денег: как у уже отмеченных оплат этого занятия, иначе — день занятия
  const eventPays = data.payments.filter((p) => p.kind === 'lesson' && p.eventId === event.id);
  // Абонементы, по которым идут ученики этого занятия и которые уже отмечены оплаченными
  const paidSubs = [...new Set(lessons.flatMap((l) => (l.status.type === 'sub' ? [l.status.subId] : [])))]
    .map((id) => data.subs.find((s) => s.id === id)).filter((s): s is Subscription => !!s?.paidDate);
  const [payDate, setPayDate] = useState(() => eventPays[0]?.date ?? paidSubs[0]?.paidDate ?? event.date);
  const [dateDraft, setDateDraft] = useState(payDate);
  /** Оплата отмечается выбранной датой, даже если «Сохранить» не нажат */
  const pickDate = () => { if (dateDraft !== payDate) setPayDate(dateDraft); return dateDraft; };
  /** «Сохранить»: уже отмеченные оплаты этого занятия (и оплата абонемента) переезжают на выбранную дату */
  const saveDate = async () => {
    const now = Date.now();
    const pays = eventPays.filter((p) => p.date !== dateDraft);
    const subsMoved = paidSubs.filter((s) => s.paidDate !== dateDraft);
    for (const p of pays) await db.payments.update(p.id, { date: dateDraft, updatedAt: now });
    for (const s of subsMoved) await db.subs.update(s.id, { paidDate: dateDraft, updatedAt: now });
    setPayDate(dateDraft);
    const n = pays.length + subsMoved.length;
    toast(n ? `Деньги получены ${dmy(dateDraft)} · перенесено оплат: ${n}` : `Дата ${dmy(dateDraft)} — с ней запишутся оплаты этого занятия`);
  };
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const subs = new Map(data.subs.map((s) => [s.id, s]));
  const lessonPay = (sid: string) => data.payments.find((p) => p.kind === 'lesson' && p.eventId === event.id && p.studentId === sid);
  const anyMoney = lessons.some((l) => l.status.type !== 'cancelled');

  const startCancel = (l: Lesson) => {
    if (l.student.source === 'own') { void setCancel(event, l.student.id, true); toast(`${l.student.name}: занятие отменено`); return; }
    setReasonFor(l.student.id);
    setReason(l.student.name + ' ');
  };
  const saveCancel = async (l: Lesson) => {
    const r = reason.trim();
    if (r.length <= l.student.name.length) { toast('Напиши причину — она попадёт в отчёт для центра'); return; }
    await setCancel(event, l.student.id, true, r.replace(/[.!]+$/, ''));
    setReasonFor(null);
    toast(`${l.student.name}: отмена записана`);
  };

  const status = (l: Lesson) => {
    const st = l.status;
    switch (st.type) {
      case 'cancelled':
        return <>Отменено{st.reason ? <>: «{st.reason}»</> : ''}</>;
      case 'planned': {
        const p = lessonPay(l.student.id);
        return <>Ещё впереди{p ? <> · <span className="ok">оплачено заранее {money(p.amount)}</span></> : ''}</>;
      }
      case 'sub': {
        const s = subs.get(st.subId);
        return <>По абонементу · занятие {st.n} из {st.size}{s && <> · до {dmy(subEnd(s))} · {s.paidDate ? <span className="ok">оплачен {dmy(s.paidDate)}</span> : <span className="bad">не оплачен</span>}</>}</>;
      }
      case 'single':
        return <>Разовое{st.tariff ? <>, {KIND_LABEL[l.kind]} {hrs(l.hours)} · {money(st.tariff.total)}, дань {money(st.tariff.center)}</> : ''} · {st.paid ? <span className="ok">оплачено</span> : <span className="bad">не оплачено</span>}</>;
      case 'own':
        return <>{hrs(l.hours)} · {money(st.cost)} · {st.paid ? <span className="ok">{st.via === 'balance' ? 'списано с баланса' : 'оплачено'}</span> : <span className="bad">не оплачено</span>}</>;
    }
  };

  const actions = (l: Lesson) => {
    const st = l.status;
    const out: JSX.Element[] = [];
    const btn = (key: string, label: string, run: () => unknown, cls = 'btn ghost small') =>
      out.push(<button key={key} type="button" className={cls} onClick={() => void run()}>{label}</button>);

    if (st.type === 'cancelled') {
      btn('back', 'Вернуть занятие', async () => { await setCancel(event, l.student.id, false); toast(`${l.student.name}: занятие вернулось`); });
      if (l.student.source === 'am') btn('why', 'Изменить причину', () => { setReasonFor(l.student.id); setReason(st.reason || l.student.name + ' '); });
      const p = lessonPay(l.student.id);
      if (p && l.student.source === 'am') btn('unpay', `Убрать оплату ${money(p.amount)}`, () => removePayment(p.id));
      return out;
    }
    if (st.type === 'single') {
      if (st.paid && st.paymentId) btn('unpay', 'Не оплачено', () => removePayment(st.paymentId!));
      else if (st.tariff) btn('pay', 'Оплатил', async () => { await markLessonPaid(l, pickDate()); toast(`${l.student.name}: оплата ${money(st.tariff!.total)}`); }, 'btn primary small');
      btn('sub', 'Оформить абонемент с этого занятия', () => onSellSub(l));
    }
    if (st.type === 'sub') {
      const s = subs.get(st.subId);
      if (s && !s.paidDate) btn('subpay', 'Абонемент оплачен', async () => { await saveSub({ ...s, paidDate: pickDate() }); toast(`Абонемент оплачен · тебе ${money(s.teacher)}`); }, 'btn primary small');
      if (s) btn('subopen', 'Абонемент…', () => onOpenSub(s));
    }
    if (st.type === 'own') {
      if (st.via === 'payment' && st.paymentId) btn('unpay', 'Не оплачено', () => removePayment(st.paymentId!));
      else if (!st.paid) btn('pay', 'Оплатил', async () => { await markLessonPaid(l, pickDate()); toast(`${l.student.name}: оплата ${money(st.cost)}`); }, 'btn primary small');
    }
    if (st.type === 'planned' && l.student.source === 'own') {
      const p = lessonPay(l.student.id);
      if (p) btn('unpay', 'Убрать оплату', () => removePayment(p.id));
      else btn('prepay', 'Оплатил заранее', async () => {
        const cost = Math.round(rateFor(data.m, l.date, l.student) * l.hours);
        await addPayment({ studentId: l.student.id, date: pickDate(), amount: cost, income: cost, kind: 'lesson', eventId: event.id });
        toast(`${l.student.name}: оплата ${money(cost)}`);
      });
    }
    btn('cancel', 'Отменить', async () => {
      const p = lessonPay(l.student.id);
      if (p && l.student.source === 'am' && !(await ask(`За это занятие уже записана оплата ${money(p.amount)}. Она останется — убрать её можно будет здесь же.`, 'Понятно'))) return;
      startCancel(l);
    }, 'btn ghost small danger');
    return out;
  };

  return (
    <Modal
      title={event.title || 'Занятие'}
      subtitle={`${fmtDayLong(event.date)}, ${fmtTime(event.startMin)}–${fmtTime(event.endMin)}`}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn ghost" onClick={onEdit}>Изменить занятие</button>
        <span className="spacer" />
        <button type="button" className="btn primary" onClick={onClose}>Готово</button>
      </>}>
      <div className="form ls-form">
      <ul className="ls-list">
        {lessons.map((l) => (
          <li key={l.student.id} className={'ls-item' + (l.status.type === 'cancelled' ? ' is-cancelled' : '')}>
            <div className="ls-top">
              <b>{l.student.name}</b>
              <span className="tag">{l.student.source === 'am' ? 'центр' : 'мой'}</span>
              {l.student.source === 'own' && <OwnBalance data={data} all={all} id={l.student.id} />}
            </div>
            <div className="ls-status">{status(l)}</div>
            {l.warn && <p className="hint is-error">{l.warn}. Поправь длительность или тарифы в настройках.</p>}
            {reasonFor === l.student.id ? (
              <div className="ls-reason">
                <input value={reason} data-autofocus aria-label="Причина отмены" placeholder="Лера заболела"
                  onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveCancel(l); }} />
                <button type="button" className="btn primary small" onClick={() => void saveCancel(l)}>Записать отмену</button>
                <button type="button" className="btn ghost small" onClick={() => setReasonFor(null)}>Не надо</button>
              </div>
            ) : <div className="ls-actions">{actions(l)}</div>}
          </li>
        ))}
      </ul>
      {anyMoney && (
        <div className="ls-paydate">
          <span>Деньги получены</span>
          <input type="date" value={dateDraft} aria-label="Деньги получены" onChange={(e) => e.target.value && setDateDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dateDraft !== payDate) { e.preventDefault(); void saveDate(); } }} />
          {dateDraft !== payDate && <button type="button" className="btn primary small" onClick={() => void saveDate()}>Сохранить</button>}
        </div>
      )}
      </div>
    </Modal>
  );
}

function OwnBalance({ data, all, id }: { data: MoneyData; all: Lesson[]; id: string }) {
  const b = ownBalance(data, all, id);
  if (!b) return <span className="muted ls-when">баланс 0 ₽</span>;
  return <span className={'ls-when ' + (b < 0 ? 'bad' : 'ok')}>{b < 0 ? `долг ${money(-b)}` : `на балансе ${money(b)}`}</span>;
}
