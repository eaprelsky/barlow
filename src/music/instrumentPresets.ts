// Пресеты инструментов для добавления трека: готовые параметры,
// пользователю остаётся накидать ноты в нотном стане.

import type { Track } from '../types';

export interface InstrumentPreset {
  name: string;
  // Группа в браузере инструментов (порядок категорий — CATEGORY_ORDER).
  category: string;
  // Пояснение для поиска встроенных; на плитке не показывается.
  hint?: string;
  track: Partial<Track> & { length?: number };
}

export const CATEGORY_ORDER = [
  'мои', // пользовательские пресеты (USER_CATEGORY) — пустая группа скрыта
  'бас',
  'тоны и лиды',
  'перкуссия',
  'фоны',
  'сэмплеры',
  'прочее',
];

const PENTATONIC_MINOR = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2];

// Поля, которые переносит смена инструмента (applyInstrumentPreset в
// TrackRow): по ним и опознаём текущий пресет. Ручки вне списка (громкость,
// ритм, вибрато, сайдчейн) — пользователя, на совпадение не влияют.
const MATCH_FIELDS: (keyof Track)[] = [
  'waveform', 'freq', 'scale', 'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'effects', 'mono',
  'vibratoRate', 'vibratoDepth',
  'fmRatio', 'fmIndex', 'ksLife', 'voiceMorph',
  'sampleMode', 'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
];

const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  return JSON.stringify(a) === JSON.stringify(b);
};

/** Имя пресета, которому соответствуют параметры трека; иначе «своя». */
export function instrumentNameOf(track: Track): string {
  // Свои — первыми: перезаписанный юзером пресет важнее встроенного тёзки.
  for (const p of [...loadUserPresets(), ...INSTRUMENT_PRESETS]) {
    const preset = p.track as Partial<Track>;
    if (MATCH_FIELDS.every((f) => preset[f] === undefined || sameValue(preset[f], track[f]))) {
      return p.name;
    }
  }
  return 'своя настройка';
}

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    name: 'бас',
    category: 'бас',
    hint: 'низкий синус с долгим спадом — фундамент',
    track: {
      name: 'бас', waveform: 'sine', freq: 41.2, scale: [1, 6 / 5, 3 / 2, 2],
      length: 8, rate: 4, decay: 0.7, attack: 0.004, filterFreq: 320, volume: 0.85,
      mono: true,
    },
  },
  {
    name: 'воббл-бас',
    category: 'бас',
    hint: 'дабстеп-вобл: треугольный LFO качает резонансный фильтр, дисторшн плотнит. Rate = восьмые при 118 BPM — под свой темп перецепи селектом «синхр»',
    track: {
      name: 'воббл', waveform: 'supersaw', freq: 55, scale: [1, 6 / 5, 4 / 3, 3 / 2, 2],
      voiceMorph: 0.25,
      length: 16, rate: 4, attack: 0.05, decay: 1.8, sustain: 0.85,
      pitchDrop: 1.3, pitchTime: 0.3,
      vibratoRate: 12, vibratoDepth: 100,
      filterFreq: 800, filterQ: 6,
      mono: true, volume: 0.7,
      effects: [{ type: 'dist', drive: 5, mix: 0.65 }],
      mods: [{ target: 'filterFreq', shape: 'triangle', rate: 3.93, depth: 0.35 }],
    },
  },
  {
    name: 'лид',
    category: 'тоны и лиды',
    hint: 'пентатоника, короткие ноты — мелодия сверху',
    track: {
      name: 'лид', waveform: 'triangle', freq: 329.6, scale: PENTATONIC_MINOR,
      length: 7, rate: 2, decay: 0.18, filterFreq: 4500, volume: 0.55,
      effects: [{ type: 'delay', timeSec: 0.28, feedback: 0.4, mix: 0.25 }],
    },
  },
  {
    name: 'пульс',
    category: 'перкуссия',
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
    category: 'перкуссия',
    hint: 'короткий шум — тики и сыпь между ударами',
    track: {
      name: 'хэт', waveform: 'noise', freq: 440, scale: [1],
      length: 11, rate: 1, decay: 0.05, filterFreq: 7000, volume: 0.45,
    },
  },
  {
    name: 'дрон',
    category: 'фоны',
    hint: 'долгая тянущаяся нота — фон-полотно',
    track: {
      name: 'дрон', waveform: 'sawtooth', freq: 110, scale: [1, 9 / 8],
      length: 3, rate: 16, attack: 0.3, decay: 2.5, filterFreq: 700, volume: 0.4,
      effects: [{ type: 'reverb', sizeSec: 3.5, mix: 0.4 }],
    },
  },
  {
    name: 'сэмплер',
    category: 'сэмплеры',
    hint: 'играет загруженный сэмпл; строки стана = скорость воспроизведения (питч)',
    track: {
      name: 'сэмпл', waveform: 'sample',
      scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      length: 16, rate: 2, attack: 0.001, decay: 1.2, filterFreq: 12000, volume: 0.8,
    },
  },
  {
    name: 'струна',
    category: 'тоны и лиды',
    hint: 'Karplus-Strong: щипок струны, выросший из шума — живой и пластинчатый',
    track: {
      name: 'струна', waveform: 'karplus', freq: 110, scale: PENTATONIC_MINOR,
      ksLife: 3,
      length: 11, rate: 2, attack: 0.002, decay: 1.6, filterFreq: 5000, volume: 0.7,
    },
  },
  {
    name: 'fm-звон',
    category: 'тоны и лиды',
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
    category: 'фоны',
    hint: 'расстроенный унисон семи пил — жирная подложка и стены',
    track: {
      name: 'супер-пила', waveform: 'supersaw', freq: 110, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      voiceMorph: 0.55,
      length: 16, rate: 4, attack: 0.01, decay: 0.5, filterFreq: 5500, volume: 0.55,
    },
  },
  {
    name: 'вокал',
    category: 'тоны и лиды',
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
    category: 'перкуссия',
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
    category: 'тоны и лиды',
    hint: 'регистры 1,2,3,4,6,8 — морф открывает их по одному, от флейты до полного',
    track: {
      name: 'орган', waveform: 'organ', freq: 220, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      voiceMorph: 0.6,
      length: 16, rate: 2, attack: 0.02, decay: 0.6, filterFreq: 7000, volume: 0.6,
    },
  },
  {
    name: 'гармоники',
    category: 'тоны и лиды',
    hint: 'аддитивный: морф = яркость, число гармоник 2–16',
    track: {
      name: 'гармоники', waveform: 'additive', freq: 220, scale: PENTATONIC_MINOR,
      voiceMorph: 0.4,
      length: 12, rate: 2, attack: 0.01, decay: 0.5, filterFreq: 8000, volume: 0.65,
    },
  },
  {
    name: 'грануляр',
    category: 'сэмплеры',
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
    category: 'прочее',
    hint: 'чистый лист, всё настроешь сам',
    track: { name: 'трек', waveform: 'square', freq: 220, scale: [1], length: 16, rate: 1 },
  },
];

