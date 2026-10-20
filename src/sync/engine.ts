/**
 * Синхронизация через Google Диск.
 * Правило слияния — «побеждает более свежая правка» по каждой записи (updatedAt).
 * Удаление мягкое (deleted=1), поэтому тоже доезжает до других устройств.
 * Основная копия данных — на устройстве; файл на Диске — общий «почтовый ящик».
 */
import Dexie from 'dexie';
import { useSyncExternalStore } from 'react';
import { db, exportAll, importAll, rowKey, SYNC_TABLES, tableOf, type Backup } from '../db';
import { AuthError, download, findFile, upload, uploadBackup } from './drive';
import { canWriteFiles, clientId, forgetToken, requestToken, validToken } from './google';
import { toISODate } from '../lib/time';

export type SyncState = 'off' | 'idle' | 'syncing' | 'auth' | 'error' | 'offline';
export interface SyncStatus { state: SyncState; lastSync: number | null; message?: string; dirty: boolean; needChoice: boolean }

const LS_ON = 'ritm:sync-on';
const LS_LAST = 'ritm:sync-last';
const LS_FILE = 'ritm:sync-file';
const LS_DIRTY = 'ritm:sync-dirty';

let status: SyncStatus = {
  state: localStorage.getItem(LS_ON) ? 'idle' : 'off',
  lastSync: Number(localStorage.getItem(LS_LAST)) || null,
  dirty: !!localStorage.getItem(LS_DIRTY),
  needChoice: false,
};
const listeners = new Set<() => void>();
function set(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}
export const syncEnabled = () => !!localStorage.getItem(LS_ON);

// ---------- Отслеживание изменений ----------
let ignoreUntil = 0;
let timer: number | undefined;
Dexie.on('storagemutated', () => {
  if (Date.now() < ignoreUntil) return;
  localStorage.setItem(LS_DIRTY, '1');
  if (!status.dirty) set({ dirty: true });
  if (!syncEnabled()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => { void sync(false); }, 15_000);
});

// ---------- Основное ----------
type Mode = 'merge' | 'replace';
let running: Promise<void> | null = null;

function isBackup(x: unknown): x is Backup {
  return typeof x === 'object' && x !== null && (x as Backup).app === 'ritm';
}

async function replaceLocal(remote: Backup) {
  ignoreUntil = Date.now() + 3000;
  await db.transaction('rw', SYNC_TABLES.map(tableOf), async () => {
    for (const t of SYNC_TABLES) {
      await tableOf(t).clear();
      await tableOf(t).bulkPut(remote[t] ?? []);
    }
  });
  ignoreUntil = Date.now() + 1500;
}

/** Есть ли у нас что-то, чего нет в файле на Диске (или оно новее) */
function localAhead(local: Backup, remote: Backup | null): boolean {
  if (!remote) return true;
  for (const t of SYNC_TABLES) {
    const idx = new Map((remote[t] ?? []).map((r) => [rowKey(r), r.updatedAt]));
    if ((local[t] ?? []).some((r) => (idx.get(rowKey(r)) ?? -1) < r.updatedAt)) return true;
  }
  return false;
}

