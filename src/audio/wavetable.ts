import type { Wavetable } from '../music/wavetable';
import type { WaveDef } from '../types';
import { tableSpectrum, vaSpectrum, frameWeight } from '../music/wavetable';
const cache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave[]>>();
export function periodicFrames(ctx: BaseAudioContext, wave: WaveDef): PeriodicWave[] {
  let entries = cache.get(ctx); if (!entries) { entries = new Map(); cache.set(ctx, entries); }
  const key = JSON.stringify(wave.va ?? wave.wavetable?.frames);
  const found = entries.get(key); if (found) return found;
  const spectra = wave.va ? wave.va.shape === 'pulse' && wave.va.pwmDepth
    ? Array.from({ length: 8 }, (_, i) => vaSpectrum({ ...wave.va!, pulseWidth: .05 + .9 * i / 7 }))
    : [vaSpectrum(wave.va)] : wave.wavetable!.frames.map(tableSpectrum);
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

const weightCurves = new Map<number, Float32Array<ArrayBuffer>[]>();
/** One position bus per note shared by every unison oscillator. No timer or
 * duration-dependent buffer. WaveShaper clamps the summed position to 0..1. */
export function tableMotion(ctx: BaseAudioContext, table: Wavetable, at: number, seconds: number) {
  const count = table.frames.length;
  let curves = weightCurves.get(count);
  if (!curves) {
    const length = (count - 1) * 256 + 1;
    curves = Array.from({ length: count }, (_, index) => Float32Array.from({ length }, (_, i) => frameWeight(i / (length - 1), index, count)));
    weightCurves.set(count, curves);
  }
  const base = ctx.createConstantSource();
  const from = table.position, to = Math.max(0, Math.min(1, from + table.sweep));
  base.offset.setValueAtTime(from * 2 - 1, at);
  if (table.scan) {
    for (let leg = 1; leg <= table.scan.cycles * 2; leg++) base.offset.linearRampToValueAtTime((leg % 2 ? to : from) * 2 - 1, at + seconds * leg / (table.scan.cycles * 2));
  } else base.offset.linearRampToValueAtTime(to * 2 - 1, at + seconds);
  base.start(at);
  const sources: AudioScheduledSourceNode[] = [base];
  let modulation: GainNode | undefined;
  if (table.positionLfo && table.positionLfo.depth > 0) {
    const lfo = table.positionLfo, oscillator = ctx.createOscillator();
    const real = new Float32Array(64), imag = new Float32Array(64);
    for (let k = 1; k < 64; k++) {
      const amplitude = lfo.shape === 'sine' ? (k === 1 ? 1 : 0) : k % 2 ? 8 / (Math.PI ** 2 * k * k) * (-1) ** ((k - 1) / 2) : 0;
      real[k] = amplitude * Math.sin(2 * Math.PI * k * lfo.phase);
      imag[k] = amplitude * Math.cos(2 * Math.PI * k * lfo.phase);
    }
    oscillator.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: true }));
    oscillator.frequency.value = lfo.rateHz;
    modulation = ctx.createGain(); modulation.gain.value = lfo.depth * 2;
    oscillator.connect(modulation); oscillator.start(at); sources.push(oscillator);
  }
  const weights = curves.map(curve => {
    const shaper = ctx.createWaveShaper(); shaper.curve = curve;
    base.connect(shaper); modulation?.connect(shaper); return shaper;
  });
  return { weights, sources };
}
