/** Synchronous reservation before any await; UI disabled state is not a lock. */
export class SampleJobs {
  private active = new Map<string, AbortController>();
  begin(target: string): AbortController | null {
    if (this.active.has(target) || this.active.size >= 4) return null;
    const job = new AbortController(); this.active.set(target, job); return job;
  }
  current(target: string, job: AbortController): boolean { return this.active.get(target) === job && !job.signal.aborted; }
  finish(target: string, job: AbortController): boolean {
    if (this.active.get(target) !== job) return false;
    this.active.delete(target); return true;
  }
  cancel(target: string): void { this.active.get(target)?.abort(); this.active.delete(target); }
  cancelAll(): void { for (const job of this.active.values()) job.abort(); this.active.clear(); }
}
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted','AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort',abort); resolve(); },ms);
    signal?.addEventListener('abort',abort,{once:true});
  });
}
