// Проект = переносимый архив: patch.json + все использованные сэмплы.
// SHA-256-ссылочная модель делает импорт тривиальным: файлы укладываются
// в библиотеку как есть, putSample считает тот же хеш — ссылки патча
// валидны, дубликаты схлопываются. При Tauri этот же формат станет
// папкой проекта (patch.json + samples/), zip — командой «сохранить как».

import { strFromU8, strToU8, unzip, zipSync } from 'fflate';
import type { Patch } from '../types';
import { isPatch, normalizePatch } from '../types';
import { getSampleBlob, putSamples } from './library';
import { sampleAssets } from '../music/sampleZones';

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
const MiB = 1024 * 1024;
const SAMPLE_PATH = /^samples\/([a-f0-9]{64})\.(wav|mp3|m4a|ogg|flac|weba|bin)$/;

/** Собрать zip-проект из патча и его сэмплов. */
export async function exportProject(patch: Patch): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest: ProjectManifest = { barlow: 1, exportedAt: Date.now(), samples: [] };
  const seen = new Set<string>();
  for (const inst of patch.instruments.flatMap(sampleAssets)) {
    if (!inst.sampleId || seen.has(inst.sampleId)) continue;
    seen.add(inst.sampleId);
    const blob = await getSampleBlob(inst.sampleId);
    if (!blob) throw new Error(`Не найден сэмпл «${inst.sampleName ?? inst.sampleId}»: проект не сохранён`);
    const file = `${inst.sampleId}.${extOf(blob)}`;
    files[`samples/${file}`] = new Uint8Array(await blob.arrayBuffer());
    manifest.samples.push({ id: inst.sampleId, name: inst.sampleName ?? inst.sampleId, file });
  }
  files['patch.json'] = strToU8(JSON.stringify(patch, null, 2));
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

/** Распаковать zip-проект: сэмплы — в библиотеку, патч — наружу.
 *  Возвращает null, если файл не проект barlow. */
export async function importProject(file: File): Promise<Patch | null> {
  if (file.size > 128 * MiB) throw new Error('Архив больше 128 МиБ');
  let entries: Record<string, Uint8Array>;
  let total = 0, count = 0;
  const paths = new Set<string>();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    entries = await new Promise((resolve, reject) => unzip(bytes, { filter: entry => {
      const path = entry.name;
      if (++count > 512 || paths.has(path)) throw new Error('Слишком много файлов или повтор имени');
      paths.add(path);
      const limit = path === 'patch.json' ? 8 * MiB : path === 'manifest.json' ? MiB : SAMPLE_PATH.test(path) ? 64 * MiB : 0;
      total += entry.originalSize;
      if (!limit || entry.originalSize > limit || entry.size > limit + MiB || total > 256 * MiB
        || (entry.compression === 0 && entry.size !== entry.originalSize)) throw new Error('Недопустимый путь или размер файла в архиве');
      return true;
    } }, (err, files) => err ? reject(err) : resolve(files)));
  } catch (e) {
    throw new Error(`Не удалось безопасно распаковать проект: ${e instanceof Error ? e.message : String(e)}`);
  }
  const patchRaw = entries['patch.json'];
  if (!patchRaw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(patchRaw));
  } catch {
    return null;
  }
  if (!isPatch(parsed)) throw new Error('Некорректная версия, структура или ссылки патча');
  const patch = normalizePatch(parsed);
  const names = new Map<string, string>();
  if (entries['manifest.json']) {
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as ProjectManifest;
    if (manifest.barlow !== 1 || !Array.isArray(manifest.samples)) throw new Error('Некорректный манифест');
    for (const s of manifest.samples) {
      if (!s || typeof s.file !== 'string' || typeof s.name !== 'string' || s.name.length > 1024
        || SAMPLE_PATH.exec(`samples/${s.file}`)?.[1] !== s.id || names.has(s.file) || !entries[`samples/${s.file}`]) throw new Error('Некорректная ссылка сэмпла в манифесте');
      names.set(s.file, s.name);
    }
  }
  const ids = new Set<string>();
  const staged: { blob: Blob; name: string }[] = [];
  for (const [path, data] of Object.entries(entries)) {
    const match = SAMPLE_PATH.exec(path);
    if (!match) continue;
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
    const id = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (id !== match[1] || ids.has(id)) throw new Error('Содержимое сэмпла не соответствует SHA-256 или повторяется');
    ids.add(id);
    const base = path.slice('samples/'.length);
    const type = Object.entries(EXT_BY_MIME).find(([, ext]) => ext === match[2])?.[0] ?? 'application/octet-stream';
    if (entries['manifest.json'] && !names.has(base)) throw new Error('Сэмпл отсутствует в манифесте');
    staged.push({ blob: new Blob([new Uint8Array(data)], { type }), name: names.get(base) ?? base });
  }
    for (const inst of patch.instruments.flatMap(sampleAssets)) {
    if (inst.sampleId && !ids.has(inst.sampleId)) throw new Error(`Архив не содержит сэмпл «${inst.sampleName ?? inst.sampleId}»`);
  }
  await putSamples(staged);
  return patch;
}

/** Похоже ли на zip (магические байты PK) — чтобы один файловый диалог
 *  принимал и патч .json, и проект .zip. */
export async function looksLikeZip(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}
