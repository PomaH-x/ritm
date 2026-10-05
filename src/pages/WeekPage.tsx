import { useEffect, useMemo, useState } from 'react';
import WeekCalendar from '../components/WeekCalendar';
import SlotSheet from '../components/SlotSheet';
import EventEditor, { type Draft } from '../components/EventEditor';
import NormsPanel from '../components/NormsPanel';
import { toast } from '../components/Toast';
import { choose } from '../components/Confirm';
import SyncButton from '../components/SyncButton';
import { createEvent, createSeries, db, deleteEvent, endSeriesFrom, materialize, updateEvent, type Repeat } from '../db';
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


  const newEventDraft = (): Draft => {
    const date = days.includes(now.date) ? now.date : days[narrow ? dayIdx : 0];
    let start = date === now.date ? Math.ceil(now.min / 60) * 60 : settings.dayStartHour * 60;
    start = Math.min(Math.max(start, settings.dayStartHour * 60), settings.dayEndHour * 60 - 60);
    return { sphereId: null, title: '', date, startMin: start, endMin: start + 60, status: 'planned', notes: '' };
  };

  const sameRepeat = (a: Repeat | null | undefined, b: Repeat | null | undefined) =>
    (!a && !b) || (!!a && !!b && a.interval === b.interval && a.until === b.until && [...a.weekdays].sort().join() === [...b.weekdays].sort().join());

  const openEvent = async (e: CalEvent) => {
    const s = e.seriesId ? await db.series.get(e.seriesId) : undefined;
    setDraft({ ...e, repeat: s && !s.deleted ? { interval: s.interval, weekdays: s.weekdays, until: s.until } : null });
  };

  const saveDraft = async (d: Draft) => {
    const { id, repeat, ...rest } = d;
    const fields = { sphereId: rest.sphereId, title: rest.title, date: rest.date, startMin: rest.startMin, endMin: rest.endMin, notes: rest.notes };
    if (!id) {
      if (repeat) await createSeries(fields, repeat); else await createEvent({ ...fields, status: 'planned' });
      setDraft(null);
      return;
    }
    const ev = await db.events.get(id);
    if (!ev) { setDraft(null); return; }
    if (!ev.seriesId) {
      if (repeat) { await deleteEvent(id); await createSeries(fields, repeat); }
      else await updateEvent(id, fields);
      setDraft(null);
      return;
    }
    // Повторение серии: спрашиваем, менять ли только его или и следующие
    const s = await db.series.get(ev.seriesId);
    const oldRepeat = s && !s.deleted ? { interval: s.interval, weekdays: s.weekdays, until: s.until } : null;
    const repeatChanged = !sameRepeat(repeat, oldRepeat);
    const changed = repeatChanged || ['sphereId', 'title', 'date', 'startMin', 'endMin', 'notes'].some((k) => (fields as Record<string, unknown>)[k] !== (ev as unknown as Record<string, unknown>)[k]);
    if (!changed) { setDraft(null); return; }
    const scope = repeatChanged
      ? await choose('Изменить повторение', 'Новые правила повтора применятся к этому событию и всем следующим. Прошедшие останутся как были.', [{ key: 'following', label: 'Это и следующие' }])
      : await choose('Изменить повторяющееся событие', 'Изменить только это событие или это и все следующие?', [{ key: 'one', label: 'Только это' }, { key: 'following', label: 'Это и следующие' }]);
    if (!scope) return;
    if (scope === 'one') await updateEvent(id, fields);
    else {
      await endSeriesFrom(ev.seriesId, ev.date);
      if (repeat) await createSeries(fields, repeat);
      else await createEvent({ ...fields, status: 'planned' });
    }
    setDraft(null);
  };

  const removeDraft = async (d: Draft) => {
    const id = d.id!;
    const ev = await db.events.get(id);
    if (ev?.seriesId) {
      const scope = await choose('Удалить повторяющееся событие', 'Удалить только это событие или это и все следующие? Прошедшие останутся в истории.',
        [{ key: 'one', label: 'Только это' }, { key: 'following', label: 'Это и все следующие' }]);
      if (!scope) return;
      setDraft(null);
      if (scope === 'following') { await endSeriesFrom(ev.seriesId, ev.date); toast('Повторы удалены с этой даты'); return; }
    }
    await deleteEvent(id);
    setDraft(null);
    undoable(`Удалено: ${d.title}`, () => updateEvent(id, { deleted: 0 }));
  };

  useEffect(() => { void materialize(days[0], days[6]); }, [days]);

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
            <p>Неделя пока пустая. Выдели свободное время в сетке — подскажу, чем заняться. Чтобы занятие появлялось каждую неделю, включи у него «Повторять».</p>
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
          onOpenEvent={openEvent}
          onChangeEvent={change}
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
          onDelete={draft.id ? () => removeDraft(draft) : undefined}
          onDuplicate={draft.id ? async () => {
            await createEvent({ sphereId: draft.sphereId, title: draft.title, date: addDays(draft.date, 1), startMin: draft.startMin, endMin: draft.endMin, notes: draft.notes, status: 'planned' });
            setDraft(null);
            toast('Копия добавлена на следующий день');
          } : undefined}
        />
      )}

    </div>
  );
}
