import { useEffect, useState } from 'react';
import { sync, useSyncStatus } from '../sync/engine';
import { clientId } from '../sync/google';

function ago(t: number | null) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ч назад` : 'больше суток назад';
}

/** Состояние синхронизации; по нажатию — синхронизировать сейчас */
export default function SyncButton() {
  const s = useSyncStatus();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  if (s.state === 'off' || !clientId()) return null;

  const view: Record<string, [string, string, string]> = {
    syncing: ['Синхронизация…', '…', 'is-busy'],
    auth: ['Синхронизировать', 'Синхр.', 'is-warn'],
    error: ['Ошибка — повторить', 'Ошибка', 'is-err'],
    offline: ['Нет сети, всё на устройстве', 'Офлайн', 'is-muted'],
    idle: s.dirty ? ['Есть изменения — отправить', 'Отправить', 'is-warn'] : [`Синхронизировано ${ago(s.lastSync)}`, ago(s.lastSync), 'is-ok'],
  };
  const [text, short, cls] = view[s.state] ?? ['', '', ''];
  return (
    <button type="button" className={'sync-btn ' + cls} disabled={s.state === 'syncing' || s.state === 'offline'}
      title={s.message ?? 'Синхронизация с Google Диском'} onClick={() => sync(true)}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18Z" /></svg>
      <span className="sync-long">{text}</span>
      <span className="sync-short">{short}</span>
    </button>
  );
}
