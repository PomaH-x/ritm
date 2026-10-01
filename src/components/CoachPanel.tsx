import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Markdown from './Markdown';
import { toast } from './Toast';
import { ask, coachSection, review, setProposalStatus, type CoachLog, type Kind, type Proposal } from '../coach/coach';
import { getCoachConfig } from '../coach/llm';
import { db } from '../db';
import { useSpheres } from '../lib/hooks';
import type { Sphere } from '../types';

function proposalTitle(p: Proposal, spheres: Sphere[]) {
  if (p.type === 'norm') {
    const s = spheres.find((x) => x.name.toLowerCase() === (p.sphere ?? '').toLowerCase());
    const unit = s?.normKind === 'count' ? 'раз' : 'ч';
    const was = s && s.normKind !== 'none' ? ` (было ${s.normKind === 'count' ? s.normTarget : String(Math.round(s.normTarget / 6) / 10).replace('.', ',')})` : '';
    return `Норма «${p.sphere}»: ${String(p.value).replace('.', ',')} ${unit} в неделю${was}`;
  }
  return `Новая задача: ${p.title}`;
}

export default function CoachPanel({ kind, date }: { kind: Kind; date: string }) {
  const log = useLiveQuery(async () => {
    const l = await db.logs.get(`${coachSection(kind)}@${date}`);
    return l && !l.deleted ? (l.values as unknown as CoachLog) : null;
  }, [kind, date]);
  const cfg = useLiveQuery(() => getCoachConfig(), []);
  const spheres = useSpheres() ?? [];
  const [busy, setBusy] = useState<'' | 'review' | 'ask'>('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const run = async (what: 'review' | 'ask') => {
    setBusy(what); setErr('');
    try {
      if (what === 'review') await review(kind, date);
      else { await ask(kind, date, q.trim()); setQ(''); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  };

  const act = async (i: number, status: 'applied' | 'dismissed') => {
    try {
      await setProposalStatus(kind, date, i, status);
      if (status === 'applied') toast('Изменение применено');
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };

  const configured = !!cfg?.apiKey;
  const label = kind === 'day' ? 'Разобрать день' : 'Разобрать неделю';

  return (
    <section className="coach" aria-label="Коуч">
      <header className="coach-head">
        <span className="coach-mark" aria-hidden>◆</span>
        <h2>Коуч</h2>
        {log && <span className="coach-meta">{new Date(log.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        <span className="spacer" />
        {configured
          ? <button type="button" className="btn primary small" disabled={!!busy} onClick={() => run('review')}>
              {busy === 'review' ? 'Думаю…' : log ? 'Обновить разбор' : label}
            </button>
          : <a className="btn ghost small" href="#/settings">Подключить коуча</a>}
      </header>

      {!log && !busy && !err && (
        <p className="hint">
          {configured
            ? (kind === 'day' ? 'Заполни день и нажми «Разобрать день», когда будешь готов.' : 'Заполни чек-ин недели, потом попроси разбор.')
            : 'Коуч ещё не подключён: в Настройках выбери нейросеть и вставь ключ.'}
        </p>
      )}
      {err && <p className="hint is-error">{err}</p>}

      {log && (
        <div className="coach-body">
          <Markdown text={log.text} />

          {log.proposals.map((p, i) => (
            <div key={i} className={'proposal is-' + (p.status ?? 'new')}>
              <div>
                <b>{proposalTitle(p, spheres)}</b>
                {p.reason && <p className="hint">{p.reason}</p>}
              </div>
              {(!p.status || p.status === 'new') ? (
                <div className="btn-row">
                  <button type="button" className="btn primary small" onClick={() => act(i, 'applied')}>Применить</button>
                  <button type="button" className="btn ghost small" onClick={() => act(i, 'dismissed')}>Не надо</button>
                </div>
              ) : <span className="muted">{p.status === 'applied' ? 'применено' : 'отклонено'}</span>}
            </div>
          ))}

          {log.thread.map((t, i) => (
            <div key={i} className="coach-qa">
              <p className="coach-q">{t.q}</p>
              <Markdown text={t.a} />
            </div>
          ))}

          <form className="coach-ask" onSubmit={(e) => { e.preventDefault(); if (q.trim()) run('ask'); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Спросить коуча" aria-label="Вопрос коучу" disabled={!!busy} />
            <button type="submit" className="btn ghost small" disabled={!q.trim() || !!busy}>{busy === 'ask' ? '…' : 'Спросить'}</button>
          </form>
        </div>
      )}
    </section>
  );
}
