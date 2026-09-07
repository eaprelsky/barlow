/** Bounded, stable queue of musical events. Contains no audio nodes. */
export class EventQueue<T extends { at: number }> {
  private items: T[] = [];
  readonly limit: number;
  constructor(limit = 8192) { this.limit = limit; }
  get size(): number { return this.items.length; }
  push(event: T): boolean {
    if (!Number.isFinite(event.at) || this.items.length >= this.limit) return false;
    let lo = 0, hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.items[mid].at <= event.at) lo = mid + 1; else hi = mid;
    }
    this.items.splice(lo, 0, event);
    return true;
  }
  drain(before: number): T[] {
    let end = 0;
    while (end < this.items.length && this.items[end].at < before) end++;
    return this.items.splice(0, end);
  }
  transform(map: (event: T) => T): void {
    this.items = this.items.map(map).sort((a, b) => a.at - b.at);
  }
  clear(): void { this.items = []; }
}
