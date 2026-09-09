import { t as msg } from './i18n/runtime.ts';
// Хранение автосейва патча. Сегодня — localStorage, при Tauri сюда
// подсядет файловая реализация (проект = patch.json в папке); весь остальной
// код работает только с этим интерфейсом. UI-состояние (свёрнутость треков,
// ключи ИИ) — настройки браузера/машины, остаются при себе.

import type { Patch } from './types';
import { isPatch } from './types';

const KEY = 'barlow.patch.v12';
const RECOVERY_KEY = `${KEY}.recovery`;
type SaveStatus = { phase: 'saved' | 'pending' | 'error'; message: string };
let status: SaveStatus = { phase: 'saved', get message() { return msg("storage.saved"); } };
let pending: Patch | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let previousRaw: string | null = null;
let blocked = false;
const listeners = new Set<() => void>();
const publish = (phase: SaveStatus['phase'], message: string | (() => string)) => {
  if (status.phase === phase && status.message === (typeof message === 'function' ? message() : message)) return;
  status = { phase, get message() { return typeof message === 'function' ? message() : message; } };
  for (const listener of listeners) listener();
};
export const autosaveStatus = () => status;
export const subscribeAutosave = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function loadAutosave(): Patch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!isPatch(parsed)) throw new Error(msg("storage.unsupportedVersionOrDamagedProject"));
      previousRaw = raw;
      return parsed; // нормализует вызывающий
    }
  } catch {
    // Keep the unreadable original; a default project must never overwrite it.
    blocked = true;
    publish('error', () => msg("storage.theSavedProjectCouldNotBeRead"));
  }
  return null;
}

export function saveAutosave(patch: Patch): void {
  pending = patch;
  clearTimeout(timer);
  if (blocked) return;
  publish('pending', () => msg("storage.unsavedChanges"));
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
    publish('saved', () => backupFailed ? msg("storage.savedNoSpaceForABackup") : msg("storage.saved"));
  } catch (e) {
    publish('error', () => msg("storage.couldNotSaveYourChangesRemainOpen", {p0: e instanceof Error ? e.message : String(e)}));
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
