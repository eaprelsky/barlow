// Аудио-движок: lookahead-планировщик (паттерн "A Tale of Two Clocks").
// UI-поток каждые 25 мс планирует ноты на 120 мс вперёд по часам
// AudioContext — стабильный тайминг без джиттера setInterval.
//
// Сцены (см. docs/DESIGN.md): сцена = какой паттерн играет каждый трек.
// Переходы квантованы к границе такта (16 тиков); в момент перехода часы
// каждого трека сбрасываются — паттерн новой сцены стартует с начала.
// Режимы: followChain — сцены идут по цепочке (арранжмент, циклично);
// ручной — текущая сцена держится до клика по другой.
//
// Голос (triggerVoice) отвязан от конкретного контекста: им же пользуется
// оффлайн-рендер в WAV через OfflineAudioContext.

import type { Effect, Mod, Note, Patch, Pattern, Scene, Step, Track } from '../types';
import { patternInScene, scaleOf } from '../types';
import { audioBufferToWav } from './wav';
import { getSampleBlob } from './library';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const BAR_TICKS = 16;

export function tickDuration(bpm: number): number {
  // Базовый тик = 1/16 при rate = 1.
  return 60 / bpm / 4;
}

/** Скорость шага: эскиз может переопределять шаг трека (как громкость/панораму). */
export function effectiveRate(track: Track, pattern: Pattern | undefined): number {
  return pattern?.rate ?? track.rate;
}

export function stepDuration(track: Track, bpm: number, pattern?: Pattern): number {
  return effectiveRate(track, pattern) * tickDuration(bpm);
}

export function startStepIndex(track: Track, pattern: Pattern): number {
  return ((track.phase % pattern.length) + pattern.length) % pattern.length;
}

// Позиция трека по часам от последнего сброса (смена сцены).
// Используется и движком, и playhead в UI — они не расходятся.
export function stepIndexAt(
  track: Track,
  pattern: Pattern,
  ctxTime: number,
  resetTime: number,
  bpm: number,
): number {
  const elapsed = ctxTime - resetTime;
  if (elapsed < 0) return -1;
  return (Math.floor(elapsed / stepDuration(track, bpm, pattern)) + track.phase) % pattern.length;
}

interface TrackClock {
  nextStepIndex: number;
  nextStepTime: number;
  resetTime: number;
}

interface ModNodes {
  src: AudioScheduledSourceNode;
  depth: GainNode;
}

interface FxNodes {
  dry: GainNode;
  wet: GainNode;
  delay?: DelayNode;
  feedback?: GainNode;
  convolver?: ConvolverNode;
  shaper?: WaveShaperNode;
  lfo?: OscillatorNode;
}

interface TrackChain {
  hp: BiquadFilterNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  // Гейт сайдчейна: живёт отдельно от gain, чтобы качаться поверх
  // эффективной громкости эскиза.
  duck: GainNode;
  mods: ModNodes[];
  fx: FxNodes[];
  // Сигнатура набора модуляций и эффектов: изменилась — цепочка пересобирается.
  modSig: string;
}

const modsSigOf = (mods: Mod[]) =>
  mods.map((m) => `${m.target}:${m.source ?? 'lfo'}:${m.shape}`).join(',');
const fxSigOf = (fx: Effect[]) => fx.map((e) => e.type).join(',');
// equal-power кроссфейд dry/wet — без провала громкости посередине.
const dryGain = (mix: number) => Math.cos((mix * Math.PI) / 2);
const wetGain = (mix: number) => Math.sin((mix * Math.PI) / 2);

// Процедурный impulse response для реверба: стереошумовое облако с
// экспоненциальным затуханием. Кэш общий для live и offline контекстов.
const irCache = new Map<string, AudioBuffer>();
function getImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
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

/** Слышимые эскизы сцены: мастер-выключатель дорожки глушит везде,
 *  мьют партии — на эскизе, соло сцены (эксклюзивное, привязано к дорожке —
 *  работает с любым эскизом трека) оставляет только свою дорожку. */
function audibleSet(patch: Patch, scene: Scene | undefined): Set<string> {
  const soloTrackId = scene?.soloTrackId;
  const out = new Set<string>();
  for (const t of patch.tracks) {
    if (t.enabled === false) continue;
    const p = patternInScene(t, scene);
    if (!p || p.muted) continue;
    if (!soloTrackId || t.id === soloTrackId) out.add(p.id);
  }
  return out;
}

/** Эскиз может переопределять ручки трека (громкость/панорама/модуляции). */
export function effectiveParams(track: Track, pattern: Pattern | undefined) {
  return {
    volume: pattern?.volume ?? track.volume,
    pan: pattern?.pan ?? track.pan,
    mods: pattern?.mods ?? track.mods,
  };
}

/** Масштаб глубины модуляции. Фильтр качается октавно (×2.5 от базы,
 *  не меньше ±1800 Гц) — вобблеру нужен размах от глухого до звонкого. */
function modScale(target: string, depth: number, filterBase = 1000): number {
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
function duckSidechain(
  duck: GainNode,
  at: number,
  sc: { amount: number; releaseSec: number },
): void {
  duck.gain.setTargetAtTime(1 - sc.amount, at, 0.006);
  duck.gain.setTargetAtTime(1, at + 0.05, Math.max(0.02, sc.releaseSec / 3));
}

/** Ноты, сработавшие в этом проходе (вероятность — у каждой ноты своя). */
function liveNotes(step: Step): Note[] {
  return step.notes.filter((nt) => Math.random() < nt.prob);
}

/** Нормализация сэмплов к одинаковой громкости: ИИ и библиотечные файлы
 *  приходят с разным уровнем (обычно с большим запасом). Цель — RMS ≈ -16 dBFS
 *  с потолком пика 0.95; тихие поднимаем, громкие не трогаем. */
function normalizeBuffer(buf: AudioBuffer): void {
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sumSq += d[i] * d[i];
      count++;
    }
  }
  if (count === 0 || peak === 0) return;
  const rms = Math.sqrt(sumSq / count);
  const gain = Math.min(0.95 / peak, 0.16 / rms, 8);
  if (gain <= 1.01) return;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
}

