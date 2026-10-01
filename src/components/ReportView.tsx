import type { ReactNode } from 'react';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const prim = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'number' ? String(v).replace('.', ',') : String(v));

function Value({ v }: { v: unknown }): ReactNode {
  if (Array.isArray(v)) {
    if (v.length && v.every(isObj)) {
      const cols = [...new Set(v.flatMap((o) => Object.keys(o as Obj)))];
      return (
        <div className="rv-tablewrap">
          <table className="rv-table">
            <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{v.map((o, i) => <tr key={i}>{cols.map((c) => <td key={c}>{prim((o as Obj)[c])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    return <ul className="rv-list">{v.map((x, i) => <li key={i}>{prim(x)}</li>)}</ul>;
  }
  if (isObj(v)) {
    if (!Object.keys(v).length) return <span className="muted">нет данных</span>;
    return (
      <dl className="rv-kv">
        {Object.entries(v).map(([k, x]) => (
          <div key={k}><dt>{k}</dt><dd><Value v={x} /></dd></div>
        ))}
      </dl>
    );
  }
  return <>{prim(v)}</>;
}

const SKIP = new Set(['тип', 'дата', 'день недели', 'неделя', 'отклонения от плана', 'получилось по плану']);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Человекочитаемый вид того же объекта, что получает нейросеть */
export default function ReportView({ report }: { report: Obj }) {
  const warn = (report['отклонения от плана'] as string[]) ?? [];
  const good = (report['получилось по плану'] as string[]) ?? [];
  const blocks: [string, unknown][] = [];
  for (const [k, v] of Object.entries(report)) {
    if (SKIP.has(k)) continue;
    if (k === 'разделы' && isObj(v)) blocks.push(...Object.entries(v));
    else blocks.push([cap(k), v]);
  }
  return (
    <div className="rv">
      <div className="rv-flags">
        <section className="rv-flag is-warn">
          <h2>Отклонения от плана</h2>
          {warn.length ? <ul>{warn.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="muted">Нет</p>}
        </section>
        <section className="rv-flag is-good">
          <h2>Получилось по плану</h2>
          {good.length ? <ul>{good.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="muted">Пока нечего отметить</p>}
        </section>
      </div>
      <div className="rv-blocks">
        {blocks.map(([k, v]) => (
          <section key={k} className="rv-block">
            <h3>{k}</h3>
            <Value v={v} />
          </section>
        ))}
      </div>
    </div>
  );
}
