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
  lfo: OscillatorNode;
  depth: GainNode;
}

interface FxNodes {
  dry: GainNode;
  wet: GainNode;
  delay?: DelayNode;
  feedback?: GainNode;
  convolver?: ConvolverNode;
}

interface TrackChain {
  hp: BiquadFilterNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  mods: ModNodes[];
  fx: FxNodes[];
  // Сигнатура набора модуляций и эффектов: изменилась — цепочка пересобирается.
  modSig: string;
}

const modsSigOf = (mods: Mod[]) => mods.map((m) => `${m.target}:${m.shape}`).join(',');
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

function modScale(target: string, depth: number): number {
  switch (target) {
    case 'pan':
      return depth; // ±1 максимум
    case 'volume':
      return depth * 0.5;
    case 'filterFreq':
      return depth * 1800;
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
  panner.connect(gain);
  gain.connect(dest);

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
    const lfo = ctx.createOscillator();
    lfo.type = m.shape;
    lfo.frequency.value = m.rate;
    const depth = ctx.createGain();
    depth.gain.value = modScale(m.target, m.depth);
    lfo.connect(depth);
    let param: AudioParam | null = null;
    if (m.target === 'pan') param = panner.pan;
    else if (m.target === 'volume') param = gain.gain;
    else if (m.target === 'filterFreq') param = filter.frequency;
    else if (m.target === 'fxMix') param = fx[0]?.wet.gain ?? null;
    else if (m.target === 'fxTime') param = fx[0]?.delay?.delayTime ?? null;
    else if (m.target === 'fxFeedback') param = fx[0]?.feedback?.gain ?? null;
    if (param) depth.connect(param);
    lfo.start(0);
    return { lfo, depth };
  });
  return {
    hp,
    filter,
    panner,
    gain,
    mods,
    fx,
    modSig: `${modsSigOf(track.mods)}|${fxSigOf(track.effects ?? [])}`,
  };
}

function disposeChain(chain: TrackChain): void {
  for (const m of chain.mods) {
    try {
      m.lfo.stop();
    } catch {
      /* уже остановлен */
    }
    m.lfo.disconnect();
    m.depth.disconnect();
  }
  for (const f of chain.fx) {
    f.dry.disconnect();
    f.wet.disconnect();
    f.delay?.disconnect();
    f.feedback?.disconnect();
    f.convolver?.disconnect();
  }
  chain.hp.disconnect();
  chain.filter.disconnect();
  chain.panner.disconnect();
  chain.gain.disconnect();
}

function connectMaster(ctx: BaseAudioContext, masterVolume: number): GainNode {
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
  master.connect(shaper);
  shaper.connect(ctx.destination);
  return master;
}

interface Voice {
  amp: GainNode;
  sources: AudioScheduledSourceNode[];
  stopAt: number;
}

