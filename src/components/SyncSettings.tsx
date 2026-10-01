import { useState } from 'react';
import { disconnect, sync, useSyncStatus } from '../sync/engine';
import { clientId, clientIdFromConfig, setClientId } from '../sync/google';
import { exportAll, importAll, type Backup } from '../db';
import { toast } from './Toast';

export default function SyncSettings() {
  const s = useSyncStatus();
  const [id, setId] = useState(clientId());
  const [saved, setSaved] = useState(!!clientId());
  const fromConfig = clientIdFromConfig();

  return (
    <section className="card">
      <h2>Синхронизация</h2>
      <p className="hint">
        Данные хранятся на каждом устройстве, а через скрытую папку приложения на твоём Google Диске телефон и компьютер обмениваются изменениями.
        Приложение видит только эту папку, остальные файлы Диска ему недоступны.
      </p>
      {!fromConfig && (
        <div className="inline">
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            <span>Client ID Google</span>
            <input value={id} placeholder="1234…apps.googleusercontent.com" onChange={(e) => { setId(e.target.value); setSaved(false); }} />
          </label>
          <button type="button" className="btn ghost" style={{ alignSelf: 'flex-end' }} disabled={saved}
            onClick={() => { setClientId(id); setSaved(true); toast('Client ID сохранён'); }}>Сохранить</button>
        </div>
      )}
      {saved && (
        <>
          <p className="sync-line">
            {s.state === 'off' && 'Не подключено на этом устройстве.'}
            {s.state === 'syncing' && 'Идёт синхронизация…'}
            {s.state === 'auth' && 'Нужно нажать «Синхронизировать» — Google просит подтвердить вход примерно раз в час.'}
            {s.state === 'offline' && 'Нет сети. Изменения сохранены на устройстве и уйдут, когда появится интернет.'}
            {s.state === 'error' && `Ошибка: ${s.message}`}
            {s.state === 'idle' && `Последняя синхронизация: ${s.lastSync ? new Date(s.lastSync).toLocaleString('ru-RU') : '—'}${s.message ? `. ${s.message}` : ''}`}
          </p>
          <div className="btn-row">
            <button type="button" className="btn primary" disabled={s.state === 'syncing'} onClick={() => sync(true)}>
              {s.state === 'off' ? 'Подключить Google Диск' : 'Синхронизировать сейчас'}
            </button>
            {s.state !== 'off' && <button type="button" className="btn ghost" onClick={() => { disconnect(); toast('Синхронизация на этом устройстве отключена'); }}>Отключить на этом устройстве</button>}
          </div>
        </>
      )}
      <Transfer />
    </section>
  );
}

/** Перенос данных копированием текста — для предпросмотра, где скачивание файлов недоступно */
function Transfer() {
  const [out, setOut] = useState('');
  const [inp, setInp] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="linklike" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Перенести данные текстом</button>;
  return (
    <div className="transfer">
      <p className="hint">Нужно, чтобы забрать то, что уже введено в предпросмотре: здесь «Показать копию» → скопировать весь текст → в установленном приложении вставить в нижнее поле.</p>
      <div className="btn-row">
        <button type="button" className="btn ghost small" onClick={async () => setOut(JSON.stringify(await exportAll()))}>Показать копию</button>
        {out && <button type="button" className="btn ghost small" onClick={async () => {
          try { await navigator.clipboard.writeText(out); toast('Скопировано'); } catch { toast('Выдели текст в поле и скопируй вручную'); }
        }}>Копировать</button>}
      </div>
      {out && <textarea readOnly rows={3} value={out} onFocus={(e) => e.target.select()} aria-label="Копия данных" />}
      <textarea rows={3} value={inp} placeholder="Вставь сюда копию данных" onChange={(e) => setInp(e.target.value)} aria-label="Вставить копию" />
      <button type="button" className="btn ghost small" disabled={!inp.trim()} onClick={async () => {
        try {
          const r = await importAll(JSON.parse(inp) as Backup);
          toast(`Загружено: новых ${r.added}, обновлено ${r.updated}`);
          setInp('');
        } catch (e) { toast(e instanceof Error ? e.message : 'Не похоже на копию данных'); }
      }}>Загрузить</button>
    </div>
  );
}
