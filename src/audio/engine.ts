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
// Синтез и цепочки — в voices.ts / fx.ts, формула тайминга — timing.ts.
// Публичная поверхность движка — контракт AudioBackend (backend.ts):
// UI не знает про Web Audio, завтра за этим же интерфейсом живёт Rust.

import type { Mod, Patch, Scene, Track } from '../types';
import { patternInScene } from '../types';
import { audioBufferToWav } from './wav';
import { getSampleBlob } from './library';
import type { AudioBackend } from './backend';
import {
  BAR_TICKS,
  LOOKAHEAD_MS,
  SCHEDULE_AHEAD,
  startStepIndex,
  stepDuration,
  tickDuration,
} from './timing';
import type { TrackClock } from './timing';
import {
  type MasterNodes,
  type TrackChain,
  connectMaster,
  connectMasterNoise,
  disposeChain,
  distCurve,
  dryGain,
  duckSidechain,
  fxSigOf,
  getImpulse,
  lofiCurve,
  makeChain,
  modScale,
  modsSigOf,
  wetGain,
} from './fx';
import {
  type Voice,
  duckVoice,
  ensureScratchModule,
  liveNotes,
  makeNoiseBuffer,
  makeScratchNode,
  normalizeBuffer,
  triggerVoice,
} from './voices';

// Совместимость потребителей: App и TrackRow импортируют тайминг отсюда.
export { tickDuration, stepIndexAt, effectiveRate, stepDuration } from './timing';
export type { TrackClock } from './timing';

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
export function effectiveParams(track: Track, pattern: import('../types').Pattern | undefined) {
  return {
    volume: pattern?.volume ?? track.volume,
    pan: pattern?.pan ?? track.pan,
    mods: pattern?.mods ?? track.mods,
  };
}

function validSceneId(patch: Patch | null, want: string): string {
  const scenes = patch?.scenes ?? [];
  return scenes.some((s) => s.id === want) ? want : (scenes[0]?.id ?? '');
}

