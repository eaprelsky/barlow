import { useSyncExternalStore } from 'react';

// Вид нотного стана, общий для всех дорожек: высота окна (строк) и шаг
// листания ▲/▼. Это настройка интерфейса, а не патч — живёт в
// localStorage и переживает перезагрузку. null — «весь диапазон» /
// «октава шкалы трека» (авто, у каждой шкалы своё число строк).
export interface RollViewPrefs {
  rows: number | null;
  step: number | null;
}
export const ROLL_VIEW_KEY = 'barlow.rollView.v1';
export const ROLL_VIEW_EVENT = 'barlow:roll-view';
const DEFAULTS: RollViewPrefs = { rows: null, step: null };

const positiveInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

function parse(raw: string | null): RollViewPrefs {
  if (!raw) return DEFAULTS;
  try {
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object') return DEFAULTS;
    const { rows, step } = v as Record<string, unknown>;
    return { rows: positiveInt(rows), step: positiveInt(step) };
  } catch {
    return DEFAULTS;
  }
}

// Снапшот кэшируется: useSyncExternalStore сравнивает его по ссылке и
// уходит в цикл, если getSnapshot каждый раз отдаёт новый объект.
let snapshot = parse(localStorage.getItem(ROLL_VIEW_KEY));

export function setRollViewPrefs(patch: Partial<RollViewPrefs>) {
  try {
    localStorage.setItem(ROLL_VIEW_KEY, JSON.stringify({ ...snapshot, ...patch }));
  } catch {
    // Вид — не данные: молча остаёмся на текущих значениях до конца сессии.
    return;
  }
  snapshot = { ...snapshot, ...patch };
  window.dispatchEvent(new Event(ROLL_VIEW_EVENT));
}

function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === ROLL_VIEW_KEY || event.key === null) {
      snapshot = parse(event.key === null ? null : event.newValue);
      notify();
    }
  };
  window.addEventListener(ROLL_VIEW_EVENT, notify);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(ROLL_VIEW_EVENT, notify);
    window.removeEventListener('storage', storage);
  };
}

export const useRollViewPrefs = () =>
  useSyncExternalStore(subscribe, () => snapshot, () => DEFAULTS);
