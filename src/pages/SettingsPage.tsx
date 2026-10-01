import { useEffect, useRef, useState } from 'react';
import { exportAll, importAll, resetAll, saveSettings, type Backup } from '../db';
import { useSettings } from '../lib/hooks';
import { fmtTime, parseTime, toISODate } from '../lib/time';
import DayPicker from '../components/DayPicker';
import SyncSettings from '../components/SyncSettings';
import ChatSettings from '../components/ChatSettings';
import type { Settings } from '../types';
import { toast } from '../components/Toast';
import { ask } from '../components/Confirm';

export default function SettingsPage() {
  const s = useSettings();
  const set = (patch: Partial<Settings>) => saveSettings(patch);
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setUsage(`${(e.usage / 1024).toFixed(0)} КБ`);
    }).catch(() => {});
  }, []);

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ritm-backup-${toISODate(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const doImport = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Backup;
      const r = await importAll(data);
      toast(`Импорт: новых записей ${r.added}, обновлено ${r.updated}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Файл не похож на резервную копию');
    }
  };

  const hourOpts = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

  return (
    <div className="page">
      <div className="page-head"><h1>Настройки</h1></div>

      <section className="card">
        <h2>Оформление</h2>
        <div className="field">
          <span>Тема</span>
          <div className="seg">
            {([['dark', 'Тёмная'], ['light', 'Светлая'], ['system', 'Как в системе']] as const).map(([k, l]) => (
              <button key={k} type="button" className={s.theme === k ? 'is-on' : ''} onClick={() => set({ theme: k })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Высота часа в сетке</span>
          <div className="seg">
            {([[40, 'Компактно'], [52, 'Обычно'], [68, 'Крупно']] as const).map(([v, l]) => (
              <button key={v} type="button" className={s.hourHeight === v ? 'is-on' : ''} onClick={() => set({ hourHeight: v })}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Расписание</h2>
        <div className="row3">
          <label className="field">
            <span>Сетка с</span>
            <select value={s.dayStartHour} onChange={(e) => set({ dayStartHour: Number(e.target.value) })}>
              {hourOpts(5, 12).map((h) => <option key={h} value={h}>{fmtTime(h * 60)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>до</span>
            <select value={s.dayEndHour} onChange={(e) => set({ dayEndHour: Number(e.target.value) })}>
              {hourOpts(20, 28).map((h) => <option key={h} value={h}>{fmtTime(h * 60)}{h > 24 ? ' ночи' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Шаг перетаскивания</span>
            <select value={s.snapMin} onChange={(e) => set({ snapMin: Number(e.target.value) })}>
              {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} мин</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Правила из плана</h2>
        <p className="hint">Их учитывают подсказки: что предлагать в свободное время.</p>
        <div className="field">
          <span>Дни, когда вечером только лёгкие дела</span>
          <div className="inline">
            <DayPicker label="Дни с лёгким вечером" value={s.lightWeekdays} onChange={(v) => set({ lightWeekdays: v })} />
            <span className="muted">после</span>
            <input type="time" value={fmtTime(s.lightFromMin)} aria-label="Время начала лёгкого вечера"
              onChange={(e) => { const v = parseTime(e.target.value); if (v != null) set({ lightFromMin: v }); }} />
          </div>
        </div>
        <div className="row2">
          <label className="field">
            <span>Цифровой закат</span>
            <input type="time" value={fmtTime(s.sunsetMin)}
              onChange={(e) => { const v = parseTime(e.target.value); if (v != null) set({ sunsetMin: v }); }} />
          </label>
          <div className="field">
            <span>Дни отдыха</span>
            <DayPicker label="Дни отдыха" value={s.restWeekdays} onChange={(v) => set({ restWeekdays: v })} />
          </div>
        </div>
      </section>

      <ChatSettings />

      <SyncSettings />

      <section className="card">
        <h2>Данные</h2>
        <p className="hint">
          На этом устройстве занято {usage || '—'}. Резервная копия — отдельный файл на всякий случай, в дополнение к синхронизации.
        </p>
        {persisted === false && (
          <p className="hint is-warn">
            Браузер может очистить данные при нехватке места.{' '}
            <button type="button" className="linklike" onClick={async () => {
              const ok = await navigator.storage?.persist?.();
              setPersisted(!!ok);
              toast(ok ? 'Хранилище закреплено' : 'Браузер не разрешил. Установи приложение на экран — тогда обычно разрешает');
            }}>Попросить закрепить хранилище</button>
          </p>
        )}
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={doExport}>Скачать резервную копию</button>
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Загрузить из файла</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
        </div>
        <p className="hint">При загрузке записи объединяются: из двух версий одной записи остаётся более свежая.</p>
        <button type="button" className="btn ghost danger small" onClick={async () => {
          if (await ask('Все данные на этом устройстве будут удалены, приложение начнёт с чистого листа. Резервную копию лучше скачать заранее.', 'Стереть всё', true)) resetAll();
        }}>Стереть всё на этом устройстве</button>
      </section>
    </div>
  );
}
