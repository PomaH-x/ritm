import { db } from '../db';
import { loadBundle } from './report';
import { dayTemplate, weekTemplate } from './template';
import { addDays, logicalNow } from './time';

export async function getChatUrl(): Promise<string> {
  return (((await db.kv.get('deepseek'))?.value as { url?: string } | undefined)?.url) ?? '';
}

export async function saveChatUrl(url: string) {
  await db.kv.put({ key: 'deepseek', value: { url: url.trim() }, updatedAt: Date.now() });
}

export async function buildText(kind: 'day' | 'week', date: string): Promise<string> {
  if (kind === 'day') return dayTemplate(await loadBundle(addDays(date, -6), addDays(date, 1)), date);
  return weekTemplate(await loadBundle(date, addDays(date, 6)), date, logicalNow().date);
}
