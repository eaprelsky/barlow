/** Stable named streams. Event choices never consume the DSP stream. */
export function seedOf(seed: number, ...scope: (string | number)[]): number {
  let hash = seed >>> 0;
  for (const char of JSON.stringify(scope)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash;
}
export function randomFor(seed: number | undefined, ...scope: (string | number)[]): () => number {
  if (seed === undefined) return Math.random;
  let state = seedOf(seed, ...scope);
  return () => {
    let t = state = (state + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
