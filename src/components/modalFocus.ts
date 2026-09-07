import type { KeyboardEvent } from 'react';
/** Keep Tab in the modal, including the browser's address-bar boundary. */
export function trapModalTab(e: KeyboardEvent<HTMLDialogElement>): void {
  if (e.key !== 'Tab') return;
  const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
    .filter(el => el.getClientRects().length > 0);
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (!first) { e.preventDefault(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
