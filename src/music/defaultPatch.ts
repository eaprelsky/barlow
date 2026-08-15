import { euclid } from './euclid';
import { SCALE_PRESETS } from './scales';
import { PATCH_VERSION, makePattern, makeScene, makeStep, makeTrack, uid } from '../types';
import type { Patch, Step, Track } from '../types';

const scale = (name: string): number[] =>
  SCALE_PRESETS.find((p) => p.name === name)?.ratios ?? [1];

function stepsFromMask(mask: boolean[]): Step[] {
  return mask.map((on) => makeStep(on));
}

// Проставить высоты on-шагам по порядку; элемент списка — аккорд (индексы шкалы).
function withMelody(steps: Step[], notes: number[][]): Step[] {
  let k = 0;
  return steps.map((s) => {
    if (s.notes.length === 0) return s;
    return { ...s, notes: notes[k++] ?? [0] };
  });
}

// Дефолтный патч — сразу слышная полиритмия: циклы 16, 9, 7 и 5 шагов
// с разными скоростями. Одна сцена «осннова», у лида — второй эскиз «B»,
// чтобы фича паттернов была видна сразу.

export function defaultPatch(): Patch {
  const tracks: Track[] = [
    makeTrack({
      id: uid('t'),
      name: 'pulse',
      rate: 4,
      waveform: 'sine',
      scale: scale('одна высота'),
      freq: 48,
      attack: 0.001,
      decay: 0.32,
      pitchDrop: 3.5,
      pitchTime: 0.09,
      filterFreq: 1400,
      volume: 0.9,
      patterns: [makePattern('A', 16, stepsFromMask(euclid(16, 4)))],
    }),
    makeTrack({
      id: uid('t'),
      name: 'grain',
      rate: 2,
      waveform: 'noise',
      scale: scale('одна высота'),
      decay: 0.06,
      filterFreq: 6500,
      volume: 0.5,
      patterns: [
        makePattern('A', 9, stepsFromMask(euclid(9, 4))),
        makePattern('B', 9, stepsFromMask(euclid(9, 5))),
      ],
    }),
    makeTrack({
      id: uid('t'),
      name: 'lead',
      rate: 2,
      waveform: 'triangle',
      scale: scale('пентатоника, минор'),
      freq: 329.6,
      decay: 0.18,
      filterFreq: 4200,
      volume: 0.55,
      patterns: [
        makePattern('A', 7, withMelody(stepsFromMask(euclid(7, 3)), [[2], [4], [0, 2], [5]])),
      ],
    }),
    makeTrack({
      id: uid('t'),
      name: 'bass',
      rate: 8,
      waveform: 'sine',
      scale: [1, 3 / 2],
      freq: 41.2,
      mono: true,
      decay: 0.8,
      filterFreq: 500,
      volume: 0.85,
      patterns: [makePattern('A', 5, withMelody(stepsFromMask(euclid(5, 2)), [[0], [1], [0, 1]]))],
    }),
  ];
  const scene = makeScene('основа', tracks, (t) => t.patterns[0].id);
  return {
    version: PATCH_VERSION,
    bpm: 118,
    masterVolume: 1,
    followChain: false,
    scenes: [scene],
    chain: [{ sceneId: scene.id, bars: 8 }],
    tracks,
  };
}
