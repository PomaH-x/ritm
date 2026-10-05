import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalEvent, Settings, Sphere } from '../types';
import type { Slot } from '../lib/recommend';
import { dayNum, fmtDur, fmtHours, fmtTime, isoWeek, WD_SHORT, weekday } from '../lib/time';
import { dur } from '../lib/stats';

interface Props {
  days: string[];
  events: CalEvent[];
  spheres: Map<string, Sphere>;
  settings: Settings;
  now: { date: string; min: number };
  highlight: Slot | null;
  onSelectSlot: (s: Slot) => void;
  onOpenEvent: (e: CalEvent) => void;
  onChangeEvent: (id: string, patch: Partial<CalEvent>) => void;
}

type Preview =
  | { type: 'select'; dayIdx: number; start: number; end: number }
  | { type: 'drag'; id: string; dayIdx: number; start: number; end: number }
  | null;

interface Gesture {
  kind: 'select' | 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean; // для касаний — становится true после долгого нажатия
  moved: boolean;
  timer?: number;
  dayIdx: number;
  anchor: number; // select: исходная минута
  rawMin: number; // минута под пальцем при нажатии
  ev?: CalEvent;
  grab: number; // move: смещение точки захвата от начала события
}

const LONG_PRESS = 380;

/** Раскладка пересекающихся событий по «дорожкам» */
function layout(evs: CalEvent[]) {
  const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || dur(b) - dur(a));
  const out: { ev: CalEvent; lane: number; lanes: number }[] = [];
  let cluster: { ev: CalEvent; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = laneEnds.length;
    cluster.forEach((c) => (c.lanes = n));
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const ev of sorted) {
    if (ev.startMin >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= ev.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.endMin); } else laneEnds[lane] = ev.endMin;
    cluster.push({ ev, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return out;
}

export default function WeekCalendar(p: Props) {
  const { days, settings } = p;
  const hourH = settings.hourHeight;
  const snap = settings.snapMin;
  const minB = settings.dayStartHour * 60;
  const maxB = settings.dayEndHour * 60;
  const hours = Array.from({ length: settings.dayEndHour - settings.dayStartHour }, (_, i) => settings.dayStartHour + i);

  const colsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<Gesture | null>(null);
  const [preview, setPreviewState] = useState<Preview>(null);
  const previewRef = useRef<Preview>(null);
  const setPreview = (v: Preview) => { previewRef.current = v; setPreviewState(v); };

  // Свежие пропсы для обработчиков на window
  const propsRef = useRef(p);
  propsRef.current = p;

  const eventsById = useMemo(() => new Map(p.events.map((e) => [e.id, e])), [p.events]);

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const snapV = (v: number) => Math.round(v / snap) * snap;
  const minFromY = (y: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    return minB + ((y - r.top) / hourH) * 60;
  };
  const dayFromX = (x: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    return clamp(Math.floor((x - r.left) / (r.width / days.length)), 0, days.length - 1);
  };

  const activate = (g: Gesture) => {
    g.active = true;
    navigator.vibrate?.(12);
    if (g.kind === 'select') {
      const start = clamp(Math.floor(g.rawMin / 60) * 60, minB, maxB - 60);
      g.anchor = start;
      setPreview({ type: 'select', dayIdx: g.dayIdx, start, end: start + 60 });
    } else if (g.ev) {
      setPreview({ type: 'drag', id: g.ev.id, dayIdx: g.dayIdx, start: g.ev.startMin, end: g.ev.endMin });
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-nodrag]')) return;
    const evEl = t.closest<HTMLElement>('[data-ev]');
    const isTouch = e.pointerType !== 'mouse';
    const rawMin = minFromY(e.clientY);
    const dayIdx = dayFromX(e.clientX);
    let g: Gesture;
    if (evEl) {
      const ev = eventsById.get(evEl.dataset.ev!);
      if (!ev) return;
      const resize = !!t.closest('[data-resize]');
      g = {
        kind: resize ? 'resize' : 'move', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
        active: !isTouch, moved: false, dayIdx: days.indexOf(ev.date), anchor: 0, rawMin, ev,
        grab: rawMin - ev.startMin,
      };
    } else {
      const anchor = clamp(Math.floor(rawMin / snap) * snap, minB, maxB - snap);
      g = { kind: 'select', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: !isTouch, moved: false, dayIdx, anchor, rawMin, grab: 0 };
      if (!isTouch) setPreview({ type: 'select', dayIdx, start: anchor, end: anchor + snap });
    }
    if (!g.active) g.timer = window.setTimeout(() => activate(g), LONG_PRESS);
    gRef.current = g;
    if (!isTouch) e.preventDefault(); // не выделять текст мышью
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
      if (!g.active) {
        if (dist > 10) { clearTimeout(g.timer); gRef.current = null; } // это прокрутка
        return;
      }
      if (!g.moved && dist < 4) return;
      g.moved = true;
      const m = minFromY(e.clientY);
      if (g.kind === 'select') {
        const cur = clamp(snapV(m), minB, maxB);
        let start = Math.min(g.anchor, cur);
        let end = Math.max(g.anchor, cur);
        if (end - start < snap) end = start + snap;
        if (end > maxB) { end = maxB; start = end - snap; }
        setPreview({ type: 'select', dayIdx: g.dayIdx, start, end });
      } else if (g.ev && g.kind === 'move') {
        const d = dur(g.ev);
        const start = clamp(snapV(m - g.grab), minB, maxB - d);
        setPreview({ type: 'drag', id: g.ev.id, dayIdx: dayFromX(e.clientX), start, end: start + d });
      } else if (g.ev) {
        const end = clamp(snapV(m), g.ev.startMin + snap, maxB);
        setPreview({ type: 'drag', id: g.ev.id, dayIdx: g.dayIdx, start: g.ev.startMin, end });
      }
    };
    const up = (e: PointerEvent) => {
      const g = gRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      clearTimeout(g.timer);
      gRef.current = null;
      const P = propsRef.current;
      const pv = previewRef.current;
      setPreview(null);
      const hourSlot = () => {
        const start = clamp(Math.floor(g.rawMin / 60) * 60, minB, maxB - 60);
        P.onSelectSlot({ date: P.days[g.dayIdx], startMin: start, endMin: start + 60 });
      };
      if (g.kind === 'select') {
        if (!g.moved) hourSlot();
        else if (pv?.type === 'select') P.onSelectSlot({ date: P.days[pv.dayIdx], startMin: pv.start, endMin: pv.end });
        return;
      }
      if (!g.ev) return;
      if (!g.moved || pv?.type !== 'drag') { P.onOpenEvent(g.ev); return; }
      const patch: Partial<CalEvent> = { date: P.days[pv.dayIdx], startMin: pv.start, endMin: pv.end };
      if (patch.date !== g.ev.date || patch.startMin !== g.ev.startMin || patch.endMin !== g.ev.endMin) P.onChangeEvent(g.ev.id, patch);
    };
    const cancel = (e: PointerEvent) => {
      const g = gRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      clearTimeout(g.timer);
      gRef.current = null;
      setPreview(null);
    };
    // Пока идёт перетаскивание пальцем — не даём странице прокручиваться
    const touchMove = (e: TouchEvent) => { if (gRef.current?.active) e.preventDefault(); };
    const sc = scrollRef.current;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    sc?.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      sc?.removeEventListener('touchmove', touchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourH, snap, minB, maxB, days.length]);

  // Прокрутка к текущему времени при открытии
  const todayIdx = days.indexOf(p.now.date);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const target = todayIdx >= 0 ? ((p.now.min - minB) / 60 - 1.5) * hourH : 0;
    sc.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  // События по дням с учётом перетаскивания
  const perDay = useMemo(() => {
    const lists: CalEvent[][] = days.map(() => []);
    for (const e of p.events) {
      let ev = e;
      if (preview?.type === 'drag' && preview.id === e.id) {
        ev = { ...e, date: days[preview.dayIdx], startMin: preview.start, endMin: preview.end };
      }
      const i = days.indexOf(ev.date);
      if (i >= 0) lists[i].push(ev);
    }
    return lists.map(layout);
  }, [p.events, preview, days]);

  const dayTotals = useMemo(() => days.map((d) => p.events
    .filter((e) => e.date === d && e.status !== 'skipped')
    .reduce((a, e) => a + dur(e), 0)), [p.events, days]);

  const y = (min: number) => ((min - minB) / 60) * hourH;

  const hl: { dayIdx: number; start: number; end: number } | null =
    preview?.type === 'select' ? preview
      : p.highlight && days.includes(p.highlight.date)
        ? { dayIdx: days.indexOf(p.highlight.date), start: p.highlight.startMin, end: p.highlight.endMin }
        : null;

  return (
    <div className="cal" style={{ ['--hour' as string]: `${hourH}px`, ['--days' as string]: days.length }}>
      <div className="cal-head">
        <div className="cal-gutter-head">{isoWeek(days[0])} нед.</div>
        {days.map((d, i) => {
          const wd = weekday(d);
          const isToday = d === p.now.date;
          return (
            <div key={d} className={'cal-dayhead' + (isToday ? ' is-today' : '') + (wd >= 6 ? ' is-weekend' : '')}>
              <span className="cal-dayname">{WD_SHORT[wd - 1]}</span>
              <span className="cal-daynum">{dayNum(d)}</span>
              {dayTotals[i] > 0 && <span className="cal-daytotal" title="Запланировано на день">{fmtHours(dayTotals[i])}</span>}
            </div>
          );
        })}
      </div>

      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-body" style={{ height: hours.length * hourH }}>
          <div className="cal-gutter" aria-hidden>
            {hours.map((h, i) => (
              <div key={h} className="cal-hour" style={{ top: i * hourH }}>
                {i > 0 && fmtTime(h * 60)}
              </div>
            ))}
          </div>

          <div
            className={'cal-cols' + (preview ? ' is-dragging' : '')}
            ref={colsRef}
            onPointerDown={onPointerDown}
            onContextMenu={(e) => e.preventDefault()}
          >
            {days.map((d, di) => (
              <div key={d} className={'cal-col' + (d === p.now.date ? ' is-today' : '')}>
                {settings.lightWeekdays.includes(weekday(d)) && settings.lightFromMin < maxB && (
                  <div className="cal-light" style={{ top: y(settings.lightFromMin), height: y(maxB) - y(settings.lightFromMin) }} title="Только лёгкие дела" />
                )}

                {perDay[di].map(({ ev, lane, lanes }) => {
                  if (ev.endMin <= minB || ev.startMin >= maxB) return null;
                  const s = ev.sphereId ? p.spheres.get(ev.sphereId) : undefined;
                  const top = y(Math.max(ev.startMin, minB));
                  const h = Math.max(14, y(Math.min(ev.endMin, maxB)) - top - 2);
                  const dragging = preview?.type === 'drag' && preview.id === ev.id;
                  return (
                    <div
                      key={ev.id}
                      data-ev={ev.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${ev.title}, ${fmtTime(ev.startMin)}–${fmtTime(ev.endMin)}`}
                      onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); p.onOpenEvent(eventsById.get(ev.id)!); } }}
                      className={`ev${ev.status === 'skipped' ? ' ev-skipped' : ''}${dragging ? ' is-dragged' : ''}${h < 30 ? ' is-short' : ''}`}
                      style={{
                        ['--c' as string]: s?.color ?? '#8792a2',
                        top,
                        height: h,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <div className="ev-inner">
                        {h >= 30 && (
                          <div className="ev-time">
                            {fmtTime(ev.startMin)} – {fmtTime(ev.endMin)}
                            {dragging && <span className="ev-dur"> · {fmtDur(ev.endMin - ev.startMin)}</span>}
                          </div>
                        )}
                        <div className="ev-title">{ev.title || s?.name || 'Без названия'}</div>
                      </div>
                      <div className="ev-resize" data-resize aria-hidden />
                    </div>
                  );
                })}

                {hl && hl.dayIdx === di && (
                  <div className="cal-select" style={{ top: y(hl.start), height: y(hl.end) - y(hl.start) }}>
                    <span>{fmtTime(hl.start)}–{fmtTime(hl.end)} · {fmtDur(hl.end - hl.start)}</span>
                  </div>
                )}

                {d === p.now.date && p.now.min >= minB && p.now.min <= maxB && (
                  <div className="cal-now" style={{ top: y(p.now.min) }} aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
