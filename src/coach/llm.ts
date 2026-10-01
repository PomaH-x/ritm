/** Подключение к нейросети. Все провайдеры — в формате OpenAI Chat Completions. */
import { db } from '../db';

export type Provider = 'gas' | 'groq' | 'gemini' | 'custom';

export interface CoachConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const PROVIDERS: Record<Provider, { name: string; baseUrl: string; model: string; keyHint: string; keyUrl: string }> = {
  gas: { name: 'Через мой скрипт Google', baseUrl: '', model: 'gemini-3.8-flash', keyHint: 'секрет приложения', keyUrl: '' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_…', keyUrl: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
  custom: { name: 'Свой адрес', baseUrl: '', model: '', keyHint: 'ключ', keyUrl: '' },
};

export const DEFAULT_COACH: CoachConfig = { provider: 'gas', apiKey: '', model: PROVIDERS.gas.model, baseUrl: '' };

/** Модели Gemini «думают» перед ответом, и мысли съедают лимит длины — просим думать недолго */
function extra(model: string): Record<string, unknown> {
  return /gemini/i.test(model) ? { reasoning_effort: 'low' } : {};
}

export async function getCoachConfig(): Promise<CoachConfig> {
  const c = { ...DEFAULT_COACH, ...(((await db.kv.get('coach'))?.value as Partial<CoachConfig>) ?? {}) } as CoachConfig;
  // GitHub Models закрыт 30.07.2026 — старые настройки переводим на скрипт
  if ((c.provider as string) === 'github') return { ...c, provider: 'gas', apiKey: '', model: PROVIDERS.gas.model, baseUrl: '' };
  // gemini-2.5-flash закрыт для новых пользователей — переводим на актуальную модель
  if (c.provider === 'gas' && (c.model.startsWith('openai/') || c.model === 'gemini-2.5-flash')) c.model = PROVIDERS.gas.model;
  return c;
}

export async function saveCoachConfig(c: CoachConfig) {
  await db.kv.put({ key: 'coach', value: c, updatedAt: Date.now() });
}

export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

export class LlmError extends Error {}

function explain(status: number, body: string, c: CoachConfig): string {
  if (status === 401 || (status === 400 && /API key/i.test(body))) return 'Ключ нейросети не подошёл. Проверь, что он скопирован целиком' + (c.provider === 'gas' ? ' в свойство API_KEY скрипта.' : '.');
  if (status === 403) return 'Доступ запрещён. Обычно это значит, что сервис не работает из твоей страны или сети, или у ключа нет нужного права.';
  if (status === 404) return `Модель «${c.model}» не найдена. Выбери другую в настройках.`;
  if (status === 413) return 'Запрос получился слишком большим для этой модели.';
  if (status === 429) return 'Лимит запросов на сегодня исчерпан. Попробуй позже или выбери другую модель.';
  return `Сервис ответил ошибкой ${status}. ${body.slice(0, 200)}`;
}

/**
 * Вызов через посредника на Google Apps Script. Тело без заголовка Content-Type —
 * так браузер не делает предварительный CORS-запрос, а ответ Apps Script разрешён для любых сайтов.
 */
async function viaGas(cfg: CoachConfig, payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(cfg.baseUrl.trim())) {
    throw new LlmError('Укажи адрес веб-приложения Apps Script: https://script.google.com/macros/s/…/exec');
  }
  let r: Response;
  try {
    r = await fetch(cfg.baseUrl.trim(), { method: 'POST', body: JSON.stringify({ secret: cfg.apiKey, ...payload }), redirect: 'follow' });
  } catch {
    throw new LlmError('Не получилось достучаться до скрипта Google. Проверь адрес и что в развёртывании выбран доступ «Все» (Anyone).');
  }
  const text = await r.text();
  try {
    return JSON.parse(text) as { status: number; body: string };
  } catch {
    const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new LlmError(`Скрипт ответил не так, как ожидалось (код ${r.status}): ${plain.slice(0, 180) || 'пусто'}. Проверь, что развёрнута последняя версия и доступ — «Все».`);
  }
}

export async function chat(messages: Msg[], c?: CoachConfig, maxTokens = 3000): Promise<string> {
  const cfg = c ?? (await getCoachConfig());
  if (!cfg.apiKey) throw new LlmError('Коуч не подключён: добавь ключ в Настройках.');
  if (!navigator.onLine) throw new LlmError('Нет интернета. Разбор можно запросить, когда появится сеть.');
  if (cfg.provider === 'gas') {
    const res = await viaGas(cfg, { body: { model: cfg.model, messages, temperature: 0.5, max_tokens: maxTokens, ...extra(cfg.model) } });
    if (res.status === 401 && res.body === 'Неверный секрет') throw new LlmError('Секрет в приложении не совпадает с APP_SECRET в свойствах скрипта.');
    if (res.status === 502) throw new LlmError(res.body);
    if (res.status !== 200) throw new LlmError(explain(res.status, res.body, cfg));
    if (res.body === 'Ритм: посредник работает') throw new LlmError('Скрипт получил запрос без данных (сработал doGet). Проверь, что развёрнута последняя версия кода.');
    return parseAnswer(res.body);
  }
  let r: Response;
  try {
    r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.5, max_tokens: maxTokens, ...extra(cfg.model) }),
    });
  } catch {
    throw new LlmError('Сервис недоступен из браузера или из твоей сети (запрос не прошёл). Попробуй другого провайдера.');
  }
  const text = await r.text();
  if (!r.ok) throw new LlmError(explain(r.status, text, cfg));
  return parseAnswer(text);
}

function parseAnswer(text: string): string {
  type Part = string | { text?: string; type?: string };
  let j: { choices?: { message?: { content?: Part | Part[] | null; refusal?: string | null }; text?: string; finish_reason?: string }[]; error?: { message?: string } };
  try { j = JSON.parse(text); } catch {
    throw new LlmError(`Неожиданный ответ (не JSON): ${text.slice(0, 200)}`);
  }
  if (j.error?.message) throw new LlmError(`Нейросеть вернула ошибку: ${j.error.message}`);
  const ch = j.choices?.[0];
  const c = ch?.message?.content;
  const flat = (x: Part): string => (typeof x === 'string' ? x : x.text ?? '');
  const out = (Array.isArray(c) ? c.map(flat).join('') : c != null ? flat(c) : (ch?.text ?? '')).trim();
  if (out) return out;
  if (ch?.message?.refusal) throw new LlmError(`Модель отказалась отвечать: ${ch.message.refusal}`);
  throw new LlmError(`Пустой ответ модели${ch?.finish_reason ? ` (finish_reason: ${ch.finish_reason})` : ''}. Начало ответа: ${text.slice(0, 200)}`);
}

/** Список доступных моделей — чтобы выбирать из того, что реально есть */
export async function listModels(cfg: CoachConfig): Promise<string[]> {
  try {
    let raw: unknown;
    if (cfg.provider === 'gas') {
      const res = await viaGas(cfg, { action: 'models' });
      if (res.status !== 200) return [];
      raw = JSON.parse(res.body);
    } else {
      const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
      if (!r.ok) return [];
      raw = await r.json();
    }
    const list = (Array.isArray(raw) ? raw : (raw as { data?: unknown[] }).data ?? []) as { id: string }[];
    return list.map((m) => m.id.replace(/^models\//, '')).filter((id) => !/embedding|imagen|veo|tts|audio|image|aqa/i.test(id)).sort();
  } catch { return []; }
}
