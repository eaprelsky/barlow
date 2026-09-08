export interface Wavetable {
  frames: number[][]; position: number; sweep: number;
  /** Complete outward/return trips over the sounding note, not Hz. */
  scan?: { cycles: number };
  positionLfo?: { shape: 'sine' | 'triangle'; rateHz: number; depth: number; phase: number };
}
export interface VirtualAnalog { shape: 'saw' | 'pulse' | 'triangle'; pulseWidth: number }
export const TABLE_SIZE = 128;
export function validWavetable(raw: unknown): boolean {
  if (raw === undefined) return true;
  const t = raw as Wavetable;
  return !!t && Number.isFinite(t.position) && t.position >= 0 && t.position <= 1
    && Number.isFinite(t.sweep) && t.sweep >= -1 && t.sweep <= 1
    && (t.scan === undefined || !!t.scan && Number.isInteger(t.scan.cycles) && t.scan.cycles >= 1 && t.scan.cycles <= 32)
    && (t.positionLfo === undefined || !!t.positionLfo && ['sine', 'triangle'].includes(t.positionLfo.shape)
      && Number.isFinite(t.positionLfo.rateHz) && t.positionLfo.rateHz >= .05 && t.positionLfo.rateHz <= 20
      && Number.isFinite(t.positionLfo.depth) && t.positionLfo.depth >= 0 && t.positionLfo.depth <= 1
      && Number.isFinite(t.positionLfo.phase) && t.positionLfo.phase >= 0 && t.positionLfo.phase <= 1)
    && Array.isArray(t.frames) && t.frames.length >= 2 && t.frames.length <= 8
    && t.frames.every(f => Array.isArray(f) && f.length === TABLE_SIZE && f.every(v => Number.isFinite(v) && Math.abs(v) <= 1));
}
export function validVA(raw: unknown): boolean {
  if (raw === undefined) return true;
  const v = raw as VirtualAnalog;
  return !!v && ['saw', 'pulse', 'triangle'].includes(v.shape) && Number.isFinite(v.pulseWidth) && v.pulseWidth >= .05 && v.pulseWidth <= .95;
}
export function tableFrame(shape: 'sine' | 'saw' | 'pulse' | 'triangle', width = .5): number[] {
  return Array.from({ length: TABLE_SIZE }, (_, i) => {
    const t = i / TABLE_SIZE;
    return shape === 'sine' ? Math.sin(2 * Math.PI * t) : shape === 'saw' ? 2 * t - 1
      : shape === 'pulse' ? (t < width ? 1 : -1) : 1 - 4 * Math.abs(t - .5);
  });
}
export const tableRecipe = (): Wavetable => ({ position: 0, sweep: 1, frames: [tableFrame('sine'), tableFrame('triangle'), tableFrame('saw'), tableFrame('pulse', .2)] });
/** Harmonic coefficients, with DC removed. PeriodicWave supplies band limiting. */
export function tableSpectrum(frame: readonly number[]): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(TABLE_SIZE / 2), imag = new Float32Array(TABLE_SIZE / 2);
  for (let k = 1; k < real.length; k++) for (let n = 0; n < frame.length; n++) {
    real[k] += 2 / frame.length * frame[n] * Math.cos(2 * Math.PI * k * n / frame.length);
    imag[k] += 2 / frame.length * frame[n] * Math.sin(2 * Math.PI * k * n / frame.length);
  }
  return { real, imag };
}
/** Analytic VA coefficients retain fine pulse-width resolution, without
 * sampling an edge onto the wavetable grid. No analog circuit emulation. */
export function vaSpectrum(va: VirtualAnalog): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(128), imag = new Float32Array(128);
  for (let k = 1; k < 128; k++) {
    if (va.shape === 'saw') imag[k] = -2 / (Math.PI * k);
    else if (va.shape === 'triangle') real[k] = k % 2 ? -8 / (Math.PI * Math.PI * k * k) : 0;
    else { real[k] = 2 * Math.sin(2 * Math.PI * k * va.pulseWidth) / (Math.PI * k); imag[k] = 2 * (1 - Math.cos(2 * Math.PI * k * va.pulseWidth)) / (Math.PI * k); }
  }
  if (va.shape === 'pulse') { const scale = 1 / Math.max(1, 2 * Math.max(va.pulseWidth, 1 - va.pulseWidth)); for (let k = 1; k < 128; k++) { real[k] *= scale; imag[k] *= scale; } }
  return { real, imag };
}
export const frameWeight = (position: number, frame: number, count: number): number => Math.max(0, 1 - Math.abs(position * (count - 1) - frame));

/** Position preview: same baseline and bounded sum as the audio control graph. */
export function wavetablePosition(table: Wavetable, progress: number, elapsedSeconds: number): number {
  const u = Math.max(0, Math.min(1, progress));
  const travel = table.scan ? 1 - Math.abs(2 * ((u * table.scan.cycles) % 1) - 1) : u;
  const end = Math.max(0, Math.min(1, table.position + table.sweep));
  let position = table.position + (end - table.position) * travel;
  const lfo = table.positionLfo;
  if (lfo) {
    const sine = Math.sin(2 * Math.PI * (elapsedSeconds * lfo.rateHz + lfo.phase));
    position += lfo.depth * (lfo.shape === 'sine' ? sine : 2 / Math.PI * Math.asin(sine));
  }
  return Math.max(0, Math.min(1, position));
}