function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Karplus-Strong: струна = шумовое возбуждение в короткой задержке с
// усреднением и затуханием в петле. Графовые циклы Web Audio требуют
// задержку ≥ блока рендера (128 сэмплов ≈ 344 Гц потолок), поэтому струну
// считаем в буфер синхронно — работает для любых частот и одинаково
// в live и офлайн-рендере. Кэш: частоты нот конечны, hit почти всегда.
const ksCache = new Map<string, AudioBuffer>();
function karplusBuffer(
  ctx: BaseAudioContext,
  freq: number,
  lifeSec: number,
  lenSec: number,
): AudioBuffer {
  const key = `${ctx.sampleRate}:${freq.toFixed(1)}:${lifeSec.toFixed(2)}:${Math.ceil(lenSec * 20)}`;
  let buf = ksCache.get(key);
  if (buf) return buf;
  if (ksCache.size > 256) ksCache.clear();
  const sr = ctx.sampleRate;
  const n = Math.max(2, Math.round(sr / freq));
  const len = Math.max(2 * n, Math.floor(sr * lenSec));
  buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  for (let i = 0; i < n; i++) out[i] = Math.random() * 2 - 1;
  // Усиление петли под T60 = lifeSec: за период амплитуда падает в g раз,
  // 6.9078 = ln(1000) — путь до −60 дБ.
  const g = Math.exp((-6.9078 * n) / (sr * Math.max(0.05, lifeSec)));
  for (let i = n; i < len; i++) {
    out[i] = g * 0.5 * (out[i - n] + out[i - n + 1]);
  }
  ksCache.set(key, buf);
  return buf;
}

// Аддитивные модели (гармоники, орган): массив амплитуд гармоник →
// PeriodicWave с кэшем (морф квантуется в ступени — попаданий много).
const waveCache = new Map<string, PeriodicWave>();
function harmonicWave(ctx: BaseAudioContext, amps: number[]): PeriodicWave {
  const key = `${ctx.sampleRate}:${amps.map((a) => a.toFixed(4)).join(',')}`;
  let w = waveCache.get(key);
  if (!w) {
    const imag = new Float32Array(amps.length + 1);
    for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
    w = ctx.createPeriodicWave(new Float32Array(amps.length + 1), imag, {
      disableNormalization: false,
    });
    if (waveCache.size > 128) waveCache.clear();
    waveCache.set(key, w);
  }
  return w;
}

// Вокальные форманты: пять гласных (F1, F2, F3), морф их интерполирует.
const VOWELS: [number, number, number][] = [
  [800, 1150, 2800], // А
  [500, 1900, 2550], // Э
  [280, 2250, 2890], // И
  [550, 950, 2400], // О
  [350, 800, 2300], // У
];
function vowelOf(m: number): [number, number, number] {
  const pos = Math.min(0.9999, Math.max(0, m)) * (VOWELS.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = VOWELS[i];
  const b = VOWELS[i + 1];
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * frac) as [number, number, number];
}

// Модальные партиалы: маримба → колокол, морф их интерполирует.
const PARTIALS_A = [1, 3.9, 9.2, 13.4];
const PARTIALS_B = [1, 2.32, 4.25, 6.63];

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

/** Кривая перегруза: tanh(drive·x)/tanh(drive) — мягкое насыщение. */
function distCurve(drive: number): Float32Array<ArrayBuffer> {
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
function lofiCurve(bits: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(n);
  const levels = Math.pow(2, bits) - 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(((x + 1) / 2) * levels) / levels * 2 - 1;
  }
  return curve;
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

interface MasterNodes {
  input: GainNode;
  comp: DynamicsCompressorNode;
  makeup: GainNode;
  setVolume: (v: number, at: number) => void;
  setComp: (v: number, at: number) => void;
  setPan: (v: number, at: number) => void;
}

function makeChain(ctx: BaseAudioContext, track: Track, dest: AudioNode): TrackChain {
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
    mods,
    fx,
    modSig: `${modsSigOf(track.mods)}|${fxSigOf(track.effects ?? [])}`,
  };
}

function disposeChain(chain: TrackChain): void {
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
}

/** Мастер: громкость → компрессия (плотность 0..1) → мягкий tanh-лимитер.
 *  Компрессор с нейтральными настройками при 0 — цепь стабильна,
 *  переключение без щелчков перестройки. */
