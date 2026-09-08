import { selectChokeEvents } from './chokeEvents';
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

import type { Mod, Note, Patch, Scene, SoundingTrack, Track, WavRenderOptions } from '../types';
import { resolveMacros } from '../music/macros';
import { sampleAssets } from '../music/sampleZones';
import { SampleRoundRobin } from '../music/sampleRoundRobin';
import { DecodedAssets } from './decodedAssets';
import { copySamplePCM, type SamplePCM } from './pcm';
import { WEB_AUDIO_CAPABILITIES } from './capabilities';
import { renderMemoryBudget, renderMemoryBytes, RENDER_MEMORY_LIMIT } from './renderMemory';
import { autoToParam, autoValue, makeNote, modRateHz, patternInScene, slotMuted } from '../types';
import { planStepEvents } from './eventPlan';
import { MonoVoices } from './monoVoices';
import { randomFor } from './random';
import { EventQueue } from './eventQueue';
import { planRender, RENDER_LIMITS } from './renderPlan';
import { VoiceBudget } from './voiceBudget';
import { chainBudgetOf, emptyResources, ChainBudgetError } from './chainBudget';
import { sameAddress, effectId } from '../music/effectAddress';
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
  startChain,
  disposeChain,
  distCurve,
  fxParamOf,
  duckSidechain,
  fxSigOf,
  getImpulse,
  lofiCurve,
  makeChain,
  modScale,
  modsSigOf,
} from './fx';
import {
  ensureScratchModule,
  makeNoiseBuffer,
  makeScratchNode,
  normalizeBuffer,
  triggerVoice,
} from './voices';

// Совместимость потребителей: App и TrackRow импортируют тайминг отсюда.
export { tickDuration, stepIndexAt, effectiveRate, stepDuration } from './timing';
export type { TrackClock } from './timing';

/** Слышимые эскизы сцены: мастер-выключатель дорожки глушит везде,
 *  мьют слота — тишина в ЭТОЙ сцене (эскиз общий, в других сценах
 *  играет), соло сцены (эксклюзивное, привязано к дорожке — работает
 *  с любым эскизом трека) оставляет только свою дорожку. */
function audibleSet(patch: Patch, scene: Scene | undefined): Set<string> {
  const soloTrackId = scene?.soloTrackId;
  const out = new Set<string>();
  for (const t of patch.tracks) {
    if (t.enabled === false) continue;
    if (slotMuted(scene, t.id)) continue;
    const p = patternInScene(t, scene);
    if (!p) continue;
    if (!soloTrackId || t.id === soloTrackId) out.add(p.id);
  }
  return out;
}

/** Эскиз может переопределять ручки трека (громкость/панорама/модуляции). */
export function effectiveParams(track: Track, pattern: import('../types').Pattern | undefined) {
  return {
    volume: track.volume * (pattern?.volume ?? 1),
    pan: pattern?.pan ?? track.pan,
    mods: pattern?.mods ?? track.mods,
  };
}

/** Дорожка со слитым инструментом: синтез видит только слитый вид. */
function stOf(patch: Patch | null, track: Track): SoundingTrack {
  const inst = patch?.instruments?.find((i) => i.id === track.instrumentId);
  return resolveMacros(inst ? { ...track, ...inst } : (track as unknown as SoundingTrack));
}

function validSceneId(patch: Patch | null, want: string): string {
  const scenes = patch?.scenes ?? [];
  return scenes.some((s) => s.id === want) ? want : (scenes[0]?.id ?? '');
}

export class AudioEngine implements AudioBackend {
  readonly capabilities = WEB_AUDIO_CAPABILITIES;
  private pendingNotes = new EventQueue<{
    at: number; trackId: string; patternId: string; notes: Note[];
    stepDur: number; durSec?: number; gain: number; ordinal: number; eventIndex: number;
  }>();
  private voiceBudget = new VoiceBudget();
  private roundRobin = new SampleRoundRobin();
  private previewRoundRobin = new SampleRoundRobin();
  private droppedEvents = 0;
  private lateEvents = 0;
  private blockedTracks = new Set<string>();
  private schedulerMaxMs = 0;
  private slowSchedulerCalls = 0;
  private preparationMs = 0;
  get diagnostics() {
    this.voiceBudget.prune(this.ctx?.currentTime ?? 0);
    const chains = this.ctx ? chainBudgetOf(this.ctx).usage : emptyResources();
    return { activeNotes: this.voiceBudget.notes, estimatedNodes: this.voiceBudget.estimatedNodes,
      queuedEvents: this.pendingNotes.size, droppedEvents: this.droppedEvents, lateEvents: this.lateEvents,
      chains: chains.chains, chainNodes: chains.nodes, chainBufferBytes: chains.bufferBytes,
      blockedTracks: [...this.blockedTracks].map(id => this.patch?.tracks.find(t => t.id === id)?.name ?? id),
      schedulerMaxMs: this.schedulerMaxMs, slowSchedulerCalls: this.slowSchedulerCalls, preparationMs: this.preparationMs,
      decodedBytes: this.sampleCache.bytes, decodedAssets: this.sampleCache.size, pendingDecodes: this.sampleCache.pending };
  }
  // Дебаг-мост: приёмник событий нот live-планировщика.
  noteSink?: (trackId: string, at: number, notes: Note[]) => void;
  /** Приёмник ошибок превью (послушать жест/ноту/сэмпл): тихие падения —
   *  загадка «не слышно», UI показывает их сообщением. */
  warnSink?: (msg: string) => void;

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
  private stopRevision = 0;
  private patch: Patch | null = null;
  private startAt = 0;
  private sceneOccurrence = 0;
  // Декодированные сэмплы библиотеки, id → AudioBuffer.
  private sampleCache = new DecodedAssets<AudioBuffer>();
  private releasePatchAssets: (() => void) | undefined;
  private previewRequest = 0;
  private previewCleanup: (() => void) | null = null;
  private async loadSoundSample(st: SoundingTrack): Promise<void> {
    if (st.waveform !== 'sample') return;
    const ctx = this.ensureCtx();
    if (st.sampleMode === 'scratch') await ensureScratchModule(ctx);
    for (const asset of sampleAssets(st)) {
      await this.loadSample(asset.sampleId, asset.sampleName);
    }
  }
  private loadSample(id: string, name = id): Promise<AudioBuffer> {
    if (!/^[a-f0-9]{64}$/.test(id)) return Promise.reject(new Error('Некорректный SHA-256 сэмпла.'));
    return this.sampleCache.load(id, async () => {
      const blob = await getSampleBlob(id);
      if (!blob) throw new Error(`Нет записи «${name}» в библиотеке`);
      if (blob.size > 64 * 1048576) throw new Error('Файл сэмпла больше 64 МиБ.');
      const buf = await this.ensureCtx().decodeAudioData(await blob.arrayBuffer());
      const bytes = buf.length * buf.numberOfChannels * 4;
      if (bytes <= this.sampleCache.limits.assetBytes) normalizeBuffer(buf);
      return { value: buf, bytes };
    });
  }
  private patchAssetIds(patch: Patch): string[] {
    return patch.tracks.flatMap(t => {
      const st = stOf(patch, t);
      return st.waveform === 'sample' ? sampleAssets(st).map(a => a.sampleId) : [];
    });
  }
  private async loadMainSample(st: SoundingTrack, scratch = false): Promise<AudioBuffer | null> {
    if (!st.sampleId) return null;
    const sample = await this.loadSample(st.sampleId, st.sampleName);
    if (scratch) await ensureScratchModule(this.ensureCtx());
    return sample;
  }
  // Последний голос моно-трека — глушится при новой ноте.
  private lastVoices = new MonoVoices();
  private chokeVoices = new MonoVoices();
  private sceneId = '';
  // Живой темп: база из шапки или bpm текущего пункта цепочки (v35).
  private liveBpm = 120;
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