export class AudioEngine implements AudioBackend {
  private ctx: AudioContext | null = null;
  private master: MasterNodes | null = null;
  // Слой мастер-шума (после лимитера) и его текущий вид. Живёт только
  // пока движок играет — на стопе глушится.
  private noiseLayer: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private noiseKind = '';
  private noiseBuffer: AudioBuffer | null = null;
  private chains = new Map<string, TrackChain>();
  // Уходящие цепочки: хвосты нот доигрывают с затуханием ~30 мс, потом
  // узлы освобождаются — стык инструментов/эскизов без щелчка.
  private retiring: { chain: TrackChain; dieAt: number }[] = [];
  // Баллистика тумбометров: пик кадра с мгновенной атакой и плавным спадом.
  private meters = new Map<string, { buf: Float32Array<ArrayBuffer>; level: number }>();
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
        this.retireChain(chain, this.ctx.currentTime);
        this.chains.delete(id);
        this.clocks.delete(id);
        this.meters.delete(id);
        this.lastVoices.delete(id);
      }
    }
  }

  /** Мягко увести цепочку: гейн в ноль за ~20 мс, узлы живут ещё 0.3 c —
   *  хвосты нот затухают, а не обрываются (клик на стыке). */
  private retireChain(chain: TrackChain, at: number): void {
    chain.gain.gain.cancelScheduledValues(at);
    chain.gain.gain.setTargetAtTime(0, at, 0.02);
    for (const m of chain.mods) {
      try {
        m.src.stop(at + 0.3);
      } catch {
        /* уже остановлен */
      }
    }
    for (const f of chain.fx) f.lfo?.stop(at + 0.3);
    this.retiring.push({ chain, dieAt: at + 0.3 });
  }

  /** Живой уровень дорожки 0..1 для индикации: пик с мгновенной атакой
   *  и экспоненциальным спадом. Вызывается из rAF — должно быть дёшево. */
  trackLevel(trackId: string): number {
    const chain = this.chains.get(trackId);
    if (!chain || !this.ctx) return 0;
    let st = this.meters.get(trackId);
    if (!st) {
      st = { buf: new Float32Array(chain.meter.fftSize), level: 0 };
      this.meters.set(trackId, st);
    }
    chain.meter.getFloatTimeDomainData(st.buf);
    let peak = 0;
    for (let i = 0; i < st.buf.length; i++) {
      const v = Math.abs(st.buf[i]);
      if (v > peak) peak = v;
    }
    st.level = peak > st.level ? peak : st.level * 0.86 + peak * 0.14;
    return st.level > 1 ? 1 : st.level;
  }

  private duckLastVoice(trackId: string, t: number): void {
    const prev = this.lastVoices.get(trackId);
    if (prev && prev.stopAt > t) duckVoice(prev, t);
    this.lastVoices.delete(trackId);
  }

  /** Применить эффективные параметры эскиза к цепочке трека.
   *  Смена набора модуляций пересобирает цепочку: старая мягко уходит
   *  (хвосты нот затухают в ней), новая включается параллельно. */
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
      this.retireChain(chain, t0);
      const fresh = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master.input);
      this.chains.set(trackId, fresh);
      return fresh;
    }
    chain.hp.frequency.setTargetAtTime(track.filterLow, t0, 0.03);
    chain.filter.frequency.setTargetAtTime(track.filterFreq, t0, 0.03);
    chain.filter.Q.setTargetAtTime(track.filterQ ?? 0.8, t0, 0.03);
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
    // Таймер — до applyMasterFx: слой шума создаётся только «пока играем»
    // (getter playing смотрит на таймер). Раньше шум не начинался на play,
    // а включался при первой правке патча — например, смене темпа.
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    this.applyMasterFx(patch);
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
    // Хвосты (эхо, реверб) не доигрывают в тишине после стопа: мастер
    // плавно гасится, цепочки разбираются — на следующем play scheduler
    // соберёт их заново.
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.setVolume(0, t);
      window.setTimeout(() => {
        if (this.playing) return; // успели нажать play — не трогаем
        for (const chain of this.chains.values()) disposeChain(chain);
        for (const r of this.retiring) disposeChain(r.chain);
        this.retiring = [];
        this.chains.clear();
        this.meters.clear();
      }, 120);
    }
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

  /** Смена темпа на ходу: часы треков пере-якорятся — позиция шага
   *  сохраняется, дальше играем новым темпом. Границы сцен и тактов
   *  масштабируются той же пропорцией, playhead не прыгает. */
  setBpm(bpm: number): void {
    const patch = this.patch;
    if (!patch || !this.ctx) return;
    const old = patch.bpm;
    if (bpm === old || !Number.isFinite(bpm) || bpm <= 0) return;
    const now = this.ctx.currentTime;
    const ratio = tickDuration(bpm) / tickDuration(old);
    const stretch = (t: number) => now + (t - now) * ratio;
    // Якорь тактов (nextBarTime) и граница сцены едут той же пропорцией.
    this.startAt = stretch(this.startAt);
    if (this.sceneAdvanceTime !== null) this.sceneAdvanceTime = stretch(this.sceneAdvanceTime);
    for (const [id, clock] of this.clocks) {
      const track = patch.tracks.find((t) => t.id === id);
      if (!track) continue;
      const pattern = patternInScene(track, this.scene());
      if (!pattern) continue;
      // Дробная позиция в шагах с момента сброса — сохраняем её точно,
      // формула playhead остаётся непрерывной через новый якорь.
      const oldStepDur = stepDuration(track, old, pattern);
      const posFrac = Math.max(0, (now - clock.resetTime) / oldStepDur);
      const newStepDur = oldStepDur * ratio;
      clock.resetTime = now - posFrac * newStepDur;
      clock.nextStepTime = Math.max(stretch(clock.nextStepTime), now + 0.01);
    }
    this.patch = { ...patch, bpm };
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

    // Освобождение доживших уходящих цепочек.
    if (this.retiring.length > 0) {
      this.retiring = this.retiring.filter((r) => {
        if (r.dieAt > ctx.currentTime) return true;
        disposeChain(r.chain);
        return false;
      });
    }

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
    // Worklet-модули грузятся на каждый контекст отдельно (live и offline —
    // разные глобальные скоупы), иначе AudioWorkletNode не создастся.
    await ensureScratchModule(ctx);
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
