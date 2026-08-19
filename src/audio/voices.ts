// Голоса: рождение ноты в Web Audio-графе. triggerVoice отвязан от
// конкретного контекста — им пользуются и live-планировщик, и
// оффлайн-рендер WAV (это же — точка сверки с Rust-движком по golden WAV).

import type { Note, Track } from '../types';
import { scaleOf } from '../types';
import type { TrackChain } from './fx';

export const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ноты, сработавшие в этом проходе (вероятность — у каждой ноты своя). */
export function liveNotes(step: import('../types').Step): Note[] {
  return step.notes.filter((nt) => Math.random() < nt.prob);
}

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

export function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

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

// Скрэтч-модуль: загружается один раз на контекст (live и offline).
const scratchLoaded = new WeakSet<BaseAudioContext>();
export async function ensureScratchModule(ctx: BaseAudioContext): Promise<void> {
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

export function makeScratchNode(ctx: BaseAudioContext, sample: AudioBuffer): AudioWorkletNode {
  const node = new AudioWorkletNode(ctx, 'barlow-scratch', { outputChannelCount: [1] });
  node.port.postMessage({ type: 'buffer', samples: monoChannel(sample) });
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

export function triggerVoice(
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
  // Реальная длина голоса: vibBus ниже замыкается на эту переменную,
  // значение присваивается после расчёта огибающей (до первого вызова).
  let stopAt = time + 0.05;

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
  // 100% плато без сетки — «тянуть до перебоя»: голос живёт до потолка
  // 16 с, пока его не срежет mono-retrigger или смена партии; релиз —
  // мягкие 50 мс вместо обрыва (внутренний sus чуть меньше единицы).
  const gates = notes.map((nt) => clampNum(nt.gate ?? 1, 0.1, 4));
  const maxGate = Math.max(1, ...gates);
  let sus = Math.min(1, Math.max(0, track.sustain ?? 0));
  const baseLen =
    track.noteSteps && track.noteSteps > 0
      ? track.noteSteps * stepSec
      : attack + track.decay;
  let voiceLen = baseLen * maxGate;
  if (!track.noteSteps && sus >= 0.99) {
    voiceLen = Math.max(voiceLen, 16);
    sus = 1 - 0.05 / voiceLen;
  }
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
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  amp.gain.setValueAtTime(peak, time + attack + (voiceLen - attack) * sus);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + voiceLen);
  stopAt = time + voiceLen + 0.05;
  const finish = (): Voice => ({ amp, sources, stopAt });

  if (track.waveform === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.connect(amp);
    src.start(time, Math.random() * 1.5, stopAt - time);
    src.stop(stopAt);
    sources.push(src);
    return finish();
  }

  if ((track.sampleMode ?? 'plain') === 'scratch' && track.waveform === 'sample') {
    // Скрэтч: игла worklet-процессора читает сэмпл по позиции, позиция
    // автоматизируется жестом (ломаная t→pos). Питч из стана не действует —
    // скорость задаёт наклон жеста.
    if (!sample) return finish();
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
    return finish();
  }

  if (track.waveform === 'sample') {
    // Сэмпл-плеер: шкала задаёт скорость воспроизведения (питч),
    // длина ноты — как всегда, атакой и спадом.
    if (!sample) return finish();
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
    return finish();
  }

  if (track.waveform === 'karplus') {
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
    return finish();
  }

  if (track.waveform === 'fm') {
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
    return finish();
  }

  if (track.waveform === 'supersaw') {
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
    return finish();
  }

  if (track.waveform === 'additive' || track.waveform === 'organ') {
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
    return finish();
  }

  if (track.waveform === 'formant') {
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
    return finish();
  }

  if (track.waveform === 'modal') {
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
    return finish();
  }

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
  return finish();
}
