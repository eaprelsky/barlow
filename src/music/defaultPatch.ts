import { euclid } from './euclid';
import { makeStep, makeTrack } from '../types';
import type { Patch, Track } from '../types';

let nextId = 1;
const id = () => `t${nextId++}`;

// Дефолтный патч — сразу слышная полиритмия: циклы 16, 9, 7 и 5 шагов
// с разными скоростями. Фазы треков постоянно пересекаются по-новому.
// 16 (kick, rate 4)  = 64 тика — «такт 4/4», точка сборки.
// 9 (perc, rate 2)   = 18 тиков, 7 (lead, rate 2) = 14, 5 (bass, rate 8) = 40.

function stepsFromMask(mask: boolean[], mul = 1): ReturnType<typeof makeStep>[] {
  return mask.map((on) => makeStep(on, mul));
}

export function defaultPatch(): Patch {
  nextId = 1;
  const tracks: Track[] = [
    makeTrack({
      id: id(),
      name: 'pulse',
      length: 16,
      rate: 4,
      waveform: 'sine',
      freq: 55,
      decay: 0.35,
      filterFreq: 900,
      volume: 0.9,
      steps: stepsFromMask(euclid(16, 4)),
    }),
    makeTrack({
      id: id(),
      name: 'grain',
      length: 9,
      rate: 2,
      waveform: 'noise',
      decay: 0.06,
      filterFreq: 6500,
      volume: 0.5,
      steps: stepsFromMask(euclid(9, 4)),
    }),
    makeTrack({
      id: id(),
      name: 'lead',
      length: 7,
      rate: 2,
      waveform: 'triangle',
      freq: 329.6,
      decay: 0.18,
      filterFreq: 4200,
      volume: 0.55,
      steps: stepsFromMask(euclid(7, 3), 1),
    }),
    makeTrack({
      id: id(),
      name: 'bass',
      length: 5,
      rate: 8,
      waveform: 'sine',
      freq: 41.2,
      decay: 0.8,
      filterFreq: 500,
      volume: 0.85,
      steps: stepsFromMask(euclid(5, 2), 1),
    }),
  ];
  // Несколько шагов лида на других высотах, чтобы полиритмия слышалась мелодически.
  const lead = tracks[2];
  if (lead.steps[1]) lead.steps[1].mul = 1.5;
  if (lead.steps[4]) lead.steps[4].mul = 2;
  if (lead.steps[6]) lead.steps[6].mul = 0.75;
  const bass = tracks[3];
  if (bass.steps[3]) bass.steps[3].mul = 1.5;
  return { version: 1, bpm: 118, tracks };
}