  /** Живой темп: шапка или bpm текущего пункта цепочки. */
  get currentBpm(): number {
    return this.liveBpm || this.patch?.bpm || 120;
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
      this.noiseBuffer = makeNoiseBuffer(this.ctx, this.patch?.performanceSeed);
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
    this.noiseLayer = connectMasterNoise(ctx, kind, patch.masterNoiseLevel ?? 0.03, patch.performanceSeed, Math.max(ctx.currentTime, this.startAt));
    this.noiseKind = kind;
  }

  /** Декодировать сэмплы, на которые ссылается патч (идемпотентно). */
  async ensureSamples(patch: Patch): Promise<void> {
    const release = this.sampleCache.pin(this.patchAssetIds(patch));
    try { for (const track of patch.tracks) await this.loadSoundSample(stOf(patch, track)); }
    finally { release(); }
  }

  /** Обновить данные патча без остановки: движок читает их на каждом шаге.
   *  Параметры цепочек применяет scheduler — ему известен активный эскиз. */
  setPatch(patch: Patch): void {
    const release = this.sampleCache.pin(this.patchAssetIds(patch));
    this.releasePatchAssets?.(); this.releasePatchAssets = release;
    if (this.ctx && this.patch?.performanceSeed !== patch.performanceSeed) {
      this.noiseBuffer = makeNoiseBuffer(this.ctx, patch.performanceSeed);
      this.stopNoiseLayer();
      for (const chain of this.chains.values()) this.retireChain(chain,this.ctx.currentTime);
      this.chains.clear(); this.lastVoices.clear(); this.chokeVoices.clear();
    }
    this.patch = patch;
    this.applyMasterVolume(patch.masterVolume);
    this.applyMasterFx(patch);
    if (!this.ctx) return;
    const alive = new Set(patch.tracks.map((t) => t.id));
    for (const id of this.blockedTracks) if (!alive.has(id)) this.blockedTracks.delete(id);
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
    chain.duck.gain.cancelScheduledValues(at);
    chain.duck.gain.setTargetAtTime(0, at, 0.02);
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

  /** Применить эффективные параметры эскиза к цепочке трека.
   *  Смена набора модуляций пересобирает цепочку: старая мягко уходит
   *  (хвосты нот затухают в ней), новая включается параллельно. */
  private applyTrackParams(
    trackId: string,
    chain: TrackChain,
    track: SoundingTrack,
    eff: { volume: number; pan: number; mods: Mod[] },
    pattern?: import('../types').Pattern,
  ): TrackChain {
    const ctx = this.ctx;
    if (!ctx || !this.master) return chain;
    const t0 = ctx.currentTime;
    // Переходная огибающая сыграла — план снимается, громкость снова
    // под управлением scheduler'а.
    if (chain.fadePlan && t0 > chain.fadePlan.entryEnd + 0.05) {
      chain.fadePlan = null;
      chain.fadeHold = undefined;
    }
    const sig = `${modsSigOf(eff.mods)}|${fxSigOf(track.effects ?? [])}`;
    if (chain.modSig !== sig) {
      const fresh = makeChain(ctx, { ...track, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master.input, this.currentBpm, this.patch?.performanceSeed, ctx.currentTime);
      this.retireChain(chain, t0);
      this.chains.set(trackId, fresh);
      return fresh;
    }
    // Resizing a reverb must reserve its new buffer before allocation too.
    chain.resourceLease?.resize({ effects: track.effects, mods: eff.mods });
    const autoOf = (target: string, fxId?: string) => pattern?.automation?.some(c => sameAddress(c, target, fxId, track.effects ?? []));
    chain.hp.frequency.setTargetAtTime(track.filterLow, t0, 0.03);
    // Автоматизированные цели качает кривая партии — базу сюда не пишем.
    if (!autoOf('filterFreq')) chain.filter.frequency.setTargetAtTime(track.filterFreq, t0, 0.03);
    chain.filter.Q.setTargetAtTime(track.filterQ ?? 0.8, t0, 0.03);
    if (!autoOf('pan')) chain.panner.pan.setTargetAtTime(eff.pan * 2 - 1, t0, 0.03);
    // Во время запланированного перехода сцен громкость на плане рамп —
    // setTarget здесь затёр бы их; вернёмся к обычному режиму после входа.
    if (!autoOf('volume') && (chain.fadeHold === undefined || t0 >= chain.fadeHold)) {
      chain.gain.gain.setTargetAtTime(eff.volume, t0, 0.03);
    }
    eff.mods.forEach((m, i) => {
      const nodes = chain.mods[i];
      if (!nodes) return;
      const freqParam = (nodes.src as OscillatorNode).frequency ?? (nodes.src as AudioBufferSourceNode).playbackRate;
      if (freqParam) freqParam.setTargetAtTime(modRateHz(m, this.currentBpm), t0, 0.05);
      nodes.depth.gain.setTargetAtTime(
        modScale(m.target, m.depth, chain.filter.frequency.value),
        t0,
        0.05,
      );
    });
    (track.effects ?? []).forEach((e, i) => {
      const n = chain.fx[i];
      if (!n) return;
      const id = effectId(e, i);
      if (!autoOf('fxMix', id)) n.mix.offset.setTargetAtTime(e.mix, t0, 0.03);
      if (e.type === 'delay') {
        if (!autoOf('fxTime', id)) n.timeControl?.source.offset.setTargetAtTime(e.timeSec, t0, 0.05);
        if (!autoOf('fxFeedback', id)) n.feedbackControl?.source.offset.setTargetAtTime(e.feedback, t0, 0.05);
      } else if (e.type === 'reverb' && n.convolver) {
        const ir = getImpulse(ctx, e.sizeSec, this.patch?.performanceSeed);
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
    const tickDur = tickDuration(this.liveBpm);
    const ticksNow = Math.max(0, (from - this.startAt) / tickDur);
    const nextBar = (Math.floor(ticksNow / BAR_TICKS) + 1) * BAR_TICKS;
    return this.startAt + nextBar * tickDur;
  }

  private scheduleSceneAdvance(t: number): void {
    const patch = this.patch!;
    if (patch.followChain && !this.manualMode) {
      const bars = patch.chain[this.chainPos]?.bars ?? 8;
      const itemBpm = patch.chain[this.chainPos]?.bpm ?? this.liveBpm;
      this.sceneAdvanceTime = t + bars * BAR_TICKS * tickDuration(itemBpm);
    } else if (this.pendingSceneId) {
      this.sceneAdvanceTime = t + BAR_TICKS * tickDuration(patch.bpm);
    } else {
      this.sceneAdvanceTime = null;
    }
    // Граница известна — планируем переходную огибающую заранее (выход
    // может начинаться за секунды до границы). null — перехода нет.
    this.armSceneExit(this.sceneAdvanceTime);
  }

  /** Переходная огибающая сцены: рампы на chain.gain. Уходящий эскиз
   *  затухает к границе (его fadeOut), входящий нарастает после неё
   *  (его fadeIn) — у каждой партии свой характер вступления и ухода.
   *
   *  Вызывается, когда граница становится известна (цепочка — конец
   *  текущего пункта; ручной клик — ближайший такт). Смена сцены в
   *  applyNextScene план не трогает: рампы расставлены заранее.
   *  Повторный вызов с той же границей и той же следующей сценой —
   *  no-op; с другой (перенаведение клика) — хвост перестраивается:
   *  идущий вход не рвётся, достраиваем после него.
   *
   *  boundary = null, cancel = true — переход отменён (выход из
   *  цепочки): снимаем рампы. null без cancel — план сыгран до конца
   *  (сцена применена), события добьют вход, нового ухода нет.
   *
   *  Известное ограничение: смена темпа в середине длинного выхода
   *  растягивает границу (setBpm), но не уже запланированные рампы —
   *  стык слегка съезжает; на слух незаметно, редкий случай. */
  private armSceneExit(boundary: number | null, opts?: { cancel?: boolean }): void {
    const ctx = this.ctx;
    const patch = this.patch;
    if (!ctx || !patch) return;
    const now = ctx.currentTime;
    const nextId = this.pendingSceneId
      ? this.validScene(this.pendingSceneId)
      : patch.followChain && !this.manualMode
        ? this.validScene(patch.chain[(this.chainPos + 1) % Math.max(1, patch.chain.length)]?.sceneId ?? '')
        : '';
    const nextScene = patch.scenes.find((s) => s.id === nextId);
    const curScene = this.scene();
    for (const track of patch.tracks) {
      const chain = this.chains.get(track.id);
      const clock = this.clocks.get(track.id);
      if (!chain || !clock) continue;
      const g = chain.gain.gain;
      const plan = chain.fadePlan;
      // Тот же переход — план уже стоит.
      if (boundary !== null && plan && plan.boundary === boundary && plan.nextSceneId === nextId) continue;
      const curP = patternInScene(track, curScene);
      const volCur = effectiveParams(track, curP).volume;
      const fadeInCur = Math.max(0.001, curP?.fadeIn ?? 0.005);
      const fadeOutCur = Math.max(0, curP?.fadeOut ?? 0.05);
      const inP = patternInScene(track, nextScene);
      const volIn = effectiveParams(track, inP).volume;
      const fadeInIn = Math.max(0.001, inP?.fadeIn ?? 0.005);
      const hasPlan = !!plan && plan.entryEnd > now + 0.001;

      if (boundary === null) {
        if (opts?.cancel && hasPlan) {
          // Переход отменён до границы — рампы не нужны.
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
        }
        if (hasPlan && !opts?.cancel) {
          // Сцена уже применена: событиям входа дать отыграть.
          chain.fadeHold = plan!.entryEnd;
        } else if (!hasPlan && !opts?.cancel && clock.resetTime > now + 0.001) {
          // Границы дальше нет, но партия только входит (старт/вливание) —
          // входной фейд от resetTime.
          g.setValueAtTime(0, clock.resetTime);
          g.linearRampToValueAtTime(volCur, clock.resetTime + fadeInCur);
          chain.fadeHold = clock.resetTime + fadeInCur;
        } else {
          chain.fadeHold = undefined;
        }
        chain.fadePlan = null;
        continue;
      }

      // Опорная точка, до которой на параметре уже есть события:
      // вход прошлого плана или вход свежей цепочки от resetTime.
      let anchor: number;
      if (hasPlan) {
        anchor = plan!.entryEnd;
      } else if (clock.resetTime > now + 0.001) {
        // Свежая цепочка: старт игры или вливание трека на ходу. До
        // resetTime голосов нет — значение на параметре не важно.
        g.setValueAtTime(0, clock.resetTime);
        g.linearRampToValueAtTime(volCur, clock.resetTime + fadeInCur);
        anchor = clock.resetTime + fadeInCur;
      } else {
        // Свободный параметр: фиксируем текущее значение и строим переход.
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.setTargetAtTime(volCur, now, 0.02);
        anchor = now;
      }
      const exitFrom = Math.max(anchor, boundary - fadeOutCur);
      if (exitFrom > anchor + 0.001) g.setValueAtTime(volCur, exitFrom);
      if (fadeOutCur > 0.001) {
        g.linearRampToValueAtTime(0, boundary);
      } else {
        g.setValueAtTime(0, boundary);
      }
      const entryEnd = boundary + fadeInIn;
      g.linearRampToValueAtTime(volIn, entryEnd);
      chain.fadePlan = { boundary, nextSceneId: nextId, entryEnd };
      chain.fadeHold = entryEnd;
    }
  }

  private applyNextScene(t: number): void {
    this.pendingNotes.clear();
    this.sceneOccurrence++;
    const patch = this.patch!;
    // Темп-карта: bpm нового пункта цепочки действует с его границы —
    // часы треков всё равно сбрасываются на t, так что просто берём.
    if (this.pendingSceneId) {
      this.sceneId = this.validScene(this.pendingSceneId);
      this.pendingSceneId = '';
    } else if (patch.followChain && !this.manualMode) {
      this.chainPos = (this.chainPos + 1) % Math.max(1, patch.chain.length);
      this.sceneId = this.validScene(patch.chain[this.chainPos]?.sceneId ?? '');
    }
    if (patch.followChain && !this.manualMode) {
      this.liveBpm = patch.chain[this.chainPos]?.bpm ?? patch.bpm;
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
      clock.eventOrdinal = 0;
    }
    this.scheduleSceneAdvance(t);
  }

  play(patch: Patch, sceneId: string): void {
    const preparationStart = performance.now();
    this.stop();
    this.droppedEvents = 0; this.lateEvents = 0;
    this.blockedTracks.clear(); this.schedulerMaxMs = 0; this.slowSchedulerCalls = 0;
    this.sceneOccurrence = 0;
    this.roundRobin.clear();
    const ctx = this.ensureCtx();
    this.noiseBuffer = makeNoiseBuffer(ctx, patch.performanceSeed);
    if (ctx.state === 'suspended') void ctx.resume();
    this.patch = patch;
    this.setPatch(patch);
    this.sceneId = this.validScene(sceneId);
    this.pendingSceneId = '';
    this.manualMode = !patch.followChain;
    const pos = patch.chain.findIndex((it) => it.sceneId === this.sceneId);
    this.chainPos = pos >= 0 ? pos : 0;
    this.liveBpm = patch.followChain ? patch.chain[this.chainPos]?.bpm ?? patch.bpm : patch.bpm;
    const scene = this.scene();
    const audible = audibleSet(patch, scene);
    for (const track of patch.tracks) {
      const pattern = patternInScene(track, scene);
      if (!pattern || !audible.has(pattern.id) || this.chains.has(track.id)) continue;
      const eff = effectiveParams(track, pattern);
      try {
        const chain = makeChain(ctx, { ...stOf(patch, track), ...eff }, this.master!.input, this.liveBpm, patch.performanceSeed, null);
        this.chains.set(track.id, chain);
      } catch (e) {
        if (!(e instanceof ChainBudgetError)) {
          for (const chain of this.chains.values()) disposeChain(chain);
          this.chains.clear(); throw e;
        }
        this.blockedTracks.add(track.id);
      }
    }
    this.preparationMs = performance.now() - preparationStart;
    this.startAt = ctx.currentTime + .1;
    for (const chain of this.chains.values()) startChain(chain, this.startAt);
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
      this.sceneAdvanceTime = this.startAt + bars * BAR_TICKS * tickDuration(this.liveBpm);
    } else {
      this.sceneAdvanceTime = null;
    }
    // Таймер — до applyMasterFx: слой шума создаётся только «пока играем»
    // (getter playing смотрит на таймер). Раньше шум не начинался на play,
    // а включался при первой правке патча — например, смене темпа.
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    this.armSceneExit(this.sceneAdvanceTime);
    this.applyMasterFx(patch);
    this.scheduler();
  }

  stop(): void {
    this.blockedTracks.clear();
    this.scratchEnd();
    ++this.regionRequest; this.regionCleanup?.(); this.regionCleanup = null;
    this.pendingNotes.clear();
    this.voiceBudget.stop(this.ctx?.currentTime ?? 0);
    ++this.previewRequest;
    this.previewCleanup?.();
    this.previewCleanup = null;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.stopNoiseLayer();
    this.clocks.clear();
    this.lastVoices.clear(); this.chokeVoices.clear();
    this.pendingSceneId = '';
    this.sceneAdvanceTime = null;
    // Detach this generation immediately: the next Play builds fresh LFO/FX.
    // Each timer owns a snapshot, so an earlier Stop cannot dispose a later Play.
    const stopped = [...this.chains.values(), ...this.retiring.map(r => r.chain)];
    this.chains.clear(); this.retiring = []; this.meters.clear();
    const revision = ++this.stopRevision;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const chain of stopped) {
        chain.duck.gain.cancelScheduledValues(now);
        chain.duck.gain.setTargetAtTime(0, now, .004);
        chain.gain.gain.cancelScheduledValues(now);
        chain.gain.gain.setTargetAtTime(0, now, .004);
      }
      this.master?.setVolume(0, now);
      window.setTimeout(() => {
        for (const chain of stopped) disposeChain(chain);
        if (revision === this.stopRevision && !this.playing && this.master && this.ctx)
          this.master.setVolume(this.patch?.masterVolume ?? 1, this.ctx.currentTime);
      }, 120);
    } else for (const chain of stopped) disposeChain(chain);
  }

  // ---- Ручной скрэтч-пэд: игла под мышью, вне планировщика ----

  private scratchNode: AudioWorkletNode | null = null;
  private scratchRequest = 0;
  // Обрезка сэмпла в нормальных координатах иглы (0..1 всего буфера).
  private scratchMap: ((p: number) => number) | null = null;

  /** Начать ручной скрэтч: игла с заданной позиции. Без играющего
   *  транспорта звук идёт прямо в мастер — запись жеста всегда слышна. */
  scratchBegin(track: Track, pos0 = 0): void {
    this.scratchEnd();
    const request = ++this.scratchRequest;
    void (async () => {
      const patch = this.patch;
      if (!patch) return;
      const st = stOf(patch, track);
      const sample = await this.loadMainSample(st, true);
      if (request !== this.scratchRequest) return;
      const ctx = this.ensureCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      if (!this.playing) this.applyMasterVolume(patch.masterVolume);
      if (request !== this.scratchRequest) return;
      const chain = this.chains.get(track.id);
      if (!sample || (!chain && !this.master)) return;
      const dest: AudioNode = chain ? chain.hp : this.master!.input;
      // Игла ходит по обрезанному куску сэмпла, если он задан.
      const rs = Math.max(0, Math.min(st.sampleStart ?? 0, sample.duration - 0.001));
      const re = Math.max(rs + 0.001, Math.min(st.sampleEnd ?? sample.duration, sample.duration));
      this.scratchMap = (p) => Math.min(1, Math.max(0, p)) * ((re - rs) / sample.duration) + rs / sample.duration;
      const node = makeScratchNode(ctx, sample);
      const pos = node.parameters.get('position')!;
      const off = node.parameters.get('off')!;
      pos.setValueAtTime(this.scratchMap(pos0), ctx.currentTime);
      off.setValueAtTime(0, ctx.currentTime);
      node.connect(dest);
      this.scratchNode = node;
    })().catch(e => { if (request === this.scratchRequest) this.warnSink?.(`Скрэтч: ${String(e)}`); });
  }

  /** Игла едет за мышью. */
  scratchMove(pos: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.scratchNode) return;
    const p = this.scratchMap ? this.scratchMap(pos) : Math.min(1, Math.max(0, pos));
    this.scratchNode.parameters
      .get('position')!
      // tau побольше: мышиные события ~8 мс, резкие цели дают дробность
      .setTargetAtTime(p, ctx.currentTime, 0.02);
  }

  /** Прослушать жест одной нотой: работает и без играющего транспорта —
   *  сэмпл догружается, при отсутствии цепочки трека звук идёт в мастер.
   *  Возвращает null, если сыграло, или причину тишины (покажет UI). */
  async previewScratch(track: Track): Promise<string | null> {
    const request = ++this.previewRequest;
    this.previewCleanup?.(); this.previewCleanup = null;
    const patch = this.patch;
    if (!patch) return 'патч ещё не загружен';
    // Контекст и resume — синхронно, в стеке клика: после первого await
    // выйдем из пользовательского жеста, и resume подвисшего контекста
    // может не пройти (autoplay-политика).
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.playing) this.applyMasterVolume(patch.masterVolume);
    const st = stOf(patch, track);
    let sample: AudioBuffer | null;
    try { sample = await this.loadMainSample(st, true); }
    catch (e) { return request === this.previewRequest ? `Сэмпл не загрузился: ${String(e)}` : null; }
    if (request !== this.previewRequest) return null;
    if (!sample) return 'в слоте дорожки нет сэмпла';
    const chain = this.chains.get(track.id);
    if (!chain && !this.master) return 'звуковой граф не поднят';
    // Игла ходит по обрезанному куску сэмпла; пустая обрезка — тишина.
    const rs = Math.max(0, Math.min(st.sampleStart ?? 0, sample.duration - 0.001));
    const re = Math.max(rs + 0.001, Math.min(st.sampleEnd ?? sample.duration, sample.duration));
    if (re - rs < 0.01) return 'обрезка сэмпла почти пустая — расширь кусок в редакторе волны';
    try {
      const dest: AudioNode = chain ? chain.hp : this.master!.input;
      const stepSec = stepDuration(track, patch.bpm, patternInScene(track, this.scene()));
      const len =
        st.noteSteps && st.noteSteps > 0
          ? st.noteSteps * stepSec
          : st.attack + st.decay;
      const node = makeScratchNode(ctx, sample);
      const pos = node.parameters.get('position')!;
      const off = node.parameters.get('off')!;
      const mapPos = (p: number) =>
        Math.min(1, Math.max(0, p)) * ((re - rs) / sample.duration) + rs / sample.duration;
      const t0 = ctx.currentTime + 0.02;
      const points = (st.scratchPoints ?? []).slice().sort((x, y) => x.t - y.t);
      if (points.length === 0) {
        pos.setValueAtTime(mapPos(0), t0);
        pos.linearRampToValueAtTime(mapPos(1), t0 + len);
      } else {
        pos.setValueAtTime(mapPos(points[0].pos), t0);
        for (const pt of points) pos.linearRampToValueAtTime(mapPos(pt.pos), t0 + pt.t * len);
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
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return; cleaned = true;
        window.clearTimeout(timeout);
        off.cancelScheduledValues(ctx.currentTime);
        off.setValueAtTime(1, ctx.currentTime + .03);
        amp.gain.cancelScheduledValues(ctx.currentTime);
        amp.gain.setTargetAtTime(0, ctx.currentTime, .004);
        window.setTimeout(() => { node.disconnect(); amp.disconnect(); }, 40);
        if (this.previewCleanup === cleanup) this.previewCleanup = null;
      };
      const timeout = window.setTimeout(cleanup, Math.max(0, t0 + len + .15 - ctx.currentTime) * 1000);
      this.previewCleanup = cleanup;
      return null;
    } catch (e) {
      return `ошибка звука: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Отпустили: узел завершает себя по расписанию off. */
  scratchEnd(): void {
    ++this.scratchRequest;
    const ctx = this.ctx;
    this.scratchMap = null;
    if (!ctx || !this.scratchNode) return;
    const node = this.scratchNode;
    node.parameters.get('off')!.setValueAtTime(1, ctx.currentTime + 0.05);
    window.setTimeout(() => node.disconnect(), 70);
    this.scratchNode = null;
  }

  /** Заморозить жест скрэтча сэмпла: оффлайн-рендер одной ноты жеста
   *  в WAV — тот же звук, что «▶ послушать» (обрезка куска, ломаная,
   *  огибающая с плато). Удачная настройка становится готовым сэмплом
   *  библиотеки — не надо настраивать скрэтч заново. */
  async renderScratchWav(track: Track): Promise<Blob> {
    const patch = this.patch;
    if (!patch) throw new Error('патч не загружен');
    const st = stOf(patch, track);
    const stepSec = stepDuration(track, patch.bpm, patternInScene(track, this.scene()));
    const len = st.noteSteps && st.noteSteps > 0 ? st.noteSteps * stepSec : st.attack + st.decay;
    if (!Number.isFinite(len) || len <= 0 || len > RENDER_LIMITS.seconds) throw new Error('WAV: жест должен быть не длиннее 10 минут.');
    const bytes = renderMemoryBytes(len + .2, 1);
    const memory = renderMemoryBudget.reserve(bytes);
    try {
      const sample = await this.loadMainSample(st);
      if (!sample) throw new Error('в слоте нет сэмпла');
      memory.resize(bytes + sample.length * sample.numberOfChannels * 8);
      return await this.renderPreparedScratch(st, sample, len);
    } finally { memory.release(); }
  }

  private async renderPreparedScratch(st: SoundingTrack, sample: AudioBuffer, len: number): Promise<Blob> {
    const ctx = new OfflineAudioContext(1, Math.ceil((len + 0.2) * 44100), 44100);
    await ensureScratchModule(ctx);
    const node = makeScratchNode(ctx, sample);
    const pos = node.parameters.get('position')!;
    const off = node.parameters.get('off')!;
    // Жест иглы ходит по обрезанному куску сэмпла.
    const rs = Math.max(0, Math.min(st.sampleStart ?? 0, sample.duration - 0.001));
    const re = Math.max(rs + 0.001, Math.min(st.sampleEnd ?? sample.duration, sample.duration));
    const mapPos = (p: number) =>
      Math.min(1, Math.max(0, p)) * ((re - rs) / sample.duration) + rs / sample.duration;
    const t0 = 0.02;
    const points = (st.scratchPoints ?? []).slice().sort((x, y) => x.t - y.t);
    if (points.length === 0) {
      pos.setValueAtTime(mapPos(0), t0);
      pos.linearRampToValueAtTime(mapPos(1), t0 + len);
    } else {
      pos.setValueAtTime(mapPos(points[0].pos), t0);
      for (const pt of points) pos.linearRampToValueAtTime(mapPos(pt.pos), t0 + pt.t * len);
    }
    off.setValueAtTime(0, t0);
    off.setValueAtTime(1, t0 + len + 0.1);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(0.9, t0 + 0.005);
    amp.gain.setValueAtTime(0.9, t0 + len * 0.88);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    node.connect(amp);
    amp.connect(ctx.destination);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  private peaksCache = new Map<string, { peaks: number[]; duration: number }>();

  /** Пики волны сэмпла (64 сегмента, нормированы в 0..1) и длительность —
   *  для мини-карты скрэтч-пэда: видно, где в сэмпле удары, где тишина. */
  async getSamplePeaks(
    id: string | undefined,
  ): Promise<{ peaks: number[]; duration: number } | null> {
    if (!id) return null;
    const cached = this.peaksCache.get(id);
    if (cached) return cached;
    const buf = await this.loadSample(id);
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
    const entry = { peaks, duration: buf.duration };
    if (this.peaksCache.size >= 1024) this.peaksCache.delete(this.peaksCache.keys().next().value!);
    this.peaksCache.set(id, entry);
    return entry;
  }

  /** Декодированный буфер сэмпла — редактору волны для канваса
   *  (пики на любой зум считает UI по буферу). */
  async getSamplePCM(id: string | undefined): Promise<SamplePCM | null> {
    if (!id) return null;
    return copySamplePCM(await this.loadSample(id));
  }

  /** Прослушать кусок сэмпла (редактор: проверка обрезки). Играет через
   *  цепочку трека, если транспорт стоит — прямо в мастер. */
  private regionRequest = 0;
  private regionCleanup: (() => void) | null = null;
  previewSampleRegion(track: SoundingTrack, fromSec: number, toSec: number): void {
    const request = ++this.regionRequest;
    this.regionCleanup?.(); this.regionCleanup = null;
    void (async () => {
      const patch = this.patch;
      if (!patch) return;
      const st = resolveMacros(track);
      const sample = await this.loadMainSample(st);
      if (request !== this.regionRequest) return;
      const ctx = this.ensureCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      if (!this.playing) this.applyMasterVolume(patch.masterVolume);
      if (!sample || !this.master) return;
      const chain = this.chains.get(track.id);
      const dest: AudioNode = chain ? chain.hp : this.master.input;
      const from = Math.max(0, Math.min(fromSec, sample.duration - 0.001));
      const to = Math.max(from + 0.01, Math.min(toSec, sample.duration));
      const t0 = ctx.currentTime + 0.02;
      const src = ctx.createBufferSource();
      src.buffer = sample;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.9, t0 + 0.005);
      const dur = to - from;
      g.gain.setValueAtTime(0.9, t0 + Math.max(0.005, dur - 0.02));
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      src.connect(g);
      g.connect(dest);
      src.start(t0, from, dur);
      src.stop(t0 + dur + 0.02);
      const release = () => { src.onended = null; src.disconnect(); g.disconnect();
        if (this.regionCleanup === cleanup) this.regionCleanup = null;
      };
      const cleanup = () => {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, .004);
        try { src.stop(ctx.currentTime + .03); } catch { release(); }
        if (this.regionCleanup === cleanup) this.regionCleanup = null;
      };
      this.regionCleanup = cleanup;
      src.onended = release;
    })().catch(e => { if (request === this.regionRequest) this.warnSink?.(`Прослушивание сэмпла: ${String(e)}`); });
  }

  /** Прослушать одну ноту слитого трека (SoundingTrack). Так браузер
   *  звуков слушает пресеты ещё до применения; previewNote — обёртка
   *  для трека из текущего патча. Тот же triggerVoice, что и в
   *  планировщике — слышим ровно то, что будет в паттерне. */
  previewSounding(st: SoundingTrack, noteRow = 0): void {
    st = resolveMacros(st);
    const request = ++this.previewRequest;
    this.previewCleanup?.();
    // Контекст и resume — синхронно, в стеке клика (см. previewScratch).
    const ctx0 = this.ensureCtx();
    if (ctx0.state === 'suspended') void ctx0.resume();
    // Стоп гасил мастер под хвосты — превью вне игры должно звучать.
    if (!this.playing) this.applyMasterVolume(this.patch?.masterVolume ?? 1);
    void (async () => {
      const patch = this.patch;
      if (!patch) return;
      const releaseAssets = this.sampleCache.pin(sampleAssets(st).map(a => a.sampleId));
      let assetsOwnedByPreview = false;
      try {
        try {
          await this.loadSoundSample(st);
        } catch (e) {
          if (request === this.previewRequest) this.warnSink?.(`Сэмпл не загрузился: ${String(e)}`);
          return;
        }
        const ctx = this.ensureCtx();
        if (request !== this.previewRequest) return;
        if (!this.master || !this.noiseBuffer) return;
        // Сэмпловый тембр без буфера (слот пуст или не загрузился) — тишина
        // без объяснений; говорим.
        if (st.waveform === 'sample' && !sampleAssets(st).some(a => this.sampleCache.has(a.sampleId))) {
          this.warnSink?.('В слоте дорожки нет сэмпла — «▶ нота» молчит');
          return;
        }
        let failedChain: TrackChain | undefined;
        try {
          // Audition has its own complete chain: it must not inherit the old
          // track's filters/FX or alter its running notes.
          const pseudo = makeChain(ctx, st, this.master.input, patch.bpm, patch.performanceSeed, ctx.currentTime + 0.02);
          failedChain = pseudo;
          const pattern = patternInScene(st, this.scene());
          const stepSec = stepDuration(st, patch.bpm, pattern);
          const notes = [makeNote(noteRow, 0.9, 1)];
          this.voiceBudget.prune(ctx.currentTime);
          if (!this.voiceBudget.allows(st, notes)) throw new Error('Превышен бюджет голосов. Уменьши унисон/число операторов или останови транспорт для прослушивания.');
          const voice = triggerVoice(
            ctx,
            pseudo,
            this.noiseBuffer,
            this.sampleCache.get(st.sampleId ?? '') ?? null,
            st,
            notes,
            ctx.currentTime + 0.02,
            stepSec,
            undefined,
            (id) => this.sampleCache.get(id) ?? null,
            randomFor(patch.performanceSeed, 'preview', st.id, noteRow),
            this.previewRoundRobin,
          );
          this.voiceBudget.add(voice, st, notes);
          let cleaned = false;
          const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            voice.stopAt = Math.min(voice.stopAt, ctx.currentTime + .03);
            voice.amp.gain.cancelScheduledValues(ctx.currentTime);
            voice.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
            window.setTimeout(() => {
              for (const source of voice.sources) { try { (source as AudioScheduledSourceNode).stop?.(); } catch { /* ended */ } source.disconnect(); }
              voice.amp.disconnect();
              disposeChain(pseudo);
              releaseAssets();
            }, 30);
          };
          const tail = Math.max(0.1, ...(st.effects ?? []).map((fx) => fx.type === 'reverb' ? fx.sizeSec : fx.type === 'delay' ? Math.min(12, fx.timeSec * 12) : 0));
          const timeout = window.setTimeout(cleanup, Math.max(0, voice.stopAt - ctx.currentTime + tail) * 1000);
          this.previewCleanup = () => { window.clearTimeout(timeout); cleanup(); };
          assetsOwnedByPreview = true;
          failedChain = undefined; // cleanup now owns this graph and reservation
          // Голос живёт своей огибающей; хвост подчищаем по stopAt.
          const src = voice.sources[0];
          try {
            (src as AudioScheduledSourceNode).stop?.(voice.stopAt);
          } catch {
            /* уже остановлен */
          }
        } catch (e) {
          if (failedChain) disposeChain(failedChain);
          this.warnSink?.(
            `Нота не прозвучала: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      } finally { if (!assetsOwnedByPreview) releaseAssets(); }
    })();
  }

  /** Прослушать одну ноту инструмента дорожки (редактор: тембр на слух).
   *  Понимает и «сырой» Track (сливает с инструментом из патча), и уже
   *  слитый SoundingTrack с оверрайдами — редактор инструмента слушает
   *  черновик волны и накрученные ручки до их записи в патч. */
  previewNote(track: Track, noteRow = 0): void {
    const patch = this.patch;
    if (!patch) return;
    const merged: SoundingTrack =
      'attack' in track && 'decay' in track
        ? (track as SoundingTrack)
        : stOf(patch, track);
    this.previewSounding(merged, noteRow);
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
    // Клик по другой сцене до границы — перенаводим переходную рампу.
    this.armSceneExit(this.sceneAdvanceTime);
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
    this.liveBpm = bpm;
    const stretch = (t: number) => now + (t - now) * ratio;
    this.pendingNotes.transform(ev => ({ ...ev, at: stretch(ev.at), stepDur: ev.stepDur * ratio,
      durSec: ev.durSec === undefined ? undefined : ev.durSec * ratio }));
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
      const itemBpm = this.patch.chain[this.chainPos]?.bpm ?? this.liveBpm;
      // Расчёт времени следующего перехода от границы такта.
      const t = this.sceneAdvanceTime;
      this.sceneAdvanceTime = t + bars * BAR_TICKS * tickDuration(itemBpm);
      this.armSceneExit(this.sceneAdvanceTime);
    } else {
      this.sceneAdvanceTime = this.pendingSceneId ? this.sceneAdvanceTime : null;
      // Выход из цепочки без заявленной сцены — переход отменяем; с заявленной
      // (кликнули сцену, потом выключили цепочку) — граница и рампы живут.
      this.armSceneExit(this.sceneAdvanceTime, { cancel: this.sceneAdvanceTime === null });
    }
  }

  private scheduler(): void {
    const started = performance.now();
    try { this.runScheduler(); }
    finally {
      const elapsed = performance.now() - started;
      this.schedulerMaxMs = Math.max(this.schedulerMaxMs, elapsed);
      if (elapsed > LOOKAHEAD_MS) this.slowSchedulerCalls++;
    }
  }

  private runScheduler(): void {
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
      // Finish the outgoing scene before resetting its clocks. Otherwise
      // the last lookahead window was silently skipped at every boundary.
      this.scheduleWindow(this.sceneAdvanceTime);
      this.applyNextScene(this.sceneAdvanceTime);
    }
    this.scheduleWindow(horizon);
  }

  private scheduleWindow(horizon: number): void {
    const ctx = this.ctx;
    const patch = this.patch;
    if (!ctx || !patch || !this.noiseBuffer) return;

    const scene = this.scene();
    const audible = audibleSet(patch, scene);
    for (const track of patch.tracks) {
      const pattern = patternInScene(track, scene);
      if (!pattern) { this.blockedTracks.delete(track.id); continue; }
      const st = stOf(patch, track);
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
      const trackAudible = audible.has(pattern.id);
      if (!trackAudible) {
        if (chain) { this.retireChain(chain, Math.max(ctx.currentTime, clock.resetTime)); this.chains.delete(track.id); chain = undefined; }
        this.blockedTracks.delete(track.id);
      } else {
        try {
          if (!chain && this.master) {
            chain = makeChain(ctx, { ...st, volume: eff.volume, pan: eff.pan, mods: eff.mods }, this.master.input, this.currentBpm, patch.performanceSeed, Math.max(ctx.currentTime,clock.resetTime));
            this.chains.set(track.id, chain);
            this.armSceneExit(this.sceneAdvanceTime);
          }
          if (chain) chain = this.applyTrackParams(track.id, chain, st, eff, pattern);
          this.blockedTracks.delete(track.id);
        } catch (e) {
          if (!(e instanceof ChainBudgetError)) throw e;
          // Retire the old graph rather than playing a new instrument through
          // effects that no longer match the patch. Retry after tails release.
          if (chain) { this.retireChain(chain, ctx.currentTime); this.chains.delete(track.id); chain = undefined; }
          this.blockedTracks.add(track.id);
        }
      }
      const stepDur = stepDuration(track, this.liveBpm, pattern);
      let g = 0;
      // Read up to 50 ms earlier for negative microtiming, but never read
      // a grid step belonging to the next scene.
      const planningEnd = Math.min(horizon + 0.05, this.sceneAdvanceTime ?? Infinity);
      while (clock.nextStepTime < planningEnd && g++ < 1024) {
        const step = pattern.steps[clock.nextStepIndex % pattern.steps.length];
        if (trackAudible) {
          const ordinal = clock.eventOrdinal ?? 0;
          const events = planStepEvents(step, st, stepDur, randomFor(patch.performanceSeed, 'events', track.id, this.sceneOccurrence, ordinal));
          for (const [eventIndex, ev] of events.entries()) {
            if (!chain) { this.droppedEvents++; continue; }
            const at = Math.max(clock.resetTime, clock.nextStepTime + ev.dt * stepDur + (ev.offsetSec ?? 0));
            if (at >= (this.sceneAdvanceTime ?? Infinity)) continue;
            if (!this.pendingNotes.push({ at, trackId: track.id, patternId: pattern.id,
              notes: ev.notes, stepDur, durSec: ev.durSec, gain: ev.gain ?? 1, ordinal, eventIndex })) {
              this.droppedEvents++;
            }
          }
        }
        // Кривые партии: значение параметра на границе шага (v35).
        if (chain && pattern.automation?.length) {
          const pos = clock.nextStepIndex / pattern.length;
          for (const c of pattern.automation) {
            const v = autoValue(c.points, pos);
            if (v === undefined) continue;
            const at = clock.nextStepTime;
            if (c.target === 'filterFreq') {
              chain.filter.frequency.setTargetAtTime(autoToParam('filterFreq', v), at, 0.03);
            } else if (c.target === 'pan') {
              chain.panner.pan.setTargetAtTime(v * 2 - 1, at, 0.03);
            } else if (c.target === 'volume' && (chain.fadeHold === undefined || ctx.currentTime >= chain.fadeHold)) {
              chain.gain.gain.setTargetAtTime(eff.volume * v, at, 0.03);
            } else if (c.target.startsWith('fx')) {
              fxParamOf(chain.fx, c.target, c.fxId)?.setTargetAtTime(autoToParam(c.target, v), at, 0.03);
            }
          }
        }
        clock.nextStepTime += stepDur;
        clock.nextStepIndex = (clock.nextStepIndex + 1) % pattern.length;
        clock.eventOrdinal = (clock.eventOrdinal ?? 0) + 1;
      }
    }
    this.lastVoices.prune(ctx.currentTime);
    this.chokeVoices.prune(ctx.currentTime);
    this.voiceBudget.prune(ctx.currentTime);
    const ready = this.pendingNotes.drain(horizon).filter(ev => {
      const track = patch.tracks.find(t => t.id === ev.trackId);
      return track && audible.has(ev.patternId) && patternInScene(track, scene)?.id === ev.patternId;
    });
    const selected = selectChokeEvents(ready, ev => {
      const track = patch.tracks.find(t => t.id === ev.trackId)!;
      return { trackId: track.id, group: this.chains.has(track.id) ? track.chokeGroup : undefined,
        priority: track.chokePriority, order: patch.tracks.indexOf(track) };
    });
    for (const ev of selected) {
      const track = patch.tracks.find(t => t.id === ev.trackId);
      if (!track || !audible.has(ev.patternId) || patternInScene(track, scene)?.id !== ev.patternId) continue;
      const chain = this.chains.get(track.id);
      if (!chain) { this.droppedEvents++; continue; }
      const st = stOf(patch, track);
      if (!this.voiceBudget.allows(st, ev.notes)) { this.droppedEvents++; continue; }
      if (ev.at < ctx.currentTime) this.lateEvents++;
      const at = Math.max(ctx.currentTime + 0.001, ev.at);
      const voice = triggerVoice(ctx, chain, this.noiseBuffer, this.sampleCache.get(st.sampleId ?? '') ?? null,
        st, ev.notes, at, ev.stepDur, ev.durSec, id => this.sampleCache.get(id) ?? null,
        randomFor(patch.performanceSeed, 'voice', track.id, this.sceneOccurrence, ev.ordinal, ev.eventIndex), this.roundRobin, track.id);
      voice.amp.gain.value *= ev.gain;
      this.voiceBudget.add(voice, st, ev.notes);
      if (track.mono) this.lastVoices.register(track.id, voice, at);
      if (track.chokeGroup) this.chokeVoices.register(String(track.chokeGroup), voice, at);
      this.noteSink?.(track.id, at, ev.notes);
      for (const rt of patch.tracks) {
        const sc = rt.sidechain;
        const rc = this.chains.get(rt.id);
        if (sc?.sourceId === track.id && rc) duckSidechain(rc.duck, at, sc);
      }
    }
  }

  /** Оффлайн-рендер в WAV: по цепочке (арранжмент) или N тактов одной сцены. */
  async renderToWav(patch: Patch, fallbackSceneId: string, fallbackBars = 8, options?: WavRenderOptions): Promise<Blob> {
    const plan = planRender(patch, fallbackSceneId, fallbackBars, options);
    const memory = renderMemoryBudget.reserve(plan.memoryBytes);
    const assets = new Set(plan.parts.flatMap(p => p.st.waveform === 'sample' ? sampleAssets(p.st).map(a => a.sampleId) : []));
    const release = this.sampleCache.pin(assets);
    try {
      for (const part of plan.parts) await this.loadSoundSample(part.st);
      let assetBytes = 0;
      for (const id of assets) { const b = this.sampleCache.get(id); if (b) assetBytes += b.length * b.numberOfChannels * 4; }
      memory.resize(plan.memoryBytes + assetBytes);
      return await this.renderPreparedWav(patch, plan, options);
    } finally { release(); memory.release(); }
  }

  estimateWav(patch: Patch, sceneId: string, bars: number, options: WavRenderOptions) {
    const plan = planRender(patch, sceneId, bars, options);
    return { musicSeconds: plan.musicalEnd - plan.musicalStart, maxSeconds: plan.duration - plan.musicalStart, workingBytes: plan.memoryBytes, memoryLimitBytes: RENDER_MEMORY_LIMIT };
  }

  private async renderPreparedWav(patch: Patch, plan: ReturnType<typeof planRender>, options?: WavRenderOptions): Promise<Blob> {
    const duration = plan.duration;
    const { sampleRate, channels } = this.capabilities.wav;
    const ctx = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate);
    // Worklet-модули грузятся на каждый контекст отдельно (live и offline —
    // разные глобальные скоупы), иначе AudioWorkletNode не создастся.
    if (plan.parts.some(p=>p.st.waveform==='sample' && p.st.sampleMode==='scratch')) await ensureScratchModule(ctx);
    const master = connectMaster(ctx, patch.masterVolume, patch.masterComp ?? 0);
    master.setPan(patch.masterPan ?? 0.5, 0);
    if (patch.masterNoise === 'white' || patch.masterNoise === 'pink') {
      const layer = connectMasterNoise(ctx, patch.masterNoise, patch.masterNoiseLevel ?? 0.03, patch.performanceSeed, options ? plan.musicalStart : 0);
      if (options) {
        layer.gain.gain.setValueAtTime(layer.gain.gain.value, Math.max(plan.musicalStart, plan.musicalEnd - .02));
        layer.gain.gain.linearRampToValueAtTime(0, plan.musicalEnd);
        layer.src.stop(plan.musicalEnd);
      }
    }
    const noise = makeNoiseBuffer(ctx, patch.performanceSeed);

    const chainsByKey = new Map<string, TrackChain>();
    try {
      for (const part of plan.parts) {
        const { track, st, pattern, bpm, start, end } = part;
        const eff = effectiveParams(track, pattern);
        const naturalFinal = options?.tail === 'natural' && part.itemIndex === plan.finalItemIndex;
        const output = options ? ctx.createGain() : master.input;
        if (options) {
          output.connect(master.input);
          if (!naturalFinal) {
            output.gain.setValueAtTime(1, Math.max(start, end - .005));
            output.gain.linearRampToValueAtTime(0, end);
          }
        }
        const chain = makeChain(ctx, { ...st, ...eff }, output, bpm, patch.performanceSeed, start);
        chainsByKey.set(part.key, chain);
        const fadeIn = Math.max(0.001, pattern.fadeIn ?? 0.005);
        const fadeOut = Math.max(0, pattern.fadeOut ?? 0.05);
        const gg = chain.gain.gain;
        gg.setValueAtTime(0, start);
        gg.linearRampToValueAtTime(eff.volume, start + fadeIn);
        if (!naturalFinal) {
          const exitFrom = Math.max(start + fadeIn, end - fadeOut);
          if (exitFrom < end - 0.001) gg.setValueAtTime(eff.volume, exitFrom);
          if (fadeOut > 0.001) gg.linearRampToValueAtTime(0, end);
          else gg.setValueAtTime(0, end);
        }
        for (const step of part.steps) {
          for (const c of pattern.automation ?? []) {
            const v = autoValue(c.points, step.index / pattern.length);
            if (v === undefined) continue;
            const at = step.at;
            if (c.target === 'filterFreq') chain.filter.frequency.setTargetAtTime(autoToParam('filterFreq', v), at, 0.03);
            else if (c.target === 'pan') chain.panner.pan.setTargetAtTime(v * 2 - 1, at, 0.03);
            else if (c.target === 'volume') chain.gain.gain.setTargetAtTime(eff.volume * v, at, 0.03);
            else if (c.target.startsWith('fx')) fxParamOf(chain.fx, c.target, c.fxId)?.setTargetAtTime(autoToParam(c.target, v), at, 0.03);
          }
        }
      }
      // Globally ordered creation is required for mono/choke/voice budgets.
      const monoVoices = new MonoVoices();
      const chokeVoices = new MonoVoices();
      const voiceBudget = new VoiceBudget();
      const roundRobin = new SampleRoundRobin();
      for (const ev of plan.events) {
        const { track, st, itemIndex } = ev.part;
        voiceBudget.prune(ev.at);
        if (!voiceBudget.allows(st, ev.notes))
          throw new Error('WAV: превышена полифония (128 нот / 8192 условных узла). Уменьши длину нот, унисон или плотность арпеджио.');
        const chain = chainsByKey.get(ev.part.key)!;
        const voice = triggerVoice(ctx, chain, noise, this.sampleCache.get(st.sampleId ?? '') ?? null,
          st, ev.notes, ev.at, ev.stepDur, ev.durSec, id => this.sampleCache.get(id) ?? null,
          randomFor(patch.performanceSeed, 'voice', track.id, itemIndex, ev.ordinal, ev.eventIndex), roundRobin, track.id);
        voice.amp.gain.value *= ev.gain ?? 1;
        voiceBudget.add(voice, st, ev.notes);
        monoVoices.prune(ev.at);
        if (track.mono) monoVoices.register(track.id, voice, ev.at);
        chokeVoices.prune(ev.at);
        if (track.chokeGroup) chokeVoices.register(String(track.chokeGroup), voice, ev.at);
        for (const rt of patch.tracks) {
          const sc = rt.sidechain;
          const rc = chainsByKey.get(`${itemIndex}:${rt.id}`);
          if (sc?.sourceId === track.id && rc) duckSidechain(rc.duck, ev.at, sc);
        }
      }
      const rendered = await ctx.startRendering();
      if (!options) return audioBufferToWav(rendered);
      const from = Math.round(plan.musicalStart * sampleRate);
      let to = Math.round(plan.musicalEnd * sampleRate);
      if (options.tail === 'natural') {
        let last = to - 1;
        for (let c = 0; c < rendered.numberOfChannels; c++) {
          const data = rendered.getChannelData(c);
          for (let i = data.length - 1; i >= to; i--) {
            if (!Number.isFinite(data[i])) throw new Error('WAV: некорректный сигнал при рендере хвоста.');
            if (Math.abs(data[i]) > 1 / 32768) { last = Math.max(last, i); break; }
          }
        }
        const silence = Math.ceil(.05 * sampleRate);
        if (last >= rendered.length - silence)
          throw new Error('WAV: звук не успел затихнуть в расчётное время. Файл не обрезан и не сохранён. Уменьши feedback или выбери точную границу.');
        if (last >= to) to = Math.min(rendered.length, last + 1 + silence);
      }
      return audioBufferToWav(rendered, { from, to, fadeFrames: Math.round(.005 * sampleRate) });
    } finally {
      for (const chain of chainsByKey.values()) disposeChain(chain);
    }
  }
}
