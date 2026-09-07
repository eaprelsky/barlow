/** Strong cache references obey both byte and entry limits. Active audio graphs
 * may still own an evicted buffer; their reservations are accounted separately. */
export class ByteLru<K, V> {
  private entries = new Map<K, { value: V; bytes: number }>();
  private used = 0;
  readonly byteLimit: number;
  readonly entryLimit: number;
  constructor(byteLimit: number, entryLimit: number) { this.byteLimit = byteLimit; this.entryLimit = entryLimit; }
  get bytes(): number { return this.used; }
  get size(): number { return this.entries.size; }
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key: K, value: V, bytes: number): void {
    const previous = this.entries.get(key);
    if (previous) { this.used -= previous.bytes; this.entries.delete(key); }
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.byteLimit) return;
    while (this.entries.size && (this.entries.size >= this.entryLimit || this.used + bytes > this.byteLimit)) {
      const oldest = this.entries.keys().next().value!;
      this.used -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
    }
    this.entries.set(key, { value, bytes }); this.used += bytes;
  }
}
