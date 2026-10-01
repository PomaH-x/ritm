import type { CalEvent, Settings, Sphere } from '../types';
import { dur, weekProgress } from './stats';
import { fmtDur, weekday } from './time';

export interface Slot {
  date: string;
  startMin: number;
  endMin: number;
}

export interface Suggestion {
  sphere: Sphere;
  score: number;
  /** Рекомендуемая длительность, мин */
  duration: number;
  reasons: string[];
}

export interface Skipped {
  sphere: Sphere;
  reason: string;
}

/**
 * Правила рекомендаций (без ИИ, прозрачно и мгновенно):
 * 1. Сферы с выполненной недельной нормой не предлагаются.
 * 2. Чем больше отставание от нормы, тем выше сфера в списке; отставание от темпа недели — бонус.
 * 3. Вечером в «лёгкие» дни (Пн/Ср/Пт после 21:30) — только лёгкое и отдых.
 * 4. После цифрового заката — только отдых и ритуал сна.
 * 5. В день отдыха (Вс) тяжёлые дела опускаются ниже.
 * 6. Слот короче минимального блока сферы — штраф.
 * 7. Тренировка (норма «разы») — не больше одной в день.
 */
export function recommend(slot: Slot, spheres: Sphere[], weekEvents: CalEvent[], settings: Settings, snap = 15, extraDone?: Map<string, Set<string>>) {
  const len = slot.endMin - slot.startMin;
  const wd = weekday(slot.date);
  const lightTime = settings.lightWeekdays.includes(wd) && slot.startMin >= settings.lightFromMin;
  const afterSunset = slot.startMin >= settings.sunsetMin;
  const restDay = settings.restWeekdays.includes(wd);
  const progress = weekProgress(spheres, weekEvents, extraDone);

  const today = weekEvents.filter((e) => e.date === slot.date && e.status !== 'skipped');
  const byId = new Map(spheres.map((s) => [s.id, s]));
  const busyToday = today.reduce((acc, e) => {
    const s = e.sphereId ? byId.get(e.sphereId) : undefined;
    return s && (s.intensity === 'focus' || s.intensity === 'active') ? acc + dur(e) : acc;
  }, 0);

  const top: Suggestion[] = [];
  const skipped: Skipped[] = [];

  for (const s of spheres) {
    if (!s.suggest || !s.inCalendar || s.archived) continue;
    if (s.windowFrom != null && s.windowTo != null && (slot.startMin < s.windowFrom || slot.startMin >= s.windowTo)) continue;

    if (afterSunset && s.intensity !== 'rest') {
      skipped.push({ sphere: s, reason: 'после цифрового заката' });
      continue;
    }

    const reasons: string[] = [];
    let score: number;
    let remaining = Infinity;
    const p = progress.get(s.id) ?? { done: 0, planned: 0, minutes: 0 };
    const sphereToday = today.filter((e) => e.sphereId === s.id);

    if (s.normKind !== 'none' && s.normTarget > 0) {
      const used = p.done + p.planned;
      remaining = s.normTarget - used;
      if (remaining <= 0) {
        skipped.push({ sphere: s, reason: `норма недели набрана${p.planned > 0 ? ' с учётом плана' : ''}` });
        continue;
      }
      if (s.normKind === 'count' && (sphereToday.length > 0 || extraDone?.get(s.id)?.has(slot.date))) {
        skipped.push({ sphere: s, reason: 'сегодня уже есть' });
        continue;
      }
      score = 40 + 60 * (remaining / s.normTarget);
      reasons.push(s.normKind === 'minutes'
        ? `осталось ${fmtDur(remaining)} из ${fmtDur(s.normTarget)}`
        : `осталось ${remaining} из ${s.normTarget}`);
      // Темп: к концу этого дня должно быть сделано примерно wd/7 нормы
      const expected = (wd / 7) * s.normTarget;
      if (p.done + p.planned < expected * 0.75) {
        score += 15;
        reasons.push('отстаёшь от темпа недели');
      }
    } else {
      score = s.intensity === 'rest' ? 30 : 18;
    }

    if (len < s.minBlock) {
      score *= 0.35;
      reasons.push(`слот короче удобного блока (${fmtDur(s.minBlock)})`);
    }

    const heavy = s.intensity === 'focus' || s.intensity === 'active';
    if (lightTime) {
      if (heavy) { score *= 0.4; reasons.push('в это время по плану только лёгкие дела'); }
      else { score += 25; reasons.push('вечер — время для лёгкого'); }
    }
    if (restDay) {
      if (heavy) { score *= 0.7; reasons.push('воскресенье — день отдыха'); }
      else score += 15;
    }
    if (afterSunset && s.intensity === 'rest') {
      score += 40;
      reasons.push('цифровой закат — пора к ритуалу сна');
    }
    if (s.intensity === 'rest' && busyToday >= 360) {
      score += 20;
      reasons.push(`день уже плотный: ${fmtDur(busyToday)}`);
    }
    const minsToday = sphereToday.reduce((a, e) => a + dur(e), 0);
    if (s.intensity === 'focus' && minsToday >= 180) {
      score *= 0.6;
      reasons.push(`сегодня уже ${fmtDur(minsToday)}`);
    }

    // Длительность: обычный блок, но не больше остатка нормы и слота
    let d = s.defaultBlock;
    if (s.normKind === 'minutes' && remaining < d) d = Math.max(s.minBlock, remaining);
    d = Math.min(d, len);
    d = Math.max(snap, Math.round(d / snap) * snap);
    if (d > len) d = len;

    top.push({ sphere: s, score, duration: d, reasons });
  }

  top.sort((a, b) => b.score - a.score);
  return { top: top.slice(0, 4), rest: top.slice(4), skipped };
}
