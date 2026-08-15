// Мутация трека: пара случайных правок за нажатие — главный IDM-приём
// «поколечного» развития паттерна (мутируешь, слушаешь, оставляешь или снова мутируешь).

import type { Step, Track } from '../types';

const randNote = (track: Track) => Math.floor(Math.random() * track.scale.length);

function randomChord(track: Track): number[] {
  const count = track.scale.length > 1 && Math.random() < 0.3 ? 2 : 1;
  const notes = new Set<number>();
  while (notes.size < count) notes.add(randNote(track));
  return [...notes];
}

export function mutateTrack(track: Track, edits = 3): Track {
  const steps: Step[] = track.steps.map((s) => ({ ...s, notes: [...s.notes] }));
  const ops = ['toggle', 'chord', 'prob', 'vel'] as const;
  for (let i = 0; i < edits; i++) {
    const s = steps[Math.floor(Math.random() * steps.length)];
    if (!s) break;
    switch (ops[Math.floor(Math.random() * ops.length)]) {
      case 'toggle':
        s.notes = s.notes.length > 0 ? [] : randomChord(track);
        break;
      case 'chord':
        if (s.notes.length > 0) s.notes = randomChord(track);
        break;
      case 'prob':
        s.prob = 0.4 + Math.random() * 0.6;
        break;
      case 'vel':
        s.vel = 0.3 + Math.random() * 0.7;
        break;
    }
  }
  return { ...track, steps };
}
