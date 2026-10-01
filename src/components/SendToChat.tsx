import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { buildText, getChatUrl } from '../lib/chat';
import { toast } from './Toast';

/** Отчёт текстом: скопировать и открыть чат DeepSeek одним нажатием */
export default function SendToChat({ kind, date }: { kind: 'day' | 'week'; date: string }) {
  // Текст собирается заранее, чтобы по нажатию сразу скопировать и открыть чат (браузеры требуют это делать мгновенно)
  const text = useLiveQuery(() => buildText(kind, date), [kind, date]);
  const url = useLiveQuery(() => getChatUrl(), []);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const copy = async (): Promise<boolean> => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      return true;
    } catch {
      setShow(true);
      setTimeout(() => { areaRef.current?.focus(); areaRef.current?.select(); }, 50);
      toast('Не удалось скопировать автоматически — текст выделен, скопируй вручную');
      return false;
    }
  };

  const send = () => {
    if (!text) return;
    const p = copy();
    if (url) window.open(url, '_blank', 'noopener');
    p.then((ok) => { if (ok) toast(url ? 'Отчёт скопирован — в чате нажми «Вставить» и отправь' : 'Отчёт скопирован'); });
  };

  const share = async () => {
    if (!text) return;
    try { await navigator.share({ text }); } catch { /* отменили */ }
  };

  const label = kind === 'day' ? 'Отправить отчёт за день в DeepSeek' : 'Отправить отчёт за неделю в DeepSeek';

  return (
    <section className="send" aria-label="Отчёт для DeepSeek">
      <div className="send-head">
        <span className="send-mark" aria-hidden>➤</span>
        <div className="send-titles">
          <h2>{kind === 'day' ? 'Отчёт за день для DeepSeek' : 'Отчёт за неделю для DeepSeek'}</h2>
          <span className="hint">
            {url
              ? 'Скопирую текст и открою твой чат: там останется нажать «Вставить» и «Отправить».'
              : <>Ссылка на чат не указана — <a className="linklike" href="#/settings">добавь её в Настройках</a>. Пока можно просто скопировать текст.</>}
          </span>
        </div>
      </div>
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={!text} onClick={send} aria-label={label}>
          {url ? 'Скопировать и открыть чат' : 'Скопировать отчёт'}
        </button>
        {mobile && 'share' in navigator && <button type="button" className="btn ghost" disabled={!text} onClick={share}>Поделиться</button>}
        <button type="button" className="btn ghost" aria-expanded={show} onClick={() => setShow((v) => !v)}>{show ? 'Скрыть текст' : 'Показать текст'}</button>
        {copied && <span className="muted send-ok">скопировано ✓</span>}
      </div>
      {show && text && (
        <textarea ref={areaRef} className="send-text" readOnly value={text} rows={Math.min(24, text.split('\n').length + 1)} onFocus={(e) => e.target.select()} aria-label="Текст отчёта" />
      )}
    </section>
  );
}
