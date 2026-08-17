// Евклидово распределение k пульсов по n шагам (алгоритм накопления):
// максимально равномерно, классика генеративных ритмов.

export function euclid(steps: number, pulses: number): boolean[] {
  const out = Array.from({ length: steps }, () => false);
  if (pulses <= 0) return out;
  if (pulses >= steps) return out.map(() => true);
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += pulses;
    if (bucket >= steps) {
      bucket -= steps;
      out[i] = true;
    }
  }
  return out;
}

/** Случайная раскладка: k нот по случайным (различным) шагам цикла —
    то же количество, что у евклида, но без равномерности. */
export function randomMask(steps: number, pulses: number): boolean[] {
  const n = Math.max(0, Math.min(Math.round(pulses), steps));
  const idx = Array.from({ length: steps }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const on = new Set(idx.slice(0, n));
  return Array.from({ length: steps }, (_, i) => on.has(i));
}
