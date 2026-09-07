import type { SampleZone, SampleVariant } from './sampleZones';

/** Per-performance state, deliberately outside patch JSON. Independent zone
 * counters advance only for admitted notes, in actual attack order. */
export class SampleRoundRobin {
  private counters = new Map<string, { signature: string; next: number }>();
  clear(): void { this.counters.clear(); }
  select(trackId: string, zone: SampleZone): SampleVariant {
    const variants: SampleVariant[] = [{ sampleId: zone.sampleId, sampleName: zone.sampleName, rootHz: zone.rootHz }, ...(zone.alternates ?? [])];
    if (variants.length === 1) return variants[0];
    const key = JSON.stringify([trackId, zone.id]);
    const signature = JSON.stringify(variants.map(v => [v.sampleId, v.rootHz]));
    const previous = this.counters.get(key), index = previous?.signature === signature ? previous.next : 0;
    if (!this.counters.has(key) && this.counters.size >= 8192) this.counters.delete(this.counters.keys().next().value!);
    this.counters.set(key, { signature, next: (index + 1) % variants.length });
    return variants[index];
  }
}
