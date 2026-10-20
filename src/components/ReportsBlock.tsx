import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { buildText, getChatUrl } from '../lib/chat';
import { dayReport, loadBundle, weekReport } from '../lib/report';
import { downloadPdf } from '../lib/pdf';
import { addDays, fmtDayLong, fmtWeekRange, logicalNow, weekday, weekStartOf } from '../lib/time';
import { toast } from './Toast';

type Kind = 'day' | 'week';

function Row({ kind, date, url, highlight }: { kind: Kind; date: string; url: string; highlight?: boolean }) {
  // Текст собирается заранее: браузер разрешает копировать и открывать вкладку только сразу по нажатию
  const text = useLiveQuery(() => buildText(kind, date), [kind, date]);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const title = kind === 'day' ? 'За день' : 'За неделю';
  const sub = kind === 'day' ? fmtDayLong(date) : fmtWeekRange(date);

  const send = () => {
    if (!text) return;
    const p = navigator.clipboard.writeText(text).then(() => true, () => false);
    if (url) window.open(url, '_blank', 'noopener');
    p.then((ok) => {
      if (ok) toast(url ? 'Отчёт скопирован — в чате нажми «Вставить» и отправь' : 'Отчёт скопирован');
      else {
        setShow(true);
        setTimeout(() => { areaRef.current?.focus(); areaRef.current?.select(); }, 50);
        toast('Не удалось скопировать автоматически — текст выделен, скопируй вручную');
      }
    });
  };

  const pdf = async () => {
    setBusy(true);
    try {
      const today = logicalNow().date;
      const report = kind === 'day'
        ? dayReport(await loadBundle(date, date), date)
        : weekReport(await loadBundle(date, addDays(date, 6)), date, today < addDays(date, 6) ? today : addDays(date, 6));
      await downloadPdf(report, kind === 'day' ? 'Отчёт за день' : 'Отчёт за неделю', sub, kind === 'day' ? `ritm-den-${date}.pdf` : `ritm-nedelya-${date}.pdf`);
    } catch (e) {
      toast('Не получилось собрать PDF: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  };

  return (
    <div className={'rb-row' + (highlight ? ' is-hl' : '')}>
      <div className="rb-title">
        <b>{title}</b>
        <span className="muted">{sub}{highlight && ' · воскресенье, пора отправить'}</span>
      </div>
      <div className="rb-actions">
        <button type="button" className="btn primary small" disabled={!text} onClick={send}
          aria-label={kind === 'day' ? 'Отправить отчёт за день в DeepSeek' : 'Отправить отчёт за неделю в DeepSeek'}>
          {url ? 'В DeepSeek' : 'Скопировать'}
        </button>
        {mobile && 'share' in navigator && (
          <button type="button" className="btn ghost small" disabled={!text} onClick={() => navigator.share({ text: text! }).catch(() => {})}>Поделиться</button>
        )}
        <button type="button" className="btn ghost small" disabled={busy} onClick={pdf}>{busy ? 'PDF…' : 'PDF'}</button>
        <button type="button" className="btn ghost small" aria-expanded={show} onClick={() => setShow((v) => !v)}>{show ? 'Скрыть' : 'Текст'}</button>
      </div>
      {show && text && (
        <textarea ref={areaRef} className="send-text" readOnly value={text} rows={Math.min(22, text.split('\n').length + 1)}
          onFocus={(e) => e.target.select()} aria-label={`Текст отчёта: ${title.toLowerCase()}`} />
      )}
    </div>
  );
}

/** Внизу страницы «День»: отчёты для DeepSeek и PDF за выбранный день и его неделю */
export default function ReportsBlock({ date }: { date: string }) {
  const url = useLiveQuery(() => getChatUrl(), []) ?? '';
  const sunday = weekday(date) === 7;
  return (
    <section className="rb" id="reports" aria-label="Отчёты">
      <header className="rb-head">
        <h2>Отчёты</h2>
        {!url && <a className="linklike" href="#/settings">указать чат DeepSeek</a>}
      </header>
      <Row kind="day" date={date} url={url} />
      <Row kind="week" date={weekStartOf(date)} url={url} highlight={sunday} />
    </section>
  );
}
