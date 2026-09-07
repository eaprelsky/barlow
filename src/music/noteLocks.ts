import type { NoteLocks, NoteLockParameter, SoundingTrack } from '../types';
import { PARAMETERS, normalizeParameter, type ParameterId } from '../parameters.ts';

export const NOTE_LOCK_LIMIT = 8;
export const NOTE_LOCK_FIELDS: readonly NoteLockParameter[] = [
  'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime', 'filterEnvAmount', 'filterEnvTime',
  'unisonVoices', 'unisonDetune', 'unisonSpread', 'vibratoRate', 'vibratoDepth', 'vibratoDelay',
  'sampleStart', 'sampleEnd', 'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
];
export const lockParameterId = (field: NoteLockParameter): ParameterId => `instrument.${field}` as ParameterId;
export const lockSpec = (field: NoteLockParameter) => PARAMETERS[lockParameterId(field)];
const known = new Set<string>(NOTE_LOCK_FIELDS);

export function validNoteLocks(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= NOTE_LOCK_LIMIT && entries.every(([key, v]) => known.has(key) && typeof v === 'number' && Number.isFinite(v));
}
export function normalizeNoteLocks(value: unknown): NoteLocks | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: NoteLocks = {};
  for (const [key, v] of Object.entries(value)) {
    if (!known.has(key) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const field = key as NoteLockParameter;
    result[field] = normalizeParameter(lockParameterId(field), v);
    if (Object.keys(result).length === NOTE_LOCK_LIMIT) break;
  }
  return Object.keys(result).length ? result : undefined;
}
export function withNoteLocks(track: SoundingTrack, locks: NoteLocks | undefined): SoundingTrack {
  const values = normalizeNoteLocks(locks);
  return values ? { ...track, ...values } : track;
}
export function lockApplicable(field: NoteLockParameter, st: SoundingTrack): boolean {
  const sample = st.waveform === 'sample', grain = sample && st.sampleMode === 'grain', scratch = sample && st.sampleMode === 'scratch';
  if (field.startsWith('grain')) return grain;
  if (field === 'sampleStart' || field === 'sampleEnd') return sample;
  if (grain && ['attack', 'decay', 'sustain', 'vibratoDelay'].includes(field)) return false;
  if (scratch && (field.startsWith('pitch') || field.startsWith('vibrato') || field.startsWith('unison'))) return false;
  return true;
}
