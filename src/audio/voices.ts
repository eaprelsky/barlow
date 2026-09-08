import { stopSource } from './sourceLifecycle';
import { periodicFrames, scanFrame } from './wavetable';
import { voiceColor } from './voiceColor';
import { sampleTime } from './sampleTime';
import { instrumentVoices } from '../music/layers';
import { scheduleMseg, msegDuration } from '../music/mseg';
// Голоса: рождение ноты в Web Audio-графе. triggerVoice отвязан от
// конкретного контекста — им пользуются и live-планировщик, и
// оффлайн-рендер WAV (это же — точка сверки с Rust-движком по golden WAV).

import type { Note, SoundingTrack, WavePartial } from '../types';
import { normalizeWave, scaleOf } from '../types';
import type { TrackChain } from './fx';
import { prepareSampleRegion } from './sampleRegion';
import { withNoteLocks } from '../music/noteLocks';
import { resolveMacros } from '../music/macros';
import { sampleZoneAt } from '../music/sampleZones';
import type { SampleRoundRobin } from '../music/sampleRoundRobin';
import { randomFor } from './random';
import type { PitchGlide, PitchMemory } from './pitchMemory';

export const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ноты, сработавшие в этом проходе (вероятность — у каждой ноты своя). */
export function liveNotes(step: import('../types').Step): Note[] {
  return step.notes.filter((nt) => Math.random() < nt.prob);
}

/** Октава арпеджиатора: множитель частоты 2^oct поверх строки стана. */
const octMulOf = (nt: Note) => 2 ** (nt.oct ?? 0);

/** Нормализация сэмплов к одинаковой громкости: ИИ и библиотечные файлы
 *  приходят с разным уровнем (обычно с большим запасом). Цель — RMS ≈ -16 dBFS
 *  с потолком пика 0.95; тихие поднимаем, громкие не трогаем. */
