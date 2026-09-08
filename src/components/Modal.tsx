import { HelpToggle } from '../onboarding/HelpToggle';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { trapModalTab } from './modalFocus';

export function Modal({ label, className = '', onClose, children }: {
  label: string; className?: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    (el.querySelector<HTMLElement>('[data-initial-focus]') ?? el.querySelector<HTMLElement>('button:not(.modal-point-help), input:not([type="file"])'))?.focus();
    return () => { if (el.open) el.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal native-dialog ${className}`} aria-label={label}
    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } else trapModalTab(e); }} onCancel={e => { e.preventDefault(); onClose(); }}
    onMouseDown={e => {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) onClose();
    }}><HelpToggle />{children}</dialog>;
}
