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
    (dialog.querySelector('input') ?? dialog.querySelector('button'))?.focus();
    return () => { if (dialog.open) dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, [first]);

  if (!first) return null;
  const { req } = first;
  return (
    <dialog
      ref={dialogRef}
      className="modal native-dialog"
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
          {!req.onlyOk && <button onClick={() => closeDialog(first, false)}>{req.cancelLabel ?? 'отмена'}</button>}
          <button
            className={req.danger ? 'danger' : ''}
            onClick={() => closeDialog(first, true)}
          >
            {req.okLabel ?? 'ок'}
          </button>
        </div>
    </dialog>
  );
}
