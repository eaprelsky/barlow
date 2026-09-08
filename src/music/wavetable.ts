export interface Wavetable { frames: number[][]; position: number; sweep: number }
export interface VirtualAnalog { shape: 'saw' | 'pulse' | 'triangle'; pulseWidth: number }
export const TABLE_SIZE = 128;
export function validWavetable(raw: unknown): boolean {
  if (raw === undefined) return true;
  const t = raw as Wavetable;
  return !!t && Number.isFinite(t.position) && t.position >= 0 && t.position <= 1
    && Number.isFinite(t.sweep) && t.sweep >= -1 && t.sweep <= 1
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
