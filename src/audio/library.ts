// Библиотека сэмплов: контент живёт в IndexedDB, патч хранит только
// SHA-256-ссылки (см. docs/DESIGN.md, «Сэмплы и бинарный контент»).
// Хеш даёт дедупликацию и переиспользование между патчами.
// При переезде на Tauri меняется только этот слой — на файловую систему.

export interface SampleMeta {
  id: string; // sha-256 содержимого
  name: string;
  size: number;
  createdAt: number;
}

const DB_NAME = 'barlow-library';
const STORE = 'samples';

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

export async function putSample(blob: Blob, name: string): Promise<SampleMeta> {
  const buf = await blob.arrayBuffer();
  const id = await sha256Hex(buf);
  const meta: SampleMeta = { id, name, size: blob.size, createdAt: Date.now() };
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
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}
