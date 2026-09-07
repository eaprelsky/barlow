// Библиотека сэмплов: патч хранит только SHA-256-ссылки (см. docs/DESIGN.md,
// «Сэмплы и бинарный контент»). Хеш даёт дедупликацию и переиспользование.
// Веб: контент в IndexedDB. Десктоп (Tauri): файлы <sha256>.<ext> в папке
// <appData>/samples + index.json с именами — та же структура, что в
// zip-проекте; при смене слоя меняется только этот файл.

import { nativeSamples } from '../platform';
import { slugify } from '../utils/slug';

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
export const LIBRARY_CHANGED_EVENT = 'barlow:library-changed';
const libraryChanged = () => window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));

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
  const json = await nativeSamples!.readIndex();
  if (!json) return [];
  let arr: unknown;
  const corrupt = () => new Error('Индекс библиотеки повреждён. Исходный индекс сохранён; исправь его или выбери другую папку.');
  try { arr = JSON.parse(json); } catch { throw corrupt(); }
  if (!Array.isArray(arr) || arr.some(m => !m || typeof m !== 'object'
    || typeof m.id !== 'string' || !/^[a-f0-9]{64}$/.test(m.id)
    || typeof m.name !== 'string' || typeof m.file !== 'string'
    || !Number.isSafeInteger(m.size) || m.size < 0 || m.size > 64 * 1048576
    || !Number.isFinite(m.createdAt) || m.createdAt < 0))
    throw corrupt();
  if (new Set(arr.map(m => m.id)).size !== arr.length) throw corrupt();
  return arr as SampleMeta[];
}

async function desktopIndexSave(list: SampleMeta[]): Promise<void> {
  await nativeSamples!.writeIndex(JSON.stringify(list, null, 2));
}

/** Путь к папке библиотеки (для подписи в панели сэмплов). */
export async function samplesDirLabel(): Promise<string | null> {
  if (!nativeSamples) return null;
  return nativeSamples.directory();
}

/** Открыть папку библиотеки в проводнике (десктоп). */
export async function revealSamplesDir(): Promise<void> {
  await nativeSamples?.revealDirectory();
}

/** Сменить папку библиотеки: нативный диалог. Существующие сэмплы
 *  переносятся; если в новой папке уже есть своя библиотека — используется
 *  она. Возвращает новый путь или null (отмена / веб). */
export async function samplesDirPick(): Promise<string | null> {
  const adapter = nativeSamples;
  if (!adapter) return null;
  return serialize(() => adapter.pickDirectory()).then(path => { if (path) libraryChanged(); return path; });
}

let mutations: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = mutations.then(action, action);
  mutations = next.catch(() => undefined);
  return next;
}

/** One visible library commit: one IndexedDB transaction / one index replace.
 * Desktop content is staged before the index is published; interrupted writes
 * may leave unreferenced files, but never a partially published import. */
export function putSamples(items: { blob: Blob; name: string }[]): Promise<SampleMeta[]> {
  return serialize(async () => {
  const prepared = await Promise.all(items.map(async ({ blob, name }) => {
    if (blob.size > 64 * 1024 * 1024) throw new Error('Сэмпл больше 64 МиБ');
    const buf = await blob.arrayBuffer();
    const id = await sha256Hex(buf);
    const meta: SampleMeta = { id, name, size: blob.size, createdAt: Date.now(), file: `${slugify(name)}-${id}.${extOf(blob)}` };
    return { blob, buf, meta };
  }));
  if (nativeSamples) {
    const list = await desktopIndex();
    for (const { buf, meta } of prepared) {
      if (list.some(m => m.id === meta.id)) continue;
      await nativeSamples.write(meta.file!, buf);
      list.push(meta);
    }
    await desktopIndexSave(list);
    return prepared.map(p => list.find(m => m.id === p.meta.id)!);
  }
  const db = await openDb();
  const chosen = new Map<string, SampleMeta>();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const done = txDone(tx), store = tx.objectStore(STORE);
    const unique = new Map<string, typeof prepared[number]>();
    for (const p of prepared) if (!unique.has(p.meta.id)) unique.set(p.meta.id, p);
    for (const { meta, blob } of unique.values()) {
      const request = store.get(meta.id);
      request.onsuccess = () => {
        const existing = request.result as { meta?: SampleMeta } | undefined;
        if (existing?.meta) chosen.set(meta.id, existing.meta);
        else { store.put({ meta, blob }); chosen.set(meta.id, meta); }
      };
    }
    await done;
  } finally {
    db.close();
  }
  return prepared.map(p => chosen.get(p.meta.id)!);
  }).then(result => { libraryChanged(); return result; });
}

export async function putSample(blob: Blob, name: string): Promise<SampleMeta> {
  return (await putSamples([{ blob, name }]))[0];
}

export async function getSampleBlob(id: string): Promise<Blob | undefined> {
  if (nativeSamples) {
    const list = await desktopIndex();
    const meta = list.find((m) => m.id === id);
    if (!meta?.file) return undefined;
    const data = await nativeSamples.read(meta.file);
    if (!data) return undefined;
    const ext = meta.file.split('.').pop() ?? 'bin';
    return new Blob([data], { type: MIME_BY_EXT[ext] ?? 'application/octet-stream' });
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
  if (nativeSamples) {
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

export function deleteSample(id: string): Promise<void> {
  return serialize(() => deleteSampleInternal(id)).then(() => { libraryChanged(); });
}

async function deleteSampleInternal(id: string): Promise<void> {
  if (nativeSamples) {
    const list = await desktopIndex();
    const meta = list.find((m) => m.id === id);
    if (meta?.file) await nativeSamples.remove(meta.file);
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
