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
