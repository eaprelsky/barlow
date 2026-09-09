import { t as msg } from '../i18n/runtime.ts';
/** Bounded strong references, with leases for a patch/render/preview. Browser
 * decoder temporaries and already playing source nodes are outside this cache. */
export const DECODED_LIMITS = { bytes: 256 * 1024 * 1024, assetBytes: 64 * 1024 * 1024, entries: 1024, pending: 64 };

export class DecodedAssets<V> {
  private entries = new Map<string, { value: V; bytes: number }>();
  private pins = new Map<string, number>();
  private inflight = new Map<string, Promise<V>>();
  private queue: Promise<unknown> = Promise.resolve();
  private used = 0;
  readonly limits: typeof DECODED_LIMITS;
  constructor(limits = DECODED_LIMITS) { this.limits = limits; }
  get bytes() { return this.used; }
  get size() { return this.entries.size; }
  get pending() { return this.inflight.size; }
  has(id: string) { return this.entries.has(id); }
  get(id: string): V | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    this.entries.delete(id); this.entries.set(id, entry);
    return entry.value;
  }
  pin(ids: Iterable<string>): () => void {
    const unique = new Set(ids);
    for (const id of unique) this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const id of unique) {
        const count = (this.pins.get(id) ?? 1) - 1;
        if (count) this.pins.set(id, count); else this.pins.delete(id);
      }
    };
  }
  load(id: string, decode: () => Promise<{ value: V; bytes: number }>): Promise<V> {
    const cached = this.get(id);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inflight.get(id);
    if (pending) return pending;
    if (this.pending >= this.limits.pending) return Promise.reject(new Error(msg("decodedAssets.theSampleLoadingQueueIsFullWait")));
    // Decode at most one asset at a time, even with concurrent UI/transport calls.
    const task = this.queue.then(async () => {
      const entry = await decode();
      if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > this.limits.assetBytes || entry.bytes > this.limits.bytes)
        throw new Error(msg("decodedAssets.theDecodedSampleExceedsMiBOrContains", {p0: Math.floor(this.limits.assetBytes / 1048576)}));
      // Plan eviction first: a failed admission must not discard useful entries.
      let bytes = this.used, count = this.size;
      const evict: string[] = [];
      for (const [key, old] of this.entries) {
        if (bytes + entry.bytes <= this.limits.bytes && count < this.limits.entries) break;
        if (this.pins.has(key)) continue;
        evict.push(key); bytes -= old.bytes; count--;
      }
      if (bytes + entry.bytes > this.limits.bytes || count >= this.limits.entries)
        throw new Error(msg("decodedAssets.samplesInThisProjectOrExportExceed", {p0: Math.floor(this.limits.bytes / 1048576)}));
      for (const key of evict) this.entries.delete(key);
      this.entries.set(id, entry); this.used = bytes + entry.bytes;
      return entry.value;
    });
    const result = task.finally(() => this.inflight.delete(id));
    this.inflight.set(id, result);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
