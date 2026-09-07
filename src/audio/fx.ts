// Цепочка трека (фильтры → эффекты → панорама → громкость → сайдчейн)
// и мастер (громкость → компрессия → лимитер → пан + слой шума).
// Выделено из engine.ts без изменений логики — модуль переносится в
// Rust-движок по мере надобности.

import type { Effect, Mod, SoundingTrack } from '../types';
import { modRateHz } from '../types';
import { resolveMacros } from '../music/macros';
import { randomFor, seedOf } from './random';
import { effectId } from '../music/effectAddress';
import { reserveChain, type ChainLease } from './chainBudget';
import { ByteLru } from './byteLru';

export interface ModNodes {
  src: AudioScheduledSourceNode;
  depth: GainNode;
}

export interface FxNodes {
  id: string;
  type: Effect['type'];
  mix: ConstantSourceNode;
  mixDry: WaveShaperNode;
  mixWet: WaveShaperNode;
  dry: GainNode;
  wet: GainNode;
  delay?: DelayNode;
  feedback?: GainNode;
  timeControl?: BoundedParam;
  feedbackControl?: BoundedParam;
  convolver?: ConvolverNode;
  shaper?: WaveShaperNode;
  lfo?: OscillatorNode;
}

export interface TrackChain {
  resourceLease?: ChainLease;
  deferredStart?: boolean;
  hp: BiquadFilterNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  // Гейт сайдчейна: живёт отдельно от gain, чтобы качаться поверх
  // эффективной громкости эскиза.
  duck: GainNode;
  // Тумбометр: ответвление от duck, читается trackLevel для UI.
  meter: AnalyserNode;
  mods: ModNodes[];
  fx: FxNodes[];
  // Сигнатура набора модуляций и эффектов: изменилась — цепочка пересобирается.
  modSig: string;
  // Переходная огибающая сцены: рампы входа/выхода на gain.gain.
  // boundary — граница, к которой уходит эскиз; entryEnd — конец входа
  // следующего. Пока план жив, scheduler не пере-применяет громкость.
  fadePlan?: { boundary: number; nextSceneId: string; entryEnd: number } | null;
  // До этого времени (audio clock) громкость под управлением плана.
  fadeHold?: number;
}

export const modsSigOf = (mods: Mod[]) =>
  mods.map((m) => `${m.target}:${m.fxId ?? 'first'}:${m.source ?? 'lfo'}:${m.shape}`).join(',');
export const fxSigOf = (fx: Effect[]) => fx.map((e, i) => `${effectId(e, i)}:${e.type}`).join(',');
// equal-power кроссфейд dry/wet — без провала громкости посередине.
export const dryGain = (mix: number) => Math.cos((mix * Math.PI) / 2);
export const wetGain = (mix: number) => Math.sin((mix * Math.PI) / 2);

const mixCurve = (gain: (v: number) => number) => Float32Array.from({ length: 2049 }, (_, i) => gain(Math.min(1, Math.max(0, i / 1024 - 1))));
const dryCurve = mixCurve(dryGain), wetCurve = mixCurve(wetGain);
interface BoundedParam { source: ConstantSourceNode; scale: GainNode; clamp: WaveShaperNode }
/** Bounds the sum of base + automation + audio-rate modulation, not just
 * the stored value. Feedback above unity otherwise creates a runaway loop. */
export function makeBoundedParam(ctx: BaseAudioContext, param: AudioParam, value: number, min: number, max: number, startAt: number | null): BoundedParam {
  const source = ctx.createConstantSource(), scale = ctx.createGain(), clamp = ctx.createWaveShaper();
  source.offset.value = Math.min(max, Math.max(min, value)); scale.gain.value = 1 / max;
  clamp.curve = Float32Array.from({ length: 2049 }, (_, i) => Math.min(max, Math.max(min, (i / 1024 - 1) * max)));
  param.value = 0; source.connect(scale); scale.connect(clamp); clamp.connect(param); if (startAt !== null) source.start(startAt);
  return { source, scale, clamp };
}
/** One normalized control signal drives both equal-power branches. Manual,
 * automation and audio-rate modulation all meet at the same AudioParam. */
