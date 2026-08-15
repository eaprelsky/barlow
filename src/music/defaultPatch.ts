import { euclid } from './euclid';
import { SCALE_PRESETS } from './scales';
import { makeStep, makeTrack } from '../types';
import type { Patch, Step, Track } from '../types';

let nextId = 1;
const id = () => `t${nextId++}`;

const scale = (name: string): number[] =>
  SCALE_PRESETS.find((p) => p.name === name)?.ratios ?? [1];

function stepsFromMask(mask: boolean[]): Step[] {
  return mask.map((on) => makeStep(on));
}

// Проставить высоты on-шагам по порядку из списка индексов шкалы.
function withMelody(steps: Step[], notes: number[]): Step[] {
  let k = 0;
  return steps.map((s) => (s.on ? { ...s, note: notes[k++] ?? 0 } : s));
}

// Дефолтный патч — сразу слышная полиритмия: циклы 16, 9, 7 и 5 шагов
// с разными скоростями. Фазы треков постоянно пересекаются по-новому.
// 16 (pulse, rate 4) = 64 тика — «такт 4/4», точка сборки.
// 9 (grain, rate 2), 7 (lead, rate 2), 5 (bass, rate 8) — плывут вокруг.

export function defaultPatch(): Patch {
  nextId = 1;
  const tracks: Track[] = [
    makeTrack({
      id: id(),
      name: 'pulse',
      length: 16,
      rate: 4,
      waveform: 'sine',
      scale: scale('одна высота'),
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
      scale: scale('одна высота'),
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
      scale: scale('пентатоника, минор'),
      freq: 329.6,
      decay: 0.18,
      filterFreq: 4200,
      volume: 0.55,
      steps: withMelody(stepsFromMask(euclid(7, 3)), [2, 4, 0, 5]),
    }),
    makeTrack({
      id: id(),
      name: 'bass',
      length: 5,
      rate: 8,
      waveform: 'sine',
      scale: [1, 3 / 2],
      freq: 41.2,
      decay: 0.8,
      filterFreq: 500,
      volume: 0.85,
      steps: withMelody(stepsFromMask(euclid(5, 2)), [0, 1, 0]),
    }),
  ];
  return { version: 3, bpm: 118, tracks };
}
