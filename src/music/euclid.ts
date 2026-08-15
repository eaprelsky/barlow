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
