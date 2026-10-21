import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ImportWizard from '../components/ImportWizard';
import StudentEditor from '../components/StudentEditor';
import StudentCard from '../components/StudentCard';
import SubForm from '../components/SubForm';
import TopUpForm from '../components/TopUpForm';
import AmReportCard from '../components/AmReportCard';
import { amDebt, buildLessons, lastPaid, loadMoney, money, ownBalance, rateFor, subEnd, subState, subUsage, weeklyCount } from '../lib/money';
import { useNow } from '../lib/hooks';
import { logicalNow } from '../lib/time';
import type { Student, StudentSource, Subscription } from '../types';

const nf = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
/** Длительности занятий ученика по расписанию: «1,5 и 3 ч» */
function durations(series: { students?: string[]; startMin: number; endMin: number; until: string | null }[], id: string) {
  const hs = [...new Set(series.filter((x) => x.students?.includes(id) && (!x.until || x.until >= logicalNow().date)).map((x) => (x.endMin - x.startMin) / 60))].sort((a, b) => a - b);
  return hs.length ? `${hs.map((h) => String(h).replace('.', ',')).join(' и ')} ч` : 'центр';
}
const perWeek = (n: number) => (n ? `${String(Math.round(n * 10) / 10).replace('.', ',')} в нед.` : 'нет в расписании');

