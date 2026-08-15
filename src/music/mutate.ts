// Мутация паттерна: пара случайных правок за нажатие — главный IDM-приём
// «поколечного» развития паттерна (мутируешь, слушаешь, оставляешь или снова мутируешь).

import type { Note, Pattern } from '../types';

const randNote = (rows: number) => Math.floor(Math.random() * rows);

function randomChord(rows: number): Note[] {
  const count = rows > 1 && Math.random() < 0.3 ? 2 : 1;
  const notes: Note[] = [];
  while (notes.length < count) {
    const n = randNote(rows);
    if (!notes.some((x) => x.n === n)) notes.push({ n, vel: 0.8, prob: 1 });
  }
  return notes;
}

export function mutatePattern(pattern: Pattern, rows: number, edits = 3): Pattern {
  const steps = pattern.steps.map((s) => ({ ...s, notes: s.notes.map((nt) => ({ ...nt })) }));
  const ops = ['toggle', 'height', 'prob', 'vel'] as const;
  for (let i = 0; i < edits; i++) {
    const s = steps[Math.floor(Math.random() * steps.length)];
    if (!s) break;
    switch (ops[Math.floor(Math.random() * ops.length)]) {
      case 'toggle':
        if (s.notes.length > 0) {
          s.notes.splice(Math.floor(Math.random() * s.notes.length), 1);
        } else {
          s.notes = randomChord(rows);
        }
        break;
      case 'height': {
        const nt = s.notes[Math.floor(Math.random() * s.notes.length)];
        if (nt) nt.n = randNote(rows);
        // от дублей высот в одном шаге избавляемся
        s.notes = s.notes.filter((nt2, i2, arr) => arr.findIndex((x) => x.n === nt2.n) === i2);
        break;
      }
      case 'prob': {
        const nt = s.notes[Math.floor(Math.random() * s.notes.length)];
        if (nt) nt.prob = 0.4 + Math.random() * 0.6;
        break;
      }
      case 'vel': {
        const nt = s.notes[Math.floor(Math.random() * s.notes.length)];
        if (nt) nt.vel = 0.3 + Math.random() * 0.7;
        break;
      }
    }
  }
  return { ...pattern, steps };
}