export function makeMixControl(ctx: BaseAudioContext, dry: GainNode, wet: GainNode, value: number, startAt: number | null) {
  const mix = ctx.createConstantSource(); mix.offset.value = Math.min(1, Math.max(0, value));
  const mixDry = ctx.createWaveShaper(), mixWet = ctx.createWaveShaper();
  mixDry.curve = dryCurve; mixWet.curve = wetCurve;
  dry.gain.value = 0; wet.gain.value = 0;
  mix.connect(mixDry); mix.connect(mixWet);
  mixDry.connect(dry.gain); mixWet.connect(wet.gain); if (startAt !== null) mix.start(startAt);
  return { mix, mixDry, mixWet };
}
export function fxParamOf(fx: FxNodes[], target: string, id?: string): AudioParam | null {
  const node = id === undefined ? fx[0] : fx.find(f => f.id === id);
  if (!node) return null;
  if (target === 'fxMix') return node.mix.offset;
  if (node.type !== 'delay') return null;
  return target === 'fxTime' ? node.timeControl?.source.offset ?? null : target === 'fxFeedback' ? node.feedbackControl?.source.offset ?? null : null;
}

// Процедурный impulse response для реверба: стереошумовое облако с
// экспоненциальным затуханием. Кэш общий для live и offline контекстов.
const irCache = new ByteLru<string, AudioBuffer>(32 * 1024 * 1024, 16);
const bufferBytes = (b: AudioBuffer) => b.length * b.numberOfChannels * 4;
export function getImpulse(ctx: BaseAudioContext, seconds: number, seed?: number): AudioBuffer {
  const random = randomFor(seed, "impulse", seconds);
  const key = `${ctx.sampleRate}:${seconds}:${seed ?? "legacy"}`;
  let ir = irCache.get(key);
  if (!ir) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    irCache.set(key, ir, bufferBytes(ir));
  }
  return ir;
}

/** Масштаб глубины модуляции. Фильтр качается октавно (×2.5 от базы,
 *  не меньше ±1800 Гц) — вобблеру нужен размах от глухого до звонкого. */
export function modScale(target: string, depth: number, filterBase = 1000): number {
  switch (target) {
    case 'pan':
      return depth; // ±1 максимум
    case 'volume':
      return depth * 0.5;
    case 'filterFreq':
      return depth * Math.max(1800, filterBase * 2.5);
    case 'fxTime':
      return depth * 0.12; // до ±120 мс — даб-варп времени эха
    case 'fxFeedback':
      return depth * 0.35;
    case 'fxMix':
      return depth * 0.35;
    default:
      return depth;
  }
}

/** Дак сайдчейна: приглушить к удару источника и отпустить обратно. */
export function duckSidechain(
  duck: GainNode,
  at: number,
  sc: { amount: number; releaseSec: number },
): void {
  duck.gain.setTargetAtTime(1 - sc.amount, at, 0.006);
  duck.gain.setTargetAtTime(1, at + 0.05, Math.max(0.02, sc.releaseSec / 3));
}

/** Кривая перегруза: tanh(drive·x)/tanh(drive) — мягкое насыщение. */
export function distCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/** Кривая ло-фая: квантование на 2^bits уровней — ступеньки и хруст. */
export function lofiCurve(bits: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(n);
  const levels = Math.pow(2, bits) - 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(((x + 1) / 2) * levels) / levels * 2 - 1;
  }
  return curve;
}

// S&H: кусочно-постоянные случайные значения, шаг = 1/rate. Луп бесшовный:
// периодов целое число, стык значений не важен (скачок и есть суть S&H).
const sahCache = new ByteLru<string, AudioBuffer>(16 * 1024 * 1024, 64);
function makeSahBuffer(ctx: BaseAudioContext, rate: number, seed?: number): AudioBuffer {
  const random = randomFor(seed, "sah", rate);
  const key = `${ctx.sampleRate}:${rate}:${seed ?? "legacy"}`;
  let buf = sahCache.get(key);
  if (buf) return buf;
  const steps = 16;
  const len = Math.floor((steps / rate) * ctx.sampleRate);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const period = len / steps;
  for (let i = 0; i < steps; i++) {
    const v = random() * 2 - 1;
    const from = Math.floor(i * period);
    const to = Math.floor((i + 1) * period);
    for (let j = from; j < to; j++) d[j] = v;
  }
  sahCache.set(key, buf, bufferBytes(buf));
  return buf;
}

