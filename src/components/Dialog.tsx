// Хост глобальных диалогов в эстетике приложения — рендерится один раз
// в App. Логика очереди живёт в dialog.ts (там же confirmDialog/alertDialog).

import { useEffect, useSyncExternalStore } from 'react';
import {
  closeDialog,
  currentDialog,
  dialogsVersion,
  subscribeDialogs,
} from './dialogs';

export function DialogHost() {
  useSyncExternalStore(subscribeDialogs, dialogsVersion, dialogsVersion);
  const first = currentDialog();

  useEffect(() => {
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape = главный ответ: отмена для вопроса, «ок» для сообщения.
      if (e.key === 'Escape') closeDialog(first, !!first.req.onlyOk);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [first]);

  if (!first) return null;
  const { req } = first;
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeDialog(first, !!req.onlyOk);
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <h3>{req.title}</h3>
        {req.text && <p>{req.text}</p>}
        <div className="modal-btns">
          {!req.onlyOk && <button onClick={() => closeDialog(first, false)}>{req.cancelLabel ?? 'отмена'}</button>}
          <button
            className={req.danger ? 'danger' : ''}
            onClick={() => closeDialog(first, true)}
            // фокус на главном действии: Enter подтверждает без таба
            ref={(b) => b?.focus()}
          >
            {req.okLabel ?? 'ок'}
          </button>
        </div>
      </div>
    </div>
  );
}