async function run(interactive: boolean, mode?: Mode) {
  if (!clientId()) { set({ state: 'error', message: 'Не указан Client ID Google' }); return; }
  if (!navigator.onLine) { set({ state: 'offline', message: undefined }); return; }
  let token = validToken();
  if (!token) {
    if (!interactive) { set({ state: 'auth', message: undefined }); return; }
    token = await requestToken();
  }
  set({ state: 'syncing', message: undefined });

  let fileId = localStorage.getItem(LS_FILE) || (await findFile(token));
  let remote: Backup | null = null;
  if (fileId) {
    try {
      const data = await download(token, fileId);
      remote = isBackup(data) ? data : null;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      fileId = await findFile(token); // файл могли удалить — ищем заново
      if (fileId) { const d = await download(token, fileId); remote = isBackup(d) ? d : null; }
    }
  }

  // Первое подключение этого устройства, а на Диске уже есть данные — спрашиваем
  if (!syncEnabled() && remote && !mode) {
    set({ state: 'idle', needChoice: true });
    return;
  }

  let received = 0;
  if (remote) {
    if (mode === 'replace') { await replaceLocal(remote); received = -1; }
    else {
      ignoreUntil = Date.now() + 3000;
      const r = await importAll(remote);
      received = r.added + r.updated;
      ignoreUntil = Date.now() + 1500;
    }
  }

  const local = await exportAll();
  let sent = false;
  if (localAhead(local, remote)) {
    fileId = await upload(token, fileId, local);
    sent = true;
  }
  if (fileId) localStorage.setItem(LS_FILE, fileId);
  localStorage.setItem(LS_ON, '1');
  localStorage.removeItem(LS_DIRTY);
  const now = Date.now();
  localStorage.setItem(LS_LAST, String(now));
  await weeklyBackup(token, false);
  set({
    state: 'idle', lastSync: now, dirty: false, needChoice: false,
    message: received === -1 ? 'Данные загружены с Диска' : received > 0 ? `Получено изменений: ${received}${sent ? ', отправлено' : ''}` : sent ? 'Изменения отправлены' : 'Всё совпадает',
  });
}

export function sync(interactive: boolean, mode?: Mode): Promise<void> {
  if (running) return running;
  running = run(interactive, mode)
    .catch((e: unknown) => {
      if (e instanceof AuthError) { forgetToken(); set({ state: 'auth', message: 'Нужно заново войти в Google' }); }
      else set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => { running = null; });
  return running;
}

export function resolveChoice(mode: Mode | null) {
  if (!mode) { set({ needChoice: false, state: syncEnabled() ? 'idle' : 'off' }); return Promise.resolve(); }
  return sync(true, mode);
}

export function disconnect() {
  forgetToken();
  [LS_ON, LS_FILE, LS_LAST].forEach((k) => localStorage.removeItem(k));
  set({ state: 'off', lastSync: null, message: undefined, needChoice: false });
}

/** Автосинхронизация: при запуске, возвращении в приложение и появлении сети — если есть действующий вход */
export function startAutoSync() {
  if (!syncEnabled()) return;
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    if (!validToken()) { if (status.state !== 'syncing') set({ state: navigator.onLine ? 'auth' : 'offline' }); return; }
    if (status.dirty || !status.lastSync || Date.now() - status.lastSync > 2 * 60_000) void sync(false);
  };
  tick();
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
  window.addEventListener('offline', () => set({ state: 'offline' }));
}

// ---------- Еженедельная резервная копия ----------

export interface BackupInfo { at: number; name: string }

export async function lastBackup(): Promise<BackupInfo | null> {
  return ((await db.kv.get('backupLast'))?.value as BackupInfo | undefined) ?? null;
}

/** Раз в неделю (или по кнопке) — полная копия в видимую папку на Диске. Ошибка копии не ломает синхронизацию. */
async function weeklyBackup(token: string, force: boolean) {
  if (!canWriteFiles()) return;
  const last = await lastBackup();
  if (!force && last && Date.now() - last.at < 7 * 86400000) return;
  const name = `ritm-backup-${toISODate(new Date())}.json`;
  try {
    await uploadBackup(token, name, await exportAll());
    ignoreUntil = Date.now() + 1500;
    await db.kv.put({ key: 'backupLast', value: { at: Date.now(), name }, updatedAt: Date.now() });
  } catch (e) {
    if (force) throw e;
  }
}

export async function backupNow(): Promise<void> {
  let token = validToken();
  if (!token || !canWriteFiles()) token = await requestToken();
  if (!canWriteFiles()) throw new Error('Google не дал разрешение на создание файлов на Диске');
  await weeklyBackup(token, true);
}
