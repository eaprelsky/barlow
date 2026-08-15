// Аудио-движок: lookahead-планировщик (паттерн "A Tale of Two Clocks").
// UI-поток каждые 25 мс планирует ноты на 120 мс вперёд по часам
// AudioContext — стабильный тайминг без джиттера setInterval.
//
// У каждого трека свои часы: шаг длится rate * (60/bpm/4) секунд,
// позиция считается по единой формуле stepIndexAt, поэтому движок
// и UI никогда не расходятся.
//
// Голос (triggerVoice) отвязан от конкретного контекста: им же пользуется
// оффлайн-рендер в WAV через OfflineAudioContext.

import type { Patch, Step, Track } from '../types';
import { stepFreqs } from '../types';
import { audioBufferToWav } from './wav';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

export function tickDuration(bpm: number): number {
  // Базовый тик = 1/16 при rate = 1.
  return 60 / bpm / 4;
}

export function stepDuration(track: Track, bpm: number): number {
  return track.rate * tickDuration(bpm);
}

export function startStepIndex(track: Track): number {
  return ((track.phase % track.length) + track.length) % track.length;
}

// Позиция трека в момент ctxTime (для playhead в UI). -1 — ещё не стартовали.
export function stepIndexAt(track: Track, ctxTime: number, startAt: number, bpm: number): number {
  const elapsed = ctxTime - startAt;
  if (elapsed < 0) return -1;
  return (Math.floor(elapsed / stepDuration(track, bpm)) + track.phase) % track.length;
}

interface TrackClock {
  nextStepIndex: number;
  nextStepTime: number;
}

interface TrackChain {
  filter: BiquadFilterNode;
  gain: GainNode;
}

function fires(step: Step): boolean {
  return step.notes.length > 0 && Math.random() < step.prob;
}

function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeChain(ctx: BaseAudioContext, track: Track, dest: AudioNode): TrackChain {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = track.filterFreq;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = track.volume;
  filter.connect(gain);
  gain.connect(dest);
  return { filter, gain };
}

function connectMaster(ctx: BaseAudioContext, masterVolume: number): GainNode {
  const master = ctx.createGain();
  master.gain.value = 0.75 * masterVolume;
  // Мягкий лимитер на tanh: пики выше ~0.9 плавно пережимаются, а не
  // обрезаются нулём — иначе сумма громких треков трещит (цифровой клиппинг).
  // Компрессор тут не годится: он пропускает короткие транзиенты.
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2; // диапазон входа [-2, 2]
    curve[i] = Math.tanh(1.5 * x) / Math.tanh(3);
  }
  shaper.curve = curve;
  master.connect(shaper);
  shaper.connect(ctx.destination);
  return master;
}

function triggerVoice(
  ctx: BaseAudioContext,
  chain: TrackChain,
  noise: AudioBuffer,
  track: Track,
  step: Step,
  time: number,
): void {
  const freqs = stepFreqs(track, step);
  if (freqs.length === 0) return;
  // Аккорд делим поровну между нотами — вертикаль не громче одиночной ноты
  // (главный источник клиппинга), и держим запас под мастер-лимитер.
  const peak = Math.max(0.0001, (step.vel * 0.55) / freqs.length);
  // Мгновенная атака = скачок = щелчок; минимальный пологий фронт обязателен.
  const attack = Math.max(track.attack, 0.0005);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + attack + track.decay);
  amp.connect(chain.filter);
  const stopAt = time + attack + track.decay + 0.05;

  if (track.waveform === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.start(time, Math.random() * 1.5, stopAt - time);
    src.connect(amp);
    src.stop(stopAt);
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
    }
  }
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

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Актуальное время аудио-часов — для расчёта playhead в UI. */
  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get startTime(): number {
    return this.startAt;
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

  /** Обновить данные патча без остановки: движок читает их на каждом шаге. */
  setPatch(patch: Patch): void {
    this.patch = patch;
    this.applyMasterVolume(patch.masterVolume);
    if (!this.ctx || !this.master) return;
    // Актуализируем цепочки: параметры существующих, disconnect удалённых.
    const alive = new Set<string>();
    for (const track of patch.tracks) {
      alive.add(track.id);
      let chain = this.chains.get(track.id);
      if (!chain) {
        chain = makeChain(this.ctx, track, this.master);
        this.chains.set(track.id, chain);
      }
      chain.filter.frequency.setTargetAtTime(track.filterFreq, this.ctx.currentTime, 0.03);
      chain.gain.gain.setTargetAtTime(track.volume, this.ctx.currentTime, 0.03);
    }
    for (const [id, chain] of this.chains) {
      if (!alive.has(id)) {
        chain.filter.disconnect();
        chain.gain.disconnect();
        this.chains.delete(id);
        this.clocks.delete(id);
      }
    }
  }

  play(patch: Patch): void {
    this.stop();
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    this.patch = patch;
    this.setPatch(patch);
    this.startAt = ctx.currentTime + 0.1;
    for (const track of patch.tracks) {
      this.clocks.set(track.id, {
        nextStepIndex: startStepIndex(track),
        nextStepTime: this.startAt,
      });
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
  }

  private scheduler(): void {
    const ctx = this.ctx;
    const patch = this.patch;
    if (!ctx || !patch || !this.noiseBuffer) return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;
    for (const track of patch.tracks) {
      const clock = this.clocks.get(track.id);
      if (!clock) continue;
      const stepDur = stepDuration(track, patch.bpm);
      let guard = 0;
      while (clock.nextStepTime < horizon && guard++ < 512) {
        const step = track.steps[clock.nextStepIndex % track.steps.length];
        if (step && fires(step)) {
          const chain = this.chains.get(track.id);
          if (chain) triggerVoice(ctx, chain, this.noiseBuffer, track, step, clock.nextStepTime);
        }
        clock.nextStepTime += stepDur;
        clock.nextStepIndex = (clock.nextStepIndex + 1) % track.length;
      }
    }
  }

  /** Оффлайн-рендер патча в WAV: bars «тактов» по 16 базовых тиков. */
  async renderToWav(patch: Patch, bars: number): Promise<Blob> {
    const duration = bars * 16 * tickDuration(patch.bpm) + 1.0;
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const master = connectMaster(ctx, patch.masterVolume);
    const noise = makeNoiseBuffer(ctx);
    for (const track of patch.tracks) {
      const chain = makeChain(ctx, track, master);
      const stepDur = stepDuration(track, patch.bpm);
      let idx = startStepIndex(track);
      for (let t = 0.05; t < duration - 0.1; t += stepDur) {
        const step = track.steps[idx % track.steps.length];
        if (step && fires(step)) {
          triggerVoice(ctx, chain, noise, track, step, t);
        }
        idx++;
      }
    }
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }
}
