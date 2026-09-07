import type { Patch, Pattern, SoundingTrack, Track } from '../types';
import { patternInScene, slotMuted } from '../types';
import { resolveMacros } from '../music/macros';
import { BAR_TICKS, startStepIndex, stepDuration, tickDuration } from './timing';
import { planStepEvents, type PlannedNoteEvent } from './eventPlan';
import { randomFor } from './random';
import { estimateVoiceNodes } from './voiceBudget';

export const RENDER_LIMITS = { seconds: 600, chains: 512, steps: 200000, events: 20000, estimatedNodes: 100000 };

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
export function planRender(patch: Patch, fallbackSceneId: string, fallbackBars: number) {
  const items = patch.followChain && patch.chain.length ? patch.chain : [{ sceneId: fallbackSceneId, bars: fallbackBars }];
  const parts: RenderPart[] = [], events: RenderEvent[] = [];
  let start = 0.05, steps = 0, nodes = 0;
  for (const [itemIndex, item] of items.entries()) {
    const bpm = item.bpm ?? patch.bpm;
    const seconds = item.bars * BAR_TICKS * tickDuration(bpm);
    if (!Number.isFinite(seconds) || seconds <= 0 || start + seconds > RENDER_LIMITS.seconds + 0.05)
      throw new Error('WAV: длина должна быть от одного такта до 10 минут. Сократи цепочку для экспорта.');
    const end = start + seconds;
    const scene = patch.scenes.find(s => s.id === item.sceneId) ?? patch.scenes[0];
    for (const track of patch.tracks) {
      const pattern = patternInScene(track, scene);
      if (!pattern) continue;
      if (parts.length >= RENDER_LIMITS.chains) throw new Error('WAV: больше 512 партий в цепочке. Экспортируй её частями.');
      const instrument = patch.instruments.find(i => i.id === track.instrumentId);
      const st = resolveMacros({ ...track, ...instrument } as SoundingTrack);
      const part: RenderPart = { key: `${itemIndex}:${track.id}`, itemIndex, start, end, bpm, track, st, pattern, steps: [] };
      parts.push(part);
      const audible = track.enabled !== false && !slotMuted(scene, track.id) && (!scene?.soloTrackId || scene.soloTrackId === track.id);
      const stepDur = stepDuration(track, bpm, pattern);
      if (!Number.isFinite(stepDur) || stepDur <= 0) throw new Error('WAV: недопустимая длительность шага.');
      let index = startStepIndex(track, pattern), ordinal = 0;
      for (let at = start; at < end - 0.001; at += stepDur) {
        if (++steps > RENDER_LIMITS.steps) throw new Error('WAV: больше 200 000 шагов. Уменьши плотность или длину цепочки.');
        part.steps.push({ at, index });
        if (audible) {
          const planned = planStepEvents(pattern.steps[index % pattern.steps.length], st, stepDur,
            randomFor(patch.performanceSeed, 'events', track.id, itemIndex, ordinal));
          for (const [eventIndex, event] of planned.entries()) {
            const time = Math.max(start, at + event.dt * stepDur + (event.offsetSec ?? 0));
            if (time >= end) continue;
            nodes += estimateVoiceNodes(st, event.notes.length);
            if (events.length >= RENDER_LIMITS.events || nodes > RENDER_LIMITS.estimatedNodes)
              throw new Error('WAV: превышен бюджет синтеза (20 000 событий / 100 000 условных узлов). Сократи унисон, арпеджио или цепочку.');
            events.push({ ...event, at: time, part, stepDur, ordinal, eventIndex });
          }
        }
        index = (index + 1) % pattern.length; ordinal++;
      }
    }
    start = end;
  }
  events.sort((a, b) => a.at - b.at);
  return { parts, events, duration: start + 0.95, estimatedNodes: nodes };
}
