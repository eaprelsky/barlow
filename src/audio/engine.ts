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

import type { Mod, ModTarget, Patch, Pattern, Scene, Step, Track } from '../types';
import { patternInScene, stepFreqs } from '../types';
import { audioBufferToWav } from './wav';
import { getSampleBlob } from './library';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const BAR_TICKS = 16;

export function tickDuration(bpm: number): number {
  // Базовый тик = 1/16 при rate = 1.
  return 60 / bpm / 4;
}

export function stepDuration(track: Track, bpm: number): number {
  return track.rate * tickDuration(bpm);
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
  return (Math.floor(elapsed / stepDuration(track, bpm)) + track.phase) % pattern.length;
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

interface TrackChain {
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  mods: ModNodes[];
  // Сигнатура набора модуляций: изменилась — цепочка пересобирается.
  modSig: string;
}

const modsSigOf = (mods: Mod[]) => mods.map((m) => `${m.target}:${m.shape}`).join(',');

/** Эскиз может переопределять ручки трека (громкость/панорама/модуляции). */
export function effectiveParams(track: Track, pattern: Pattern | undefined) {
  return {
    volume: pattern?.volume ?? track.volume,
    pan: pattern?.pan ?? track.pan,
    mods: pattern?.mods ?? track.mods,
  };
}

function modScale(target: ModTarget, depth: number): number {
  switch (target) {
    case 'pan':
      return depth; // ±1 максимум
    case 'volume':
      return depth * 0.5;
    case 'filterFreq':
      return depth * 1800;
  }
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
  const panner = ctx.createStereoPanner();
  panner.pan.value = track.pan * 2 - 1;
  const gain = ctx.createGain();
  gain.gain.value = track.volume;
  filter.connect(panner);
  panner.connect(gain);
  gain.connect(dest);
  const mods: ModNodes[] = track.mods.map((m) => {
    const lfo = ctx.createOscillator();
    lfo.type = m.shape;
    lfo.frequency.value = m.rate;
    const depth = ctx.createGain();
    depth.gain.value = modScale(m.target, m.depth);
    lfo.connect(depth);
    const param: AudioParam =
      m.target === 'pan' ? panner.pan : m.target === 'volume' ? gain.gain : filter.frequency;
    depth.connect(param);
    lfo.start(0);
    return { lfo, depth };
  });
  return { filter, panner, gain, mods, modSig: modsSigOf(track.mods) };
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
  chain.filter.disconnect();
  chain.panner.disconnect();
  chain.gain.disconnect();
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
  sample: AudioBuffer | null,
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
  } else if (track.waveform === 'sample') {
    // Сэмпл-плеер: шкала задаёт скорость воспроизведения (питч),
    // длина ноты — как всегда, атакой и спадом.
    if (!sample) return;
    const max = track.scale.length - 1;
    for (const n of step.notes) {
      const ratio = track.scale[Math.min(Math.max(Math.round(n), 0), max)] ?? 1;
      const src = ctx.createBufferSource();
      src.buffer = sample;
      src.playbackRate.value = ratio;
      src.connect(amp);
      src.start(time);
      src.stop(stopAt);
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
    }
  }
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
      }
    }
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
    const sig = modsSigOf(eff.mods);
    if (chain.modSig !== sig) {
      disposeChain(chain);
      const fresh = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master);
      this.chains.set(trackId, fresh);
      return fresh;
    }
    chain.filter.frequency.setTargetAtTime(track.filterFreq, t0, 0.03);
    chain.panner.pan.setTargetAtTime(eff.pan * 2 - 1, t0, 0.03);
    chain.gain.gain.setTargetAtTime(eff.volume, t0, 0.03);
    eff.mods.forEach((m, i) => {
      const nodes = chain.mods[i];
      if (!nodes) return;
      nodes.lfo.frequency.setTargetAtTime(m.rate, t0, 0.05);
      nodes.depth.gain.setTargetAtTime(modScale(m.target, m.depth), t0, 0.05);
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
    for (const track of patch.tracks) {
      const clock = this.clocks.get(track.id);
      const pattern = patternInScene(track, scene);
      if (!clock || !pattern) continue;
      const eff = effectiveParams(track, pattern);
      let chain = this.chains.get(track.id);
      if (!chain && this.master) {
        chain = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master);
        this.chains.set(track.id, chain);
      }
      if (!chain) continue;
      chain = this.applyTrackParams(track.id, chain, track, eff);
      const stepDur = stepDuration(track, patch.bpm);
      let g = 0;
      while (clock.nextStepTime < horizon && g++ < 1024) {
        const step = pattern.steps[clock.nextStepIndex % pattern.steps.length];
        if (step && fires(step)) {
          triggerVoice(ctx, chain, this.noiseBuffer, this.sampleCache.get(track.sampleId ?? '') ?? null, track, step, clock.nextStepTime);
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
      const stepDur = stepDuration(track, patch.bpm);
      let t = 0.05;
      for (const item of fixedItems) {
        const scene = patch.scenes.find((s) => s.id === item.sceneId);
        const pattern = patternInScene(track, scene);
        if (!pattern) continue;
        // Цепочка на каждую сцену: эскиз может нести свои ручки и модуляции.
        // Не dispose-им: запланированные ноты привязаны к узлам.
        const eff = effectiveParams(track, pattern);
        const chain = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, master);
        const itemDur = item.bars * BAR_TICKS * tickDur;
        let idx = startStepIndex(track, pattern);
        const sample = this.sampleCache.get(track.sampleId ?? '') ?? null;
        for (let tt = t; tt < t + itemDur - 0.001; tt += stepDur) {
          const step = pattern.steps[idx % pattern.steps.length];
          if (step && fires(step)) {
            triggerVoice(ctx, chain, noise, sample, track, step, tt);
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