function connectMaster(ctx: BaseAudioContext, masterVolume: number, compAmount = 0): MasterNodes {
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
function connectMasterNoise(
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

// Скрэтч-модуль: загружается один раз на контекст (live и offline).
const scratchLoaded = new WeakSet<BaseAudioContext>();
async function ensureScratchModule(ctx: BaseAudioContext): Promise<void> {
  if (scratchLoaded.has(ctx)) return;
  await ctx.audioWorklet.addModule('/scratch-worklet.js');
  scratchLoaded.add(ctx);
}

/** Моно-канал сэмпла для скрэтч-иглы (worklet моно, до панорамы). */
function monoChannel(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

function makeScratchNode(ctx: BaseAudioContext, sample: AudioBuffer): AudioWorkletNode {
  const node = new AudioWorkletNode(ctx, 'barlow-scratch', { outputChannelCount: [1] });
  node.port.postMessage({ type: 'buffer', samples: monoChannel(sample) });
  return node;
}

interface Voice {
  amp: GainNode;
  // Осцилляторы/источники со stop, плюс скрэтч-worklet (гасится off-расписанием).
  sources: (AudioScheduledSourceNode | AudioWorkletNode)[];
  stopAt: number;
}

/** Мягко заглушить голос (моно-retrigger): плавный релиз без обрыва. */
function duckVoice(v: Voice, t: number): void {
  v.amp.gain.setTargetAtTime(0.00001, t, 0.004);
  for (const s of v.sources) {
    const sched = s as AudioScheduledSourceNode;
    if (typeof sched.stop !== 'function') {
      // worklet: гасим off-параметром — узел завершит себя
      const off = (s as AudioWorkletNode).parameters?.get('off');
      if (off) off.setValueAtTime(1, t + 0.06);
      continue;
    }
    try {
      sched.stop(t + 0.06);
    } catch {
      /* уже остановлен */
    }
  }
}

/** Гранулярное облако: нота = равномерная россыпь Ханн-окошек из сэмпла.
 *  Питч зерна — из строки стана (аккорд = зёрна разных нот вперемешку),
 *  позиция — вокруг grainPos ± разброс. Возвращает конец последнего зерна. */
function scheduleGrainCloud(
  ctx: BaseAudioContext,
  amp: GainNode,
  sample: AudioBuffer,
  track: Track,
  rows: number[],
  notes: Note[],
  time: number,
  peak: number,
  sources: (AudioScheduledSourceNode | AudioWorkletNode)[],
  baseLenSec: number,
): number {
  // Гейт в облаке общий: облако тянется по самой длинной ноте шага.
  const gMax = Math.max(1, ...notes.map((nt) => clampNum(nt.gate ?? 1, 0.1, 4)));
  const dur = Math.max(0.05, baseLenSec * gMax);
  const sizeSec = clampNum((track.grainSizeMs ?? 120) / 1000, 0.01, sample.duration);
  const pos = clampNum(track.grainPos ?? 0.3, 0, 1);
  const scatter = clampNum(track.grainScatter ?? 0.15, 0, 1);
  const perNote = Math.round(clampNum(track.grainCount ?? 10, 1, 32));
  const total = Math.min(64, perNote * notes.length);
  const per = Math.max(1, Math.round(total / notes.length));
  const stepT = dur / per;
  // Ханн-окна наполовину перекрываются — суммарная громкость растёт как
  // √числа зёрен, компенсируем корнем и держим запас под лимитер.
  const grainAmp = (peak * 1.4) / Math.sqrt(total);
  const max = rows.length - 1;
  let lastEnd = time;
  // Вибрато на скорости зёрен: один LFO на всё облако.
  let vibLfo: OscillatorNode | null = null;
  let vibG: GainNode | null = null;
  if ((track.vibratoDepth ?? 0) > 0) {
    vibLfo = ctx.createOscillator();
    vibLfo.frequency.value = track.vibratoRate ?? 5;
    vibG = ctx.createGain();
    vibG.gain.value = (track.vibratoDepth ?? 0) / 1200;
    vibLfo.connect(vibG);
    vibLfo.start(time);
    sources.push(vibLfo);
  }
  for (let g = 0; g < per; g++) {
    const t0 = time + g * stepT;
    // Небольшой джиттер стартов: чисто периодическая россыпь даёт слышимый
    // паразитный тон на частоте 1/шага.
    const at = Math.max(time, t0 + (Math.random() - 0.5) * stepT * 0.4);
    for (const nt of notes) {
      const ratio = rows[Math.min(Math.max(Math.round(nt.n), 0), max)] ?? 1;
      const center = clampNum(pos + (Math.random() * 2 - 1) * scatter * 0.5, 0, 1);
      // Окно должно поместиться в буфер с учётом скорости воспроизведения.
      const room = Math.max(0, sample.duration - sizeSec * ratio - 0.001);
      const offset = center * room;
      const src = ctx.createBufferSource();
      src.buffer = sample;
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        src.playbackRate.setValueAtTime(ratio * track.pitchDrop, at);
        src.playbackRate.exponentialRampToValueAtTime(ratio, at + track.pitchTime);
      } else {
        src.playbackRate.value = ratio;
      }
      // Ханн-окно: линейные рампы вверх-вниз по половине зерна.
      const gAmp = ctx.createGain();
      gAmp.gain.setValueAtTime(0, at);
      gAmp.gain.linearRampToValueAtTime(grainAmp * nt.vel, at + sizeSec / 2);
      gAmp.gain.linearRampToValueAtTime(0, at + sizeSec);
      if (vibG) vibG.connect(src.playbackRate);
      src.connect(gAmp);
      gAmp.connect(amp);
      src.start(at, offset, sizeSec * ratio + 0.02);
      src.stop(at + sizeSec + 0.02);
      sources.push(src);
      lastEnd = Math.max(lastEnd, at + sizeSec);
    }
  }
  // Огибающая облака ровная: форму дают сами Ханн-окна, от amp нужны
  // только мягкий старт и общий спад в конце.
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + Math.min(0.02, dur * 0.2));
  amp.gain.setValueAtTime(peak, time + dur);
  amp.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.01);
  // Вибрато-LFO облака останавливается вместе с последним зерном.
  if (vibLfo) vibLfo.stop(lastEnd + 0.06);
  return lastEnd + 0.05;
}

