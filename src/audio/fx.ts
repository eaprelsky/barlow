// Цепочка трека (фильтры → эффекты → панорама → громкость → сайдчейн)
// и мастер (громкость → компрессия → лимитер → пан + слой шума).
// Выделено из engine.ts без изменений логики — модуль переносится в
// Rust-движок по мере надобности.

import type { Effect, Mod, Track } from '../types';

export interface ModNodes {
  src: AudioScheduledSourceNode;
  depth: GainNode;
}

export interface FxNodes {
  dry: GainNode;
  wet: GainNode;
  delay?: DelayNode;
  feedback?: GainNode;
  convolver?: ConvolverNode;
  shaper?: WaveShaperNode;
  lfo?: OscillatorNode;
}

export interface TrackChain {
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
}

export const modsSigOf = (mods: Mod[]) =>
  mods.map((m) => `${m.target}:${m.source ?? 'lfo'}:${m.shape}`).join(',');
export const fxSigOf = (fx: Effect[]) => fx.map((e) => e.type).join(',');
// equal-power кроссфейд dry/wet — без провала громкости посередине.
export const dryGain = (mix: number) => Math.cos((mix * Math.PI) / 2);
export const wetGain = (mix: number) => Math.sin((mix * Math.PI) / 2);

// Процедурный impulse response для реверба: стереошумовое облако с
// экспоненциальным затуханием. Кэш общий для live и offline контекстов.
const irCache = new Map<string, AudioBuffer>();
export function getImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds.toFixed(2)}`;
  let ir = irCache.get(key);
  if (!ir) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    irCache.set(key, ir);
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
const sahCache = new Map<string, AudioBuffer>();
function makeSahBuffer(ctx: BaseAudioContext, rate: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${rate.toFixed(3)}`;
  let buf = sahCache.get(key);
  if (buf) return buf;
  if (sahCache.size > 64) sahCache.clear();
  const steps = 16;
  const len = Math.floor((steps / rate) * ctx.sampleRate);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const period = len / steps;
  for (let i = 0; i < steps; i++) {
    const v = Math.random() * 2 - 1;
    const from = Math.floor(i * period);
    const to = Math.floor((i + 1) * period);
    for (let j = from; j < to; j++) d[j] = v;
  }
  sahCache.set(key, buf);
  return buf;
}

