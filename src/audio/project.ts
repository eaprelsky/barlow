// Проект = переносимый архив: patch.json + все использованные сэмплы.
// SHA-256-ссылочная модель делает импорт тривиальным: файлы укладываются
// в библиотеку как есть, putSample считает тот же хеш — ссылки патча
// валидны, дубликаты схлопываются. При Tauri этот же формат станет
// папкой проекта (patch.json + samples/), zip — командой «сохранить как».

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Patch } from '../types';
import { isPatch } from '../types';
import { getSampleBlob, putSample } from './library';

interface ProjectManifest {
  barlow: 1;
  exportedAt: number;
  // id — SHA-256 содержимого (совпадает с sampleId в патче), file — имя
  // в архиве, name — человеческое имя для библиотеки.
  samples: { id: string; name: string; file: string }[];
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
};

const extOf = (blob: Blob): string => EXT_BY_MIME[blob.type] ?? 'bin';

/** Собрать zip-проект из патча и его сэмплов. */
export async function exportProject(patch: Patch): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest: ProjectManifest = { barlow: 1, exportedAt: Date.now(), samples: [] };
  const seen = new Set<string>();
  for (const track of patch.tracks) {
    if (!track.sampleId || seen.has(track.sampleId)) continue;
    seen.add(track.sampleId);
    const blob = await getSampleBlob(track.sampleId);
    if (!blob) continue; // сэмпл исчез из библиотеки — патч валиден и без него
    const file = `${track.sampleId}.${extOf(blob)}`;
    files[`samples/${file}`] = new Uint8Array(await blob.arrayBuffer());
    manifest.samples.push({ id: track.sampleId, name: track.sampleName ?? track.sampleId, file });
  }
  files['patch.json'] = strToU8(JSON.stringify(patch, null, 2));
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

/** Распаковать zip-проект: сэмплы — в библиотеку, патч — наружу.
 *  Возвращает null, если файл не проект barlow. */
export async function importProject(file: File): Promise<Patch | null> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
  const patchRaw = entries['patch.json'];
  if (!patchRaw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(patchRaw));
  } catch {
    return null;
  }
  if (!isPatch(parsed)) return null;

  // Имена сэмплов — из манифеста (если есть), иначе имя файла.
  const names = new Map<string, string>();
  try {
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as ProjectManifest;
    for (const s of manifest.samples ?? []) names.set(s.file, s.name);
  } catch {
    /* манифест необязателен */
  }
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith('samples/') || path.endsWith('/')) continue;
    const base = path.slice('samples/'.length);
    const type = base.endsWith('.wav')
      ? 'audio/wav'
      : base.endsWith('.mp3')
        ? 'audio/mpeg'
        : base.endsWith('.bin')
          ? 'application/octet-stream'
          : 'application/octet-stream';
    await putSample(new File([new Uint8Array(data)], base, { type }), names.get(base) ?? base);
  }
  return parsed;
}

/** Похоже ли на zip (магические байты PK) — чтобы один файловый диалог
 *  принимал и патч .json, и проект .zip. */
export async function looksLikeZip(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}