// Перлин (1D value noise): плавные холмы между случайными точками,
// косинусная интерполяция; последняя точка равна первой — луп бесшовный.
const perlinCache = new ByteLru<string, AudioBuffer>(16 * 1024 * 1024, 64);
function makePerlinBuffer(ctx: BaseAudioContext, rate: number, seed?: number): AudioBuffer {
  const random = randomFor(seed, "perlin", rate);
  const key = `${ctx.sampleRate}:${rate}:${seed ?? "legacy"}`;
  let buf = perlinCache.get(key);
  if (buf) return buf;
  const steps = 16;
  const len = Math.floor((steps / rate) * ctx.sampleRate);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const points = Array.from({ length: steps + 1 }, () => random() * 2 - 1);
  points[steps] = points[0];
  const period = len / steps;
  for (let i = 0; i < len; i++) {
    const pos = i / period;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = points[i0];
    const b = points[i0 + 1];
    const t = 0.5 - 0.5 * Math.cos(frac * Math.PI);
    d[i] = a + (b - a) * t;
  }
  perlinCache.set(key, buf, bufferBytes(buf));
  return buf;
}

/** Узел источника модуляции по её виду. */
function makeModSource(ctx: BaseAudioContext, m: Mod, seed?: number): AudioScheduledSourceNode {
  const source = m.source ?? 'lfo';
  if (source === 'sah' || source === 'perlin') {
    const src = ctx.createBufferSource();
    src.buffer = source === 'sah' ? makeSahBuffer(ctx, 1, seed) : makePerlinBuffer(ctx, 1, seed);
    src.loop = true;
    src.playbackRate.value = m.rate;
    return src;
  }
  const osc = ctx.createOscillator();
  osc.type = m.shape;
  osc.frequency.value = m.rate;
  return osc;
}

// Мастер-шумы: длинные лупы, чтобы период не слушался.
const masterNoiseCache = new ByteLru<string, AudioBuffer>(16 * 1024 * 1024, 16);
function masterNoiseBuffer(ctx: BaseAudioContext, kind: 'white' | 'pink', seed?: number): AudioBuffer {
  const random = randomFor(seed, 'master-noise', kind);
  const key = `${ctx.sampleRate}:${kind}:${seed ?? "legacy"}`;
  let buf = masterNoiseCache.get(key);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 10);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = random() * 2 - 1;
  } else {
    // Розовый: фильтр Пола Келлета — равномерный спад -3 дБ/октаву.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  masterNoiseCache.set(key, buf, bufferBytes(buf));
  return buf;
}

export interface MasterNodes {
  input: GainNode;
  comp: DynamicsCompressorNode;
  makeup: GainNode;
  setVolume: (v: number, at: number) => void;
  setComp: (v: number, at: number) => void;
  setPan: (v: number, at: number) => void;
}

export function makeChain(ctx: BaseAudioContext, track: SoundingTrack, dest: AudioNode, bpm = 120, seed?: number, startAt: number | null = 0): TrackChain {
  track = resolveMacros(track);
  const lease = reserveChain(ctx, track);
  try { return { ...makeChainGraph(ctx, track, dest, bpm, seed, startAt), resourceLease: lease, deferredStart: startAt === null }; }
  catch (e) { lease.release(); throw e; }
}

/** Expensive graph construction can precede the transport anchor without
 * advancing LFO phase or starting control signals. Idempotent for live setup. */
export function startChain(chain: TrackChain, at: number): void {
  if (!chain.deferredStart) return;
  chain.deferredStart = false;
  for (const m of chain.mods) m.src.start(at);
  for (const f of chain.fx) {
    f.mix.start(at); f.timeControl?.source.start(at); f.feedbackControl?.source.start(at); f.lfo?.start(at);
  }
}

