import type { Note, SoundingTrack, Step } from '../types';
import { arpEvents } from './arp';
import { withNoteLocks } from '../music/noteLocks';

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
  const notes = step?.notes.filter(note => random() < note.prob)
    .filter(note => track.waveform !== 'sample' || !note.sliceId || track.sampleSlices?.some(s => s.id === note.sliceId)) ?? [];
  if (!notes.length) return [];
  const noteLength = (note: Note) => {
    const st = withNoteLocks(track, note.locks);
    const base = st.noteSteps && st.noteSteps > 0 ? st.noteSteps : (Math.max(st.attack, .0005) + st.decay) / stepSec;
    return typeof note.len === 'number' && note.len > 0 ? Math.min(64, Math.max(.05, note.len)) : base * Math.min(4, Math.max(.1, note.gate ?? 1));
  };
  const length = Math.min(64, Math.max(0.05, ...notes.map(noteLength)));
  const ordinary = notes.every(n => (n.ratchet ?? 1) <= 1 && !n.microTimingMs);
  if (!track.arp && ordinary) return [{ notes, dt: 0 }];
  const initial = track.arp ? arpEvents(notes.map(note => note.len ? note : { ...note, len: noteLength(note) }), track.arp, length, random)
    : notes.map(note => ({note,dt:0,len:noteLength(note)}));
  return initial.flatMap(event => {
    const count = Math.max(1, Math.min(8, Math.round(event.note.ratchet ?? 1)));
    const span = Math.min(1, event.len), slot = span / count;
    const offsetSec = Math.max(-50, Math.min(50, event.note.microTimingMs ?? 0)) / 1000;
    return Array.from({length:count}, (_, index) => ({notes:[event.note], dt:event.dt + index * slot,
      durSec: count > 1 ? slot * stepSec : track.arp ? event.len * stepSec : undefined,
      offsetSec, gain: track.arp ? 1 : 1 / notes.length}));
  }).sort((a,b) => (a.dt-b.dt)*stepSec + a.offsetSec-b.offsetSec);
}
