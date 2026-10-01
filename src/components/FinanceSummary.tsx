import { useMemo, useState } from 'react';
import { useSectionLogs } from '../lib/hooks';
import { addDays, parseISODate, toISODate } from '../lib/time';

const money = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₽';

type Period = '30' | 'month' | 'custom';

export default function FinanceSummary({ today }: { today: string }) {
  const [period, setPeriod] = useState<Period>('30');
  const monthStart = toISODate(new Date(parseISODate(today).getFullYear(), parseISODate(today).getMonth(), 1));
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);

  const range = period === '30' ? [addDays(today, -29), today] : period === 'month' ? [monthStart, today] : [from, to];
  const logs = useSectionLogs('finance', range[0], range[1]) ?? [];

  const s = useMemo(() => {
    let income = 0, expenses = 0, savedDays = 0, incomeDays = 0, days = 0;
    for (const l of logs) {
      const v = l.values;
      const inc = typeof v.income === 'number' ? v.income : 0;
      const exp = typeof v.expenses === 'number' ? v.expenses : 0;
      income += inc;
      expenses += exp;
      if (inc > 0) incomeDays++;
      if (inc > 0 && v.saved === true) savedDays++;
      if (inc || exp) days++;
    }
    const span = Math.max(1, Math.round((parseISODate(range[1]).getTime() - parseISODate(range[0]).getTime()) / 86400000) + 1);
    return { income, expenses, savedDays, incomeDays, days, span };
  }, [logs, range]);

  return (
    <div className="fin">
      <div className="fin-head">
        <div className="seg">
          {([['30', '30 дней'], ['month', 'Месяц'], ['custom', 'Период']] as [Period, string][]).map(([k, l]) => (
            <button key={k} type="button" className={period === k ? 'is-on' : ''} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
      </div>
      {period === 'custom' && (
        <div className="row2">
          <label className="field"><span>С</span><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label className="field"><span>По</span><input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        </div>
      )}
      <dl className="fin-grid">
        <div><dt>Доход</dt><dd>{money(s.income)}</dd></div>
        <div><dt>Расходы</dt><dd>{money(s.expenses)}</dd></div>
        <div><dt>Разница</dt><dd className={s.income - s.expenses < 0 ? 'neg' : ''}>{money(s.income - s.expenses)}</dd></div>
        <div><dt>20% от дохода</dt><dd>{money(s.income * 0.2)}</dd></div>
        <div><dt>Расход в день</dt><dd>{money(s.expenses / s.span)}</dd></div>
        <div><dt>Отложено</dt><dd>{s.incomeDays ? `${s.savedDays} из ${s.incomeDays} дн. с доходом` : '—'}</dd></div>
      </dl>
    </div>
  );
}
