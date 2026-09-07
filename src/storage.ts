// Хранение автосейва патча. Сегодня — localStorage, при Tauri сюда
// подсядет файловая реализация (проект = patch.json в папке); весь остальной
// код работает только с этим интерфейсом. UI-состояние (свёрнутость треков,
// ключи ИИ) — настройки браузера/машины, остаются при себе.

import type { Patch } from './types';
import { isPatch } from './types';

const KEY = 'barlow.patch.v12';
const RECOVERY_KEY = `${KEY}.recovery`;
type SaveStatus = { phase: 'saved' | 'pending' | 'error'; message: string };
let status: SaveStatus = { phase: 'saved', message: 'сохранено' };
let pending: Patch | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let previousRaw: string | null = null;
let blocked = false;
const listeners = new Set<() => void>();
const publish = (phase: SaveStatus['phase'], message: string) => {
  if (status.phase === phase && status.message === message) return;
  status = { phase, message };
  for (const listener of listeners) listener();
};
export const autosaveStatus = () => status;
export const subscribeAutosave = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function loadAutosave(): Patch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!isPatch(parsed)) throw new Error('Неподдерживаемая версия или повреждённый патч');
      previousRaw = raw;
      return parsed; // нормализует вызывающий
    }
  } catch {
    // Keep the unreadable original; a default project must never overwrite it.
    blocked = true;
    publish('error', 'Сохранённый патч не прочитан. Оригинал сохранён; автосохранение приостановлено. Экспортируй текущий проект или восстанови резервную копию.');
  }
  return null;
}

export function saveAutosave(patch: Patch): void {
  pending = patch;
  clearTimeout(timer);
  if (blocked) return;
  publish('pending', 'есть несохранённые изменения');
  timer = setTimeout(flushAutosave, 400);
}

export function flushAutosave(): void {
  clearTimeout(timer);
  if (!pending || blocked) return;
  try {
    const raw = JSON.stringify(pending);
    localStorage.setItem(KEY, raw);
    let backupFailed = false;
    if (previousRaw && previousRaw !== raw) {
      try { localStorage.setItem(RECOVERY_KEY, previousRaw); } catch { backupFailed = true; }
    }
    previousRaw = raw;
    pending = null;
    publish('saved', backupFailed ? 'сохранено; нет места для резервной копии' : 'сохранено');
  } catch (e) {
    publish('error', `Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}. Изменения остаются открыты — экспортируй проект.`);
  }
}

export function loadRecovery(): Patch | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPatch(parsed) ? parsed : null;
  } catch { return null; }
}

/** Called only by the user's explicit recovery action. */
export function resumeAutosave(): void { blocked = false; }

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAutosave);
  window.addEventListener('beforeunload', flushAutosave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAutosave(); });
}
