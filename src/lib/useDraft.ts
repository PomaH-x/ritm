import { useCallback, useEffect, useRef, useState } from 'react';
import { saveLog } from '../db';

type Values = Record<string, unknown>;

/** Локальные значения раздела + автосохранение через 400 мс после правки */
export function useDraft(date: string, section: string, initial: Values | undefined) {
  const [values, setValues] = useState<Values>(initial ?? {});
  const latest = useRef<Values>(values);
  const pending = useRef<Values | null>(null);
  const timer = useRef<number>();

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) {
      const v = pending.current;
      pending.current = null;
      void saveLog(date, section, v);
    }
  }, [date, section]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const commit = (next: Values) => {
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    latest.current = next;
    setValues(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  };

  const setField = (k: string, v: unknown) => commit({ ...latest.current, [k]: v });
  const setAll = (v: Values) => commit({ ...v });
  return { values, setField, setAll };
}
