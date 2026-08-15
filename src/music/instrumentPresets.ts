// Пресеты инструментов для добавления трека: готовые параметры,
// пользователю остаётся накидать ноты в нотном стане.

import type { Track } from '../types';

export interface InstrumentPreset {
  name: string;
  hint: string;
  track: Partial<Track>;
}

const PENTATONIC_MINOR = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2];

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    name: 'бас',
    hint: 'низкий синус с долгим спадом — фундамент',
    track: {
      name: 'бас', waveform: 'sine', freq: 41.2, scale: [1, 6 / 5, 3 / 2, 2],
      length: 8, rate: 4, decay: 0.7, attack: 0.004, filterFreq: 320, volume: 0.85,
    },
  },
  {
    name: 'лид',
    hint: 'пентатоника, короткие ноты — мелодия сверху',
    track: {
      name: 'лид', waveform: 'triangle', freq: 329.6, scale: PENTATONIC_MINOR,
      length: 7, rate: 2, decay: 0.18, filterFreq: 4500, volume: 0.55,
    },
  },
  {
    name: 'пульс',
    hint: 'низкий удар — опорная точка ритма',
    track: {
      name: 'пульс', waveform: 'sine', freq: 55, scale: [1],
      length: 16, rate: 4, decay: 0.35, filterFreq: 800, volume: 0.9,
    },
  },
  {
    name: 'хэт',
    hint: 'короткий шум — тики и сыпь между ударами',
    track: {
      name: 'хэт', waveform: 'noise', freq: 440, scale: [1],
      length: 11, rate: 1, decay: 0.05, filterFreq: 7000, volume: 0.45,
    },
  },
  {
    name: 'дрон',
    hint: 'долгая тянущаяся нота — фон-полотно',
    track: {
      name: 'дрон', waveform: 'sawtooth', freq: 110, scale: [1, 9 / 8],
      length: 3, rate: 16, attack: 0.3, decay: 2.5, filterFreq: 700, volume: 0.4,
    },
  },
  {
    name: 'пустой',
    hint: 'чистый лист, всё настроишь сам',
    track: { name: 'трек', waveform: 'square', freq: 220, scale: [1], length: 16, rate: 1 },
  },
];
