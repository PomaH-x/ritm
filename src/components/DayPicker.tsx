import { WD_SHORT } from '../lib/time';

export default function DayPicker({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <div className="daypick" role="group" aria-label={label}>
      {WD_SHORT.map((d, i) => {
        const wd = i + 1;
        const on = value.includes(wd);
        return (
          <button key={d} type="button" aria-pressed={on} className={on ? 'is-on' : ''}
            onClick={() => onChange(on ? value.filter((x) => x !== wd) : [...value, wd].sort())}>{d}</button>
        );
      })}
    </div>
  );
}