function makeChainGraph(ctx: BaseAudioContext, track: SoundingTrack, dest: AudioNode, bpm: number, seed: number | undefined, startAt: number | null): TrackChain {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = track.filterLow;
  hp.Q.value = 0.7;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = track.filterFreq;
  filter.Q.value = track.filterQ ?? 0.8;
  hp.connect(filter);
  const panner = ctx.createStereoPanner();
  panner.pan.value = track.pan * 2 - 1;
  const gain = ctx.createGain();
  gain.gain.value = track.volume;
  const duck = ctx.createGain(); // сайдчейн-гейт, обычно открыт (1)
  panner.connect(gain);
  gain.connect(duck);
  duck.connect(dest);
  // Тумбометр — тупиковое ответвление: анализатору не нужен выход,
  // он читает поток на проход.
  const meter = ctx.createAnalyser();
  meter.fftSize = 512;
  duck.connect(meter);

  // Эффекты: фильтры → (dry|wet каждого эффекта) → панорама.
  // dry и wet — кроссфейд: обработанный сигнал приходит только через
  // ветку обработки (delay/shaper/convolver); раньше wet дублировался
  // в sum напрямую — сухой сигнал смешивался дважды.
  const fx: FxNodes[] = [];
  let node: AudioNode = filter;
  for (const [index, e] of (track.effects ?? []).entries()) {
    const sum = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const control = { ...makeMixControl(ctx, dry, wet, e.mix, startAt), id: effectId(e, index), type: e.type };
    node.connect(dry);
    dry.connect(sum);
    wet.connect(sum);
    if (e.type === 'delay') {
      const delay = ctx.createDelay(2.5);
      delay.delayTime.value = e.timeSec;
      const feedback = ctx.createGain();
      feedback.gain.value = e.feedback;
      const timeControl = makeBoundedParam(ctx, delay.delayTime, e.timeSec, 0.01, 2, startAt);
      const feedbackControl = makeBoundedParam(ctx, feedback.gain, e.feedback, 0, 0.9, startAt);
      node.connect(delay);
      delay.connect(wet);
      delay.connect(feedback);
      feedback.connect(delay);
      fx.push({ ...control, dry, wet, delay, feedback, timeControl, feedbackControl });
    } else if (e.type === 'dist' || e.type === 'lofi') {
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';
      shaper.curve = e.type === 'dist' ? distCurve(e.drive) : lofiCurve(e.bits);
      node.connect(shaper);
      shaper.connect(wet);
      fx.push({ ...control, dry, wet, shaper });
    } else if (e.type === 'chorus') {
      // Короткая задержка, качаемая LFO: размножение тембра в разжижение.
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.026;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = e.rate;
      const sway = ctx.createGain();
      sway.gain.value = 0.005; // ±5 мс
      lfo.connect(sway);
      sway.connect(delay.delayTime);
      node.connect(delay);
      delay.connect(wet);
      if (startAt !== null) lfo.start(startAt);
      fx.push({ ...control, dry, wet, delay, lfo });
    } else {
      const conv = ctx.createConvolver();
      conv.buffer = getImpulse(ctx, e.sizeSec, seed);
      node.connect(conv);
      conv.connect(wet);
      fx.push({ ...control, dry, wet, convolver: conv });
    }
    node = sum;
  }
  node.connect(panner);
  const mods: ModNodes[] = track.mods.map((m, index) => {
    const src = makeModSource(ctx, { ...m, rate: modRateHz(m, bpm) }, seed === undefined ? undefined : seedOf(seed, track.id, index));
    const depth = ctx.createGain();
    depth.gain.value = modScale(m.target, m.depth, filter.frequency.value);
    src.connect(depth);
    let param: AudioParam | null = null;
    if (m.target === 'pan') param = panner.pan;
    else if (m.target === 'volume') param = gain.gain;
    else if (m.target === 'filterFreq') param = filter.frequency;
    else if (m.target.startsWith('fx')) param = fxParamOf(fx, m.target, m.fxId);
    if (param) depth.connect(param);
    if (startAt !== null) src.start(startAt);
    return { src, depth };
  });
  return {
    hp,
    filter,
    panner,
    gain,
    duck,
    meter,
    mods,
    fx,
    modSig: `${modsSigOf(track.mods)}|${fxSigOf(track.effects ?? [])}`,
  };
}

