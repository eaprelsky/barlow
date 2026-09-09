import { t as msg } from '../i18n/runtime.ts';
import { instrumentVoices } from '../music/layers';
import { selectChokeEvents } from './chokeEvents';
import type { Patch, Pattern, SoundingTrack, Track, WavRenderOptions } from '../types';
import { patternInScene, slotMuted } from '../types';
import { resolveMacros } from '../music/macros';
import { BAR_TICKS, startStepIndex, stepDuration, tickDuration } from './timing';
import { planStepEvents, type PlannedNoteEvent } from './eventPlan';
import { randomFor } from './random';
import { renderMemoryBytes, checkRenderMemory } from './renderMemory';
import { WEB_AUDIO_CAPABILITIES } from './capabilities';
import { estimateVoiceNodes } from './voiceBudget';
import { effectTailBound, voiceLifetimeBound } from './renderTail';
import { addResources, emptyResources, estimateChainResources, OFFLINE_CHAIN_LIMITS, resourcesFit, ChainBudgetError } from './chainBudget';

export const RENDER_LIMITS = { seconds: 600, tailSeconds: 120, chains: 512, steps: 200000, events: 20000, estimatedNodes: 100000 };

export interface RenderPart {
  key: string; itemIndex: number; start: number; end: number; bpm: number;
  track: Track; st: SoundingTrack; pattern: Pattern;
  steps: { at: number; index: number }[];
}
export interface RenderEvent extends PlannedNoteEvent {
  at: number; part: RenderPart; stepDur: number; ordinal: number; eventIndex: number;
}

/** Validate all allocation limits before creating an OfflineAudioContext or
 * loading assets. Repeated scene occurrences deliberately have distinct keys. */
export function planRender(patch: Patch, fallbackSceneId: string, fallbackBars: number, options?: WavRenderOptions) {
  const items = patch.followChain && patch.chain.length ? patch.chain : [{ sceneId: fallbackSceneId, bars: fallbackBars }];
  const parts: RenderPart[] = [];
  let events: RenderEvent[] = [];
  let start = 0.05, steps = 0, nodes = 0;
  for (const [itemIndex, item] of items.entries()) {
    const bpm = item.bpm ?? patch.bpm;
    const seconds = item.bars * BAR_TICKS * tickDuration(bpm);
    if (!Number.isFinite(seconds) || seconds <= 0 || start + seconds > RENDER_LIMITS.seconds + 0.05)
      throw new Error(msg("renderPlan.wavDurationMustBeBetweenOneBar"));
    const end = start + seconds;
    const scene = patch.scenes.find(s => s.id === item.sceneId) ?? patch.scenes[0];
    for (const track of patch.tracks) {
      const pattern = patternInScene(track, scene);
      if (!pattern) continue;
      if (parts.length >= RENDER_LIMITS.chains) throw new Error(msg("renderPlan.wavTheChainContainsMoreThan512"));
      const instrument = patch.instruments.find(i => i.id === track.instrumentId);
      const st = resolveMacros({ ...track, ...instrument } as SoundingTrack);
      const part: RenderPart = { key: `${itemIndex}:${track.id}`, itemIndex, start, end, bpm, track, st, pattern, steps: [] };
      parts.push(part);
      const audible = track.enabled !== false && !slotMuted(scene, track.id) && (!scene?.soloTrackId || scene.soloTrackId === track.id);
      const stepDur = stepDuration(track, bpm, pattern);
      if (!Number.isFinite(stepDur) || stepDur <= 0) throw new Error(msg("renderPlan.wavInvalidStepDuration"));
      let index = startStepIndex(track, pattern), ordinal = 0;
      for (let at = start; at < end - 0.001; at += stepDur) {
        if (++steps > RENDER_LIMITS.steps) throw new Error(msg("renderPlan.wavMoreThan200000StepsReduce"));
        part.steps.push({ at, index });
        if (audible) {
          const planned = planStepEvents(pattern.steps[index % pattern.steps.length], st, stepDur,
            randomFor(patch.performanceSeed, 'events', track.id, itemIndex, ordinal));
          for (const [eventIndex, event] of planned.entries()) {
            const time = Math.max(start, at + event.dt * stepDur + (event.offsetSec ?? 0));
            if (time >= end) continue;
            if (events.length >= RENDER_LIMITS.events)
              throw new Error(msg("renderPlan.wavSynthesisBudgetExceeded20000Events"));
            events.push({ ...event, at: time, part, stepDur, ordinal, eventIndex });
          }
        }
        index = (index + 1) % pattern.length; ordinal++;
      }
    }
    start = end;
  }
  events.sort((a, b) => a.at - b.at);
  events = selectChokeEvents(events, ev => ({ trackId: ev.part.track.id, group: ev.part.track.chokeGroup,
    priority: ev.part.track.chokePriority, order: patch.tracks.indexOf(ev.part.track) }));
  nodes = events.reduce((total, ev) => total + estimateVoiceNodes(ev.part.st, ev.notes), 0);
  if (nodes > RENDER_LIMITS.estimatedNodes) throw new Error(msg("renderPlan.wavSynthesisBudgetExceeded100000Estimated"));
  const sounding = new Set(events.map(ev => ev.part.key));
  const activeParts = parts.filter(part => sounding.has(part.key));
  let chainResources = activeParts.reduce((total, part) => addResources(total,
    estimateChainResources({ effects: part.st.effects, mods: part.pattern.mods ?? part.st.mods })), emptyResources());
  for (const ev of events) for (const voice of instrumentVoices(ev.part.st)) {
    if (voice.gain > 0 && voice.sound.voiceEffects?.length)
      chainResources = addResources(chainResources, estimateChainResources({effects:voice.sound.voiceEffects,mods:[]}));
  }
  if (!resourcesFit(chainResources, OFFLINE_CHAIN_LIMITS)) throw new ChainBudgetError();
  let duration = options ? start : start + .95;
  if (options?.tail === 'natural') {
    const tails = new Map<string, number>();
    for (const ev of events) {
      if (ev.part.itemIndex !== items.length - 1) continue;
      let tail = tails.get(ev.part.key);
      if (tail === undefined) { tail = effectTailBound(ev.part.st, ev.part.pattern); tails.set(ev.part.key, tail); }
      duration = Math.max(duration, ev.at + voiceLifetimeBound(ev.part.st, ev.notes, ev.stepDur, ev.durSec) + tail);
    }
    // Master/filter settling at the final boundary, also for a silent last scene.
    duration = Math.max(duration, start + 2);
    if (patch.sceneSpace) duration += patch.sceneSpace.sizeSec;
    if (!Number.isFinite(duration) || duration - start > RENDER_LIMITS.tailSeconds)
      throw new Error(msg("renderPlan.wavTheEstimatedTailExceeds120Seconds"));
  }
  if(patch.sceneSpace) chainResources.bufferBytes += Math.ceil(patch.sceneSpace.sizeSec*44100)*2*4*4;
  if (!resourcesFit(chainResources, OFFLINE_CHAIN_LIMITS)) throw new ChainBudgetError();
  const format = WEB_AUDIO_CAPABILITIES.wav;
  const memoryBytes = renderMemoryBytes(duration, format.channels, format.sampleRate, chainResources.bufferBytes);
  checkRenderMemory(memoryBytes);
  return { parts: activeParts, events, duration, musicalStart: .05, musicalEnd: start, finalItemIndex: items.length - 1, estimatedNodes: nodes, chainResources, memoryBytes };
}
