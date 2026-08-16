// Библиотека сэмплов: патч хранит только SHA-256-ссылки (см. docs/DESIGN.md,
// «Сэмплы и бинарный контент»). Хеш даёт дедупликацию и переиспользование.
// Веб: контент в IndexedDB. Десктоп (Tauri): файлы <sha256>.<ext> в папке
// <appData>/samples + index.json с именами — та же структура, что в
// zip-проекте; при смене слоя меняется только этот файл.

import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../platform';

export interface SampleMeta {
  id: string; // sha-256 содержимого
  name: string;
  size: number;
  createdAt: number;
  // Имя файла в папке библиотеки (только десктоп: <id>.<ext>).
  file?: string;
}

const DB_NAME = 'barlow-library';
const STORE = 'samples';

const EXT_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
};

const MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  weba: 'audio/webm',
  bin: 'application/octet-stream',
};

const extOf = (blob: Blob): string => EXT_BY_MIME[blob.type] ?? 'bin';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'meta.id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB недоступна'));
  });
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

// ---- Десктоп: файлы + index.json (см. src-tauri/src/lib.rs) ----

async function desktopIndex(): Promise<SampleMeta[]> {
  const json = await invoke<string | null>('sample_index_read');
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) ? (arr as SampleMeta[]) : [];
  } catch {
    return [];
  }
}

async function desktopIndexSave(list: SampleMeta[]): Promise<void> {
  await invoke('sample_index_write', { json: JSON.stringify(list, null, 2) });
}

/** Путь к папке библиотеки (для подписи в панели сэмплов). */
export async function samplesDirLabel(): Promise<string | null> {
  if (!isDesktop) return null;
  return invoke<string>('samples_dir_path');
}

/** Открыть папку библиотеки в проводнике (десктоп). */
export async function revealSamplesDir(): Promise<void> {
  await invoke('reveal_samples_dir');
}

/** Сменить папку библиотеки: нативный диалог. Существующие сэмплы
 *  переносятся; если в новой папке уже есть своя библиотека — используется
 *  она. Возвращает новый путь или null (отмена / веб). */
export async function samplesDirPick(): Promise<string | null> {
  if (!isDesktop) return null;
  return invoke<string | null>('samples_dir_pick');
}

export async function putSample(blob: Blob, name: string): Promise<SampleMeta> {
  const buf = await blob.arrayBuffer();
  const id = await sha256Hex(buf);
  const meta: SampleMeta = { id, name, size: blob.size, createdAt: Date.now() };
  if (isDesktop) {
    meta.file = `${id}.${extOf(blob)}`;
    await invoke('sample_write', {
      name: meta.file,
      data: Array.from(new Uint8Array(buf)),
    });
    const list = await desktopIndex();
    await desktopIndexSave([...list.filter((m) => m.id !== id), meta]);
    return meta;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ meta, blob });
    await txDone(tx);
  } finally {
    db.close();
  }
  return meta;
}

export async function getSampleBlob(id: string): Promise<Blob | undefined> {
  if (isDesktop) {
    const list = await desktopIndex();
    const meta = list.find((m) => m.id === id);
    if (!meta?.file) return undefined;
    const data = await invoke<number[] | null>('sample_read', { name: meta.file });
    if (!data) return undefined;
    const ext = meta.file.split('.').pop() ?? 'bin';
    return new Blob([new Uint8Array(data)], { type: MIME_BY_EXT[ext] ?? 'application/octet-stream' });
  }
  const db = await openDb();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as { blob?: Blob } | undefined)?.blob);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listSamples(): Promise<SampleMeta[]> {
  if (isDesktop) {
    return (await desktopIndex()).sort((a, b) => b.createdAt - a.createdAt);
  }
  const db = await openDb();
  try {
    return await new Promise<SampleMeta[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () =>
        resolve(
          ((req.result as { meta: SampleMeta }[]) ?? [])
            .map((r) => r.meta)
            .sort((a, b) => b.createdAt - a.createdAt),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteSample(id: string): Promise<void> {
  if (isDesktop) {
    const list = await desktopIndex();
    const meta = list.find((m) => m.id === id);
    if (meta?.file) await invoke('sample_delete', { name: meta.file });
    await desktopIndexSave(list.filter((m) => m.id !== id));
    return;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}
