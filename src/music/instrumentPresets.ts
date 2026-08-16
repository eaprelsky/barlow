// Пресеты инструментов для добавления трека: готовые параметры,
// пользователю остаётся накидать ноты в нотном стане.

import type { Track } from '../types';

export interface InstrumentPreset {
  name: string;
  hint: string;
  track: Partial<Track> & { length?: number };
}

const PENTATONIC_MINOR = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2];

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    name: 'бас',
    hint: 'низкий синус с долгим спадом — фундамент',
    track: {
      name: 'бас', waveform: 'sine', freq: 41.2, scale: [1, 6 / 5, 3 / 2, 2],
      length: 8, rate: 4, decay: 0.7, attack: 0.004, filterFreq: 320, volume: 0.85,
      mono: true,
    },
  },
  {
    name: 'лид',
    hint: 'пентатоника, короткие ноты — мелодия сверху',
    track: {
      name: 'лид', waveform: 'triangle', freq: 329.6, scale: PENTATONIC_MINOR,
      length: 7, rate: 2, decay: 0.18, filterFreq: 4500, volume: 0.55,
      effects: [{ type: 'delay', timeSec: 0.28, feedback: 0.4, mix: 0.25 }],
    },
  },
  {
    name: 'пульс',
    hint: 'бочка: нота стартует высоко и падает вниз — «вумп», опора ритма',
    track: {
      name: 'пульс', waveform: 'sine', freq: 48, scale: [1],
      length: 16, rate: 4, attack: 0.001, decay: 0.32,
      pitchDrop: 3.5, pitchTime: 0.09,
      filterFreq: 1400, volume: 0.9,
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
      effects: [{ type: 'reverb', sizeSec: 3.5, mix: 0.4 }],
    },
  },
  {
    name: 'сэмплер',
    hint: 'играет загруженный сэмпл; строки стана = скорость воспроизведения (питч)',
    track: {
      name: 'сэмпл', waveform: 'sample',
      scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      length: 16, rate: 2, attack: 0.001, decay: 1.2, filterFreq: 12000, volume: 0.8,
    },
  },
  {
    name: 'струна',
    hint: 'Karplus-Strong: щипок струны, выросший из шума — живой и пластинчатый',
    track: {
      name: 'струна', waveform: 'karplus', freq: 110, scale: PENTATONIC_MINOR,
      ksLife: 3,
      length: 11, rate: 2, attack: 0.002, decay: 1.6, filterFreq: 5000, volume: 0.7,
    },
  },
  {
    name: 'fm-звон',
    hint: 'частотная модуляция: колокола и металл — крути FM-отношение (√2 ≈ 1.41 — негармоничный звон)',
    track: {
      name: 'звон', waveform: 'fm', freq: 220, scale: PENTATONIC_MINOR,
      fmRatio: 1.41, fmIndex: 4,
      length: 9, rate: 2, attack: 0.002, decay: 0.6, filterFreq: 9000, volume: 0.6,
      effects: [{ type: 'reverb', sizeSec: 2.5, mix: 0.3 }],
    },
  },
  {
    name: 'супер-пила',
    hint: 'расстроенный унисон семи пил — жирная подложка и стены',
    track: {
      name: 'супер-пила', waveform: 'supersaw', freq: 110, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      voiceMorph: 0.55,
      length: 16, rate: 4, attack: 0.01, decay: 0.5, filterFreq: 5500, volume: 0.55,
    },
  },
  {
    name: 'вокал',
    hint: 'пила сквозь форманты — поёт гласные; морф едет А → Э → И → О → У',
    track: {
      name: 'вокал', waveform: 'formant', freq: 220, scale: PENTATONIC_MINOR,
      voiceMorph: 0.35,
      length: 13, rate: 2, attack: 0.06, decay: 0.7, filterFreq: 8000, volume: 0.7,
      effects: [{ type: 'reverb', sizeSec: 2.2, mix: 0.3 }],
    },
  },
  {
    name: 'колокол',
    hint: 'модальные резонаторы: маримба → колокол, морф — материал и время звона',
    track: {
      name: 'колокол', waveform: 'modal', freq: 220, scale: [1, 6 / 5, 3 / 2, 2, 9 / 5 * 2],
      voiceMorph: 0.8,
      length: 9, rate: 2, attack: 0.001, decay: 1.2, filterFreq: 12000, volume: 0.7,
      effects: [{ type: 'reverb', sizeSec: 3, mix: 0.35 }],
    },
  },
  {
    name: 'орган',
    hint: 'регистры 1,2,3,4,6,8 — морф открывает их по одному, от флейты до полного',
    track: {
      name: 'орган', waveform: 'organ', freq: 220, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      voiceMorph: 0.6,
      length: 16, rate: 2, attack: 0.02, decay: 0.6, filterFreq: 7000, volume: 0.6,
    },
  },
  {
    name: 'гармоники',
    hint: 'аддитивный: морф = яркость, число гармоник 2–16',
    track: {
      name: 'гармоники', waveform: 'additive', freq: 220, scale: PENTATONIC_MINOR,
      voiceMorph: 0.4,
      length: 12, rate: 2, attack: 0.01, decay: 0.5, filterFreq: 8000, volume: 0.65,
    },
  },
  {
    name: 'грануляр',
    hint: 'нота — облако коротких осколков сэмпла; загрузи сэмпл и двигай позицию облака',
    track: {
      name: 'гранулы', waveform: 'sample', sampleMode: 'grain',
      scale: [1, 4 / 3, 3 / 2, 2, 3],
      grainSizeMs: 140, grainCount: 12, grainPos: 0.25, grainScatter: 0.2,
      length: 8, rate: 2, attack: 0.01, decay: 1.4, filterFreq: 9000, volume: 0.75,
    },
  },
  {
    name: 'пустой',
    hint: 'чистый лист, всё настроишь сам',
    track: { name: 'трек', waveform: 'square', freq: 220, scale: [1], length: 16, rate: 1 },
  },
];
