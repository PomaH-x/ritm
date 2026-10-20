import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import ImportWizard from '../components/ImportWizard';
import StudentEditor from '../components/StudentEditor';
import { getMoneySettings, rateFor, weeklyCount } from '../lib/money';
import { logicalNow } from '../lib/time';
import type { Student, StudentSource } from '../types';

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
  const data = useLiveQuery(async () => {
    const [students, series, m] = await Promise.all([db.students.toArray(), db.series.toArray(), getMoneySettings()]);
    return { students: students.filter((s) => !s.deleted).sort((a, b) => a.name.localeCompare(b.name, 'ru')), series: series.filter((s) => !s.deleted), m };
  }, []);

  const pick = (t: StudentSource) => { setTab(t); try { localStorage.setItem('ritm:students-tab', t); } catch { /* ок */ } };
  if (!data) return <div className="page"><p className="muted">Загрузка…</p></div>;
  const { students, series, m } = data;
  const list = students.filter((s) => s.source === tab && !s.archived);
  const archived = students.filter((s) => s.source === tab && s.archived);
  const count = (t: StudentSource) => students.filter((s) => s.source === t && !s.archived).length;
  const today = logicalNow().date;

  const row = (s: Student) => (
    <li key={s.id}>
      <button type="button" className="st-row" onClick={() => setEdit(s)}>
        <span className="st-name">{s.name}</span>
        <span className="st-meta">
          {s.source === 'am' ? durations(series, s.id) : `${nf(rateFor(m, today, s))} ₽/ч${s.rate != null ? ' (своя)' : ''}`}
          {' · '}{perWeek(weeklyCount(series, s.id))}
        </span>
        {s.note && <span className="st-note">{s.note}</span>}
      </button>
    </li>
  );

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
          <div className="btn-row st-tools">
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
      {edit && <StudentEditor student={edit === 'new' ? null : edit} source={tab} all={students} onClose={() => setEdit(null)} />}
    </div>
  );
}
