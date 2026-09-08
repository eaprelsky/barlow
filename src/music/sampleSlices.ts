/** Non-destructive cuts refer to immutable assets; no PCM is copied. */
export interface SampleSlice { id: string; name: string; sampleId: string; sampleName?: string; start: number; end: number }
export const SAMPLE_SLICE_LIMIT = 64;
export function validSampleSlices(raw: unknown): boolean {
  if (raw === undefined) return true;
  if (!Array.isArray(raw) || raw.length > SAMPLE_SLICE_LIMIT) return false;
  const ids = new Set<string>();
  return raw.every(value => {
    if (!value || typeof value !== 'object') return false;
    const s = value as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id || s.id.length > 128 || ids.has(s.id)
      || typeof s.name !== 'string' || s.name.length > 160
      || typeof s.sampleId !== 'string' || !/^[a-f0-9]{64}$/.test(s.sampleId)
      || typeof s.start !== 'number' || !Number.isFinite(s.start) || s.start < 0
      || typeof s.end !== 'number' || !Number.isFinite(s.end) || s.end - s.start < .001 - 1e-9 || s.end > 3600) return false;
    ids.add(s.id); return true;
  });
}
export function normalizeSampleSlices(raw: unknown): SampleSlice[] | undefined {
  if (!validSampleSlices(raw) || !Array.isArray(raw) || !raw.length) return undefined;
  return raw.map((s: SampleSlice) => ({ id: s.id, name: s.name.slice(0, 160), sampleId: s.sampleId,
    sampleName: typeof s.sampleName === 'string' ? s.sampleName.slice(0, 160) : undefined, start: s.start, end: s.end }));
}
