import { useMemo, useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { ask } from './Confirm';
import { db } from '../db';
import { money, newSub, saveSub, subEnd, tariffFor } from '../lib/money';
import { logicalNow } from '../lib/time';
import type { LessonKind, MoneySettings, Student, Subscription } from '../types';

const dmy = (d: string) => d.split('-').reverse().join('.');

/** Продажа или правка абонемента ученика центра. Задним числом — можно: дата продажи любая. */
export default function SubForm({ m, students, sub, defaults, onClose }: {
  m: MoneySettings;
  students: Student[];
  sub?: Subscription;
  defaults?: Partial<Pick<Subscription, 'studentId' | 'start' | 'kind' | 'hours'>>;
  onClose: () => void;
}) {
  const today = logicalNow().date;
  const am = students.filter((s) => s.source === 'am' && (!s.archived || s.id === sub?.studentId)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const [studentId, setStudentId] = useState(sub?.studentId ?? defaults?.studentId ?? am[0]?.id ?? '');
  const [size, setSize] = useState<4 | 8>(sub?.size ?? 8);
  const [days, setDays] = useState(sub?.days ?? 30);
  const [start, setStart] = useState(sub?.start ?? defaults?.start ?? today);
  const [kind, setKind] = useState<LessonKind>(sub?.kind ?? defaults?.kind ?? 'group');
  const [hours, setHours] = useState(sub?.hours ?? defaults?.hours ?? 2);
  const [paid, setPaid] = useState(!!sub?.paidDate);
  const [paidDate, setPaidDate] = useState(sub?.paidDate ?? today);
  const [extra, setExtra] = useState(sub?.extraDays ?? 0);

  const realDays = size === 4 ? 30 : days;
  const tr = useMemo(() => tariffFor(m, start, kind, hours, size === 4 ? 'sub4' : 'sub8'), [m, start, kind, hours, size]);
  const hourOpts = kind === 'group' ? [1.5, 2, 3] : [1.5, 2];
  const end = subEnd({ start, days: realDays, extraDays: extra } as Subscription);

  const save = async () => {
    if (!studentId) { toast('Выбери ученика'); return; }
    if (!tr) { toast('Нет тарифа центра для такого формата'); return; }
    const base = sub
      ? { ...sub, studentId, size, days: realDays, start, kind, hours, extraDays: extra, total: tr.total, teacher: tr.teacher, center: tr.center }
      : newSub(m, { studentId, size, days: realDays, start, kind, hours })!;
    await saveSub({ ...base, extraDays: extra, paidDate: paid ? paidDate : null });
    toast(sub ? 'Абонемент сохранён' : 'Абонемент оформлен');
    onClose();
  };

  return (
    <Modal title={sub ? 'Абонемент' : 'Продать абонемент'} onClose={onClose}
      footer={<>
        {sub && <button type="button" className="btn ghost danger" onClick={async () => {
          if (!(await ask('Удалить абонемент? Его занятия станут разовыми, а комиссия уйдёт из отчёта за неделю продажи.', 'Удалить', true))) return;
          await db.subs.update(sub.id, { deleted: 1, updatedAt: Date.now() });
          toast('Абонемент удалён'); onClose();
        }}>Удалить</button>}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" disabled={!tr || !studentId} onClick={save}>Сохранить</button>
      </>}>
      <div className="form">
        <label className="field">
          <span>Ученик центра</span>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {am.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="row2">
          <div className="field">
            <span>Абонемент</span>
            <div className="seg">
              <button type="button" className={size === 4 ? 'is-on' : ''} onClick={() => setSize(4)}>4 занятия</button>
              <button type="button" className={size === 8 ? 'is-on' : ''} onClick={() => setSize(8)}>8 занятий</button>
            </div>
          </div>
          <div className="field">
            <span>Срок</span>
            {size === 4 ? <p className="hint" style={{ marginTop: 8 }}>30 дней</p> : (
              <div className="seg">
                <button type="button" className={days === 30 ? 'is-on' : ''} onClick={() => setDays(30)}>30 дней</button>
                <button type="button" className={days === 60 ? 'is-on' : ''} onClick={() => setDays(60)}>60 дней</button>
              </div>
            )}
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <span>Формат</span>
            <div className="seg">
              <button type="button" className={kind === 'group' ? 'is-on' : ''} onClick={() => setKind('group')}>Групповые</button>
              <button type="button" className={kind === 'ind' ? 'is-on' : ''} onClick={() => { setKind('ind'); if (hours === 3) setHours(2); }}>Индивидуальные</button>
            </div>
          </div>
          <div className="field">
            <span>Длительность занятия</span>
            <div className="seg">
              {hourOpts.map((h) => <button key={h} type="button" className={hours === h ? 'is-on' : ''} onClick={() => setHours(h)}>{String(h).replace('.', ',')} ч</button>)}
            </div>
          </div>
        </div>
        <label className="field" style={{ maxWidth: 240 }}>
          <span>Дата продажи — с неё абонемент действует</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        {tr ? (
          <div className="sub-sum">
            <div><span>Стоимость</span><b>{money(tr.total)}</b></div>
            <div><span>Дань центру</span><b>{money(tr.center)}</b></div>
            <div><span>Тебе</span><b className="ok">{money(tr.teacher)}</b></div>
          </div>
        ) : <p className="hint is-error">В тарифах центра нет такого варианта.</p>}
        <p className="hint">Действует до {dmy(end)} включительно. Комиссия попадёт в отчёт за неделю продажи.</p>

        <div className="field">
          <span>Оплата</span>
          <div className="inline">
            <div className="seg">
              <button type="button" className={!paid ? 'is-on' : ''} onClick={() => setPaid(false)}>Не оплачен</button>
              <button type="button" className={paid ? 'is-on' : ''} onClick={() => setPaid(true)}>Оплачен</button>
            </div>
            {paid && <input type="date" value={paidDate} style={{ width: 'auto' }} aria-label="Дата оплаты" onChange={(e) => e.target.value && setPaidDate(e.target.value)} />}
          </div>
          {paid && <p className="hint">В доход дня оплаты пойдёт твоя доля — {tr ? money(tr.teacher) : '—'}.</p>}
        </div>

        {sub && (
          <label className="field" style={{ maxWidth: 300 }}>
            <span>Продление срока, дней — болезнь преподавателя, праздники</span>
            <input type="number" min={0} max={60} value={extra} onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
      </div>
    </Modal>
  );
}