function triggerVoice(
  ctx: BaseAudioContext,
  chain: TrackChain,
  noise: AudioBuffer,
  sample: AudioBuffer | null,
  track: Track,
  notes: Note[],
  time: number,
  stepSec: number,
): Voice {
  if (notes.length === 0) return { amp: ctx.createGain(), sources: [], stopAt: time };
  const rows = scaleOf(track);
  const freqs = notes.map((nt) => {
    const idx = Math.min(Math.max(Math.round(nt.n), 0), rows.length - 1);
    return track.freq * (rows[idx] ?? 1);
  });
  // Аккорд делим поровну между нотами — вертикаль не громче одиночной ноты
  // (главный источник клиппинга), и держим запас под мастер-лимитер.
  // Готовый сэмпл уже мастерен — ему запас осцилляторов не нужен.
  const headroom = track.waveform === 'sample' ? 0.95 : 0.55;
  const topVel = Math.max(...notes.map((nt) => nt.vel));
  const peak = Math.max(0.0001, (topVel * headroom) / notes.length);
  const amp = ctx.createGain();
  amp.connect(chain.hp);
  const sources: (AudioScheduledSourceNode | AudioWorkletNode)[] = [];

  // Вибрато: один LFO на голос, ветки с нужным масштабом (центы — на
  // detune осцилляторов; доли скорости — на playbackRate сэмплов).
  const vibDepth = track.vibratoDepth ?? 0;
  let vibOut: GainNode | null = null;
  const vibBus = (scale: number): GainNode | null => {
    if (vibDepth <= 0 || scale === 0) return null;
    if (!vibOut) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = track.vibratoRate ?? 5;
      vibOut = ctx.createGain();
      lfo.connect(vibOut);
      lfo.start(time);
      lfo.stop(stopAt);
      sources.push(lfo);
    }
    const g = ctx.createGain();
    g.gain.value = vibDepth * scale;
    vibOut.connect(g);
    return g;
  };

  if (track.waveform === 'sample' && (track.sampleMode ?? 'plain') === 'grain') {
    if (!sample) return { amp, sources, stopAt: time };
    const baseLenG =
      track.noteSteps && track.noteSteps > 0 ? track.noteSteps * stepSec : track.attack + track.decay;
    const lastEnd = scheduleGrainCloud(ctx, amp, sample, track, rows, notes, time, peak, sources, baseLenG);
    return { amp, sources, stopAt: lastEnd };
  }

  // Мгновенная атака = скачок = щелчок; минимальный пологий фронт обязателен.
  // На низких нотах фронт масштабируем периодом волны: четверть периода
  // самой низкой ноты убирает широкополосный «прищёлк» у баса, панч сохраняя.
  const lowestPeriod = 1 / Math.min(...freqs);
  const attack = Math.max(track.attack, Math.min(0.25 * lowestPeriod, 0.012));

  // Длина ноты: по умолчанию — огибающая трека (атака + спад); при
  // noteSteps — привязка к сетке инструмента (шаг эскиза × темп), тогда
  // тягучесть не едет при смене темпа. Гейт ноты умножает сверху.
  const gates = notes.map((nt) => clampNum(nt.gate ?? 1, 0.1, 4));
  const maxGate = Math.max(1, ...gates);
  const baseLen =
    track.noteSteps && track.noteSteps > 0
      ? track.noteSteps * stepSec
      : attack + track.decay;
  const voiceLen = baseLen * maxGate;
  const noteGainOf = (i: number): GainNode | null => {
    if (gates[i] >= maxGate - 1e-9) return null;
    const ng = ctx.createGain();
    const end = Math.max(time + 0.03, time + baseLen * gates[i]);
    ng.gain.setValueAtTime(1, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, end);
    ng.connect(amp);
    return ng;
  };
  /** Куда подключать источник ноты i: через её гейт-гейн или сразу в amp. */
  const noteDest = (i: number): AudioNode => noteGainOf(i) ?? amp;
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + voiceLen);
  const stopAt = time + voiceLen + 0.05;

  if (track.waveform === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.connect(amp);
    src.start(time, Math.random() * 1.5, stopAt - time);
    src.stop(stopAt);
    sources.push(src);
  } else if (track.waveform === 'sample' && (track.sampleMode ?? 'plain') === 'scratch') {
    // Скрэтч: игла worklet-процессора читает сэмпл по позиции, позиция
    // автоматизируется жестом (ломаная t→pos). Питч из стана не действует —
    // скорость задаёт наклон жеста.
    if (!sample) return { amp, sources, stopAt };
    const node = makeScratchNode(ctx, sample);
    const pos = node.parameters.get('position')!;
    const off = node.parameters.get('off')!;
    const points = (track.scratchPoints ?? []).slice().sort((a, b) => a.t - b.t);
    if (points.length === 0) {
      pos.setValueAtTime(0, time);
      pos.linearRampToValueAtTime(1, time + voiceLen);
    } else {
      pos.setValueAtTime(points[0].pos, time);
      for (const pt of points) {
        pos.linearRampToValueAtTime(pt.pos, time + Math.max(0, Math.min(1, pt.t)) * voiceLen);
      }
    }
    off.setValueAtTime(0, time);
    off.setValueAtTime(1, stopAt + 0.1);
    // Скрэтчу нужна огибающая с плато: жесТ слышен всю ноту, а не затухает
    // экспонентой к середине (общая амплитудная рампа здесь неприменима).
    amp.gain.cancelScheduledValues(time);
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(peak, time + Math.min(0.01, voiceLen * 0.1));
    amp.gain.setValueAtTime(peak, time + voiceLen * 0.88);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + voiceLen);
    node.connect(amp);
    sources.push(node);
  } else if (track.waveform === 'sample') {
    // Сэмпл-плеер: шкала задаёт скорость воспроизведения (питч),
    // длина ноты — как всегда, атакой и спадом.
    if (!sample) return { amp, sources, stopAt };
    const max = rows.length - 1;
    notes.forEach((nt, ni) => {
      const ratio = rows[Math.min(Math.max(Math.round(nt.n), 0), max)] ?? 1;
      const src = ctx.createBufferSource();
      src.buffer = sample;
      // Падение тона на сэмпле — рампой скорости воспроизведения:
      // «бочка из сэмпла» собирается прямо в слоте.
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        src.playbackRate.setValueAtTime(ratio * track.pitchDrop, time);
        src.playbackRate.exponentialRampToValueAtTime(ratio, time + track.pitchTime);
      } else {
        src.playbackRate.value = ratio;
      }
      const vbS = vibBus(1 / 1200);
      if (vbS) vbS.connect(src.playbackRate);
      src.connect(noteDest(ni));
      src.start(time);
      src.stop(stopAt);
      sources.push(src);
    });
  } else if (track.waveform === 'karplus') {
    // Струна: каждая нота — свой буфер (кэш по частоте и затуханию).
    freqs.forEach((f, fi) => {
      const len = Math.min(4, voiceLen + 0.05);
      const src = ctx.createBufferSource();
      src.buffer = karplusBuffer(ctx, f, track.ksLife ?? 2.5, len);
      src.connect(noteDest(fi));
      src.start(time);
      src.stop(stopAt);
      sources.push(src);
    });
  } else if (track.waveform === 'fm') {
    // Классический FM: синусная несущая, синусный модулятор в её частоту.
    // Девиация = индекс × частота модулятора; индекс тает к хвосту ноты —
    // яркая атака, спокойное послезвучие (как у FM-пиано).
    const ratio = track.fmRatio ?? 2;
    const index = track.fmIndex ?? 3;
    freqs.forEach((f, fi) => {
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      const modGain = ctx.createGain();
      const dev = index * f * ratio;
      modGain.gain.setValueAtTime(dev, time);
      modGain.gain.setTargetAtTime(0, time + attack, Math.max(0.02, track.decay * 0.4));
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      // Падение тона тянет обе частоты, сохраняя отношение.
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        carrier.frequency.setValueAtTime(f * track.pitchDrop, time);
        carrier.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime);
        mod.frequency.setValueAtTime(f * track.pitchDrop * ratio, time);
        mod.frequency.exponentialRampToValueAtTime(f * ratio, time + track.pitchTime);
      } else {
        carrier.frequency.setValueAtTime(f, time);
        mod.frequency.setValueAtTime(f * ratio, time);
      }
      const vbF = vibBus(1);
      if (vbF) vbF.connect(carrier.detune);
      carrier.connect(noteDest(fi));
      mod.start(time);
      carrier.start(time);
      mod.stop(stopAt);
      carrier.stop(stopAt);
      sources.push(carrier, mod);
    });
  } else if (track.waveform === 'supersaw') {
    // Супер-пила: расстроенный унисон из семи пил, морф = ширина расстройки.
    const detune = 4 + (track.voiceMorph ?? 0.5) * 36; // центов на крайнем голосе
    const voices = [
      { det: 0, gain: 1 },
      { det: -detune * 0.33, gain: 0.7 },
      { det: detune * 0.33, gain: 0.7 },
      { det: -detune * 0.66, gain: 0.5 },
      { det: detune * 0.66, gain: 0.5 },
      { det: -detune, gain: 0.32 },
      { det: detune, gain: 0.32 },
    ];
    const norm = voices.reduce((sum, v) => sum + v.gain, 0);
    freqs.forEach((f, fi) => {
      for (const v of voices) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = v.det;
        if (track.pitchDrop > 1 && track.pitchTime > 0) {
          osc.frequency.setValueAtTime(f * track.pitchDrop, time);
          osc.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime);
        } else {
          osc.frequency.setValueAtTime(f, time);
        }
        const g = ctx.createGain();
        g.gain.value = v.gain / norm;
        const vbSS = vibBus(1);
        if (vbSS) vbSS.connect(osc.detune);
        osc.connect(g);
        g.connect(noteDest(fi));
        osc.start(time);
        osc.stop(stopAt);
        sources.push(osc);
      }
    });
  } else if (track.waveform === 'additive' || track.waveform === 'organ') {
    // Гармоники: морф = число гармоник (2..16, спад k^-1.5).
    // Орган: регистры-унисоны 1,2,3,4,6,8; морф открывает их по одному.
    const m = track.voiceMorph ?? 0.5;
    let amps: number[];
    if (track.waveform === 'organ') {
      const regs = [1, 2, 3, 4, 6, 8];
      const full = new Array<number>(regs[regs.length - 1] + 1).fill(0);
      regs.forEach((r, i) => {
        full[r] = Math.max(0.15, Math.min(1, m * regs.length * 1.15 - i));
      });
      amps = full.slice(1);
    } else {
      const n = 2 + Math.round(m * 14);
      amps = Array.from({ length: n }, (_, i) => Math.pow(i + 1, -1.5));
    }
    const wave = harmonicWave(ctx, amps);
    freqs.forEach((f, fi) => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        osc.frequency.setValueAtTime(f * track.pitchDrop, time);
        osc.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime);
      } else {
        osc.frequency.setValueAtTime(f, time);
      }
      const vbA = vibBus(1);
      if (vbA) vbA.connect(osc.detune);
      osc.connect(noteDest(fi));
      osc.start(time);
      osc.stop(stopAt);
      sources.push(osc);
    });
  } else if (track.waveform === 'formant') {
    // Вокал: пила сквозь три формантных полосовых фильтра — гласная
    // не зависит от высоты ноты, морф едет А → Э → И → О → У.
    const [f1, f2, f3] = vowelOf(track.voiceMorph ?? 0.5);
    freqs.forEach((f, fi) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        osc.frequency.setValueAtTime(f * track.pitchDrop, time);
        osc.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime);
      } else {
        osc.frequency.setValueAtTime(f, time);
      }
      const vbV = vibBus(1);
      if (vbV) vbV.connect(osc.detune);
      // Немного сухой пилы — тело голоса под формантами.
      const dry = ctx.createGain();
      dry.gain.value = 0.12;
      osc.connect(dry);
      dry.connect(noteDest(fi));
      (
        [
          [f1, 10, 1],
          [f2, 12, 0.55],
          [f3, 14, 0.3],
        ] as [number, number, number][]
      ).forEach(([ff, q, level]) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = level;
        osc.connect(bp);
        bp.connect(g);
        g.connect(noteDest(fi));
      });
      osc.start(time);
      osc.stop(stopAt);
      sources.push(osc);
    });
  } else if (track.waveform === 'modal') {
    // Колокол/маримба: шумовой щелчок в банк параллельных резонаторов.
    // Морф = материал (частоты партиалов) и время звона (Q).
    const m = track.voiceMorph ?? 0.5;
    const q0 = 30 + m * 130;
    freqs.forEach((f, fi) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      PARTIALS_A.forEach((pa, i) => {
        const ratio = pa + (PARTIALS_B[i] - pa) * m;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.min(f * ratio, 17000);
        bp.Q.value = q0 / (1 + i * 0.55);
        const g = ctx.createGain();
        g.gain.value = 0.9 / (i + 1);
        src.connect(bp);
        bp.connect(g);
        g.connect(noteDest(fi));
      });
      src.start(time, Math.random() * 1.5, 0.004);
      src.stop(time + 0.02);
      sources.push(src);
    });
  } else {
    // Аккорд: по осциллятору на ноту, огибающая общая.
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = track.waveform;
      // Падение тона: нота стартует выше тоники и слетает вниз —
      // так рождается бочка. При pitchDrop = 1 рампа вырождается.
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        osc.frequency.setValueAtTime(f * track.pitchDrop, time);
        osc.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime);
      } else {
        osc.frequency.setValueAtTime(f, time);
      }
      const vbO = vibBus(1);
      if (vbO) vbO.connect(osc.detune);
      osc.connect(noteDest(freqs.indexOf(f)));
      osc.start(time);
      osc.stop(stopAt);
      sources.push(osc);
    }
  }
  return { amp, sources, stopAt };
}