/** Мягко заглушить голос (моно-retrigger): плавный релиз без обрыва. */
function duckVoice(v: Voice, t: number): void {
  v.amp.gain.setTargetAtTime(0.00001, t, 0.004);
  for (const s of v.sources) {
    try {
      s.stop(t + 0.06);
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
  sources: AudioScheduledSourceNode[],
): number {
  const dur = Math.max(0.05, track.attack + track.decay);
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
  const sources: AudioScheduledSourceNode[] = [];

  if (track.waveform === 'sample' && (track.sampleMode ?? 'plain') === 'grain') {
    if (!sample) return { amp, sources, stopAt: time };
    const lastEnd = scheduleGrainCloud(ctx, amp, sample, track, rows, notes, time, peak, sources);
    return { amp, sources, stopAt: lastEnd };
  }

  // Мгновенная атака = скачок = щелчок; минимальный пологий фронт обязателен.
  // На низких нотах фронт масштабируем периодом волны: четверть периода
  // самой низкой ноты убирает широкополосный «прищёлк» у баса, панч сохраняя.
  const lowestPeriod = 1 / Math.min(...freqs);
  const attack = Math.max(track.attack, Math.min(0.25 * lowestPeriod, 0.012));
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + attack + track.decay);
  const stopAt = time + attack + track.decay + 0.05;

  if (track.waveform === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.connect(amp);
    src.start(time, Math.random() * 1.5, stopAt - time);
    src.stop(stopAt);
    sources.push(src);
  } else if (track.waveform === 'sample') {
    // Сэмпл-плеер: шкала задаёт скорость воспроизведения (питч),
    // длина ноты — как всегда, атакой и спадом.
    if (!sample) return { amp, sources, stopAt };
    const max = rows.length - 1;
    for (const nt of notes) {
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
      src.connect(amp);
      src.start(time);
      src.stop(stopAt);
      sources.push(src);
    }
  } else if (track.waveform === 'karplus') {
    // Струна: каждая нота — свой буфер (кэш по частоте и затуханию).
    for (const f of freqs) {
      const len = Math.min(4, attack + track.decay + 0.05);
      const src = ctx.createBufferSource();
      src.buffer = karplusBuffer(ctx, f, track.ksLife ?? 2.5, len);
      src.connect(amp);
      src.start(time);
      src.stop(stopAt);
      sources.push(src);
    }
  } else if (track.waveform === 'fm') {
    // Классический FM: синусная несущая, синусный модулятор в её частоту.
    // Девиация = индекс × частота модулятора; индекс тает к хвосту ноты —
    // яркая атака, спокойное послезвучие (как у FM-пиано).
    const ratio = track.fmRatio ?? 2;
    const index = track.fmIndex ?? 3;
    for (const f of freqs) {
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
      carrier.connect(amp);
      mod.start(time);
      carrier.start(time);
      mod.stop(stopAt);
      carrier.stop(stopAt);
      sources.push(carrier, mod);
    }
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
      osc.connect(amp);
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
  private master: GainNode | null = null;
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
      this.master = connectMaster(this.ctx, 1);
      this.noiseBuffer = makeNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  private applyMasterVolume(v: number): void {
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0.75 * v, this.ctx.currentTime, 0.05);
    }
  }

  /** Декодировать сэмплы, на которые ссылается патч (идемпотентно). */
  async ensureSamples(patch: Patch): Promise<void> {
    const ctx = this.ensureCtx();
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
      const fresh = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master);
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
      nodes.lfo.frequency.setTargetAtTime(m.rate, t0, 0.05);
      nodes.depth.gain.setTargetAtTime(modScale(m.target, m.depth), t0, 0.05);
    });
    (track.effects ?? []).forEach((e, i) => {
      const n = chain.fx[i];
      if (!n) return;
      n.dry.gain.setTargetAtTime(dryGain(e.mix), t0, 0.03);
      n.wet.gain.setTargetAtTime(wetGain(e.mix), t0, 0.03);
      if (e.type === 'delay') {
        n.delay?.delayTime.setTargetAtTime(e.timeSec, t0, 0.05);
        n.feedback?.gain.setTargetAtTime(e.feedback, t0, 0.05);
      } else if (n.convolver) {
        const ir = getImpulse(ctx, e.sizeSec);
        if (n.convolver.buffer !== ir) n.convolver.buffer = ir;
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
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    this.scheduler();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.clocks.clear();
    this.lastVoices.clear();
    this.pendingSceneId = '';
    this.sceneAdvanceTime = null;
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
        chain = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master);
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
          const voice = triggerVoice(ctx, chain, this.noiseBuffer, this.sampleCache.get(track.sampleId ?? '') ?? null, track, notes, at);
          if (track.mono) this.lastVoices.set(track.id, voice);
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
    const master = connectMaster(ctx, patch.masterVolume);
    const noise = makeNoiseBuffer(ctx);

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
        // Цепочка на каждую сцену: эскиз может нести свои ручки и модуляции.
        // Не dispose-им: запланированные ноты привязаны к узлам.
        const eff = effectiveParams(track, pattern);
        const chain = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, master);
        const itemDur = item.bars * BAR_TICKS * tickDur;
        let idx = startStepIndex(track, pattern);
        const sample = this.sampleCache.get(track.sampleId ?? '') ?? null;
        for (let tt = t; tt < t + itemDur - 0.001; tt += stepDur) {
          const step = pattern.steps[idx % pattern.steps.length];
          const notes = step ? liveNotes(step) : [];
          if (notes.length > 0 && audible) {
            if (track.mono && prevVoice && prevVoice.stopAt > tt) duckVoice(prevVoice, tt);
            const voice = triggerVoice(ctx, chain, noise, sample, track, notes, tt);
            if (track.mono) prevVoice = voice;
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
