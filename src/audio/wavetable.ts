import type { WaveDef } from '../types';
import { tableSpectrum, vaSpectrum, frameWeight } from '../music/wavetable';
const cache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave[]>>();
export function periodicFrames(ctx: BaseAudioContext, wave: WaveDef): PeriodicWave[] {
  let entries = cache.get(ctx); if (!entries) { entries = new Map(); cache.set(ctx, entries); }
  const key = JSON.stringify(wave.va ?? wave.wavetable?.frames);
  const found = entries.get(key); if (found) return found;
  const spectra = wave.va ? [vaSpectrum(wave.va)] : wave.wavetable!.frames.map(tableSpectrum);
  const frames = spectra.map(s => ctx.createPeriodicWave(s.real, s.imag, { disableNormalization: true }));
  if (entries.size >= 32) entries.delete(entries.keys().next().value!);
  entries.set(key, frames); return frames;
}
export function scanFrame(param: AudioParam, index: number, count: number, from: number, to: number, at: number, seconds: number): void {
  if (count === 1) { param.value = 1; return; }
  param.setValueAtTime(frameWeight(from, index, count), at);
  const stops = Array.from({ length: count }, (_, k) => k / (count - 1))
    .filter(p => p > Math.min(from, to) && p < Math.max(from, to)).sort((a, b) => from < to ? a - b : b - a);
  for (const p of stops) param.linearRampToValueAtTime(frameWeight(p, index, count), at + (p - from) / (to - from) * seconds);
  param.linearRampToValueAtTime(frameWeight(to, index, count), at + seconds);
}
