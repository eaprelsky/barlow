// Аудио-движок: lookahead-планировщик (паттерн "A Tale of Two Clocks").
// UI-поток каждые 25 мс планирует ноты на 120 мс вперёд по часам
// AudioContext — стабильный тайминг без джиттера setInterval.
//
// У каждого трека свои часы: шаг длится rate * (60/bpm/4) секунд,
// позиция считается по единой формуле stepIndexAt, поэтому движок
// и UI никогда не расходятся.

import type { Patch, Track } from '../types';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

export function tickDuration(bpm: number): number {
  // Базовый тик = 1/16 при rate = 1.
  return 60 / bpm / 4;
}

export function stepDuration(track: Track, bpm: number): number {
  return track.rate * tickDuration(bpm);
}

// Позиция трека в момент ctxTime (для playhead в UI). -1 — ещё не стартовали.
export function stepIndexAt(track: Track, ctxTime: number, startAt: number, bpm: number): number {
  const elapsed = ctxTime - startAt;
  if (elapsed < 0) return -1;
  return Math.floor(elapsed / stepDuration(track, bpm)) % track.length;
}

interface TrackClock {
  nextStepIndex: number;
  nextStepTime: number;
}

interface TrackChain {
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
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
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.ratio.value = 12;
      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.ctx;
  }

  /** Обновить данные патча без остановки: движок читает их на каждом шаге. */
  setPatch(patch: Patch): void {
    this.patch = patch;
    if (!this.ctx) return;
    // Актуализируем цепочки: параметры существующих, disconnect удалённых.
    const alive = new Set<string>();
    for (const track of patch.tracks) {
      alive.add(track.id);
      const chain = this.chains.get(track.id) ?? this.createChain(track.id);
      chain.filter.frequency.setTargetAtTime(
        track.filterFreq, this.ctx.currentTime, 0.03,
      );
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

  private createChain(id: string): TrackChain {
    const ctx = this.ensureCtx();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    filter.connect(gain);
    gain.connect(this.master!);
    const chain = { filter, gain };
    this.chains.set(id, chain);
    return chain;
  }

  play(patch: Patch): void {
    this.stop();
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    this.patch = patch;
    this.setPatch(patch);
    this.startAt = ctx.currentTime + 0.1;
    for (const track of patch.tracks) {
      this.clocks.set(track.id, { nextStepIndex: 0, nextStepTime: this.startAt });
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
    if (!ctx || !patch) return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;
    for (const track of patch.tracks) {
      const clock = this.clocks.get(track.id);
      if (!clock) continue;
      const stepDur = stepDuration(track, patch.bpm);
      let guard = 0;
      while (clock.nextStepTime < horizon && guard++ < 512) {
        const idx = clock.nextStepIndex % track.steps.length;
        const step = track.steps[idx];
        if (step && step.on) {
          this.trigger(track, step, clock.nextStepTime);
        }
        clock.nextStepTime += stepDur;
        clock.nextStepIndex = (clock.nextStepIndex + 1) % track.length;
      }
    }
  }

  private trigger(track: Track, step: { mul: number; vel: number }, time: number): void {
    const ctx = this.ctx!;
    const chain = this.chains.get(track.id) ?? this.createChain(track.id);
    const freq = track.freq * (step.mul || 1);
    const peak = Math.max(0.0001, step.vel * 0.9);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(peak, time + track.attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + track.attack + track.decay);
    amp.connect(chain.filter);
    const stopAt = time + track.attack + track.decay + 0.05;

    if (track.waveform === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer!;
      src.start(time, Math.random() * 1.5, stopAt - time);
      src.connect(amp);
      src.stop(stopAt);
    } else {
      const osc = ctx.createOscillator();
      osc.type = track.waveform;
      osc.frequency.setValueAtTime(freq, time);
      osc.connect(amp);
      osc.start(time);
      osc.stop(stopAt);
    }
  }
}