export function disposeChain(chain: TrackChain): void {
  chain.resourceLease?.release();
  for (const m of chain.mods) {
    try {
      m.src.stop();
    } catch {
      /* уже остановлен */
    }
    m.src.disconnect();
    m.depth.disconnect();
  }
  for (const f of chain.fx) {
    try { f.mix.stop(); } catch { /* stopped */ }
    f.mix.disconnect(); f.mixDry.disconnect(); f.mixWet.disconnect();
    for (const c of [f.timeControl, f.feedbackControl]) if (c) {
      try { c.source.stop(); } catch { /* stopped */ }
      c.source.disconnect(); c.scale.disconnect(); c.clamp.disconnect();
    }
    f.dry.disconnect();
    f.wet.disconnect();
    f.delay?.disconnect();
    f.feedback?.disconnect();
    f.convolver?.disconnect();
    f.shaper?.disconnect();
    if (f.lfo) {
      try {
        f.lfo.stop();
      } catch {
        /* уже остановлен */
      }
      f.lfo.disconnect();
    }
  }
  chain.hp.disconnect();
  chain.filter.disconnect();
  chain.panner.disconnect();
  chain.gain.disconnect();
  chain.duck.disconnect();
  chain.meter.disconnect();
}

/** Мастер: громкость → компрессия (плотность 0..1) → мягкий tanh-лимитер.
 *  Компрессор при 0 физически исключён из цепи (нейтральный
 *  DynamicsCompressorNode всё равно добавлял ~+1.8 дБ). */
export function connectMaster(
  ctx: BaseAudioContext,
  masterVolume: number,
  compAmount = 0,
): MasterNodes {
  const master = ctx.createGain();
  // 1.5: компенсация убранного скрытого ×2 старой кривой лимитера —
  // привычная громкость сохранена, окно линейности стало шире.
  master.gain.value = 1.5 * masterVolume;
  // Мягкий лимитер: до 0.8 сигнал идеально линеен (ноль искажений),
  // выше — плавный tanh-пережим. Кривая обязана жить на домене входа
  // [-1, 1]: WaveShaper мапит вход на всю кривую — кривая на [-2, 2]
  // означала скрытое усиление ×2 и клип с |x| ≈ 0.4.
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const n = 2048;
  const curve = new Float32Array(n);
  const knee = 0.8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; // диапазон входа [-1, 1]
    const ax = Math.abs(x);
    const y =
      ax <= knee ? ax : knee + (1 - knee) * Math.tanh((ax - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  shaper.curve = curve;
  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();
  // 0 — компрессии нет вовсе: мастер → лимитер напрямую.
  if (compAmount <= 0) {
    master.connect(shaper);
  } else {
    master.connect(comp);
    comp.connect(makeup);
    makeup.connect(shaper);
  }
  const masterPan = ctx.createStereoPanner();
  shaper.connect(masterPan);
  masterPan.connect(ctx.destination);
  const nodes: MasterNodes = {
    input: master,
    comp,
    makeup,
    setVolume: (v, at) => master.gain.setTargetAtTime(1.5 * v, at, 0.05),
    setPan: (v, at) => masterPan.pan.setTargetAtTime(v * 2 - 1, at, 0.05),
    setComp: (v, at) => {
      const d = Math.min(1, Math.max(0, v));
      comp.threshold.setTargetAtTime(d <= 0 ? 0 : -8 - 22 * d, at, 0.05);
      comp.ratio.setTargetAtTime(d <= 0 ? 1 : 2 + 8 * d, at, 0.05);
      comp.knee.setValueAtTime(24, at);
      comp.attack.setValueAtTime(0.006, at);
      comp.release.setValueAtTime(0.16, at);
      makeup.gain.setTargetAtTime(1 + 0.9 * d, at, 0.05);
    },
  };
  nodes.setComp(compAmount, 0);
  return nodes;
}

/** Слой мастер-шума: после лимитера, чтобы компрессия его не качала. */
export function connectMasterNoise(
  ctx: BaseAudioContext,
  kind: 'white' | 'pink',
  level: number,
  seed?: number,
  startAt = 0,
): { src: AudioBufferSourceNode; gain: GainNode } {
  const src = ctx.createBufferSource();
  src.buffer = masterNoiseBuffer(ctx, kind, seed);
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, level) * 0.12;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(startAt);
  return { src, gain };
}
