export interface SampleZone {
  id: string;
  sampleId: string;
  sampleName?: string;
  rootHz: number;
  lowHz: number;
  highHz: number;
  lowVelocity: number;
  highVelocity: number;
}
const bound = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export function normalizeSampleZones(raw: unknown): SampleZone[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set<string>();
  return raw.slice(0, 64).flatMap((z, index) => {
    if (!z || typeof z !== 'object' || typeof z.sampleId !== 'string' || !/^[a-f0-9]{64}$/.test(z.sampleId)) return [];
    const id = typeof z.id === 'string' && z.id.length > 0 && z.id.length <= 128 ? z.id : `zone-${index + 1}`;
    if (ids.has(id)) return [];
    ids.add(id);
    const lowHz = bound(z.lowHz, 1, 23999, 20), lowVelocity = bound(z.lowVelocity, 0, .999, 0);
    return [{ id, sampleId: z.sampleId, sampleName: typeof z.sampleName === 'string' ? z.sampleName.slice(0, 160) : undefined,
      rootHz: bound(z.rootHz, 1, 24000, 440), lowHz, highHz: bound(z.highHz, lowHz + .001, 24000, 24000),
      lowVelocity, highVelocity: bound(z.highVelocity, lowVelocity + .001, 1, 1) }];
  });
}
/** Half-open intervals avoid double hits at split points. Upper endpoints
 * 24000 Hz / velocity 1 are inclusive; overlap chooses the first zone. */
export function sampleZoneAt(zones: SampleZone[] | undefined, hz: number, velocity: number): SampleZone | undefined {
  return zones?.find(z => hz >= z.lowHz && (hz < z.highHz || z.highHz === 24000 && hz === 24000)
    && velocity >= z.lowVelocity && (velocity < z.highVelocity || z.highVelocity === 1 && velocity === 1));
}
export function sampleAssets(source: { sampleId?: string; sampleName?: string; sampleZones?: SampleZone[] }): { sampleId: string; sampleName?: string }[] {
  const result = new Map<string, { sampleId: string; sampleName?: string }>();
  if (source.sampleId) result.set(source.sampleId, { sampleId: source.sampleId, sampleName: source.sampleName });
  for (const zone of source.sampleZones ?? []) result.set(zone.sampleId, { sampleId: zone.sampleId, sampleName: zone.sampleName });
  return [...result.values()];
}
