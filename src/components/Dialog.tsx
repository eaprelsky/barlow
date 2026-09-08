import { requestPointHelp } from '../onboarding/helpMode';
// Хост глобальных диалогов в эстетике приложения — рендерится один раз
// в App. Логика очереди живёт в dialog.ts (там же confirmDialog/alertDialog).

import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { trapModalTab } from './modalFocus';
import {
  closeDialog,
  currentDialog,
  dialogsVersion,
  subscribeDialogs,
} from './dialogs';

export function DialogHost() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();
  useSyncExternalStore(subscribeDialogs, dialogsVersion, dialogsVersion);
  const first = currentDialog();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!first || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    // The first action is cancellation; dangerous actions never take default focus.
    (dialog.querySelector('input') ?? dialog.querySelector('button:not(.modal-point-help)'))?.focus();
    return () => { if (dialog.open) dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, [first]);

  if (!first) return null;
  const { req } = first;
  return (
    <dialog
      ref={dialogRef}
      className="modal native-dialog" data-help="dialog"
      aria-labelledby={titleId}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(first, !!req.onlyOk); }
        else trapModalTab(e);
      }}
      aria-describedby={req.text ? textId : undefined}
      onCancel={(e) => { e.preventDefault(); closeDialog(first, !!req.onlyOk); }}
      onMouseDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) closeDialog(first, !!req.onlyOk);
      }}
    >
        <button className="modal-point-help" type="button" data-help="point-help" aria-label="Что это?" onClick={requestPointHelp}>?</button>
        <h3 id={titleId}>{req.title}</h3>
        {req.text && <p id={textId}>{req.text}</p>}
        {req.input && (
          <input
            className="modal-input"
            aria-labelledby={titleId}
            autoFocus
            defaultValue={first.inputValue}
            placeholder={req.input.placeholder}
            onChange={(e) => {
              first.inputValue = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') closeDialog(first, true);
            }}
          />
        )}
        <div className="modal-btns">
          {!req.onlyOk && <button data-help="dialog-cancel" onClick={() => closeDialog(first, false)}>{req.cancelLabel ?? 'отмена'}</button>}
          <button
            data-help="dialog-confirm" className={req.danger ? 'danger' : ''}
            onClick={() => closeDialog(first, true)}
          >
            {req.okLabel ?? 'ок'}
          </button>
        </div>
    </dialog>
  );
}
