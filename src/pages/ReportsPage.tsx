import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ReportView from '../components/ReportView';
import SectionCard from '../components/SectionCard';
import { toast } from '../components/Toast';
import { useEventsBetween, useLogsOn, useNow, useSpheres } from '../lib/hooks';
import { dayReport, loadBundle, weekReport, WEEKLY_SECTION } from '../lib/report';
import { downloadPdf } from '../lib/pdf';
import { addDays, fmtDayLong, fmtWeekRange, weekday, weekStartOf } from '../lib/time';

type Tab = 'day' | 'week';

function AiBox({ report }: { report: Record<string, unknown> }) {
  const text = JSON.stringify(report, null, 1);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('Скопировано'); }
    catch { toast('Не удалось скопировать — выдели текст вручную'); }
  };
  return (
    <div className="ai-box">
      <div className="ai-head">
        <p className="hint">Это получит ИИ-коуч: данные с подписями и единицами плюс отклонения, посчитанные по правилам плана. Уже сейчас можно вставить в любой чат с нейросетью.</p>
        <button type="button" className="btn ghost small" onClick={copy}>Копировать</button>
      </div>
      <pre className="ai-pre">{text}</pre>
    </div>
  );
}

export default function ReportsPage() {
  const now = useNow();
  const [tab, setTab] = useState<Tab>(() => (location.hash.includes('/week') || weekday(now.date) === 7 ? 'week' : 'day'));
  const [date, setDate] = useState(now.date);
  const [week, setWeek] = useState(weekStartOf(now.date));
  const [showAi, setShowAi] = useState(false);
  const [busy, setBusy] = useState(false);

  const report = useLiveQuery(async () => {
    if (tab === 'day') return dayReport(await loadBundle(date, date), date);
    return weekReport(await loadBundle(week, addDays(week, 6)), week, now.date);
  }, [tab, date, week, now.date]);

  // Для карточки чек-ина
  const weekLogs = useLogsOn(week);
  const spheres = useSpheres() ?? [];
  const weekEvents = useEventsBetween(week, week) ?? [];

  const isCurWeek = week === weekStartOf(now.date);
  const title = tab === 'day' ? 'Отчёт за день' : 'Отчёт за неделю';
  const subtitle = tab === 'day' ? fmtDayLong(date) : fmtWeekRange(week);

  const pdf = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await downloadPdf(report, title, subtitle, tab === 'day' ? `ritm-den-${date}.pdf` : `ritm-nedelya-${week}.pdf`);
    } catch (e) {
      toast('Не получилось собрать PDF: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  };

  return (
    <div className="page reports">
      <div className="page-head">
        <h1>Отчёты</h1>
        <div className="seg">
          <button type="button" className={tab === 'day' ? 'is-on' : ''} onClick={() => setTab('day')}>День</button>
          <button type="button" className={tab === 'week' ? 'is-on' : ''} onClick={() => setTab('week')}>Неделя</button>
        </div>
      </div>

      <div className="rep-bar">
        <div className="toolbar-nav">
          {tab === 'day' ? (
            <>
              <button type="button" className="icon-btn" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Предыдущий день">‹</button>
              <span className="rep-period">{fmtDayLong(date)}</span>
              <button type="button" className="icon-btn" disabled={date >= now.date} onClick={() => setDate((d) => addDays(d, 1))} aria-label="Следующий день">›</button>
            </>
          ) : (
            <>
              <button type="button" className="icon-btn" onClick={() => setWeek((w) => addDays(w, -7))} aria-label="Предыдущая неделя">‹</button>
              <span className="rep-period">{fmtWeekRange(week)}</span>
              <button type="button" className="icon-btn" disabled={isCurWeek} onClick={() => setWeek((w) => addDays(w, 7))} aria-label="Следующая неделя">›</button>
            </>
          )}
        </div>
        <span className="spacer" />
        <button type="button" className={'btn ghost small' + (showAi ? ' is-pressed' : '')} aria-pressed={showAi} onClick={() => setShowAi((v) => !v)}>Для нейросети</button>
        <button type="button" className="btn primary small" onClick={pdf} disabled={!report || busy}>{busy ? 'Собираю…' : 'Скачать PDF'}</button>
      </div>

      {tab === 'week' && weekLogs && (
        <div className="rep-checkin" key={week}>
          <SectionCard def={WEEKLY_SECTION} date={week} stored={weekLogs.get('weekly')} ctx={{ dayEvents: weekEvents, spheres }} hideGear onEditFields={() => {}} />
        </div>
      )}

      {!report ? <p className="muted">Собираю отчёт…</p> : showAi ? <AiBox report={report} /> : <ReportView report={report} />}
    </div>
  );
}
