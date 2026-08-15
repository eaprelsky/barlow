// Мутация трека: пара случайных правок за нажатие — главный IDM-приём
// «поколечного» развития паттерна (мутируешь, слушаешь, оставляешь или снова мутируешь).

import type { Step, Track } from '../types';

export const MUL_CYCLE = [1, 2, 1.5, 0.5, 3, 0.75];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function mutateTrack(track: Track, edits = 3): Track {
  const steps: Step[] = track.steps.map((s) => ({ ...s }));
  const ops = ['toggle', 'mul', 'prob', 'vel'] as const;
  for (let i = 0; i < edits; i++) {
    const s = steps[Math.floor(Math.random() * steps.length)];
    if (!s) break;
    switch (pick(ops)) {
      case 'toggle':
        s.on = !s.on;
        break;
      case 'mul':
        s.mul = pick(MUL_CYCLE);
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
