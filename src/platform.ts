import { t as msg, getLocale } from './i18n/runtime.ts';
// Платформенные операции файлов: браузер — загрузки и file input,
// десктоп (Tauri) — нативные диалоги через Rust-команды (src-tauri).
// Единственное место, где фронт знает, где работает.

import { invoke as tauriInvoke, type InvokeArgs } from '@tauri-apps/api/core';
import { nativeError } from './i18n/nativeError';
const invoke = <T,>(command: string, args?: InvokeArgs): Promise<T> => tauriInvoke<T>(command, args).catch(error => { throw nativeError(error); });
import { BINARY_LIMITS, decodeBinaryFile, encodeBinaryFile } from './binaryFile';

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
  if (blob.size > BINARY_LIMITS.save) throw new Error(msg("platform.theFileExceeds256MiBSaveThe"));
  const data = encodeBinaryFile(defaultName, new Uint8Array(await blob.arrayBuffer()), BINARY_LIMITS.save);
  return invoke<string | null>('save_project', data);
}

/** Выбрать файл проекта. Десктоп — нативный диалог; браузер возвращает
 *  null (вызывающий открывает свой input). */
export async function pickProjectFile(): Promise<File | null> {
  if (!isDesktop) return null;
  const res = decodeBinaryFile(await invoke<ArrayBuffer>('open_project', { locale: getLocale() }), BINARY_LIMITS.project);
  if (!res) return null;
  return new File([res.data], res.name);
}

/** Optional file-library adapter. The library domain never imports Tauri. */
export const nativeSamples = isDesktop ? {
  readIndex: () => invoke<string | null>('sample_index_read'),
  writeIndex: (json: string) => invoke<void>('sample_index_write', { json }),
  directory: () => invoke<string>('samples_dir_path'),
  pickDirectory: () => invoke<string | null>('samples_dir_pick'),
  revealDirectory: () => invoke<void>('reveal_samples_dir'),
  remove: (name: string) => invoke<void>('sample_delete', { name }),
  write: (name: string, data: ArrayBuffer) => invoke<void>('sample_write', encodeBinaryFile(name, new Uint8Array(data), BINARY_LIMITS.sample)),
  read: async (name: string): Promise<Uint8Array<ArrayBuffer> | null> => {
    const result = decodeBinaryFile(await invoke<ArrayBuffer>('sample_read', { name }), BINARY_LIMITS.sample);
    if (result && result.name !== name) throw new Error(msg("platform.theNativeLibraryReturnedADifferentSample"));
    return result?.data ?? null;
  },
} : null;


/** One picker contract for portable instruments; native project dialogs accept ZIP. */
export async function pickInstrumentFile(openBrowserPicker: () => void): Promise<File | null> {
  if (!isDesktop) { openBrowserPicker(); return null; }
  return pickProjectFile();
}

/** Audio import uses the same bounded native binary transport as projects. */
export async function pickAudioFile(openBrowserPicker: () => void): Promise<File | null> {
  if (!isDesktop) { openBrowserPicker(); return null; }
  const res = decodeBinaryFile(await invoke<ArrayBuffer>('open_project', { audio: true, locale: getLocale() }), BINARY_LIMITS.project);
  return res ? new File([res.data], res.name) : null;
}
