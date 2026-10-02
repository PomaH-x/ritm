import { useEffect, useState } from 'react';
import Modal from './Modal';

interface Req { text: string; ok: string; danger?: boolean; resolve: (v: boolean) => void }
let push: ((r: Req) => void) | null = null;

/** Подтверждение внутри приложения — вместо системного confirm() */
export function ask(text: string, ok = 'Продолжить', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) { resolve(window.confirm(text)); return; }
    push({ text, ok, danger, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => { push = setReq; return () => { push = null; }; }, []);
  if (!req) return null;
  const close = (v: boolean) => { req.resolve(v); setReq(null); };
  return (
    <Modal title="Точно?" onClose={() => close(false)}
      footer={<>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={() => close(false)}>Отмена</button>
        <button type="button" data-autofocus className={'btn ' + (req.danger ? 'danger ghost' : 'primary')} onClick={() => close(true)}>{req.ok}</button>
      </>}>
      <p className="confirm-text">{req.text}</p>
    </Modal>
  );
}

// ---------- Выбор из нескольких вариантов ----------

interface ChoiceReq { title: string; text: string; options: { key: string; label: string }[]; resolve: (v: string | null) => void }
let pushChoice: ((r: ChoiceReq) => void) | null = null;

/** Например: изменить только это повторение или это и следующие */
export function choose(title: string, text: string, options: { key: string; label: string }[]): Promise<string | null> {
  return new Promise((resolve) => {
    if (!pushChoice) { resolve(options[0]?.key ?? null); return; }
    pushChoice({ title, text, options, resolve });
  });
}

export function ChoiceHost() {
  const [req, setReq] = useState<ChoiceReq | null>(null);
  useEffect(() => { pushChoice = setReq; return () => { pushChoice = null; }; }, []);
  if (!req) return null;
  const close = (v: string | null) => { req.resolve(v); setReq(null); };
  return (
    <Modal title={req.title} onClose={() => close(null)}
      footer={<>
        <button type="button" className="btn ghost" onClick={() => close(null)}>Отмена</button>
        <span className="spacer" />
        {req.options.map((o, i) => (
          <button key={o.key} type="button" data-autofocus={i === req.options.length - 1 ? '' : undefined}
            className={'btn ' + (i === req.options.length - 1 ? 'primary' : 'ghost')} onClick={() => close(o.key)}>{o.label}</button>
        ))}
      </>}>
      <p className="confirm-text">{req.text}</p>
    </Modal>
  );
}