// Перлин (1D value noise): плавные холмы между случайными точками,
// косинусная интерполяция; последняя точка равна первой — луп бесшовный.
const perlinCache = new Map<string, AudioBuffer>();
function makePerlinBuffer(ctx: BaseAudioContext, rate: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${rate.toFixed(3)}`;
  let buf = perlinCache.get(key);
  if (buf) return buf;
  if (perlinCache.size > 64) perlinCache.clear();
  const steps = 16;
  const len = Math.floor((steps / rate) * ctx.sampleRate);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const points = Array.from({ length: steps + 1 }, () => Math.random() * 2 - 1);
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
  perlinCache.set(key, buf);
  return buf;
}

/** Узел источника модуляции по её виду. */
function makeModSource(ctx: BaseAudioContext, m: Mod): AudioScheduledSourceNode {
  const source = m.source ?? 'lfo';
  if (source === 'sah' || source === 'perlin') {
    const src = ctx.createBufferSource();
    src.buffer = source === 'sah' ? makeSahBuffer(ctx, m.rate) : makePerlinBuffer(ctx, m.rate);
    src.loop = true;
    src.playbackRate.value = 1;
    return src;
  }
  const osc = ctx.createOscillator();
  osc.type = m.shape;
  osc.frequency.value = m.rate;
  return osc;
}

// Мастер-шумы: длинные лупы, чтобы период не слушался.
const masterNoiseCache = new Map<string, AudioBuffer>();
function masterNoiseBuffer(ctx: BaseAudioContext, kind: 'white' | 'pink'): AudioBuffer {
  const key = `${ctx.sampleRate}:${kind}`;
  let buf = masterNoiseCache.get(key);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 10);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else {
    // Розовый: фильтр Пола Келлета — равномерный спад -3 дБ/октаву.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
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
  masterNoiseCache.set(key, buf);
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

export function makeChain(ctx: BaseAudioContext, track: Track, dest: AudioNode): TrackChain {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = track.filterLow;
  hp.Q.value = 0.7;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = track.filterFreq;
  filter.Q.value = 0.8;
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
  const fx: FxNodes[] = [];
  let node: AudioNode = filter;
  for (const e of track.effects ?? []) {
    const sum = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    dry.gain.value = dryGain(e.mix);
    wet.gain.value = wetGain(e.mix);
    node.connect(dry);
    dry.connect(sum);
    node.connect(wet);
    wet.connect(sum);
    if (e.type === 'delay') {
      const delay = ctx.createDelay(2.5);
      delay.delayTime.value = e.timeSec;
      const feedback = ctx.createGain();
      feedback.gain.value = e.feedback;
      wet.connect(delay);
      delay.connect(sum);
      delay.connect(feedback);
      feedback.connect(delay);
      fx.push({ dry, wet, delay, feedback });
    } else if (e.type === 'dist' || e.type === 'lofi') {
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';
      shaper.curve = e.type === 'dist' ? distCurve(e.drive) : lofiCurve(e.bits);
      wet.connect(shaper);
      shaper.connect(sum);
      fx.push({ dry, wet, shaper });
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
      wet.connect(delay);
      delay.connect(sum);
      lfo.start(0);
      fx.push({ dry, wet, delay, lfo });
    } else {
      const conv = ctx.createConvolver();
      conv.buffer = getImpulse(ctx, e.sizeSec);
      wet.connect(conv);
      conv.connect(sum);
      fx.push({ dry, wet, convolver: conv });
    }
    node = sum;
  }
  node.connect(panner);
  const mods: ModNodes[] = track.mods.map((m) => {
    const src = makeModSource(ctx, m);
    const depth = ctx.createGain();
    depth.gain.value = modScale(m.target, m.depth, filter.frequency.value);
    src.connect(depth);
    let param: AudioParam | null = null;
    if (m.target === 'pan') param = panner.pan;
    else if (m.target === 'volume') param = gain.gain;
    else if (m.target === 'filterFreq') param = filter.frequency;
    else if (m.target === 'fxMix') param = fx[0]?.wet.gain ?? null;
    else if (m.target === 'fxTime') param = fx[0]?.delay?.delayTime ?? null;
    else if (m.target === 'fxFeedback') param = fx[0]?.feedback?.gain ?? null;
    if (param) depth.connect(param);
    src.start(0);
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
 *  Компрессор с нейтральными настройками при 0 — цепь стабильна,
 *  переключение без щелчков перестройки. */
export function connectMaster(
  ctx: BaseAudioContext,
  masterVolume: number,
  compAmount = 0,
): MasterNodes {
  const master = ctx.createGain();
  master.gain.value = 0.75 * masterVolume;
  // Мягкий лимитер: до 0.8 сигнал идеально линеен (ноль искажений),
  // выше — плавный tanh-пережим. Раньше кривая искажала сразу от нуля:
  // совпадение пиков баса и бочки звучало периодическим «тыком».
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const n = 2048;
  const curve = new Float32Array(n);
  const knee = 0.8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2; // диапазон входа [-2, 2]
    const ax = Math.abs(x);
    const y =
      ax <= knee ? ax : knee + (1 - knee) * Math.tanh((ax - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  shaper.curve = curve;
  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();
  master.connect(comp);
  comp.connect(makeup);
  makeup.connect(shaper);
  const masterPan = ctx.createStereoPanner();
  shaper.connect(masterPan);
  masterPan.connect(ctx.destination);
  const nodes: MasterNodes = {
    input: master,
    comp,
    makeup,
    setVolume: (v, at) => master.gain.setTargetAtTime(0.75 * v, at, 0.05),
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
): { src: AudioBufferSourceNode; gain: GainNode } {
  const src = ctx.createBufferSource();
  src.buffer = masterNoiseBuffer(ctx, kind);
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, level) * 0.12;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
  return { src, gain };
}
