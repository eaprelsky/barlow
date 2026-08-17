// Формула тайминга — контракт между движком и UI: оба считают позицию
// шага одинаково (см. docs/DESIGN.md). Выделено в модуль: это первое,
// что портируется в Rust-движок один в один.

import type { Pattern, Track } from '../types';

export const LOOKAHEAD_MS = 25;
export const SCHEDULE_AHEAD = 0.12;
export const BAR_TICKS = 16;

export function tickDuration(bpm: number): number {
  // Базовый тик = 1/16 при rate = 1.
  return 60 / bpm / 4;
}

/** Скорость шага: эскиз может переопределять шаг трека (как громкость/панораму). */
export function effectiveRate(track: Track, pattern: Pattern | undefined): number {
  return pattern?.rate ?? track.rate;
}

export function stepDuration(track: Track, bpm: number, pattern?: Pattern): number {
  return effectiveRate(track, pattern) * tickDuration(bpm);
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
  return (Math.floor(elapsed / stepDuration(track, bpm, pattern)) + track.phase) % pattern.length;
}

/** Часы трека планировщика: следующий шаг, его время и время последнего
 *  сброса (границы сцены) — resetTime нужен playhead'у. */
export interface TrackClock {
  nextStepIndex: number;
  nextStepTime: number;
  resetTime: number;
}