// Пользовательские пресеты: «сохрани как инструмент» — настроенный трек
// под своим именем, в браузере инструментов категорией «мои». Хранилище —
// localStorage (как автосейв патча); состав — те же звуковые поля, что
// переносит applyInstrumentPreset, чтобы сохранённое применялось без потерь.

const USER_KEY = 'barlow.instruments.v1';
export const USER_CATEGORY = 'мои';

const SAVE_FIELDS: (keyof Track)[] = [
  'waveform', 'freq', 'scale', 'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'effects', 'mono',
  'fmRatio', 'fmIndex', 'voiceMorph', 'ksLife', 'sampleMode',
  'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
  'vibratoRate', 'vibratoDepth', 'scratchPoints', 'mods',
];

export function loadUserPresets(): InstrumentPreset[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (p): p is { name: string; track: Partial<Track> } =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as { name?: unknown }).name === 'string' &&
          typeof (p as { track?: unknown }).track === 'object' &&
          (p as { track?: unknown }).track !== null,
      )
      .map((p) => ({ name: p.name, category: USER_CATEGORY, track: p.track }));
  } catch {
    /* повреждённое хранилище — своих пресетов просто нет */
    return [];
  }
}

/** Записать (или перезаписать по имени) пресет из звуковых полей трека. */
export function saveUserPreset(name: string, track: Track): void {
  const sound = Object.fromEntries(
    SAVE_FIELDS.filter((f) => track[f] !== undefined).map((f) => [f, track[f]]),
  ) as Partial<Track>;
  const list = loadUserPresets().filter((p) => p.name !== name);
  list.push({ name, category: USER_CATEGORY, track: sound });
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(list));
  } catch {
    /* переполнение квоты — молча */
  }
}

export function deleteUserPreset(name: string): void {
  const list = loadUserPresets().filter((p) => p.name !== name);
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
