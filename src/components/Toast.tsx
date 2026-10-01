import { useEffect, useState } from 'react';

interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }

let listeners: ((t: ToastMsg | null) => void)[] = [];
let seq = 0;

export function toast(text: string, action?: ToastMsg['action']) {
  const msg = { id: ++seq, text, action };
  listeners.forEach((l) => l(msg));
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    const l = (t: ToastMsg | null) => setMsg(t);
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg((m) => (m?.id === msg.id ? null : m)), msg.action ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      <span>{msg.text}</span>
      {msg.action && (
        <button type="button" onClick={() => { msg.action!.run(); setMsg(null); }}>{msg.action.label}</button>
      )}
    </div>
  );
}
