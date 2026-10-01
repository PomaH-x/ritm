import { useEffect, useMemo, useRef, useState } from 'react';
import WeekCalendar from '../components/WeekCalendar';
import SlotSheet from '../components/SlotSheet';
import EventEditor, { type Draft } from '../components/EventEditor';
import NormsPanel from '../components/NormsPanel';
import { toast } from '../components/Toast';
import { ask } from '../components/Confirm';
import SyncButton from '../components/SyncButton';
import { applyTemplate, copyWeek, createEvent, deleteEvent, saveWeekAsTemplate, updateEvent } from '../db';
import { useEventsBetween, useMedia, useNow, useProgram, useSectionLogs, useSectionsConfig, useSettings, useSpheres } from '../lib/hooks';
import { sportDayStatus } from '../lib/sport';
import type { Slot } from '../lib/recommend';
import { weekProgress } from '../lib/stats';
import { addDays, dayNum, fmtTime, fmtWeekRange, parseISODate, WD_SHORT, weekday, weekDays, weekStartOf } from '../lib/time';
import type { CalEvent, Sphere } from '../types';

export default function WeekPage() {
  const now = useNow();
  const settings = useSettings();
  const spheres = useSpheres() ?? [];
  const narrow = useMedia('(max-width: 760px)');

  const [weekStart, setWeekStart] = useState(() => weekStartOf(now.date));
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const [dayIdx, setDayIdx] = useState(() => Math.max(0, days.indexOf(now.date)));
  const events = useEventsBetween(days[0], days[6]) ?? [];
  const sphereMap = useMemo(() => new Map(spheres.map((s) => [s.id, s])), [spheres]);
  const cfg = useSectionsConfig();
  const program = useProgram();
  const sportLogs = useSectionLogs('sport', days[0], days[6]);
  // Тренировки, отмеченные на странице «День», засчитываются в норму спорта
  const extraDone = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const sid = cfg?.links.sport;
    if (!sid || !program || !sportLogs) return m;
    m.set(sid, new Set(sportLogs.filter((l) => sportDayStatus(l, program, weekday(l.date)).trained).map((l) => l.date)));
    return m;
  }, [cfg, program, sportLogs]);
  const progress = useMemo(() => weekProgress(spheres, events, extraDone), [spheres, events, extraDone]);

  const [slot, setSlot] = useState<Slot | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [menu]);

  const visibleDays = narrow ? [days[dayIdx]] : days;
  const isCurrentWeek = days.includes(now.date);
  const year = parseISODate(days[6]).getFullYear();

  const goWeek = (delta: number) => {
    setWeekStart((w) => addDays(w, delta * 7));
    setSlot(null);
  };
  const goToday = () => {
    setWeekStart(weekStartOf(now.date));
    setDayIdx(Math.max(0, weekDays(weekStartOf(now.date)).indexOf(now.date)));
  };

  const undoable = (text: string, undo: () => void) => toast(text, { label: 'Отменить', run: undo });

  const create = async (s: Sphere, title: string, startMin: number, endMin: number) => {
    if (!slot) return;
    const ev = await createEvent({ sphereId: s.id, title, date: slot.date, startMin, endMin, status: 'planned', notes: '' });
    setSlot(null);
    undoable(`Добавлено: ${title}, ${fmtTime(startMin)}–${fmtTime(endMin)}`, () => deleteEvent(ev.id));
  };

  const change = async (id: string, patch: Partial<CalEvent>) => {
    const old = events.find((e) => e.id === id);
    await updateEvent(id, patch);
    if (old) undoable('Перенесено', () => updateEvent(id, { date: old.date, startMin: old.startMin, endMin: old.endMin }));
  };

  const toggleDone = (e: CalEvent) => updateEvent(e.id, { status: e.status === 'done' ? 'planned' : 'done' });

  const newEventDraft = (): Draft => {
    const date = days.includes(now.date) ? now.date : days[narrow ? dayIdx : 0];
    let start = date === now.date ? Math.ceil(now.min / 60) * 60 : settings.dayStartHour * 60;
    start = Math.min(Math.max(start, settings.dayStartHour * 60), settings.dayEndHour * 60 - 60);
    return { sphereId: null, title: '', date, startMin: start, endMin: start + 60, status: 'planned', notes: '' };
  };

  const saveDraft = async (d: Draft) => {
    const { id, ...rest } = d;
    if (id) await updateEvent(id, rest);
    else await createEvent(rest);
    setDraft(null);
  };

  const runMenu = async (action: 'template' | 'copy' | 'saveTemplate') => {
    setMenu(false);
    if (action === 'template') {
      const n = await applyTemplate(weekStart);
      toast(n ? `Добавлено занятий из шаблона: ${n}` : 'Все занятия из шаблона уже стоят');
    } else if (action === 'copy') {
      if (events.length && !(await ask('На этой неделе уже есть события. Добавить к ним копию прошлой недели?', 'Добавить копию'))) return;
      const n = await copyWeek(addDays(weekStart, -7), weekStart);
      toast(n ? `Скопировано событий: ${n}` : 'Прошлая неделя пустая');
    } else {
      const n = await saveWeekAsTemplate(weekStart);
      toast(`Шаблон обновлён: ${n} занятий`);
    }
  };

  return (
    <div className="week">
      <div className="week-main">
        <div className="toolbar">
          <div className="toolbar-title">
            <h1>{fmtWeekRange(weekStart)}</h1>
            <span className="muted">{year}</span>
          </div>
          <div className="toolbar-nav">
            <button type="button" className="icon-btn" onClick={() => goWeek(-1)} aria-label="Предыдущая неделя">‹</button>
            <button type="button" className="btn ghost small" onClick={goToday} disabled={isCurrentWeek && (!narrow || days[dayIdx] === now.date)}>Сегодня</button>
            <button type="button" className="icon-btn" onClick={() => goWeek(1)} aria-label="Следующая неделя">›</button>
          </div>
          <span className="spacer" />
          <SyncButton />
          <div className="menu-wrap" ref={menuRef}>
            <button type="button" className="icon-btn" aria-label="Действия с неделей" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>⋯</button>
            {menu && (
              <div className="menu" role="menu">
                <button type="button" role="menuitem" onClick={() => runMenu('template')}>Заполнить рабочими занятиями из шаблона</button>
                <button type="button" role="menuitem" onClick={() => runMenu('copy')}>Скопировать всё с прошлой недели</button>
                <button type="button" role="menuitem" onClick={() => runMenu('saveTemplate')}>Сделать работу этой недели шаблоном</button>
              </div>
            )}
          </div>
          <button type="button" className="btn primary" onClick={() => setDraft(newEventDraft())}>Добавить</button>
        </div>

        {narrow && (
          <div className="daystrip" role="tablist">
            {days.map((d, i) => (
              <button key={d} type="button" role="tab" aria-selected={i === dayIdx}
                className={(i === dayIdx ? 'is-on' : '') + (d === now.date ? ' is-today' : '')}
                onClick={() => { setDayIdx(i); setSlot(null); }}>
                <span>{WD_SHORT[i]}</span>
                <b>{dayNum(d)}</b>
              </button>
            ))}
          </div>
        )}

        {narrow && <NormsPanel spheres={spheres} progress={progress} compact />}

        {events.length === 0 && (
          <div className="empty-week">
            <p>Неделя пока пустая. Выдели свободное время в сетке — подскажу, чем заняться.</p>
            <button type="button" className="btn ghost small" onClick={() => runMenu('template')}>Поставить рабочие занятия</button>
          </div>
        )}

        <WeekCalendar
          days={visibleDays}
          events={events}
          spheres={sphereMap}
          settings={settings}
          now={now}
          highlight={slot}
          onSelectSlot={setSlot}
          onOpenEvent={(e) => setDraft({ ...e })}
          onChangeEvent={change}
          onToggleDone={toggleDone}
        />
      </div>

      {!narrow && (
        <aside className="week-side">
          <NormsPanel spheres={spheres} progress={progress} />
        </aside>
      )}

      {slot && (
        <SlotSheet
          slot={slot}
          spheres={spheres}
          weekEvents={events}
          settings={settings}
          onCreate={create}
          onCustom={() => { setDraft({ sphereId: null, title: '', date: slot.date, startMin: slot.startMin, endMin: slot.endMin, status: 'planned', notes: '' }); setSlot(null); }}
          onClose={() => setSlot(null)}
          extraDone={extraDone}
        />
      )}

      {draft && (
        <EventEditor
          key={draft.id ?? 'new'}
          draft={draft}
          spheres={spheres}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          onDelete={draft.id ? async () => {
            const id = draft.id!;
            await deleteEvent(id);
            setDraft(null);
            undoable(`Удалено: ${draft.title}`, () => updateEvent(id, { deleted: 0 }));
          } : undefined}
          onDuplicate={draft.id ? async () => {
            const { id: _id, ...rest } = draft;
            void _id;
            await createEvent({ ...rest, date: addDays(draft.date, 1), status: 'planned' });
            setDraft(null);
            toast('Копия добавлена на следующий день');
          } : undefined}
        />
      )}
    </div>
  );
}
