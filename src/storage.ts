// Хранение автосейва патча. Сегодня — localStorage, при Tauri сюда
// подсядет файловая реализация (проект = patch.json в папке); весь остальной
// код работает только с этим интерфейсом. UI-состояние (свёрнутость треков,
// ключи ИИ) — настройки браузера/машины, остаются при себе.

import type { Patch } from './types';
import { isPatch } from './types';

const KEY = 'barlow.patch.v12';

export function loadAutosave(): Patch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPatch(parsed)) return parsed; // нормализует вызывающий
    }
  } catch {
    /* повреждённый автосейв — начинаем с дефолта */
  }
  return null;
}

export function saveAutosave(patch: Patch): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(patch));
  } catch {
    /* переполнение квоты — автосейв молча пропускаем */
  }
}
