/** Минимальный клиент Google Drive: один файл в скрытой папке приложения */
const FILE = 'ritm-sync.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export class AuthError extends Error {}

async function call(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) throw new AuthError('Нужно заново войти в Google');
  if (!r.ok) throw new Error(`Google Диск ответил ${r.status}`);
  return r;
}

export async function findFile(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE}'`);
  const r = await call(token, `${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  const j = (await r.json()) as { files: { id: string }[] };
  return j.files[0]?.id ?? null;
}

export async function download(token: string, id: string): Promise<unknown> {
  const r = await call(token, `${API}/${id}?alt=media`);
  return r.json();
}

export async function upload(token: string, id: string | null, data: unknown): Promise<string> {
  const body = JSON.stringify(data);
  if (id) {
    await call(token, `${UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return id;
  }
  const boundary = 'ritm' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await call(token, `${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  return ((await r.json()) as { id: string }).id;
}

// ---------- Видимые резервные копии ----------

const FOLDER = 'Ритм — резервные копии';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function ensureFolder(token: string): Promise<string> {
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const r = await call(token, `${API}?q=${q}&fields=files(id)`);
  const j = (await r.json()) as { files: { id: string }[] };
  if (j.files[0]) return j.files[0].id;
  const c = await call(token, `${API}?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: FOLDER_MIME }),
  });
  return ((await c.json()) as { id: string }).id;
}

/** Кладёт копию в папку «Ритм — резервные копии» и оставляет только последние keep штук */
export async function uploadBackup(token: string, name: string, data: unknown, keep = 8): Promise<void> {
  const folder = await ensureFolder(token);
  const boundary = 'ritm' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [folder], mimeType: 'application/json' });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  await call(token, `${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
  const list = (await (await call(token, `${API}?q=${q}&orderBy=createdTime desc&fields=files(id,name)`)).json()) as { files: { id: string }[] };
  for (const f of list.files.slice(keep)) await call(token, `${API}/${f.id}`, { method: 'DELETE' });
}