function validSceneId(patch: Patch | null, want: string): string {
  const scenes = patch?.scenes ?? [];
  return scenes.some((s) => s.id === want) ? want : (scenes[0]?.id ?? '');
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: MasterNodes | null = null;
  // Слой мастер-шума (после лимитера) и его текущий вид. Живёт только
  // пока движок играет — на стопе глушится.
  private noiseLayer: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private noiseKind = '';
  private noiseBuffer: AudioBuffer | null = null;
  private chains = new Map<string, TrackChain>();
  private clocks = new Map<string, TrackClock>();
  private timer: number | null = null;
  private patch: Patch | null = null;
  private startAt = 0;
  // Декодированные сэмплы библиотеки, id → AudioBuffer.
  private sampleCache = new Map<string, AudioBuffer>();
  // Последний голос моно-трека — глушится при новой ноте.
  private lastVoices = new Map<string, Voice>();
  private sceneId = '';
  private pendingSceneId = '';
  private chainPos = 0;
  private manualMode = true;
  private sceneAdvanceTime: number | null = null;

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Сцена, которая звучит прямо сейчас (UI подсвечивает её). */
  get currentSceneId(): string {
    return this.sceneId;
  }

  /** Позиция в цепочке (для подсветки арранжмента). */
  get currentChainPos(): number {
    return this.chainPos;
  }

  /** Актуальное время аудио-часов — для расчёта playhead в UI. */
  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get startTime(): number {
    return this.startAt;
  }

  /** Часы трека (resetTime нужен playhead'у). */
  clockOf(trackId: string): TrackClock | undefined {
    return this.clocks.get(trackId);
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = connectMaster(this.ctx, 1, this.patch?.masterComp ?? 0);
      this.noiseBuffer = makeNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  private applyMasterVolume(v: number): void {
    if (this.ctx && this.master) {
      this.master.setVolume(v, this.ctx.currentTime);
    }
  }

  private stopNoiseLayer(): void {
    if (!this.noiseLayer) return;
    try {
      this.noiseLayer.src.stop();
    } catch {
      /* уже остановлен */
    }
    this.noiseLayer.src.disconnect();
    this.noiseLayer.gain.disconnect();
    this.noiseLayer = null;
    this.noiseKind = '';
  }

  /** Слой мастер-шума и компрессия следуют за патчем (без перестроения).
   *  Шум звучит только пока играем: на стопе слой глушится. */
  private applyMasterFx(patch: Patch): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.setComp(patch.masterComp ?? 0, ctx.currentTime);
    this.master.setPan(patch.masterPan ?? 0.5, ctx.currentTime);
    const kind = patch.masterNoise ?? 'off';
    if (kind === 'off') {
      this.stopNoiseLayer();
      return;
    }
    if (!this.playing) {
      this.stopNoiseLayer();
      return;
    }
    if (kind === this.noiseKind && this.noiseLayer) {
      this.noiseLayer.gain.gain.setTargetAtTime(
        Math.max(0, patch.masterNoiseLevel ?? 0.03) * 0.12,
        ctx.currentTime,
        0.1,
      );
      return;
    }
    this.stopNoiseLayer();
    this.noiseLayer = connectMasterNoise(ctx, kind, patch.masterNoiseLevel ?? 0.03);
    this.noiseKind = kind;
  }

  /** Декодировать сэмплы, на которые ссылается патч (идемпотентно). */
  async ensureSamples(patch: Patch): Promise<void> {
    const ctx = this.ensureCtx();
    await ensureScratchModule(ctx);
    for (const track of patch.tracks) {
      if (track.waveform !== 'sample' || !track.sampleId) continue;
      if (this.sampleCache.has(track.sampleId)) continue;
      const blob = await getSampleBlob(track.sampleId);
      if (!blob) continue;
      try {
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        normalizeBuffer(buf);
        this.sampleCache.set(track.sampleId, buf);
      } catch {
        // Битый формат — молча пропускаем, трек будет просто молчать.
      }
    }
  }

  /** Обновить данные патча без остановки: движок читает их на каждом шаге.
   *  Параметры цепочек применяет scheduler — ему известен активный эскиз. */
  setPatch(patch: Patch): void {
    this.patch = patch;
    this.applyMasterVolume(patch.masterVolume);
    this.applyMasterFx(patch);
    if (!this.ctx) return;
    const alive = new Set(patch.tracks.map((t) => t.id));
    for (const [id, chain] of this.chains) {
      if (!alive.has(id)) {
        disposeChain(chain);
        this.chains.delete(id);
        this.clocks.delete(id);
        this.lastVoices.delete(id);
      }
    }
  }

  private duckLastVoice(trackId: string, t: number): void {
    const prev = this.lastVoices.get(trackId);
    if (prev && prev.stopAt > t) duckVoice(prev, t);
    this.lastVoices.delete(trackId);
  }

  /** Применить эффективные параметры эскиза к цепочке трека.
   *  Смена набора модуляций пересобирает цепочку (хвосты нот обрываются —
   *  сознательно, как стоп клипа). */
  private applyTrackParams(
    trackId: string,
    chain: TrackChain,
    track: Track,
    eff: { volume: number; pan: number; mods: Mod[] },
  ): TrackChain {
    const ctx = this.ctx;
    if (!ctx || !this.master) return chain;
    const t0 = ctx.currentTime;
    const sig = `${modsSigOf(eff.mods)}|${fxSigOf(track.effects ?? [])}`;
    if (chain.modSig !== sig) {
      disposeChain(chain);
      const fresh = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master.input);
      this.chains.set(trackId, fresh);
      return fresh;
    }
    chain.hp.frequency.setTargetAtTime(track.filterLow, t0, 0.03);
    chain.filter.frequency.setTargetAtTime(track.filterFreq, t0, 0.03);
    chain.panner.pan.setTargetAtTime(eff.pan * 2 - 1, t0, 0.03);
    chain.gain.gain.setTargetAtTime(eff.volume, t0, 0.03);
    eff.mods.forEach((m, i) => {
      const nodes = chain.mods[i];
      if (!nodes) return;
      const freqParam = (nodes.src as OscillatorNode).frequency;
      if (freqParam) freqParam.setTargetAtTime(m.rate, t0, 0.05);
      nodes.depth.gain.setTargetAtTime(
        modScale(m.target, m.depth, chain.filter.frequency.value),
        t0,
        0.05,
      );
    });
    (track.effects ?? []).forEach((e, i) => {
      const n = chain.fx[i];
      if (!n) return;
      n.dry.gain.setTargetAtTime(dryGain(e.mix), t0, 0.03);
      n.wet.gain.setTargetAtTime(wetGain(e.mix), t0, 0.03);
      if (e.type === 'delay') {
        n.delay?.delayTime.setTargetAtTime(e.timeSec, t0, 0.05);
        n.feedback?.gain.setTargetAtTime(e.feedback, t0, 0.05);
      } else if (e.type === 'reverb' && n.convolver) {
        const ir = getImpulse(ctx, e.sizeSec);
        if (n.convolver.buffer !== ir) n.convolver.buffer = ir;
      } else if (e.type === 'dist' && n.shaper) {
        n.shaper.curve = distCurve(e.drive);
      } else if (e.type === 'lofi' && n.shaper) {
        n.shaper.curve = lofiCurve(e.bits);
      } else if (e.type === 'chorus') {
        n.lfo?.frequency.setTargetAtTime(e.rate, t0, 0.05);
      }
    });
    return chain;
  }

  private validScene(want: string): string {
    return validSceneId(this.patch, want);
  }

  private scene(): Scene | undefined {
    return this.patch?.scenes.find((s) => s.id === this.sceneId);
  }

  private nextBarTime(from: number): number {
    const tickDur = tickDuration(this.patch!.bpm);
    const ticksNow = Math.max(0, (from - this.startAt) / tickDur);
    const nextBar = (Math.floor(ticksNow / BAR_TICKS) + 1) * BAR_TICKS;
    return this.startAt + nextBar * tickDur;
  }

  private scheduleSceneAdvance(t: number): void {
    const patch = this.patch!;
    if (patch.followChain && !this.manualMode) {
      const bars = patch.chain[this.chainPos]?.bars ?? 8;
      this.sceneAdvanceTime = t + bars * BAR_TICKS * tickDuration(patch.bpm);
    } else if (this.pendingSceneId) {
      this.sceneAdvanceTime = t + BAR_TICKS * tickDuration(patch.bpm);
    } else {
      this.sceneAdvanceTime = null;
    }
  }

  private applyNextScene(t: number): void {
    const patch = this.patch!;
    if (this.pendingSceneId) {
      this.sceneId = this.validScene(this.pendingSceneId);
      this.pendingSceneId = '';
    } else if (patch.followChain && !this.manualMode) {
      this.chainPos = (this.chainPos + 1) % Math.max(1, patch.chain.length);
      this.sceneId = this.validScene(patch.chain[this.chainPos]?.sceneId ?? '');
    }
    // Часы треков стартуют заново с паттерном новой сцены.
    const scene = this.scene();
    for (const track of patch.tracks) {
      const clock = this.clocks.get(track.id);
      if (!clock) continue;
      const pattern = patternInScene(track, scene);
      clock.nextStepTime = t;
      clock.resetTime = t;
      clock.nextStepIndex = pattern ? startStepIndex(track, pattern) : 0;
    }
    this.scheduleSceneAdvance(t);
  }

  play(patch: Patch, sceneId: string): void {
    this.stop();
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    this.patch = patch;
    this.setPatch(patch);
    this.sceneId = this.validScene(sceneId);
    this.pendingSceneId = '';
    this.manualMode = !patch.followChain;
    const pos = patch.chain.findIndex((it) => it.sceneId === this.sceneId);
    this.chainPos = pos >= 0 ? pos : 0;
    this.startAt = ctx.currentTime + 0.1;
    const scene = this.scene();
    for (const track of patch.tracks) {
      const pattern = patternInScene(track, scene);
      this.clocks.set(track.id, {
        nextStepIndex: pattern ? startStepIndex(track, pattern) : 0,
        nextStepTime: this.startAt,
        resetTime: this.startAt,
      });
    }
    if (patch.followChain && !this.manualMode) {
      const bars = patch.chain[this.chainPos]?.bars ?? 8;
      this.sceneAdvanceTime = this.startAt + bars * BAR_TICKS * tickDuration(patch.bpm);
    } else {
      this.sceneAdvanceTime = null;
    }
    this.applyMasterFx(patch);
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    this.scheduler();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.stopNoiseLayer();
    this.clocks.clear();
    this.lastVoices.clear();
    this.pendingSceneId = '';
    this.sceneAdvanceTime = null;
  }

  // ---- Ручной скрэтч-пэд: игла под мышью, вне планировщика ----

  private scratchNode: AudioWorkletNode | null = null;

  /** Начать ручной скрэтч: игла с заданной позиции. Без играющего
   *  транспорта звук идёт прямо в мастер — запись жеста всегда слышна. */
  scratchBegin(track: Track, pos0 = 0): void {
    void (async () => {
      const patch = this.patch;
      if (!patch) return;
      await this.ensureSamples(patch);
      const ctx = this.ensureCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      const sample = track.sampleId ? this.sampleCache.get(track.sampleId) : undefined;
      const chain = this.chains.get(track.id);
      if (!sample || (!chain && !this.master)) return;
      const dest: AudioNode = chain ? chain.hp : this.master!.input;
      this.scratchEnd();
      const node = makeScratchNode(ctx, sample);
      const pos = node.parameters.get('position')!;
      const off = node.parameters.get('off')!;
      pos.setValueAtTime(pos0, ctx.currentTime);
      off.setValueAtTime(0, ctx.currentTime);
      node.connect(dest);
      this.scratchNode = node;
    })();
  }

  /** Игла едет за мышью. */
  scratchMove(pos: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.scratchNode) return;
    this.scratchNode.parameters
      .get('position')!
      // tau побольше: мышиные события ~8 мс, резкие цели дают дробность
      .setTargetAtTime(Math.min(1, Math.max(0, pos)), ctx.currentTime, 0.02);
  }

  /** Прослушать жест одной нотой: работает и без играющего транспорта —
   *  сэмпл догружается, при отсутствии цепочки трека звук идёт в мастер. */
  previewScratch(track: Track): void {
    void (async () => {
      const patch = this.patch;
      if (!patch) return;
      await this.ensureSamples(patch);
      const ctx = this.ensureCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      const sample = track.sampleId ? this.sampleCache.get(track.sampleId) : undefined;
      const chain = this.chains.get(track.id);
      if (!sample || (!chain && !this.master)) return;
      const dest: AudioNode = chain ? chain.hp : this.master!.input;
      const stepSec = stepDuration(track, patch.bpm, patternInScene(track, this.scene()));
      const len =
        track.noteSteps && track.noteSteps > 0
          ? track.noteSteps * stepSec
          : track.attack + track.decay;
      const node = makeScratchNode(ctx, sample);
      const pos = node.parameters.get('position')!;
      const off = node.parameters.get('off')!;
      const t0 = ctx.currentTime + 0.02;
      const points = (track.scratchPoints ?? []).slice().sort((x, y) => x.t - y.t);
      if (points.length === 0) {
        pos.setValueAtTime(0, t0);
        pos.linearRampToValueAtTime(1, t0 + len);
      } else {
        pos.setValueAtTime(points[0].pos, t0);
        for (const pt of points) pos.linearRampToValueAtTime(pt.pos, t0 + pt.t * len);
      }
      off.setValueAtTime(0, t0);
      off.setValueAtTime(1, t0 + len + 0.1);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(0.9, t0 + 0.005);
      amp.gain.setValueAtTime(0.9, t0 + len * 0.88);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      node.connect(amp);
      amp.connect(dest);
    })();
  }

  /** Отпустили: узел завершает себя по расписанию off. */
  scratchEnd(): void {
    const ctx = this.ctx;
    if (!ctx || !this.scratchNode) return;
    this.scratchNode.parameters.get('off')!.setValueAtTime(1, ctx.currentTime + 0.05);
    this.scratchNode = null;
  }

  private peaksCache = new Map<string, number[]>();

  /** Пики волны сэмпла (64 сегмента, нормированы в 0..1) — для мини-карты
   *  скрэтч-пэда: видно, где в сэмпле удары, где тишина. */
  async getSamplePeaks(id: string | undefined): Promise<number[] | null> {
    if (!id) return null;
    const cached = this.peaksCache.get(id);
    if (cached) return cached;
    const patch = this.patch;
    if (!patch) return null;
    await this.ensureSamples(patch);
    const buf = this.sampleCache.get(id);
    if (!buf) return null;
    const N = 64;
    const data = buf.getChannelData(0);
    const seg = Math.max(1, Math.floor(data.length / N));
    const step = Math.max(1, Math.floor(seg / 64));
    const peaks: number[] = [];
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let j = i * seg; j < (i + 1) * seg && j < data.length; j += step) {
        const v = Math.abs(data[j]);
        if (v > m) m = v;
      }
      peaks.push(m);
    }
    this.peaksCache.set(id, peaks);
    return peaks;
  }

  /** Ручное переключение сцены: применяется на ближайшей границе такта. */
  setScene(id: string): void {
    if (!this.playing || !this.ctx || !this.patch) return;
    if (!this.patch.scenes.some((s) => s.id === id)) return;
    if (id === this.sceneId && !this.pendingSceneId) {
      // Повторный клик по звучащей сцене ничего не меняет.
      if (this.sceneAdvanceTime === null) return;
    }
    this.pendingSceneId = id;
    this.manualMode = true; // ручное вмешательство выходит из цепочки
    this.sceneAdvanceTime = Math.max(
      this.ctx.currentTime + 0.03,
      this.nextBarTime(this.ctx.currentTime),
    );
  }

  /** Вход в режим цепочки / выход из него на ходу. */
  setFollowChain(on: boolean): void {
    if (!this.playing || !this.patch || !this.ctx) return;
    this.manualMode = !on;
    if (on) {
      this.pendingSceneId = '';
      const pos = this.patch.chain.findIndex((it) => it.sceneId === this.sceneId);
      this.chainPos = pos >= 0 ? pos : 0;
      // Текущая сцена доигрывает до границы такта, дальше ведёт цепочка.
      this.sceneAdvanceTime = Math.max(
        this.ctx.currentTime + 0.03,
        this.nextBarTime(this.ctx.currentTime),
      );
      const bars = this.patch.chain[this.chainPos]?.bars ?? 8;
      // Расчёт времени следующего перехода от границы такта.
      const t = this.sceneAdvanceTime;
      this.sceneAdvanceTime = t + bars * BAR_TICKS * tickDuration(this.patch.bpm);
    } else {
      this.sceneAdvanceTime = this.pendingSceneId ? this.sceneAdvanceTime : null;
    }
  }

  private scheduler(): void {
    const ctx = this.ctx;
    const patch = this.patch;
    if (!ctx || !patch || !this.noiseBuffer) return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;

    // Смены сцен внутри горизонта планирования.
    let guard = 0;
    while (this.sceneAdvanceTime !== null && this.sceneAdvanceTime < horizon && guard++ < 64) {
      this.applyNextScene(this.sceneAdvanceTime);
    }

    const scene = this.scene();
    const audible = audibleSet(patch, scene);
    for (const track of patch.tracks) {
      const pattern = patternInScene(track, scene);
      if (!pattern) continue;
      // Трек, добавленный на ходу, вливается с ближайшего мгновения —
      // лайв-джем: набросал дорожку поверх играющего микса.
      let clock = this.clocks.get(track.id);
      if (!clock) {
        const t = Math.max(ctx.currentTime + 0.05, this.startAt);
        clock = { nextStepIndex: startStepIndex(track, pattern), nextStepTime: t, resetTime: t };
        this.clocks.set(track.id, clock);
      }
      const eff = effectiveParams(track, pattern);
      let chain = this.chains.get(track.id);
      if (!chain && this.master) {
        chain = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master.input);
        this.chains.set(track.id, chain);
      }
      if (!chain) continue;
      chain = this.applyTrackParams(track.id, chain, track, eff);
      const stepDur = stepDuration(track, patch.bpm, pattern);
      let g = 0;
      while (clock.nextStepTime < horizon && g++ < 1024) {
        const step = pattern.steps[clock.nextStepIndex % pattern.steps.length];
        const notes = step ? liveNotes(step) : [];
        if (notes.length > 0 && audible.has(pattern.id)) {
          const at = clock.nextStepTime;
          if (track.mono) this.duckLastVoice(track.id, at);
          const voice = triggerVoice(ctx, chain, this.noiseBuffer, this.sampleCache.get(track.sampleId ?? '') ?? null, track, notes, at, stepDur);
          if (track.mono) this.lastVoices.set(track.id, voice);
          // Сайдчейн: ноты этой дорожки качают приглушаемых.
          for (const rt of patch.tracks) {
            const sc = rt.sidechain;
            if (!sc || sc.sourceId !== track.id) continue;
            const rc = this.chains.get(rt.id);
            if (rc) duckSidechain(rc.duck, at, sc);
          }
        }
        clock.nextStepTime += stepDur;
        clock.nextStepIndex = (clock.nextStepIndex + 1) % pattern.length;
      }
    }
  }

  /** Оффлайн-рендер в WAV: по цепочке (арранжмент) или N тактов одной сцены. */
  async renderToWav(patch: Patch, fallbackSceneId: string, fallbackBars = 8): Promise<Blob> {
    await this.ensureSamples(patch);
    const fixedItems = (
      patch.followChain && patch.chain.length > 0
        ? patch.chain
        : [{ sceneId: fallbackSceneId, bars: fallbackBars }]
    ).map((it) => ({ ...it, sceneId: validSceneId(patch, it.sceneId) }));

    const tickDur = tickDuration(patch.bpm);
    const duration = fixedItems.reduce((s, it) => s + it.bars * BAR_TICKS * tickDur, 0) + 1.0;
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const master = connectMaster(ctx, patch.masterVolume, patch.masterComp ?? 0);
    master.setPan(patch.masterPan ?? 0.5, 0);
    if (patch.masterNoise === 'white' || patch.masterNoise === 'pink') {
      connectMasterNoise(ctx, patch.masterNoise, patch.masterNoiseLevel ?? 0.03);
    }
    const noise = makeNoiseBuffer(ctx);

    // Цепочки создаются заранее (ключ трек:сцена): сайдчейн-дак должен
    // находить цепочки приёмников независимо от порядка обхода треков.
    const chainsByKey = new Map<string, TrackChain>();
    for (const track of patch.tracks) {
      for (const item of fixedItems) {
        const scene = patch.scenes.find((sc) => sc.id === item.sceneId);
        const pattern = patternInScene(track, scene);
        if (!pattern) continue;
        const eff = effectiveParams(track, pattern);
        chainsByKey.set(
          `${track.id}:${item.sceneId}`,
          makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, master.input),
        );
      }
    }

    for (const track of patch.tracks) {
      let t = 0.05;
      let prevVoice: Voice | null = null;
      for (const item of fixedItems) {
        const scene = patch.scenes.find((s) => s.id === item.sceneId);
        const pattern = patternInScene(track, scene);
        if (!pattern) continue;
        const audible = audibleSet(patch, scene).has(pattern.id);
        // Шаг — свой у каждого эскиза (override или шаг трека).
        const stepDur = stepDuration(track, patch.bpm, pattern);
        // Не dispose-им: запланированные ноты привязаны к узлам.
        const chain = chainsByKey.get(`${track.id}:${item.sceneId}`)!;
        const itemDur = item.bars * BAR_TICKS * tickDur;
        let idx = startStepIndex(track, pattern);
        const sample = this.sampleCache.get(track.sampleId ?? '') ?? null;
        for (let tt = t; tt < t + itemDur - 0.001; tt += stepDur) {
          const step = pattern.steps[idx % pattern.steps.length];
          const notes = step ? liveNotes(step) : [];
          if (notes.length > 0 && audible) {
            if (track.mono && prevVoice && prevVoice.stopAt > tt) duckVoice(prevVoice, tt);
            const voice = triggerVoice(ctx, chain, noise, sample, track, notes, tt, stepDur);
            if (track.mono) prevVoice = voice;
            // Сайдчейн: ноты этой дорожки качают приглушаемых.
            for (const rt of patch.tracks) {
              const sc = rt.sidechain;
              if (!sc || sc.sourceId !== track.id) continue;
              const rc = chainsByKey.get(`${rt.id}:${item.sceneId}`);
              if (rc) duckSidechain(rc.duck, tt, sc);
            }
          }
          idx = (idx + 1) % pattern.length;
        }
        t += itemDur;
      }
    }
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }
}
