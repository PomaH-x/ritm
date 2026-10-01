/** Подключение к нейросети. Все провайдеры — в формате OpenAI Chat Completions. */
import { db } from '../db';

export type Provider = 'gas' | 'groq' | 'gemini' | 'custom';

export interface CoachConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Запасная модель — если основная перегружена или кончился её лимит */
  fallbackModel?: string;
}

export const PROVIDERS: Record<Provider, { name: string; baseUrl: string; model: string; keyHint: string; keyUrl: string }> = {
  gas: { name: 'Через мой скрипт Google', baseUrl: '', model: 'gemini-3.8-flash', keyHint: 'секрет приложения', keyUrl: '' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_…', keyUrl: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
  custom: { name: 'Свой адрес', baseUrl: '', model: '', keyHint: 'ключ', keyUrl: '' },
};

export const DEFAULT_COACH: CoachConfig = { provider: 'gas', apiKey: '', model: PROVIDERS.gas.model, baseUrl: '', fallbackModel: 'gemini-flash-lite-latest' };

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
  if (status === 429) return 'Лимит запросов исчерпан (в минуту или на сегодня). Попробуй позже или выбери другую модель.';
  if (status === 503 || status === 500 || status === 504) return 'Нейросеть сейчас перегружена — в часы пик так бывает. Попробуй через пару минут.';
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

/** Один запрос к модели: код ответа и тело */
async function once(cfg: CoachConfig, model: string, messages: Msg[], maxTokens: number): Promise<{ status: number; body: string }> {
  const body = { model, messages, temperature: 0.5, max_tokens: maxTokens, ...extra(model) };
  if (cfg.provider === 'gas') {
    const res = await viaGas(cfg, { body });
    if (res.status === 401 && res.body === 'Неверный секрет') throw new LlmError('Секрет в приложении не совпадает с APP_SECRET в свойствах скрипта.');
    if (res.status === 502) throw new LlmError(res.body);
    if (res.status === 200 && res.body === 'Ритм: посредник работает') throw new LlmError('Скрипт получил запрос без данных (сработал doGet). Проверь, что развёрнута последняя версия кода.');
    return res;
  }
  try {
    const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.text() };
  } catch {
    throw new LlmError('Сервис недоступен из браузера или из твоей сети (запрос не прошёл). Попробуй другого провайдера.');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busy = (st: number) => st === 503 || st === 500 || st === 504;

/**
 * Запрос с повторами: при перегрузке ждём и пробуем снова, затем переходим на запасную модель.
 * Если ответ оборвался по длине, повторяем один раз с большим запасом.
 */
export async function chat(messages: Msg[], c?: CoachConfig, maxTokens = 8000): Promise<string> {
  const cfg = c ?? (await getCoachConfig());
  if (!cfg.apiKey) throw new LlmError('Коуч не подключён: добавь ключ в Настройках.');
  if (!navigator.onLine) throw new LlmError('Нет интернета. Разбор можно запросить, когда появится сеть.');
  const models = [cfg.model, cfg.fallbackModel].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
  let last: { status: number; body: string; model: string } | null = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await once(cfg, model, messages, maxTokens);
      if (res.status === 200) {
        const a = parseAnswer(res.body);
        if (a.finish !== 'length' || !a.text) return a.text;
        const again = await once(cfg, model, messages, maxTokens * 2);
        if (again.status === 200) {
          const b = parseAnswer(again.body);
          return b.finish === 'length' ? `${b.text}\n\n*Ответ оборвался — нажми «Обновить разбор».*` : b.text;
        }
        return `${a.text}\n\n*Ответ оборвался — нажми «Обновить разбор».*`;
      }
      last = { ...res, model };
      if (busy(res.status) && attempt < 2) { await sleep(attempt === 0 ? 2500 : 6000); continue; }
      break;
    }
    // На запасную модель переходим только при перегрузке или исчерпанном лимите
    if (!last || !(busy(last.status) || last.status === 429)) break;
  }
  throw new LlmError(explain(last!.status, last!.body, { ...cfg, model: last!.model }));
}

function parseAnswer(text: string): { text: string; finish?: string } {
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
  if (out) return { text: out, finish: ch?.finish_reason };
  if (ch?.message?.refusal) throw new LlmError(`Модель отказалась отвечать: ${ch.message.refusal}`);
  if (ch?.finish_reason === 'length') return { text: '', finish: 'length' };
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