export function normalizeBuffer(buf: AudioBuffer): void {
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

export function makeNoiseBuffer(ctx: BaseAudioContext, seed?: number): AudioBuffer {
  const random = randomFor(seed, 'source-noise');
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = random() * 2 - 1;
  return buf;
}

// Аддитивные модели (гармоники, орган): массив амплитуд гармоник →
// PeriodicWave с кэшем (морф квантуется в ступени — попаданий много).
const waveCaches = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function harmonicWave(ctx: BaseAudioContext, amps: number[]): PeriodicWave {
  let waveCache = waveCaches.get(ctx);
  if (!waveCache) { waveCache = new Map(); waveCaches.set(ctx, waveCache); }
  const key = `${ctx.sampleRate}:${amps.map((a) => a.toFixed(4)).join(',')}`;
  let w = waveCache.get(key);
  if (!w) {
    const imag = new Float32Array(amps.length + 1);
    for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
    w = ctx.createPeriodicWave(new Float32Array(amps.length + 1), imag, {
      disableNormalization: true,
    });
    if (waveCache.size > 128) waveCache.clear();
    waveCache.set(key, w);
  }
  return w;
}

// Вокальные форманты (гласные А Э И О У) живут в заготовках волны —
// music/waveRecipes.ts; движок читает готовые бугры из instrument.formants.

// Скрэтч-модуль: загружается один раз на контекст (live и offline).
const scratchLoaded = new WeakSet<BaseAudioContext>();
export async function ensureScratchModule(ctx: BaseAudioContext): Promise<void> {
  if (scratchLoaded.has(ctx)) return;
  await ctx.audioWorklet.addModule('/scratch-worklet.js?v=54');
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

export function makeScratchNode(ctx: BaseAudioContext, sample: AudioBuffer): AudioWorkletNode {
  const node = new AudioWorkletNode(ctx, 'barlow-scratch', {
    outputChannelCount: [1], processorOptions: { samples: monoChannel(sample) },
  });
  return node;
}

export interface Voice {
  amp: GainNode;
  // Осцилляторы/источники со stop, плюс скрэтч-worklet (гасится off-расписанием).
  sources: (AudioScheduledSourceNode | AudioWorkletNode)[];
  stopAt: number;
}

/** Мягко заглушить голос (моно-retrigger): плавный релиз без обрыва. */
export function duckVoice(v: Voice, t: number): void {
  v.stopAt = Math.min(v.stopAt, t + 0.06);
  v.amp.gain.setTargetAtTime(0.00001, t, 0.004);
  for (const s of v.sources) {
    const sched = s as AudioScheduledSourceNode;
    if (typeof sched.stop !== 'function') {
      // worklet: гасим off-параметром — узел завершит себя
      const off = (s as AudioWorkletNode).parameters?.get('off');
      if (off) off.setValueAtTime(1, v.stopAt);
      continue;
    }
    try {
      stopSource(sched, v.stopAt);
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
  track: SoundingTrack,
  rows: number[],
  notes: Note[],
  time: number,
  peak: number,
  sources: (AudioScheduledSourceNode | AudioWorkletNode)[],
  baseLenSec: number,
  regStart: number,
  regEnd: number,
  random: () => number,
  pitch?: { attach: (param: AudioParam) => void; maxRatio: number },
): number {
  const dur = Math.max(0.01, baseLenSec);
  const sizeSec = clampNum((track.grainSizeMs ?? 120) / 1000, 0.01, sample.duration);
  const pos = clampNum(track.grainPos ?? 0.3, 0, 1);
  const scatter = clampNum(track.grainScatter ?? 0.15, 0, 1);
  const perNote = Math.round(clampNum(track.grainCount ?? 10, 1, 32));
  const total = Math.min(64, perNote * notes.length);
  const per = Math.max(1, Math.round(total / notes.length));
  const stepT = dur / per;
  // Ханн-окна наполовину перекрываются — суммарная громкость растёт как
  // √числа зёрен, компенсируем корнем и держим запас под лимитер.
  // Velocity и headroom применяются ровно один раз общей огибающей.
  const grainAmp = 1.4 / Math.sqrt(total);
  const max = rows.length - 1;
  // Унисон в облаке — разброс по зёрнам: каждому зерну случайный голос
  // унисона (детюн центами → множитель скорости, панорама — k·разброс).
  // Копировать ноту N раз целиком бессмысленно — облако и так хаотично.
  const uniN = Math.round(clampNum(track.unisonVoices ?? 1, 1, 8));
  const uniDet = clampNum(track.unisonDetune ?? 12, 0, 50);
  const uniSpread = clampNum(track.unisonSpread ?? 0, 0, 1);
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
    const at = Math.max(time, t0 + (random() - 0.5) * stepT * 0.4);
    for (const nt of notes) {
      const ratio = samplePitchRatio(track, (rows[Math.min(Math.max(Math.round(nt.n), 0), max)] ?? 1) * octMulOf(nt));
      // Голос унисона этого зерна: скорость с расстройкой k·детюн центов.
      const k = uniN > 1 ? (Math.floor(random() * uniN) / (uniN - 1)) * 2 - 1 : 0;
      const rate = ratio * Math.pow(2, (k * uniDet) / 1200);
      const center = clampNum(pos + (random() * 2 - 1) * scatter * 0.5, 0, 1);
      const maxRate = Math.max(1e-6, rate * Math.max(1, track.pitchDrop) + Math.max(0, track.vibratoDepth ?? 0) / 1200) * (pitch?.maxRatio ?? 1);
      const windowSec = Math.min(sizeSec, (regEnd - regStart) / maxRate);
      // Окно должно поместиться в обрезанный кусок с учётом скорости.
      const room = Math.max(0, regEnd - regStart - windowSec * maxRate - 0.001);
      const offset = regStart + center * room;
      const src = ctx.createBufferSource();
      src.buffer = sample;
      pitch?.attach(src.detune);
      if (track.pitchDrop > 1 && track.pitchTime > 0) {
        src.playbackRate.setValueAtTime(rate * track.pitchDrop, at);
        src.playbackRate.exponentialRampToValueAtTime(rate, at + track.pitchTime);
      } else {
        src.playbackRate.value = rate;
      }
      // Ханн-окно: линейные рампы вверх-вниз по половине зерна.
      const gAmp = ctx.createGain();
      gAmp.gain.setValueAtTime(0, at);
      gAmp.gain.linearRampToValueAtTime(grainAmp, at + windowSec / 2);
      gAmp.gain.linearRampToValueAtTime(0, at + windowSec);
      if (vibG) vibG.connect(src.playbackRate);
      src.connect(gAmp);
      if (uniN > 1 && uniSpread > 0.001) {
        const p = ctx.createStereoPanner();
        p.pan.value = k * uniSpread;
        gAmp.connect(p);
        p.connect(amp);
      } else {
        gAmp.connect(amp);
      }
      src.start(at, offset, Math.min(regEnd - offset, windowSec * maxRate + 0.02));
      stopSource(src, at + windowSec + 0.02);
      sources.push(src);
      lastEnd = Math.max(lastEnd, at + windowSec);
    }
  }
  // Огибающая облака ровная: форму дают сами Ханн-окна, от amp нужны
  // только мягкий старт и общий спад в конце.
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + Math.min(0.02, dur * 0.2));
  amp.gain.setValueAtTime(peak, Math.max(time + Math.min(0.02, dur * 0.2), lastEnd));
  amp.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.01);
  // Вибрато-LFO облака останавливается вместе с последним зерном.
  if (vibLfo) stopSource(vibLfo, lastEnd + 0.06);
  return lastEnd + 0.05;
}

/** Untuned/legacy slots use scale ratios; tuned slots map absolute Hz. */
export function samplePitchRatio(track: SoundingTrack, ratio: number): number {
  return ratio * (track.keyTracking ? track.freq / clampNum(track.rootHz ?? 440, 1, 24000) : 1);
}

/** Аккорд — независимые ноты, объединённые только gain/stop-контрактом.
 * Это сохраняет velocity, длину и хвост каждой ноты во всех режимах. */
export function triggerVoice(
  ctx: BaseAudioContext,
  chain: TrackChain,
  noise: AudioBuffer,
  sample: AudioBuffer | null,
  track: SoundingTrack,
  notes: Note[],
  time: number,
  stepSec: number,
  durSec?: number,
  sampleById?: (id: string) => AudioBuffer | null,
  random: () => number = Math.random,
  roundRobin?: SampleRoundRobin,
  roundRobinOwner = track.id,
  performance?: { pitchMemory?: PitchMemory; allowGlide?: boolean },
): Voice {
  // One sample clock for live/offline origins; epsilon prevents floating floor drift.
  time = sampleTime(time, ctx.sampleRate);
  if (track.layers?.length || track.baseVoiceGain !== undefined) {
    const mix = ctx.createGain(); mix.connect(chain.hp);
    const voices = instrumentVoices(track);
    mix.gain.value = 1 / Math.max(1, voices.reduce((sum, v) => sum + v.gain, 0));
    const played = voices.filter(v => v.gain > 0).map(({ sound, gain, key }) => {
      const buffer = sound.sampleId ? sampleById?.(sound.sampleId) ?? (sound.sampleId === track.sampleId ? sample : null) : null;
      const voice = triggerVoice(ctx, { ...chain, hp: mix } as TrackChain, noise, buffer, sound, notes, time, stepSec,
        durSec, sampleById, random, roundRobin, key ? `${roundRobinOwner}/layer/${key}` : roundRobinOwner, performance);
      voice.amp.gain.value *= gain; return voice;
    });
    return { amp: mix, sources: played.flatMap(v => v.sources), stopAt: Math.max(time, ...played.map(v => v.stopAt)) };
  }
  const amp = ctx.createGain();
  amp.gain.value = 1 / Math.max(1, notes.length);
  amp.connect(chain.hp);
  track = resolveMacros(track);
  if (track.waveform === 'wave') track = { ...track, wave: normalizeWave(track.wave) };
  const rows = scaleOf(track);
  const canGlide = performance?.allowGlide !== false && !!track.mono && (track.portamentoSec ?? 0) > 0 && notes.length === 1
    && notes[0].vel > 0 && !(track.waveform === 'sample' && track.sampleMode === 'scratch');
  if (!canGlide) performance?.pitchMemory?.forget(roundRobinOwner);
  const voices = notes.filter(nt => nt.vel > 0 && (track.waveform !== 'sample' || !nt.sliceId || track.sampleSlices?.some(s => s.id === nt.sliceId))).map(nt => {
    const slice = track.waveform === 'sample' && nt.sliceId ? track.sampleSlices?.find(s => s.id === nt.sliceId) : undefined;
    const sliced = slice ? { ...track, sampleId: slice.sampleId, sampleStart: slice.start, sampleEnd: slice.end } : track;
    const locked = withNoteLocks(sliced, nt.locks);
    const hz = track.freq * (rows[Math.min(rows.length - 1, Math.max(0, Math.round(nt.n)))] ?? 1) * octMulOf(nt);
    const zone = track.waveform === 'sample' && !slice ? sampleZoneAt(track.sampleZones, hz, nt.vel) : undefined;
    const variant = zone ? roundRobin?.select(roundRobinOwner, zone) ?? zone : undefined;
    const selected = variant ? { ...locked, sampleId: variant.sampleId, rootHz: variant.rootHz, keyTracking: true } : locked;
    const assetId = slice?.sampleId ?? variant?.sampleId;
    const buffer = assetId ? sampleById?.(assetId) ?? (assetId === track.sampleId ? sample : null) : sample;
    const glide = canGlide && (track.waveform !== 'sample' || buffer)
      ? performance?.pitchMemory?.next(roundRobinOwner,
        track.waveform === 'sample' && !selected.keyTracking ? hz / track.freq * 440 : hz, time, track.portamentoSec!) : undefined;
    return triggerNoteVoice(ctx, amp, noise, buffer, selected, [nt], time, stepSec, durSec, random, glide);
  });
  return { amp, sources: voices.flatMap(v => v.sources), stopAt: Math.max(time, ...voices.map(v => v.stopAt)) };
}

function triggerNoteVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  sample: AudioBuffer | null,
  track: SoundingTrack,
  notes: Note[],
  time: number,
  stepSec: number,
  // Готовая длина голоса (арпеджиатор: доля ноты). Undefined — по треку:
  // сетка (noteSteps × шаг) или огибающая, гейт ноты умножает сверху.
  durSec?: number,
  random: () => number = Math.random,
  glide?: PitchGlide,
): Voice {
  if (notes.length === 0) return { amp: ctx.createGain(), sources: [], stopAt: time };
  const rows = scaleOf(track);
  const freqs = notes.map((nt) => {
    const idx = Math.min(Math.max(Math.round(nt.n), 0), rows.length - 1);
    return track.freq * (rows[idx] ?? 1) * octMulOf(nt);
  });
  // Обрезка сэмпла: играет кусок [sampleStart, sampleEnd] (клампы по буферу).
  const regStart = sample
    ? Math.max(0, Math.min(clampNum(track.sampleStart ?? 0, 0, sample.duration), sample.duration - 0.001))
    : 0;
  const regEnd = sample
    ? Math.max(regStart + 0.001, clampNum(track.sampleEnd ?? (sample?.duration ?? 1), 0.001, sample.duration))
    : 1;
  // Аккорд делим поровну между нотами — вертикаль не громче одиночной ноты
  // (главный источник клиппинга), и держим запас под мастер-лимитер.
  // Готовый сэмпл уже мастерен — ему запас осцилляторов не нужен.
  const headroom = track.waveform === 'sample' ? 0.95 : 0.55;
  const topVel = Math.max(...notes.map((nt) => nt.vel));
  const peak = Math.max(0.0001, (topVel * headroom) / notes.length);
  const amp = ctx.createGain();
  // Огибающая фильтра (v36): свой lowpass на голос — старт в ±полутонах
  // от ручки «верх» и съезд к базе за время. Плюс — яркая атака-плак,
  // минус — тёмный свелл. Выключена (0) — голос идёт напрямую, как раньше.
  let sink: AudioNode = destination;
  const feAmt = clampNum(track.filterEnvAmount ?? 0, -24, 24);
  if (Math.abs(feAmt) > 0.01) {
    const base = clampNum(track.filterFreq, 60, 12000);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    const from = clampNum(base * Math.pow(2, feAmt / 12), 40, 18000);
    lp.frequency.setValueAtTime(from, time);
    lp.frequency.exponentialRampToValueAtTime(base, time + clampNum(track.filterEnvTime ?? 0.3, 0.01, 4));
    lp.connect(destination);
    sink = lp;
  }
  // Формантный слой (v39, универсальный): бугры громкости на фиксированных
  // герцах поверх любой волны и сэмпла — гласная не зависит от высоты ноты.
  // Вход слоя — точка сбора тела голоса (amp) и звонкого хвоста строк.
  const fmtBands = (track.formants ?? [])
    .filter((b) => b && Number.isFinite(b.freq))
    .slice(0, 5);
  let voiceIn: AudioNode = sink;
  if (fmtBands.length > 0) {
    voiceIn = ctx.createGain();
    // Сухой остаток — тело звука под формантами.
    const dry = ctx.createGain();
    dry.gain.value = 0.22;
    voiceIn.connect(dry);
    dry.connect(sink);
    fmtBands.forEach((b, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = clampNum(b.freq, 80, 9000);
      bp.Q.value = 10 + i * 2;
      const g = ctx.createGain();
      g.gain.value = clampNum(b.gain, 0, 2) * 0.5;
      voiceIn.connect(bp);
      bp.connect(g);
      g.connect(sink);
    });
  }
  const msegGain = track.ampMseg ? ctx.createGain() : undefined;
  if (msegGain) { msegGain.connect(voiceIn); voiceIn = msegGain; }
  const color = voiceColor(ctx, voiceIn, track, freqs[0], time);
  voiceIn = color.input;
  amp.connect(voiceIn);
  const sources: (AudioScheduledSourceNode | AudioWorkletNode)[] = [...color.sources];
  // Реальная длина голоса: vibBus ниже замыкается на эту переменную,
  // значение присваивается после расчёта огибающей (до первого вызова).
  let stopAt = time + 0.05;
  let pitchSource: ConstantSourceNode | undefined;
  const attachPitch = (param: AudioParam): void => {
    if (!glide) return;
    if (!pitchSource) {
      pitchSource = ctx.createConstantSource();
      pitchSource.offset.setValueAtTime(1200 * Math.log2(glide.fromHz / glide.toHz), time);
      pitchSource.offset.linearRampToValueAtTime(0, time + glide.seconds);
      pitchSource.start(time);
      sources.push(pitchSource);
    }
    pitchSource.connect(param);
  };
  for (const source of color.sources) attachPitch(source.detune);
  const finish = (): Voice => {
    if (msegGain && track.ampMseg) {
      // Replace legacy amplitude shaping; operator decay remains part of the timbre.
      amp.gain.cancelScheduledValues(time);
      amp.gain.setValueAtTime(peak, time);
      scheduleMseg(msegGain.gain, track.ampMseg, time, msegGate);
    }
    stopAt = color.finish(stopAt);
    if (pitchSource) stopSource(pitchSource, stopAt);
    return { amp, sources, stopAt };
  };

  // Вибрато: один LFO на голос, ветки с нужным масштабом (центы — на
  // detune осцилляторов; доли скорости — на playbackRate сэмплов).
  // С задержкой (v36) глубина нарастает от нуля за vibratoDelay — голос
  // «доплывает» до дрожания, как живое пение, а не дрожит с первой мс.
  const vibDepth = track.vibratoDepth ?? 0;
  const vibDelay = clampNum(track.vibratoDelay ?? 0, 0, 4);
  let vibOut: GainNode | null = null;
  const vibBus = (scale: number): GainNode | null => {
    if (vibDepth <= 0 || scale === 0) return null;
    if (!vibOut) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = track.vibratoRate ?? 5;
      vibOut = ctx.createGain();
      lfo.connect(vibOut);
      lfo.start(time);
      stopSource(lfo, stopAt);
      sources.push(lfo);
    }
    const g = ctx.createGain();
    if (vibDelay > 0.001) {
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vibDepth * scale, time + vibDelay);
    } else {
      g.gain.value = vibDepth * scale;
    }
    vibOut.connect(g);
    return g;
  };

  // Унисон (v36): параметры читаются до ветвления по источнику — базовые
  // волны крутят их в detune осцилляторов (unisonOsc ниже), сэмпл — в
  // скорость воспроизведения (плейн — копии ноты, грейн — разброс зёрен).
  const uniN = Math.round(clampNum(track.unisonVoices ?? 1, 1, 8));
  const uniDet = clampNum(track.unisonDetune ?? 12, 0, 50);
  const uniSpread = clampNum(track.unisonSpread ?? 0, 0, 1);

  // Мгновенная атака = скачок = щелчок; минимальный пологий фронт обязателен.
  // На низких нотах фронт масштабируем периодом волны: четверть периода
  // самой низкой ноты убирает широкополосный «прищёлк» у баса, панч сохраняя.
  const lowestPeriod = 1 / Math.min(...freqs);
  const attack = Math.max(track.attack, Math.min(0.25 * lowestPeriod, 0.012));

  // Длина ноты: по умолчанию — огибающая трека (атака + спад); при
  // noteSteps — привязка к сетке инструмента (шаг эскиза × темп), тогда
  // тягучесть не едет при смене темпа. У каждой ноты может быть своя
  // абсолютная длина (len, v37, в шагах) — пересчитываем в множитель
  // базы. Легаси-гейт (v36-) встречается только у непрошедших миграцию
  // патчей. 100% плато без сетки — «тянуть до перебоя»: голос живёт до
  // потолка 16 с, пока его не срежет mono-retrigger или смена партии;
  // релиз — мягкие 50 мс вместо обрыва (внутренний sus чуть меньше
  // единицы).
  const baseLen =
    durSec ??
    (track.noteSteps && track.noteSteps > 0
      ? track.noteSteps * stepSec
      : track.ampMseg?.seconds ?? attack + track.decay);
  const gates = notes.map((nt) => {
    if (typeof nt.len === 'number' && nt.len > 0) {
      const lenSec = clampNum(nt.len, 0.05, 64) * stepSec;
      return clampNum(lenSec / Math.max(baseLen, 1e-6), 0.05, 64);
    }
    return clampNum(nt.gate ?? 1, 0.1, 4);
  });
  const maxGate = Math.max(...gates);
  let sus = Math.min(1, Math.max(0, track.sustain ?? 0));
  // Готовая длина арп-доли уже включает гейт; «тянуть до перебоя» —
  // только для обычных нот без сетки.
  const msegGate = durSec !== undefined ? durSec : baseLen * maxGate;
  let voiceLen = track.ampMseg ? msegDuration(track.ampMseg, msegGate) : msegGate;
  if (!track.ampMseg && durSec === undefined && !track.noteSteps && !notes.some(nt => nt.len !== undefined) && sus >= 0.99) {
    voiceLen = Math.max(voiceLen, 16);
    sus = 1 - 0.05 / voiceLen;
  }
  if (track.waveform === 'sample' && (track.sampleMode ?? 'plain') === 'grain') {
    if (!sample) return finish();
    const lastEnd = scheduleGrainCloud(ctx, amp, sample, track, rows, notes, time, peak, sources, voiceLen, regStart, regEnd, random,
      glide ? { attach: attachPitch, maxRatio: Math.max(1, glide.fromHz / glide.toHz) } : undefined);
    stopAt = lastEnd;
    return finish();
  }
  // Атака не бывает длиннее самой ноты: иначе план огибающей строится
  // «назад во времени» (спад раньше конца атаки, осциллятор стопается
  // посреди разгона) и Web Audio гасит голос в абсолютный ноль — нота
  // молчит целиком. Длинная атака просто сжимается до 90% ноты.
  const atk = Math.min(attack, voiceLen * 0.9);
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
  // Огибающая: атака → плато (sustain, доля звуковой части) → спад.
  // Спад управляется decay и при сеточной длине ноты: хвост падает до
  // тишины за decay секунд (если помещается), иначе тянется до конца
  // ноты и мягко досыпает в ноль. КРОМЕ перкуссии (плато 0): у бочки/хэта/
  // звона длина ноты — триггер, как в драм-машине — спад звучит свой
  // полный хвост, слот его не рубит. Иначе бочка в один шаг обрубалась
  // на середине удара.
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + atk);
  const plateauEnd = time + atk + (voiceLen - atk) * sus;
  amp.gain.setValueAtTime(peak, plateauEnd);
  const decayEnd = plateauEnd + Math.max(track.decay, 0.01);
  const fallEnd = sus <= 0 ? decayEnd : Math.min(decayEnd, time + voiceLen + 0.05);
  amp.gain.exponentialRampToValueAtTime(0.0001, fallEnd);
  if (fallEnd < time + voiceLen - 0.001) {
    amp.gain.setValueAtTime(0.0001, fallEnd);
    amp.gain.linearRampToValueAtTime(0.00002, time + voiceLen);
  }
  stopAt = time + Math.max(voiceLen, fallEnd - time) + 0.05;

  // Шумовой источник (прежде waveform 'noise') — теперь строка «шум»
  // в таблице волны: миграция v39 собирает её в wave.

  if ((track.sampleMode ?? 'plain') === 'scratch' && track.waveform === 'sample') {
    // Скрэтч: игла worklet-процессора читает сэмпл по позиции, позиция
    // автоматизируется жестом (ломаная t→pos). Питч из стана не действует —
    // скорость задаёт наклон жеста.
    if (!sample) return finish();
    const node = makeScratchNode(ctx, sample);
    const pos = node.parameters.get('position')!;
    const off = node.parameters.get('off')!;
    // Игла ходит по обрезанному куску: позиция 0..1 сэмпла → [регион].
    const mapPos = (p: number) =>
      clampNum(p, 0, 1) * ((regEnd - regStart) / sample.duration) + regStart / sample.duration;
    const points = (track.scratchPoints ?? []).slice().sort((a, b) => a.t - b.t);
    if (points.length === 0) {
      pos.setValueAtTime(mapPos(0), time);
      pos.linearRampToValueAtTime(mapPos(1), time + voiceLen);
    } else {
      pos.setValueAtTime(mapPos(points[0].pos), time);
      for (const pt of points) {
        pos.linearRampToValueAtTime(mapPos(pt.pos), time + Math.max(0, Math.min(1, pt.t)) * voiceLen);
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
    return finish();
  }

  if (track.waveform === 'sample') {
    // Сэмпл-плеер: шкала задаёт скорость воспроизведения (питч),
    // длина ноты — как всегда, атакой и спадом. Унисон — те же ручки,
    // что у осцилляторов: N копий сэмпла со скоростью ±детюн.
    if (!sample) return finish();
    const max = rows.length - 1;
    // Треугольное окно и нормировка — как у унисона осцилляторов: сумма
    // гейнов 1, когерентный транзиент N синфазных копий не клипит.
    const uShape = (k: number) => 1 - Math.abs(k) * 0.68;
    const uNorm =
      uniN > 1
        ? Array.from({ length: uniN }, (_, i) => uShape((i / (uniN - 1)) * 2 - 1)).reduce(
            (a, b) => a + b,
            0,
          )
        : 1;
    notes.forEach((nt, ni) => {
      const ratio = samplePitchRatio(track, (rows[Math.min(Math.max(Math.round(nt.n), 0), max)] ?? 1) * octMulOf(nt));
      for (let i = 0; i < uniN; i++) {
        const k = uniN > 1 ? (i / (uniN - 1)) * 2 - 1 : 0;
        // Детюн центами → множитель скорости (полутон = 2^(1/12)).
        const mul = Math.pow(2, (k * uniDet) / 1200);
        const src = ctx.createBufferSource();
        const prepared = track.sampleReverse || track.sampleLoop
          ? prepareSampleRegion(ctx, sample, regStart, regEnd, track.sampleReverse === true,
            track.sampleLoop ? track.loopCrossfadeMs ?? 10 : 0)
          : null;
        src.buffer = prepared?.buffer ?? sample;
        attachPitch(src.detune);
        src.loop = track.sampleLoop === true;
        if (prepared && src.loop) {
          src.loopStart = prepared.loopStart;
          src.loopEnd = prepared.buffer.duration;
        }
        // Падение тона на сэмпле — рампой скорости воспроизведения:
        // «бочка из сэмпла» собирается прямо в слоте.
        if (track.pitchDrop > 1 && track.pitchTime > 0) {
          src.playbackRate.setValueAtTime(ratio * mul * track.pitchDrop, time);
          src.playbackRate.exponentialRampToValueAtTime(ratio * mul, time + track.pitchTime);
        } else {
          src.playbackRate.value = ratio * mul;
        }
        const vbS = vibBus(1 / 1200);
        if (vbS) vbS.connect(src.playbackRate);
        let out: AudioNode = src;
        if (uniN > 1) {
          const g = ctx.createGain();
          g.gain.value = uShape(k) / uNorm;
          src.connect(g);
          out = g;
          if (uniSpread > 0.001) {
            const p = ctx.createStereoPanner();
            p.pan.value = k * uniSpread;
            g.connect(p);
            out = p;
          }
        }
        out.connect(noteDest(ni));
        // Играем обрезанный кусок: offset и длительность — в секундах буфера.
        if (src.loop) src.start(time, 0);
        else src.start(time, prepared ? 0 : regStart, Math.max(0.001, regEnd - regStart));
        stopSource(src, stopAt);
        sources.push(src);
      }
    });
    return finish();
  }

  if (track.waveform === 'wave') {
    // Своя волна = таблица строк-операторов (v39). Строка — слагаемое
    // суммы или (задан mod) модулятор частоты другой строки; её amp —
    // индекс модуляции. Хвост строки (decay) гаснет сам и живёт в
    // «звонкой» шине мимо релиза ноты — звон колокола, темнеющая струна.
    const wave = track.wave;
    if (!wave || wave.partials.length === 0) return finish();
    const rows = wave.partials;
    const plain = rows.every((p) => p.mod === undefined && (p.decay ?? 0) <= 0.001);
    const maxDecay = Math.max(0, ...rows.map((p) => p.decay ?? 0));
    const grainSec = clampNum((wave.noiseGrainMs ?? 40) / 1000, 0.005, 0.5);
    const drop = track.pitchDrop > 1 && track.pitchTime > 0;
    // Унисон (любая волна, v39): N копий подграфа строк на ноту —
    // треугольное окно громкости, разброс по каналам.
    const uShape = (k: number) => 1 - Math.abs(k) * 0.68;
    const uNorm =
      uniN > 1
        ? Array.from({ length: uniN }, (_, i) => uShape((i / (uniN - 1)) * 2 - 1)).reduce(
            (a, b) => a + b,
            0,
          )
        : 1;
    // Точка входа голоса унисона: гейн окна (+ панорама), далее — нота.
    const uniDest = (fi: number, k: number, input: AudioNode = noteDest(fi)): AudioNode => {
      if (uniN <= 1) return input;
      const g = ctx.createGain();
      g.gain.value = uShape(k) / uNorm;
      if (uniSpread > 0.001) {
        const p = ctx.createStereoPanner();
        p.pan.value = k * uniSpread;
        g.connect(p);
        p.connect(input);
      } else {
        g.connect(input);
      }
      return g;
    };

    if (wave.wavetable || wave.va) {
      const frames = periodicFrames(ctx, wave), from = wave.wavetable?.position ?? 0;
      const to = Math.max(0, Math.min(1, from + (wave.wavetable?.sweep ?? 0)));
      freqs.forEach((f, fi) => {
        for (let i = 0; i < uniN; i++) {
          const k = uniN > 1 ? i / (uniN - 1) * 2 - 1 : 0, dest = uniDest(fi, k);
          frames.forEach((pw, n) => {
            const osc = ctx.createOscillator(), mix = ctx.createGain();
            osc.setPeriodicWave(pw); osc.frequency.value = drop ? f * track.pitchDrop : f;
            if (drop) { osc.frequency.setValueAtTime(f * track.pitchDrop, time); osc.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime); }
            osc.detune.value = k * uniDet; attachPitch(osc.detune); vibBus(1)?.connect(osc.detune);
            scanFrame(mix.gain, n, frames.length, from, to, time, voiceLen);
            osc.connect(mix); mix.connect(dest); osc.start(time); stopSource(osc, stopAt); sources.push(osc);
          });
        }
      });
      return finish();
    }

    if (plain) {
      // Быстрый путь: без хвостов и маршрутов целые синусы склеиваются
      // в один PeriodicWave (дёшево), остальные — отдельными
      // осцилляторами/зернами шума, унисон — копиями на голос.
      const ints = new Map<number, number>();
      const solo: WavePartial[] = [];
      const sum = rows.reduce((s, p) => s + p.amp, 0);
      const scale = sum > 1 ? 1 / sum : 1;
      for (const p of rows) {
        if (p.type === 'sine' && Number.isInteger(p.ratio) && p.ratio >= 1) {
          ints.set(p.ratio, (ints.get(p.ratio) ?? 0) + p.amp * scale);
        } else {
          solo.push(p);
        }
      }
      let pw: PeriodicWave | null = null;
      if (ints.size > 0) {
        const top = Math.max(...ints.keys());
        pw = harmonicWave(ctx, Array.from({ length: top }, (_, i) => ints.get(i + 1) ?? 0));
      }
      // Сольные строки не должны в сумме пересть запас осцилляторов.
      const soloScale = scale;
      const oscType = (t: WavePartial['type']): OscillatorType =>
        t === 'saw' ? 'sawtooth' : t === 'noise' ? 'sine' : t;
      freqs.forEach((f, fi) => {
        for (let i = 0; i < uniN; i++) {
          const k = uniN > 1 ? (i / (uniN - 1)) * 2 - 1 : 0;
          const det = k * uniDet;
          const dest = uniDest(fi, k);
          if (pw) {
            const osc = ctx.createOscillator();
            osc.setPeriodicWave(pw);
            attachPitch(osc.detune);
            if (det !== 0) osc.detune.value = det;
            osc.frequency.value = drop ? f * track.pitchDrop : f;
            if (drop) {
              osc.frequency.setValueAtTime(f * track.pitchDrop, time);
              osc.frequency.exponentialRampToValueAtTime(f, time + track.pitchTime);
            } else {
              osc.frequency.setValueAtTime(f, time);
            }
            const vb = vibBus(1);
            if (vb) vb.connect(osc.detune);
            osc.connect(dest);
            osc.start(time);
            stopSource(osc, stopAt);
            sources.push(osc);
          }
          for (const p of solo) {
            if (p.type === 'noise') {
              // Зерно шума: зацикленное окно живого шумового буфера —
              // размер окна задаёт характер крупы.
              const src = ctx.createBufferSource();
              src.buffer = noise;
              src.loop = true;
              const from = random() * 1.5;
              src.loopStart = from;
              src.loopEnd = Math.min(from + grainSec, 1.99);
              const g = ctx.createGain();
              g.gain.value = p.amp * soloScale;
              src.connect(g);
              g.connect(dest);
              src.start(time, from);
              stopSource(src, stopAt);
              sources.push(src);
              continue;
            }
            const osc = ctx.createOscillator();
            osc.type = oscType(p.type);
            attachPitch(osc.detune);
            if (det !== 0) osc.detune.value = det;
            const pf = f * p.ratio;
            osc.frequency.value = drop ? pf * track.pitchDrop : pf;
            if (drop) {
              osc.frequency.setValueAtTime(pf * track.pitchDrop, time);
              osc.frequency.exponentialRampToValueAtTime(pf, time + track.pitchTime);
            } else {
              osc.frequency.setValueAtTime(pf, time);
            }
            const vb = vibBus(1);
            if (vb) vb.connect(osc.detune);
            const g = ctx.createGain();
            g.gain.value = p.amp * soloScale;
            osc.connect(g);
            g.connect(dest);
            osc.start(time);
            stopSource(osc, stopAt);
            sources.push(osc);
          }
        }
      });
      return finish();
    }

    // Операторный путь: построчные хвосты и маршруты модуляции.
    // Слагаемые не должны в сумме пересть запас осцилляторов.
    const sumAmp = rows.reduce((s, p) => (p.mod === undefined ? s + p.amp : s), 0);
    const sumScale = sumAmp > 1 ? 1 / sumAmp : 1;
    // Звонкая шина: строки с хвостом переживают релиз ноты.
    let tail: GainNode | null = null;
    if (maxDecay > 0.001) {
      tail = ctx.createGain();
      tail.gain.setValueAtTime(0, time);
      tail.gain.linearRampToValueAtTime(peak, time + Math.max(0.002, atk));
      tail.connect(voiceIn);
      stopAt = Math.max(stopAt, time + atk + maxDecay + 0.05);
    }
    /** Осцилляторы всех строк одной ноты (голос унисона — detCents). */
    const buildSources = (
      f: number,
      detCents: number,
    ): { srcs: (OscillatorNode | AudioBufferSourceNode | null)[]; noiseAt: number[] } => {
      const srcs: (OscillatorNode | AudioBufferSourceNode | null)[] = [];
      const noiseAt: number[] = [];
      rows.forEach((p) => {
        if (p.type === 'noise') {
          const src = ctx.createBufferSource();
          src.buffer = noise;
          src.loop = true;
          const from = random() * 1.5;
          noiseAt.push(from);
          src.loopStart = from;
          src.loopEnd = Math.min(from + grainSec, 1.99);
          srcs.push(src);
          return;
        }
        noiseAt.push(0);
        const osc = ctx.createOscillator();
        osc.type = p.type === 'saw' ? 'sawtooth' : p.type;
        attachPitch(osc.detune);
        const pf = f * p.ratio;
        osc.frequency.value = drop ? pf * track.pitchDrop : pf;
        if (drop) {
          osc.frequency.setValueAtTime(pf * track.pitchDrop, time);
          osc.frequency.exponentialRampToValueAtTime(pf, time + track.pitchTime);
        } else {
          osc.frequency.setValueAtTime(pf, time);
        }
        if (detCents !== 0) osc.detune.value = detCents;
        const vb = vibBus(1);
        if (vb) vb.connect(osc.detune);
        srcs.push(osc);
      });
      return { srcs, noiseAt };
    };
    /** Подключить строки: слагаемые — в dest (или звонкий tail, если у
     *  строки хвост), модуляторы — в frequency своих целей. */
    const wireRows = (
      f: number,
      srcs: (OscillatorNode | AudioBufferSourceNode | null)[],
      noiseAt: number[],
      dest: AudioNode,
      tailDest: AudioNode,
    ): void => {
      rows.forEach((p, ri) => {
        const src = srcs[ri];
        if (!src) return;
        const dec = p.decay ?? 0;
        if (p.mod !== undefined) {
          // Модулятор: девиация = индекс × частота ноты × множитель
          // строки (как прежний FM). Хвост модулятора — тающая глубина:
          // яркая атака, спокойное послезвучие.
          const target = srcs[p.mod];
          if (!(target instanceof OscillatorNode)) return;
          const g = ctx.createGain();
          g.gain.setValueAtTime(p.amp * f * p.ratio, time);
          if (dec > 0.001) g.gain.setTargetAtTime(0, time + atk, dec / 6.9078);
          src.connect(g);
          g.connect(target.frequency);
        } else {
          const g = ctx.createGain();
          g.gain.setValueAtTime(p.amp * sumScale, time);
          if (dec > 0.001) {
            // Свой хвост: экспонента T60 от конца атаки, мимо релиза.
            g.gain.setTargetAtTime(0, time + atk, dec / 6.9078);
            src.connect(g);
            g.connect(tailDest);
          } else {
            src.connect(g);
            g.connect(dest);
          }
        }
        if (p.type === 'noise') (src as AudioBufferSourceNode).start(time, noiseAt[ri]);
        else (src as OscillatorNode).start(time);
        stopSource(src, stopAt);
        sources.push(src);
      });
    };
    freqs.forEach((f, fi) => {
      for (let i = 0; i < uniN; i++) {
        const k = uniN > 1 ? (i / (uniN - 1)) * 2 - 1 : 0;
        const { srcs, noiseAt } = buildSources(f, k * uniDet);
        const dest = uniDest(fi, k);
        wireRows(f, srcs, noiseAt, dest, tail ? uniDest(fi, k, tail) : dest);
      }
    });
    return finish();
  }

  return finish();
}
