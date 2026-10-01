import { useMemo, useState } from 'react';
import SectionCard, { filledCount } from '../components/SectionCard';
import SportCard from '../components/SportCard';
import FinanceSummary from '../components/FinanceSummary';
import TasksCard from '../components/TasksCard';
import FieldsEditor, { NewSectionModal } from '../components/FieldsEditor';
import ProgramEditor, { HarderModal } from '../components/ProgramEditor';
import { saveSectionsConfig } from '../db';
import SyncButton from '../components/SyncButton';
import SendToChat from '../components/SendToChat';
import { useEventsBetween, useLogsOn, useNow, useProgram, useSectionLogs, useSectionsConfig, useSpheres } from '../lib/hooks';
import { resolveSections } from '../lib/sections';
import { addDays, fmtDayLong, weekday, weekStartOf } from '../lib/time';
import type { Exercise } from '../types';

export default function DayPage() {
  const now = useNow();
  const [date, setDate] = useState(now.date);
  const cfg = useSectionsConfig();
  const program = useProgram();
  const spheres = useSpheres() ?? [];
  const logs = useLogsOn(date);
  const yLogs = useLogsOn(addDays(date, -1));
  const sportLogs = useSectionLogs('sport') ?? [];
  const dayEvents = useEventsBetween(date, date) ?? [];

  const [editFields, setEditFields] = useState<string | null>(null);
  const [newSection, setNewSection] = useState(false);
  const [editProgram, setEditProgram] = useState(false);
  const [harder, setHarder] = useState<{ workoutId: string; ex: Exercise } | null>(null);

  const sections = useMemo(() => (cfg ? resolveSections(cfg) : []), [cfg]);
  const ctx = { dayEvents, spheres };

  if (!cfg || !program || !logs || !yLogs) return <div className="page"><p className="muted">Загрузка…</p></div>;

  const generic = sections.filter((s) => s.kind !== 'sport');
  const done = generic.filter((s) => {
    const { filled } = filledCount(s, logs.get(s.key)?.values ?? {}, ctx);
    return filled > 0;
  }).length + (logs.get('sport') ? 1 : 0);
  const isToday = date === now.date;
  const hiddenSecs = resolveSections(cfg, true).filter((s) => cfg.hiddenSections.includes(s.key));

  return (
    <div className="page day">
      <div className="page-head day-head">
        <div>
          <h1>{isToday ? 'Сегодня' : fmtDayLong(date).replace(/^./, (c) => c.toUpperCase())}</h1>
          <p className="muted day-sub">
            {isToday ? fmtDayLong(date) : ''}{isToday ? '. ' : ''}Заполнено разделов: {done} из {sections.length}. Всё сохраняется само.
          </p>
        </div>
        <div className="toolbar-nav">
          <SyncButton />
          <button type="button" className="icon-btn" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Предыдущий день">‹</button>
          <button type="button" className="btn ghost small" disabled={isToday} onClick={() => setDate(now.date)}>Сегодня</button>
          <button type="button" className="icon-btn" disabled={date >= now.date} onClick={() => setDate((d) => addDays(d, 1))} aria-label="Следующий день">›</button>
        </div>
      </div>

      {isToday && weekday(date) === 7 && (
        <div className="banner">
          <span>Воскресенье — время подвести итоги недели.</span>
          <a className="btn ghost small" href="#/reports/week">Открыть чек-ин</a>
        </div>
      )}

      <div className="day-grid" key={date}>
        {sections.map((s) => {
          if (s.kind === 'sport') {
            return (
              <SportCard key={s.key} def={s} date={date} stored={logs.get('sport')} program={program}
                sportLogs={sportLogs} onEditProgram={() => setEditProgram(true)}
                onHarder={(workoutId, ex) => setHarder({ workoutId, ex })} />
            );
          }
          return (
            <SectionCard key={s.key} def={s} date={date} stored={logs.get(s.key)} yesterday={yLogs.get(s.key)}
              ctx={ctx} onEditFields={() => setEditFields(s.key)}>
              {s.kind === 'finance' && <FinanceSummary today={date} />}
            </SectionCard>
          );
        })}
        <TasksCard today={now.date} />
      </div>

      <SendToChat kind="day" date={date} />

      <div className="day-foot">
        <button type="button" className="btn ghost" onClick={() => setNewSection(true)}>Новый раздел</button>
        {hiddenSecs.length > 0 && (
          <span className="muted">
            Скрыты: {hiddenSecs.map((s, i) => (
              <span key={s.key}>
                {i > 0 && ', '}
                <button type="button" className="linklike" onClick={() => saveSectionsConfig({ ...cfg, hiddenSections: cfg.hiddenSections.filter((k) => k !== s.key) })}>
                  {s.title}
                </button>
              </span>
            ))}
          </span>
        )}
      </div>

      {editFields && (
        <FieldsEditor cfg={cfg} section={resolveSections(cfg, true).find((s) => s.key === editFields)!} onClose={() => setEditFields(null)} />
      )}
      {newSection && (
        <NewSectionModal cfg={cfg} onClose={() => setNewSection(false)} onCreated={(key) => { setNewSection(false); setEditFields(key); }} />
      )}
      {editProgram && <ProgramEditor program={program} week={weekStartOf(now.date)} onClose={() => setEditProgram(false)} />}
      {harder && <HarderModal program={program} workoutId={harder.workoutId} ex={harder.ex} week={weekStartOf(now.date)} onClose={() => setHarder(null)} />}
    </div>
  );
}
