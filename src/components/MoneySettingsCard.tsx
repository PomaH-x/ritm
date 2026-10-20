import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { toast } from './Toast';
import { ask } from './Confirm';
import { getMoneySettings, saveMoneySettings, tariffFor } from '../lib/money';
import { useSpheres } from '../lib/hooks';
import { logicalNow } from '../lib/time';
import type { LessonKind, PlanKind, Tariff, TariffSet } from '../types';

const nf = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
const dmy = (d: string) => d.split('-').reverse().join('.');
const PLANS: [PlanKind, string][] = [['single', 'Разовое'], ['sub4', 'Абонемент на 4'], ['sub8', 'Абонемент на 8']];
const BLOCKS: [LessonKind, number][] = [['group', 1.5], ['group', 2], ['group', 3], ['ind', 1.5], ['ind', 2]];
const blockTitle = (k: LessonKind, h: number) => `${k === 'group' ? 'Групповые' : 'Индивидуальные'}, ${String(h).replace('.', ',')} ч`;

function TariffEditor({ base, onClose }: { base: TariffSet; onClose: () => void }) {
  const [from, setFrom] = useState(logicalNow().date);
  const [items, setItems] = useState<Tariff[]>(() => base.items.map((x) => ({ ...x })));
  const idx = (k: LessonKind, h: number, p: PlanKind) => items.findIndex((x) => x.kind === k && x.plan === p && Math.abs(x.hours - h) < 0.01);
  const setVal = (i: number, field: 'total' | 'center', v: number) =>
    setItems((xs) => xs.map((x, j) => (j !== i ? x : { ...x, [field]: v, teacher: (field === 'total' ? v : x.total) - (field === 'center' ? v : x.center) })));

  const save = async () => {
    const m = await getMoneySettings();
    const rest = m.tariffs.filter((t) => t.from !== from);
    await saveMoneySettings({ tariffs: [...rest, { from, items }].sort((a, b) => a.from.localeCompare(b.from)) });
    toast(`Тарифы действуют с ${dmy(from)}`);
    onClose();
  };

  return (
    <Modal title="Новые тарифы центра" wide onClose={onClose}
      subtitle="Меняй стоимость и долю центра — твоя доля посчитается сама. Занятия и абонементы до этой даты считаются по старым тарифам."
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Отмена</button><button type="button" className="btn primary" onClick={save}>Сохранить</button></>}>
      <div className="form">
        <label className="field" style={{ maxWidth: 220 }}><span>Действуют с</span><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        {BLOCKS.map(([k, h]) => (
          <div key={`${k}${h}`} className="tf-block">
            <h3 className="sc-sub">{blockTitle(k, h)}</h3>
            <div className="tf-grid tf-head"><span /><span>Стоимость</span><span>Центру</span><span>Тебе</span></div>
            {PLANS.map(([p, label]) => {
              const i = idx(k, h, p);
              if (i < 0) return null;
              const x = items[i];
              return (
                <div key={p} className="tf-grid">
                  <span>{label}</span>
                  <input type="number" inputMode="numeric" value={x.total} aria-label={`${blockTitle(k, h)}, ${label}: стоимость`} onChange={(e) => setVal(i, 'total', Number(e.target.value) || 0)} />
                  <input type="number" inputMode="numeric" value={x.center} aria-label={`${blockTitle(k, h)}, ${label}: центру`} onChange={(e) => setVal(i, 'center', Number(e.target.value) || 0)} />
                  <span className="tf-teacher">{nf(x.teacher)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function MoneySettingsCard() {
  const m = useLiveQuery(() => getMoneySettings(), []);
  const spheres = useSpheres() ?? [];
  const [rate, setRate] = useState('');
  const [rateFrom, setRateFrom] = useState(logicalNow().date);
  const [editTariffs, setEditTariffs] = useState(false);
  const [showTable, setShowTable] = useState(false);
  if (!m) return null;
  const today = logicalNow().date;
  const rates = [...m.rates].sort((a, b) => a.from.localeCompare(b.from));
  const curRate = rates.filter((r) => r.from <= today).pop() ?? rates[0];
  const tariffs = [...m.tariffs].sort((a, b) => a.from.localeCompare(b.from));
  const curTariffs = tariffs.filter((t) => t.from <= today).pop() ?? tariffs[0];

  return (
    <section className="card">
      <h2>Ученики и деньги</h2>

      <div className="field">
        <span>Моя ставка за час — сейчас {nf(curRate.rate)} ₽{rates.length > 1 ? ` (с ${dmy(curRate.from)})` : ''}</span>
        <div className="inline">
          <input type="number" inputMode="numeric" min={0} step={100} value={rate} placeholder="новая ставка" style={{ width: 130 }} onChange={(e) => setRate(e.target.value)} aria-label="Новая ставка" />
          <span className="muted">с</span>
          <input type="date" value={rateFrom} style={{ width: 'auto' }} onChange={(e) => e.target.value && setRateFrom(e.target.value)} aria-label="Действует с" />
          <button type="button" className="btn ghost small" disabled={!Number(rate)} onClick={async () => {
            await saveMoneySettings({ rates: [...m.rates.filter((r) => r.from !== rateFrom), { from: rateFrom, rate: Number(rate) }] });
            setRate('');
            toast(`Ставка ${nf(Number(rate))} ₽/ч с ${dmy(rateFrom)}`);
          }}>Изменить</button>
        </div>
        {rates.length > 1 && (
          <p className="hint">История: {rates.map((r) => `${nf(r.rate)} ₽ с ${r.from <= '2000-12-31' ? 'начала' : dmy(r.from)}`).join(' · ')}{' '}
            <button type="button" className="linklike" onClick={async () => {
              const last = rates[rates.length - 1];
              if (!(await ask(`Убрать ставку ${nf(last.rate)} ₽ с ${dmy(last.from)}?`, 'Убрать', true))) return;
              await saveMoneySettings({ rates: m.rates.filter((r) => r !== last) });
            }}>убрать последнюю</button>
          </p>
        )}
      </div>

      <div className="field">
        <span>Тарифы центра — действуют с {dmy(curTariffs.from)}{tariffs.length > 1 ? `, всего версий: ${tariffs.length}` : ''}</span>
        <div className="btn-row">
          <button type="button" className="btn ghost small" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Скрыть таблицу' : 'Показать таблицу'}</button>
          <button type="button" className="btn ghost small" onClick={() => setEditTariffs(true)}>Новые тарифы с даты…</button>
        </div>
        {showTable && (
          <div className="tf-view">
            {BLOCKS.map(([k, h]) => (
              <div key={`${k}${h}`} className="tf-block">
                <h3 className="sc-sub">{blockTitle(k, h)}</h3>
                <div className="tf-grid tf-head"><span /><span>Стоимость</span><span>Центру</span><span>Тебе</span></div>
                {PLANS.map(([p, label]) => {
                  const x = tariffFor(m, today, k, h, p);
                  return x ? <div key={p} className="tf-grid"><span>{label}</span><span>{nf(x.total)}</span><span>{nf(x.center)}</span><span className="tf-teacher">{nf(x.teacher)}</span></div> : null;
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row2">
        <label className="field">
          <span>Сфера учеников центра</span>
          <select value={m.amSphereId ?? ''} onChange={(e) => saveMoneySettings({ amSphereId: e.target.value || null })}>
            <option value="">—</option>
            {spheres.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Сфера моих учеников</span>
          <select value={m.ownSphereId ?? ''} onChange={(e) => saveMoneySettings({ ownSphereId: e.target.value || null })}>
            <option value="">—</option>
            {spheres.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {m.trackFrom && (
        <label className="field" style={{ maxWidth: 260 }}>
          <span>Учёт оплат и дани ведётся с</span>
          <input type="date" value={m.trackFrom} onChange={(e) => e.target.value && saveMoneySettings({ trackFrom: e.target.value })} />
        </label>
      )}

      {editTariffs && <TariffEditor base={curTariffs} onClose={() => setEditTariffs(false)} />}
    </section>
  );
}