export default function StudentsPage() {
  const [tab, setTab] = useState<StudentSource>(() => (localStorage.getItem('ritm:students-tab') as StudentSource) || 'am');
  const [wizard, setWizard] = useState(false);
  const [edit, setEdit] = useState<Student | 'new' | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [subForm, setSubForm] = useState<{ sub?: Subscription; studentId?: string } | null>(null);
  const [topUp, setTopUp] = useState<{ student: Student; suggest?: number } | null>(null);
  const now = useNow();
  const data = useLiveQuery(loadMoney, []);
  const lessons = useMemo(() => (data ? buildLessons(data, now) : []), [data, now]);
  const used = useMemo(() => subUsage(lessons, data?.subs), [lessons, data]);

  const pick = (t: StudentSource) => { setTab(t); try { localStorage.setItem('ritm:students-tab', t); } catch { /* ок */ } };
  if (!data) return <div className="page"><p className="muted">Загрузка…</p></div>;
  const { series, m } = data;
  const students = [...data.students].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const balance = new Map(students.filter((s) => s.source === 'own').map((s) => [s.id, ownBalance(data, lessons, s.id)]));
  const paidAt = new Map(students.map((s) => [s.id, lastPaid(data, s.id)]));
  // Мои: сверху должники (больший долг выше), дальше — кто платил недавно, внизу — давно или ни разу
  const ownOrder = (a: Student, b: Student) => {
    const da = Math.min(0, balance.get(a.id) ?? 0), db = Math.min(0, balance.get(b.id) ?? 0);
    if (da !== db) return da - db;
    const pa = paidAt.get(a.id) ?? '', pb = paidAt.get(b.id) ?? '';
    return pb.localeCompare(pa) || a.name.localeCompare(b.name, 'ru');
  };
  const list = students.filter((s) => s.source === tab && !s.archived);
  if (tab === 'own') list.sort(ownOrder);
  const archived = students.filter((s) => s.source === tab && s.archived);
  const count = (t: StudentSource) => students.filter((s) => s.source === t && !s.archived).length;
  const today = logicalNow().date;
  const cardStudent = card ? students.find((s) => s.id === card) : undefined;

  /** Деньги в строке списка: абонемент и долг — у учеников центра, баланс — у моих */
  const moneyLine = (s: Student) => {
    const short = (d: string) => d.split('-').reverse().slice(0, 2).join('.');
    if (s.source === 'own') {
      const b = balance.get(s.id) ?? 0;
      const p = paidAt.get(s.id);
      return <>
        {b < 0 ? <span className="bad">долг {money(-b)}</span> : b > 0 ? <span className="ok">+{money(b)}</span> : null}
        {p && <span>платил {short(p)}</span>}
      </>;
    }
    // Абонементов может быть несколько — по разным предметам
    const subs = data.subs.filter((x) => x.studentId === s.id && subState(x, used.get(x.id) ?? 0, today) !== 'done' && subState(x, used.get(x.id) ?? 0, today) !== 'expired');
    const debt = amDebt(data, lessons, s.id);
    return <>
      {subs.map((x) => <span key={x.id}>абонемент {used.get(x.id) ?? 0}/{x.size}{x.start > today ? ` с ${short(x.start)}` : ` до ${short(subEnd(x))}`}</span>)}
      {debt > 0 && <span className="bad">не оплачено {money(debt)}</span>}
    </>;
  };

  const row = (s: Student) => (
    <li key={s.id}>
      <button type="button" className="st-row" onClick={() => setCard(s.id)}>
        <span className="st-name">{s.name}</span>
        <span className="st-meta">
          {s.source === 'am' ? durations(series, s.id) : `${nf(rateFor(m, today, s))} ₽/ч${s.rate != null ? ' (своя)' : ''}`}
          {' · '}{perWeek(weeklyCount(series, s.id))}
        </span>
        {s.note && <span className="st-note">{s.note}</span>}
        <span className="st-money">{moneyLine(s)}</span>
      </button>
    </li>
  );

  /** Формат и длительность абонемента — как у последнего занятия ученика */
  const subDefaults = (id: string) => {
    const last = [...lessons].reverse().find((l) => l.student.id === id && l.status.type !== 'cancelled');
    return last ? { kind: last.kind, hours: last.hours } : {};
  };

  const ownTotals = tab === 'own' ? list.reduce((a, s) => {
    const b = ownBalance(data, lessons, s.id);
    return b < 0 ? { ...a, debt: a.debt - b } : { ...a, credit: a.credit + b };
  }, { debt: 0, credit: 0 }) : null;

  return (
    <div className="page students">
      <div className="page-head">
        <h1>Ученики</h1>
        <div className="seg">
          <button type="button" className={tab === 'am' ? 'is-on' : ''} onClick={() => pick('am')}>От АМ · {count('am')}</button>
          <button type="button" className={tab === 'own' ? 'is-on' : ''} onClick={() => pick('own')}>Мои · {count('own')}</button>
        </div>
      </div>

      {!m.trackFrom || !students.length ? (
        <section className="card st-empty">
          <h2>Начнём с расписания</h2>
          <p className="hint">Приложение найдёт учеников в названиях занятий: синие — ученики центра, красные — твои. Ты проверишь имена и время, и они привяжутся к занятиям.</p>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => setWizard(true)}>Найти учеников в расписании</button>
            <button type="button" className="btn ghost" onClick={() => setEdit('new')}>Добавить вручную</button>
          </div>
        </section>
      ) : (
        <>
          {tab === 'am' && <AmReportCard data={data} lessons={lessons} />}
          {ownTotals && (ownTotals.debt > 0 || ownTotals.credit > 0) && (
            <div className="st-totals">
              {ownTotals.debt > 0 && <span>Должны: <b className="bad">{money(ownTotals.debt)}</b></span>}
              {ownTotals.credit > 0 && <span>Оплачено вперёд: <b className="ok">{money(ownTotals.credit)}</b></span>}
            </div>
          )}
          <div className="btn-row st-tools">
            {tab === 'am' && <button type="button" className="btn ghost small" onClick={() => setSubForm({})}>Продать абонемент</button>}
            <button type="button" className="btn ghost small" onClick={() => setEdit('new')}>Добавить ученика</button>
            <button type="button" className="btn ghost small" onClick={() => setWizard(true)}>Найти новых в расписании</button>
            <span className="muted st-since">Учёт с {m.trackFrom.split('-').reverse().join('.')}</span>
          </div>
          {list.length ? <ul className="st-list">{list.map(row)}</ul> : <p className="empty-note">Здесь пока никого.</p>}
          {archived.length > 0 && (
            <>
              <button type="button" className="linklike muted-link" onClick={() => setShowArchive((v) => !v)}>
                {showArchive ? 'Скрыть архив' : `Архив: ${archived.length}`}
              </button>
              {showArchive && <ul className="st-list is-archive">{archived.map(row)}</ul>}
            </>
          )}
        </>
      )}

      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
      {cardStudent && !edit && !subForm && !topUp && (
        <StudentCard student={cardStudent} data={data} lessons={lessons} onClose={() => setCard(null)}
          onEdit={() => setEdit(cardStudent)}
          onTopUp={(suggest) => setTopUp({ student: cardStudent, suggest })}
          onSellSub={() => setSubForm({ studentId: cardStudent.id })}
          onOpenSub={(sub) => setSubForm({ sub })} />
      )}
      {subForm && (
        <SubForm m={m} students={students} sub={subForm.sub} onClose={() => setSubForm(null)}
          defaults={subForm.studentId ? { studentId: subForm.studentId, ...subDefaults(subForm.studentId) } : undefined} />
      )}
      {topUp && <TopUpForm student={topUp.student} suggest={topUp.suggest} onClose={() => setTopUp(null)} />}
      {edit && <StudentEditor student={edit === 'new' ? null : edit} source={tab} all={students} onClose={() => { setEdit(null); if (edit !== 'new' && !students.some((x) => x.id === edit.id)) setCard(null); }} />}
    </div>
  );
}
