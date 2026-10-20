import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { amReportText, amWeek, rub, weekTitle } from '../lib/amReport';
import { money, savePremium, type Lesson, type MoneyData } from '../lib/money';
import { addDays, logicalNow, weekday, weekStartOf } from '../lib/time';

/** По умолчанию — прошлая неделя в понедельник (отчёт за неё ещё могут ждать), иначе текущая; не раньше начала учёта */
export function defaultReportWeek(trackFrom: string | null, today = logicalNow().date) {
  const ws = weekStartOf(today);
  const w = weekday(today) === 1 ? addDays(ws, -7) : ws;
  const first = trackFrom ? weekStartOf(trackFrom) : w;
  return w < first ? first : w;
}

export default function AmReportCard({ data, lessons }: { data: MoneyData; lessons: Lesson[] }) {
  const [week, setWeek] = useState(() => defaultReportWeek(data.m.trackFrom));
  const [open, setOpen] = useState(false);
  const w = useMemo(() => amWeek(data, week, lessons), [data, week, lessons]);
  const text = useMemo(() => amReportText(data, w), [data, w]);
  const prem = data.premiums.find((p) => p.week === week);
  const [premium, setPremium] = useState('');
  useEffect(() => { setPremium(prem ? String(prem.amount) : ''); }, [week, prem?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
  const premN = Math.round(Number(premium) || 0);
  const premDirty = premN !== (prem?.amount ?? 0);
  const thisWeek = weekStartOf(logicalNow().date);
  const subsSum = w.subs.reduce((a, s) => a + s.center, 0);

  const savePrem = async () => {
    await savePremium({ id: prem?.id, week, amount: premN, note: prem?.note ?? '' });
    toast(premN ? `Премия ${money(premN)} — в неделе ${weekTitle(week)}` : 'Премия убрана');
  };

  return (
    <section className="card am-card">
      <div className="am-head">
        <h2>Отчёт для центра</h2>
        <div className="am-week">
          <button type="button" className="icon-btn" aria-label="Предыдущая неделя" disabled={!!data.m.trackFrom && week <= weekStartOf(data.m.trackFrom)} onClick={() => setWeek((x) => addDays(x, -7))}>‹</button>
          <span>{weekTitle(week)}</span>
          <button type="button" className="icon-btn" aria-label="Следующая неделя" disabled={week >= thisWeek} onClick={() => setWeek((x) => addDays(x, 7))}>›</button>
        </div>
      </div>

      <div className="am-sum">
        <div><span>Дань за разовые</span><b>{money(w.singlesTribute)}</b><small>{w.singles.length ? `занятий: ${w.singles.length}` : 'не было'}</small></div>
        <div><span>За абонементы</span><b>{money(subsSum)}</b><small>{w.subs.length ? `продано: ${w.subs.length}` : 'не было'}</small></div>
        <div><span>Премия</span><b>{w.premium ? '−' + money(w.premium) : '—'}</b><small>&nbsp;</small></div>
        <div className="is-total"><span>Итого дань</span><b>{money(w.total)}</b><small>{w.cancels.length ? `отмен: ${w.cancels.length}` : 'отмен не было'}</small></div>
      </div>

      <div className="field am-prem">
        <span>Премия от центра — вычитается из дани этой недели</span>
        <div className="inline">
          <input type="number" inputMode="numeric" min={0} step={100} value={premium} placeholder="0" style={{ width: 130 }} aria-label="Премия"
            onChange={(e) => setPremium(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && premDirty) void savePrem(); }} />
          <span className="muted">₽</span>
          {premDirty && <button type="button" className="btn ghost small" onClick={savePrem}>Сохранить</button>}
        </div>
      </div>

      {w.warnings.length > 0 && <ul className="am-warn">{w.warnings.map((x) => <li key={x}>{x}</li>)}</ul>}
      {w.planned > 0 && <p className="hint">Ещё впереди занятий: {w.planned}. Дань за них появится, когда они пройдут.</p>}

      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>Подготовить отчёт</button>
      </div>
      {open && <ReportText text={text} title={`Отчёт · ${weekTitle(week)}`} total={rub(w.total)} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ReportText({ text: initial, title, total, onClose }: { text: string; title: string; total: string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && window.matchMedia('(pointer: coarse)').matches;
  const copy = () => navigator.clipboard.writeText(text).then(
    () => toast('Отчёт скопирован'),
    () => { ref.current?.focus(); ref.current?.select(); toast('Не удалось скопировать автоматически — текст выделен'); },
  );
  return (
    <Modal title={title} subtitle={`Итого дань: ${total}₽. Текст можно поправить перед отправкой — правка не сохраняется.`} onClose={onClose}
      footer={<>
        {text !== initial && <button type="button" className="btn ghost" onClick={() => setText(initial)}>Вернуть как было</button>}
        <span className="spacer" />
        {canShare && <button type="button" className="btn ghost" onClick={() => navigator.share({ text }).catch(() => {})}>Поделиться</button>}
        <button type="button" className="btn primary" onClick={copy}>Скопировать</button>
      </>}>
      <textarea ref={ref} className="am-text" value={text} rows={Math.min(22, text.split('\n').length + 1)} aria-label="Текст отчёта" onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}
