/** Вход в Google: получаем короткоживущий токен доступа только к скрытой папке приложения на Диске */
import { GOOGLE_CLIENT_ID } from '../config';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const LS_TOKEN = 'ritm:gtoken';
const LS_CLIENT = 'ritm:gclient';

interface Stored { token: string; exp: number }

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    } } };
  }
}

export function clientId(): string {
  return GOOGLE_CLIENT_ID || localStorage.getItem(LS_CLIENT) || '';
}
export function setClientId(id: string) {
  if (id.trim()) localStorage.setItem(LS_CLIENT, id.trim()); else localStorage.removeItem(LS_CLIENT);
}
export const clientIdFromConfig = () => !!GOOGLE_CLIENT_ID;

export function validToken(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(LS_TOKEN) ?? 'null') as Stored | null;
    return s && s.exp > Date.now() + 60_000 ? s.token : null;
  } catch { return null; }
}

export function forgetToken() {
  const t = validToken();
  localStorage.removeItem(LS_TOKEN);
  if (t) window.google?.accounts.oauth2.revoke(t);
}

let scriptP: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptP) {
    scriptP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { scriptP = null; rej(new Error('Не загрузился вход Google — нет интернета?')); };
      document.head.appendChild(s);
    });
  }
  return scriptP;
}

/** Заранее подгружаем скрипт, чтобы окно входа открылось прямо по нажатию */
export function preloadGoogle() {
  if (clientId() && navigator.onLine) loadScript().catch(() => {});
}

/**
 * Запрос токена. Должен вызываться по нажатию пользователя — иначе браузер заблокирует окно.
 * После первого согласия окно обычно мелькает и закрывается само.
 */
export async function requestToken(): Promise<string> {
  const id = clientId();
  if (!id) throw new Error('Не указан Client ID Google');
  await loadScript();
  return new Promise((res, rej) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) { rej(new Error(r.error_description || r.error || 'Google не выдал доступ')); return; }
        localStorage.setItem(LS_TOKEN, JSON.stringify({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 }));
        res(r.access_token);
      },
      error_callback: (e) => rej(new Error(e.type === 'popup_closed' ? 'Окно входа закрыто' : e.message || e.type)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}
