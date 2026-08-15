// Очередь глобальных диалогов (данные без компонентов — см. Dialog.tsx).
// Прежний confirm жил внутри setPatch-updater'а, и StrictMode в dev
// прогонял апдейтеры дважды — переспрашивал по два раза. Теперь вопрос
// задаётся до правки патча.

export interface DialogReq {
  title: string;
  text?: string;
  okLabel?: string;
  cancelLabel?: string;
  // Только одна кнопка (замена alert).
  onlyOk?: boolean;
  // Опасное действие — кнопка подтверждения красная.
  danger?: boolean;
}

export interface PendingDialog {
  req: DialogReq;
  resolve: (ok: boolean) => void;
}

// Подряд идущие вопросы не затирают друг друга.
let queue: PendingDialog[] = [];
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  for (const l of listeners) l();
}

/** Подписка хоста на очередь (useSyncExternalStore). */
export function subscribeDialogs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const dialogsVersion = () => version;

export function currentDialog(): PendingDialog | undefined {
  return queue[0];
}

export function closeDialog(pending: PendingDialog, ok: boolean): void {
  const before = queue.length;
  queue = queue.filter((p) => p !== pending);
  if (queue.length === before) return;
  pending.resolve(ok);
  notify();
}

/** Спросить подтверждение. resolve(false) — отмена/Escape/клик по фону. */
export function confirmDialog(req: DialogReq): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ req, resolve });
    notify();
  });
}

/** Сообщение (замена alert). Закрывается «ок», Escape или кликом по фону. */
export function alertDialog(text: string, title = 'внимание'): Promise<void> {
  return confirmDialog({ title, text, okLabel: 'ок', onlyOk: true }).then(
    () => undefined,
  );
}
