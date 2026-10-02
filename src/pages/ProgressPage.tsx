import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Chart from '../components/Chart';
import { exerciseChart, exerciseList, loadCtx, moneyChart, normCharts, sleepCharts, trialsChart, type Period } from '../lib/progress';
import { fmtTime } from '../lib/time';

const ru = (v: number, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const money = (v: number) => (Math.abs(v) >= 1000 ? `${ru(v / 1000, 1)} тыс.` : `${Math.round(v)}`);
const moneyFull = (v: number) => new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' ₽';

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>('30');
  const [exId, setExId] = useState<string>('');
  const ctx = useLiveQuery(() => loadCtx(period), [period]);

  const exercises = ctx ? exerciseList(ctx) : [];
  const ex = exercises.find((e) => e.ex.id === exId) ?? exercises.find((e) => !e.ex.name.includes('Ежедн')) ?? exercises[0];

  const sleep = ctx ? sleepCharts(ctx) : null;
  const norms = ctx ? normCharts(ctx) : [];
  const moneyD = ctx ? moneyChart(ctx) : null;
  const trials = ctx ? trialsChart(ctx) : null;

  return (
    <div className="page progress">
      <div className="page-head">
        <h1>Прогресс</h1>
        <div className="seg">
          {([['7', '7 дней'], ['30', '30 дней'], ['all', 'Всё время']] as [Period, string][]).map(([k, l]) => (
            <button key={k} type="button" className={period === k ? 'is-on' : ''} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
      </div>
      {!ctx ? <p className="muted">Считаю…</p> : (
        <div className="pg-grid">
          <section className="pg-card">
            <h2>Сон</h2>
            <p className="pg-stats">
              {sleep!.stats.avg != null ? <>В среднем <b>{ru(sleep!.stats.avg)} ч</b>, меньше 8 ч — {sleep!.stats.under} из {sleep!.stats.nights} ноч.</> : 'Сон ещё не записывался.'}
            </p>
            <Chart data={sleep!.hours} type="bar" format={(v) => `${ru(v)} ч`} />
            <h3 className="pg-sub">Отбой</h3>
            <p className="pg-stats">
              {sleep!.stats.avgBed != null ? <>В среднем в <b>{fmtTime(Math.round(sleep!.stats.avgBed))}</b>, позже 01:00 — {sleep!.stats.late} раз</> : '—'}
            </p>
            <Chart data={sleep!.bed} type="line" fromZero={false} step={60} format={(v) => fmtTime(Math.round(v))} height={160} />
          </section>

          <section className="pg-card">
            <h2>Нормы {period === '7' ? 'по дням' : 'по неделям'}</h2>
            {norms.map((nm) => (
              <div key={nm.sphere.id} className="pg-norm">
                <p className="pg-stats">
                  <b style={{ color: nm.sphere.color }}>{nm.sphere.name}</b>{' '}
                  {nm.mode === 'day'
                    ? <>— за 7 дней {ru(nm.total!)} {nm.unit} при норме {ru(nm.target)} {nm.unit} в неделю</>
                    : <>— норма выполнена в {nm.met} из {nm.weeksFull} полных недель</>}
                </p>
                <Chart data={nm.chart} type="bar" format={(v) => `${ru(v)} ${nm.unit}`} height={150} />
              </div>
            ))}
          </section>

          <section className="pg-card">
            <h2>ЕГЭ: пробные варианты</h2>
            {trials!.count ? (
              <>
                <p className="pg-stats">
                  Последний <b>{trials!.last}</b>, средний за последние 5 — <b>{trials!.avg5}</b>, лучший {trials!.best}. Вариантов: {trials!.count}.
                </p>
                <Chart data={trials!.chart} type="line" fromZero={false} format={(v) => String(Math.round(v))} />
                {trials!.errors && <p className="hint">Чаще всего ошибки в заданиях: {trials!.errors}</p>}
              </>
            ) : <p className="pg-stats">За этот период пробных вариантов нет. Добавляй их на странице «День» в карточке ЕГЭ.</p>}
          </section>

          <section className="pg-card">
            <h2>Упражнения</h2>
            {exercises.length ? (
              <>
                <select className="pg-select" value={ex?.ex.id ?? ''} onChange={(e) => setExId(e.target.value)} aria-label="Упражнение">
                  {exercises.map(({ ex: e, workout }) => <option key={e.id} value={e.id}>{e.name} — {workout}</option>)}
                </select>
                {ex && <Chart data={exerciseChart(ctx, ex.ex)} type="line" fromZero={false} format={(v) => ru(v)} />}
                <p className="hint">Серая линия — цель недели: растёт, когда прошлая неделя выполнена. Оранжевая — сколько сделал в среднем за подход.</p>
              </>
            ) : <p className="muted">Программа тренировок пуста.</p>}
          </section>

          <section className="pg-card">
            <h2>Доходы и расходы{moneyD!.mode === 'month' ? ' по месяцам' : ''}</h2>
            <p className="pg-stats">За период: доход <b>{moneyFull(moneyD!.totalInc)}</b>, расходы {moneyFull(moneyD!.totalExp)}</p>
            <Chart data={moneyD!.chart} type="bar" format={money} />
          </section>
        </div>
      )}
    </div>
  );
}
