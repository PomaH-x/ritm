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
