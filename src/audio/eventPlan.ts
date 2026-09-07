import type { Note, SoundingTrack, Step } from '../types';
import { arpEvents } from './arp';

export interface PlannedNoteEvent {
  notes: Note[];
  /** Offset in grid steps. Host converts once using its step duration. */
  dt: number;
  durSec?: number;
  offsetSec?: number;
  gain?: number;
}

/** Shared live/offline note semantics, independent of clocks and Web Audio.
 * Random source is injected, so event fixtures do not patch global Math.random. */
export function planStepEvents(step: Step | undefined, track: SoundingTrack, stepSec: number,
  random: () => number = Math.random): PlannedNoteEvent[] {
  const notes = step?.notes.filter(note => random() < note.prob) ?? [];
  if (!notes.length) return [];
  const base = track.noteSteps && track.noteSteps > 0 ? track.noteSteps
    : (Math.max(track.attack, 0.0005) + track.decay) / stepSec;
  const length = Math.min(64, Math.max(0.05, ...notes.map(note => typeof note.len === 'number' && note.len > 0
    ? Math.min(64, Math.max(0.05, note.len)) : base * Math.min(4, Math.max(0.1, note.gate ?? 1)))));
  const ordinary = notes.every(n => (n.ratchet ?? 1) <= 1 && !n.microTimingMs);
  if (!track.arp && ordinary) return [{ notes, dt: 0 }];
  const initial = track.arp ? arpEvents(notes, track.arp, length, random)
    : notes.map(note => ({note,dt:0,len: typeof note.len === 'number' ? note.len : base * (note.gate ?? 1)}));
  return initial.flatMap(event => {
    const count = Math.max(1, Math.min(8, Math.round(event.note.ratchet ?? 1)));
    const span = Math.min(1, event.len), slot = span / count;
    const offsetSec = Math.max(-50, Math.min(50, event.note.microTimingMs ?? 0)) / 1000;
    return Array.from({length:count}, (_, index) => ({notes:[event.note], dt:event.dt + index * slot,
      durSec: count > 1 ? slot * stepSec : track.arp ? event.len * stepSec : undefined,
      offsetSec, gain: track.arp ? 1 : 1 / notes.length}));
  }).sort((a,b) => (a.dt-b.dt)*stepSec + a.offsetSec-b.offsetSec);
}
