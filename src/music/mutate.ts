// Мутация паттерна: пара случайных правок за нажатие — главный IDM-приём
// «поколечного» развития паттерна (мутируешь, слушаешь, оставляешь или снова мутируешь).

import type { Pattern, Step } from '../types';

const randNote = (scaleLength: number) => Math.floor(Math.random() * scaleLength);

function randomChord(scaleLength: number): number[] {
  const count = scaleLength > 1 && Math.random() < 0.3 ? 2 : 1;
  const notes = new Set<number>();
  while (notes.size < count) notes.add(randNote(scaleLength));
  return [...notes];
}

export function mutatePattern(pattern: Pattern, scaleLength: number, edits = 3): Pattern {
  const steps: Step[] = pattern.steps.map((s) => ({ ...s, notes: [...s.notes] }));
  const ops = ['toggle', 'chord', 'prob', 'vel'] as const;
  for (let i = 0; i < edits; i++) {
    const s = steps[Math.floor(Math.random() * steps.length)];
    if (!s) break;
    switch (ops[Math.floor(Math.random() * ops.length)]) {
      case 'toggle':
        s.notes = s.notes.length > 0 ? [] : randomChord(scaleLength);
        break;
      case 'chord':
        if (s.notes.length > 0) s.notes = randomChord(scaleLength);
        break;
      case 'prob':
        s.prob = 0.4 + Math.random() * 0.6;
        break;
      case 'vel':
        s.vel = 0.3 + Math.random() * 0.7;
        break;
    }
  }
  return { ...pattern, steps };
}
