/** Подключение к нейросети. Все провайдеры — в формате OpenAI Chat Completions. */
import { db } from '../db';

export type Provider = 'gas' | 'github' | 'groq' | 'gemini' | 'custom';

export interface CoachConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const PROVIDERS: Record<Provider, { name: string; baseUrl: string; model: string; keyHint: string; keyUrl: string }> = {
  gas: { name: 'GitHub через Google', baseUrl: '', model: 'openai/gpt-4.1', keyHint: 'секрет приложения', keyUrl: '' },
  github: { name: 'GitHub Models', baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4.1', keyHint: 'github_pat_…', keyUrl: 'https://github.com/settings/personal-access-tokens/new' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_…', keyUrl: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
  custom: { name: 'Свой адрес', baseUrl: '', model: '', keyHint: 'ключ', keyUrl: '' },
};

export const DEFAULT_COACH: CoachConfig = { provider: 'gas', apiKey: '', model: PROVIDERS.gas.model, baseUrl: '' };

export async function getCoachConfig(): Promise<CoachConfig> {
  return { ...DEFAULT_COACH, ...(((await db.kv.get('coach'))?.value as Partial<CoachConfig>) ?? {}) };
}

export async function saveCoachConfig(c: CoachConfig) {
  await db.kv.put({ key: 'coach', value: c, updatedAt: Date.now() });
}

export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

export class LlmError extends Error {}

function explain(status: number, body: string, c: CoachConfig): string {
  if (status === 401) return 'Ключ не подошёл. Проверь, что он скопирован целиком' + (c.provider === 'github' ? ' и у токена есть право Models: Read.' : '.');
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
    throw new LlmError('Скрипт ответил не так, как ожидалось. Проверь, что развёрнута последняя версия кода и доступ — «Все».');
  }
}

export async function chat(messages: Msg[], c?: CoachConfig, maxTokens = 1400): Promise<string> {
  const cfg = c ?? (await getCoachConfig());
  if (!cfg.apiKey) throw new LlmError('Коуч не подключён: добавь ключ в Настройках.');
  if (!navigator.onLine) throw new LlmError('Нет интернета. Разбор можно запросить, когда появится сеть.');
  if (cfg.provider === 'gas') {
    const res = await viaGas(cfg, { body: { model: cfg.model, messages, temperature: 0.5, max_tokens: maxTokens } });
    if (res.status === 401 && res.body === 'Неверный секрет') throw new LlmError('Секрет в приложении не совпадает с APP_SECRET в свойствах скрипта.');
    if (res.status !== 200) throw new LlmError(explain(res.status, res.body, { ...cfg, provider: 'github' }));
    return parseAnswer(res.body);
  }
  let r: Response;
  try {
    r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.5, max_tokens: maxTokens }),
    });
  } catch {
    throw new LlmError('Сервис недоступен из браузера или из твоей сети (запрос не прошёл). Попробуй другого провайдера.');
  }
  const text = await r.text();
  if (!r.ok) throw new LlmError(explain(r.status, text, cfg));
  return parseAnswer(text);
}

function parseAnswer(text: string): string {
  try {
    const j = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    const out = j.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error();
    return out;
  } catch {
    throw new LlmError('Нейросеть вернула пустой или странный ответ.');
  }
}

/** Список моделей GitHub Models — чтобы выбирать из того, что реально доступно */
export async function listGithubModels(cfg: CoachConfig): Promise<string[]> {
  try {
    let j: { id: string; supported_output_modalities?: string[] }[];
    if (cfg.provider === 'gas') {
      const res = await viaGas(cfg, { action: 'models' });
      if (res.status !== 200) return [];
      j = JSON.parse(res.body);
    } else {
      const r = await fetch('https://models.github.ai/catalog/models', { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
      if (!r.ok) return [];
      j = await r.json();
    }
    return j.filter((m) => !m.supported_output_modalities || m.supported_output_modalities.includes('text')).map((m) => m.id).sort();
  } catch { return []; }
}
