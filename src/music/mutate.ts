// Мутация паттерна: пара случайных правок за нажатие — главный IDM-приём
// «поколечного» развития паттерна (мутируешь, слушаешь, оставляешь или снова мутируешь).

import type { Note, Pattern } from '../types';

/** Что мутируем: время (вкл/выкл, вероятность, громкость) и/или тон (высота). */
export interface MutateModes {
  time: boolean;
  pitch: boolean;
}

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

export function mutatePattern(
  pattern: Pattern,
  rows: number,
  edits = 3,
  modes: MutateModes = { time: true, pitch: true },
): Pattern {
  const ops: string[] = [
    ...(modes.time ? (['toggle', 'prob', 'vel'] as const) : []),
    ...(modes.pitch ? (['height'] as const) : []),
  ];
  if (ops.length === 0) return pattern;
  const steps = pattern.steps.map((s) => ({ ...s, notes: s.notes.map((nt) => ({ ...nt })) }));
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

/** Случайно перебросить высоты всех нот по шкале: ритм, громкости,
 *  вероятности и длины нот остаются — меняется только тон. */
export function scatterHeights(pattern: Pattern, rows: number): Pattern {
  if (rows <= 1) return pattern;
  return {
    ...pattern,
    steps: pattern.steps.map((s) => {
      if (s.notes.length === 0) return s;
      const used = new Set<number>();
      return {
        ...s,
        notes: s.notes.map((nt) => {
          let n = randNote(rows);
          let guard = 0;
          while (used.has(n) && guard++ < rows * 2) n = randNote(rows);
          used.add(n);
          return { ...nt, n };
        }),
      };
    }),
  };
}

/** Разложить высоты нот ровной лестницей по строкам шкалы (слева направо,
 *  от низа к верху): пара к «высоты случайно» в равномерном режиме. */
export function spreadHeights(pattern: Pattern, rows: number): Pattern {
  if (rows <= 1) return pattern;
  const total = pattern.steps.reduce((acc, s) => acc + s.notes.length, 0);
  if (total === 0) return pattern;
  let k = 0;
  return {
    ...pattern,
    steps: pattern.steps.map((s) => ({
      ...s,
      notes: s.notes.map((nt) => ({
        ...nt,
        n: Math.min(rows - 1, Math.round((k++ * (rows - 1)) / Math.max(total - 1, 1))),
      })),
    })),
  };
}
