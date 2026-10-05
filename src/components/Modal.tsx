import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export default function Modal({ title, subtitle, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  // На телефоне после касания, открывшего окно, браузер присылает ещё и «клик» в ту же точку —
  // первые полсекунды клики игнорируем, чтобы он не нажал кнопку внутри окна
  const openedAt = useRef(Date.now());
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    const target = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current;
    target?.focus({ preventScroll: true });
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }); };
  }, []);
  return (
    <div className="modal-back"
      onPointerDown={(e) => { if (e.target === e.currentTarget && Date.now() - openedAt.current > 400) onClose(); }}
      onClickCapture={(e) => { if (Date.now() - openedAt.current < 450) { e.preventDefault(); e.stopPropagation(); } }}>
      <div className={'modal' + (wide ? ' is-wide' : '')} role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
