import type { PlaybackRange, Pattern, Track } from '../types';
import { startStepIndex, stepDuration } from './timing';

export const MIN_RANGE_BEATS = 1/16;
export const MAX_RANGE_BEATS = 4096;
export function normalizePlaybackRange(value: PlaybackRange, max = MAX_RANGE_BEATS): PlaybackRange {
  const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;
  const end = Math.max(MIN_RANGE_BEATS, Math.min(max, finite(value.endBeat, 4)));
  const start = Math.max(0, Math.min(end - MIN_RANGE_BEATS, finite(value.startBeat, 0)));
  return { sceneId: String(value.sceneId), startBeat: start, endBeat: end,
    enabled: value.enabled === true, variation: value.variation === 'fixed' ? 'fixed' : 'evolving',
    seed: finite(value.seed, 1) >>> 0 };
}

/** Keep the original scene grid, including sub-step phase at the seek point.
 * Read one prior step for ratchets and early microtiming; long arps need 64. */
export function clockAtBeat(track: Track, pattern: Pattern, bpm: number, at: number, beat: number) {
  const resetTime = at - beat * 60 / bpm;
  const duration = stepDuration(track, bpm, pattern);
  const ordinal = Math.max(0, Math.floor((at - resetTime) / duration) - (track.arp ? 64 : 1));
  return { resetTime, eventOrdinal: ordinal, nextStepTime: resetTime + ordinal * duration,
    nextStepIndex: (startStepIndex(track, pattern) + ordinal) % pattern.length };
}
