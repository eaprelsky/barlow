// Платформенные операции файлов: браузер — загрузки и file input,
// десктоп (Tauri) — нативные диалоги через Rust-команды (src-tauri).
// Единственное место, где фронт знает, где работает.

import { invoke } from '@tauri-apps/api/core';

// TAURI_ENV выставляет Tauri CLI (нужен envPrefix в vite.config);
// __TAURI_INTERNALS__ — надёжный запасной детект уже собранного окна.
const hasTauriInternals =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isDesktop =
  hasTauriInternals || !!(import.meta.env.TAURI_ENV as string | undefined);

/** Отдать пользователю бинарник (zip/wav/json). Браузер — загрузка,
 *  десктоп — диалог «сохранить как»; возвращает путь или null. */
export async function saveBlob(blob: Blob, defaultName: string): Promise<string | null> {
  if (!isDesktop) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
    return null;
  }
  // invoke сериализует параметры в JSON: Uint8Array стал бы объектом
  // {"0":1,...}, а Rust ждёт Vec<u8> — передаём обычным массивом чисел.
  const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
  return invoke<string | null>('save_project', { name: defaultName, data });
}

/** Выбрать файл проекта. Десктоп — нативный диалог; браузер возвращает
 *  null (вызывающий открывает свой input). */
export async function pickProjectFile(): Promise<File | null> {
  if (!isDesktop) return null;
  const res = await invoke<{ name: string; data: number[] } | null>('open_project');
  if (!res) return null;
  return new File([new Uint8Array(res.data)], res.name);
}
