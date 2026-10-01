import type { Sphere } from '../types';
import type { Progress } from '../lib/stats';
import { groupMinutes } from '../lib/stats';
import { fmtHours } from '../lib/time';

interface Props {
  spheres: Sphere[];
  progress: Map<string, Progress>;
  compact?: boolean;
}

const hrs = (m: number) => String(Math.round(m / 6) / 10).replace('.', ',');

function value(s: Sphere, v: number) {
  return s.normKind === 'count' ? String(v) : hrs(v);
}

export default function NormsPanel({ spheres, progress, compact }: Props) {
  const normed = spheres.filter((s) => s.normKind !== 'none' && s.normTarget > 0);
  const groups = groupMinutes(spheres, progress);
  const free = spheres.filter((s) => s.normKind === 'none' && !s.group && (progress.get(s.id)?.minutes ?? 0) > 0);

  return (
    <section className={'norms' + (compact ? ' is-compact' : '')} aria-label="Нормы недели">
      {!compact && <h2 className="norms-title">Нормы недели</h2>}
      <div className="norms-list">
        {normed.map((s) => {
          const p = progress.get(s.id) ?? { done: 0, planned: 0, minutes: 0 };
          const doneR = Math.min(1, p.done / s.normTarget);
          const planR = Math.min(1, (p.done + p.planned) / s.normTarget) - doneR;
          const full = p.done + p.planned >= s.normTarget;
          const unit = s.normKind === 'count' ? '' : ' ч';
          const target = value(s, s.normTarget);
          return (
            <div key={s.id} className={'norm' + (full ? ' is-full' : '')} style={{ ['--c' as string]: s.color }}>
              <div className="norm-top">
                <span className="norm-name">{s.name}</span>
                <span className="norm-val">
                  {value(s, p.done)}
                  {p.planned > 0 && <span className="norm-plan"> +{value(s, p.planned)}</span>}
                  <span className="norm-target"> / {target}{unit}</span>
                </span>
              </div>
              <div className="bar" role="img"
                aria-label={`${s.name}: сделано ${value(s, p.done)}, в плане ещё ${value(s, p.planned)}, норма ${target}${unit}`}>
                <span className="bar-done" style={{ width: `${doneR * 100}%` }} />
                <span className="bar-plan" style={{ width: `${planR * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <>
          <p className="norms-legend">
            <span className="lg lg-done" /> сделано <span className="lg lg-plan" /> стоит в плане
          </p>
          {(groups.length > 0 || free.length > 0) && (
            <div className="norms-other">
              {groups.map((g) => (
                <div key={g.group} className="other-row"><span>{g.group}</span><span>{fmtHours(g.minutes)}</span></div>
              ))}
              {free.map((s) => (
                <div key={s.id} className="other-row"><span>{s.name}</span><span>{fmtHours(progress.get(s.id)!.minutes)}</span></div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
