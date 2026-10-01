import { useEffect, useState } from 'react';
import { getChatUrl, saveChatUrl } from '../lib/chat';
import { instructionText } from '../lib/template';
import { toast } from './Toast';

export default function ChatSettings() {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => { getChatUrl().then((u) => { setUrl(u); setSaved(u); }); }, []);
  const valid = !url || /^https:\/\/(chat\.)?deepseek\.com\//.test(url.trim());

  return (
    <section className="card">
      <h2>Чат с DeepSeek</h2>
      <p className="hint">
        Отчёты за день и неделю собираются текстом. Кнопка «Скопировать и открыть чат» копирует отчёт и открывает твой чат — там остаётся вставить и отправить.
      </p>
      <label className="field">
        <span>Ссылка на чат — скопируй из адресной строки, когда открыт нужный чат на chat.deepseek.com</span>
        <input value={url} placeholder="https://chat.deepseek.com/a/chat/s/…" onChange={(e) => setUrl(e.target.value)} />
      </label>
      {!valid && <p className="hint is-error">Это не похоже на ссылку DeepSeek.</p>}
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={!valid || url.trim() === saved} onClick={async () => {
          await saveChatUrl(url); setSaved(url.trim()); toast('Ссылка сохранена');
        }}>Сохранить</button>
        {saved && <a className="btn ghost" href={saved} target="_blank" rel="noreferrer">Открыть чат</a>}
      </div>

      <div className="field">
        <span>Инструкция для чата — отправить один раз, если чат ещё не знает правил тона и формата</span>
        <div className="btn-row">
          <button type="button" className="btn ghost small" onClick={async () => {
            try { await navigator.clipboard.writeText(instructionText()); toast('Инструкция скопирована'); }
            catch { setShow(true); toast('Скопируй текст вручную'); }
          }}>Скопировать инструкцию</button>
          <button type="button" className="btn ghost small" onClick={() => setShow((v) => !v)}>{show ? 'Скрыть' : 'Показать'}</button>
        </div>
        {show && <textarea className="send-text" readOnly rows={14} value={instructionText()} onFocus={(e) => e.target.select()} aria-label="Инструкция для чата" />}
      </div>
    </section>
  );
}
