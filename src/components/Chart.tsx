import { useEffect, useRef, useState } from 'react';
import type { ChartData } from '../lib/progress';

interface Props {
  data: ChartData;
  type: 'bar' | 'line';
  format: (v: number) => string;
  height?: number;
  /** Для графиков, где ось не начинается с нуля (время отбоя) */
  fromZero?: boolean;
  /** Шаг делений оси (например, 60 для времени) */
  step?: number;
}

function niceStep(range: number, count: number) {
  const raw = range / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Небольшой SVG-график без сторонних библиотек: столбики или линии, линии-ориентиры, касание показывает значения */
export default function Chart({ data, type, format, height = 190, fromZero = true, step: fixedStep }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = data.labels.length;
  const all = [...data.series.flatMap((s) => s.values.filter((v): v is number => v != null)), ...data.refs.map((r) => r.value)];
  const hasData = data.series.some((s) => s.values.some((v) => v != null));
  let lo = fromZero ? 0 : Math.min(...all);
  let hi = Math.max(...all, fromZero ? 1 : -Infinity);
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (hi === lo) hi = lo + 1;
  const step = fixedStep ?? niceStep(hi - lo, 4);
  lo = fromZero ? 0 : Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);

  const L = 46, R = 8, T = 12, B = 24;
  const pw = w - L - R, ph = height - T - B;
  const band = pw / Math.max(1, n);
  const x = (i: number) => L + band * i + band / 2;
  const y = (v: number) => T + ph - ((v - lo) / (hi - lo)) * ph;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 46))));

  const pick = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - L) / band);
    setSel(i >= 0 && i < n ? i : null);
  };

  const ns = data.series.length;
  const bw = Math.min(28, (band * 0.72) / ns);

  return (
    <div className="chart" ref={box}>
      <div className="chart-info" aria-live="polite">
        {sel != null ? (
          <>
            <b>{data.tips?.[sel] ?? data.labels[sel]}</b>
            {data.series.map((s) => (
              <span key={s.name}><i style={{ background: s.color }} />{s.values[sel] == null ? 'нет данных' : format(s.values[sel]!)}</span>
            ))}
          </>
        ) : !hasData ? <span className="muted">Пока нет данных за этот период</span> : null}
      </div>
      <svg width={w} height={height} role="img" aria-label={data.series.map((s) => s.name).join(', ')}
        onPointerMove={(e) => e.pointerType === 'mouse' && pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setSel(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={w - R} y1={y(t)} y2={y(t)} className="ch-grid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="ch-axis">{format(t)}</text>
          </g>
        ))}
        {sel != null && <rect x={L + band * sel} y={T} width={band} height={ph} className="ch-sel" />}
        {type === 'bar' && data.series.map((s, si) => s.values.map((v, i) => v == null || v === 0 ? null : (
          <rect key={`${si}-${i}`} x={x(i) - (bw * ns) / 2 + si * bw} y={y(Math.max(v, lo))} width={Math.max(1, bw - 1)}
            height={Math.max(1, y(lo) - y(Math.max(v, lo)))} rx={Math.min(3, bw / 3)} fill={s.color} opacity={sel == null || sel === i ? 1 : 0.55} />
        )))}
        {type === 'line' && data.series.map((s, si) => {
          const segs: string[] = [];
          let cur = '';
          s.values.forEach((v, i) => {
            if (v == null) { if (cur) segs.push(cur); cur = ''; return; }
            cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          });
          if (cur) segs.push(cur);
          return (
            <g key={si}>
              {segs.map((d, k) => <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />)}
              {s.values.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={n > 40 ? 1.8 : 3} fill={s.color} />)}
            </g>
          );
        })}
        {data.refs.map((r, i) => {
          // Близкие ориентиры подписываем с разных сторон, чтобы подписи не налезали
          const near = data.refs.some((o, j) => j < i && Math.abs(y(o.value) - y(r.value)) < 14);
          return (
            <g key={r.label}>
              <line x1={L} x2={w - R} y1={y(r.value)} y2={y(r.value)} className="ch-ref" />
              <text x={near ? L + 4 : w - R - 2} y={y(r.value) - 4} textAnchor={near ? 'start' : 'end'} className="ch-ref-label">{r.label}</text>
            </g>
          );
        })}
        {data.labels.map((l, i) => i % every !== 0 ? null : (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="ch-axis">{l}</text>
        ))}
      </svg>
      {data.series.length > 1 && (
        <div className="chart-legend">
          {data.series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}
