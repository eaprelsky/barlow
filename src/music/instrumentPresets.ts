// Пресеты инструментов для добавления трека: готовые параметры,
// пользователю остаётся накидать ноты в нотном стане.

import type { Instrument, Track } from '../types';

export interface InstrumentPreset {
  name: string;
  // Группа в браузере инструментов (порядок категорий — CATEGORY_ORDER).
  category: string;
  // Пояснение для поиска встроенных; на плитке не показывается.
  hint?: string;
  track: Partial<Track & Instrument> & { length?: number };
}

export const CATEGORY_ORDER = [
  'мои', // пользовательские пресеты (USER_CATEGORY) — пустая группа скрыта
  'стартовые', // архетипы: минимальные основы классов звуков с рецептом в подсказке
  'клавишные',
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
const MATCH_FIELDS: (keyof (Track & Instrument))[] = [
  'waveform', 'freq', 'scale', 'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'effects', 'mono',
  'vibratoRate', 'vibratoDepth', 'vibratoDelay',
  'fmRatio', 'fmIndex', 'ksLife', 'voiceMorph',
  'sampleMode', 'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
  'unisonVoices', 'unisonDetune', 'unisonSpread',
  'filterEnvAmount', 'filterEnvTime',
  'wave',
];

const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  return JSON.stringify(a) === JSON.stringify(b);
};

/** Имя пресета, которому соответствуют параметры трека; иначе «своя». */
export function instrumentNameOf(track: Partial<Track> & Partial<Instrument>): string {
  // Свои — первыми: перезаписанный юзером пресет важнее встроенного тёзки.
  for (const p of [...loadUserPresets(), ...INSTRUMENT_PRESETS]) {
    const preset: Partial<Track & Instrument> = p.track;
    if (MATCH_FIELDS.every((f) => preset[f] === undefined || sameValue(preset[f], track[f]))) {
      return p.name;
    }
  }
  return 'своя настройка';
}

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  // ---- Архетипы: отправные точки классов звуков. Минимум настроек,
  // рецепт — в подсказке: почему именно атака/спад/фильтр такие и что
  // крутить дальше. Готовые характеры — ниже по категориям.
  {
    name: 'удар',
    category: 'стартовые',
    hint: 'Рецепт удара: атака ~1 мс, короткий спад, падение тона сверху. Спад длиннее — тон короче — щелчок. Шум в волне — треск',
    track: {
      name: 'удар', waveform: 'sine', freq: 60, scale: [1],
      length: 8, rate: 4, attack: 0.001, decay: 0.25,
      pitchDrop: 3, pitchTime: 0.07,
      filterFreq: 3000,
    },
  },
  {
    name: 'щипок',
    category: 'стартовые',
    hint: 'Рецепт щипка: Karplus-Strong сам гаснет как струна, спад короткий. ksLife дольше — тянется; фильтр ниже — глухой палец',
    track: {
      name: 'щипок', waveform: 'karplus', freq: 220, scale: PENTATONIC_MINOR,
      ksLife: 2, length: 8, rate: 2, attack: 0.002, decay: 0.35, filterFreq: 6000,
    },
  },
  {
    name: 'пад',
    category: 'стартовые',
    hint: 'Рецепт пада: медленная атака, долгий спад, унисон (супер-пила), реверб. Убери реверб — стена чистая',
    track: {
      name: 'пад', waveform: 'supersaw', freq: 110, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      voiceMorph: 0.45,
      length: 4, rate: 8, attack: 0.4, decay: 3, sustain: 0.9,
      filterFreq: 4000, volume: 0.4,
      effects: [{ type: 'reverb', sizeSec: 3, mix: 0.35 }],
    },
  },
  {
    name: 'лид-основа',
    category: 'стартовые',
    hint: 'Рецепт лида: пила, плато-сустейн, вибрато (пока без задержки), лёгкий фильтр. Глубина вибрато 30–60 центов — живой голос',
    track: {
      name: 'лид', waveform: 'sawtooth', freq: 330, scale: PENTATONIC_MINOR,
      length: 8, rate: 2, attack: 0.01, decay: 0.8, sustain: 0.75,
      vibratoRate: 5.5, vibratoDepth: 40, filterFreq: 6000,
    },
  },
  {
    name: 'язычок',
    category: 'стартовые',
    hint: 'Рецепт язычка (кларнет/шахней): нечётные гармоники 1,3,5 — полый тон, вибрато узкое. Проверни фильтр — саксофон',
    track: {
      name: 'язычок', waveform: 'wave', freq: 220, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 3, amp: 0.35, type: 'sine' },
          { ratio: 5, amp: 0.15, type: 'sine' },
        ],
      },
      length: 8, rate: 2, attack: 0.03, decay: 1, sustain: 0.8,
      vibratoRate: 5, vibratoDepth: 25, filterFreq: 4000,
    },
  },
  {
    name: 'колокол-основа',
    category: 'стартовые',
    hint: 'Рецепт звона: модальные резонаторы (негармоничные частоты), атака мгновенная, спад долгий. Морф — от маримбы к колоколу',
    track: {
      name: 'звон', waveform: 'modal', freq: 220, scale: [1, 6 / 5, 3 / 2, 2],
      voiceMorph: 0.5,
      length: 8, rate: 2, attack: 0.001, decay: 1.5, filterFreq: 12000,
    },
  },
  {
    name: 'шум-основа',
    category: 'стартовые',
    hint: 'Рецепт шума: белый шум + фильтр решает всё. Верх 6–8к — хэт; 300–600 — ветер; спад 0.03 — тик, 2 с — прибой',
    track: {
      name: 'шум', waveform: 'noise', freq: 440, scale: [1],
      length: 8, rate: 1, attack: 0.005, decay: 0.4, filterFreq: 7000,
    },
  },
  {
    name: 'бас-основа',
    category: 'стартовые',
    hint: 'Рецепт баса: синус (или треугольник), фильтр 300–500, монолит. pitchDrop 1.2 — мягкий тычок; квадрат + дисторшн — рейв',
    track: {
      name: 'бас', waveform: 'sine', freq: 55, scale: [1, 6 / 5, 3 / 2, 2],
      length: 8, rate: 4, attack: 0.004, decay: 0.5,
      pitchDrop: 1.2, pitchTime: 0.12,
      filterFreq: 400, mono: true,
    },
  },
  // ---- Готовые пресеты ----
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
    name: 'бочка',
    category: 'перкуссия',
    hint: 'бочка: нота стартует высоко и падает вниз — «вумп», опора ритма',
    track: {
      name: 'бочка', waveform: 'sine', freq: 48, scale: [1],
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
  {
    name: 'стекло',
    category: 'тоны и лиды',
    hint: 'своя волна: негармоничные парциалы (1, 2.76, 5.4) — звенящее стекло, сделано в редакторе волны',
    track: {
      name: 'стекло', waveform: 'wave', freq: 523.3,
      scale: [1, 9 / 8, 3 / 2, 2],
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2.76, amp: 0.35, type: 'sine' },
          { ratio: 5.4, amp: 0.18, type: 'sine' },
          { ratio: 8.93, amp: 0.08, type: 'sine' },
        ],
      },
      length: 9, rate: 2, attack: 0.002, decay: 0.9,
      filterFreq: 9000, volume: 0.6,
      effects: [{ type: 'reverb', sizeSec: 2.4, mix: 0.3 }],
    },
  },
  {
    name: 'песок',
    category: 'фоны',
    hint: 'своя волна: синус + шумовое зерно 25 мс — шуршащая подложка, характер крупы крути в редакторе',
    track: {
      name: 'песок', waveform: 'wave', freq: 174.6,
      scale: [1, 3 / 2],
      wave: {
        partials: [
          { ratio: 1, amp: 0.55, type: 'sine' },
          { ratio: 2, amp: 0.2, type: 'sine' },
          { ratio: 1, amp: 0.5, type: 'noise' },
        ],
        noiseGrainMs: 25,
      },
      length: 4, rate: 8, attack: 0.05, decay: 1.2,
      filterFreq: 2400, volume: 0.45,
    },
  },

  // ---- Расширение библиотеки (волна 5): новые поля движка — унисон,
  // вибрато с задержкой, огибающая фильтра — в деле.
  {
    name: 'эл-пиано',
    category: 'клавишные',
    hint: 'FM-пиано: индекс тает к хвосту, огибающая фильтра даёт звяк атаки. Мягче — индекс ниже, злее — выше',
    track: {
      name: 'эл-пиано', waveform: 'fm', freq: 261.6, scale: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2],
      fmRatio: 1, fmIndex: 1.6,
      attack: 0.002, decay: 0.9, sustain: 0.25,
      filterEnvAmount: 9, filterEnvTime: 0.15,
      filterFreq: 9000, volume: 0.6,
    },
  },
  {
    name: 'чеймс',
    category: 'клавишные',
    hint: 'Хрустальные колокольчики FM: негармоничное отношение 3.51, хвост в реверб',
    track: {
      name: 'чеймс', waveform: 'fm', freq: 659.3, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      fmRatio: 3.51, fmIndex: 2,
      attack: 0.002, decay: 1.3,
      filterFreq: 11000, volume: 0.5,
      effects: [{ type: 'reverb', sizeSec: 2.8, mix: 0.35 }],
    },
  },
  {
    name: 'клавесин',
    category: 'клавишные',
    hint: 'Щипковая клавиатура: пила сквозь захлопывающийся фильтр (+12 пт за 0.08 с) — металлический чуть-чуть',
    track: {
      name: 'клавесин', waveform: 'sawtooth', freq: 261.6, scale: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2],
      attack: 0.002, decay: 0.35,
      filterEnvAmount: 12, filterEnvTime: 0.08,
      filterFreq: 6000, volume: 0.55,
    },
  },
  {
    name: 'челеста',
    category: 'клавишные',
    hint: 'Нежный унисон из трёх синусов чуть врасстройку — мерцающее тепло, как одноимённый регистр органа',
    track: {
      name: 'челеста', waveform: 'sine', freq: 523.3, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      unisonVoices: 3, unisonDetune: 7, unisonSpread: 0.3,
      attack: 0.003, decay: 1.1,
      filterFreq: 9000, volume: 0.5,
    },
  },
  {
    name: 'орган-джаз',
    category: 'клавишные',
    hint: 'Полный орган с поздним вибрато: ручные регистры морфом, вибрато нарастает через полсекунды',
    track: {
      name: 'орган', waveform: 'organ', freq: 220, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      voiceMorph: 0.7,
      attack: 0.01, decay: 0.8, sustain: 0.85,
      vibratoRate: 5.5, vibratoDepth: 18, vibratoDelay: 0.5,
      filterFreq: 7000, volume: 0.55,
    },
  },
  {
    name: 'ребас',
    category: 'бас',
    hint: 'Рейв-бас: пила, фильтр щёлкает открытее на атаке (+7 пт), лёгкий перегруз уплотняет',
    track: {
      name: 'ребас', waveform: 'sawtooth', freq: 55, scale: [1, 6 / 5, 4 / 3, 3 / 2, 2],
      attack: 0.003, decay: 0.4, sustain: 0.4,
      filterEnvAmount: 7, filterEnvTime: 0.08,
      filterFreq: 900, filterQ: 2,
      mono: true, volume: 0.7,
      effects: [{ type: 'dist', drive: 4, mix: 0.4 }],
    },
  },
  {
    name: 'саб',
    category: 'бас',
    hint: 'Сабвуферный синус: глухой тычок с лёгким съездом тона. Основа под кач',
    track: {
      name: 'саб', waveform: 'sine', freq: 41.2, scale: [1],
      attack: 0.004, decay: 0.8,
      pitchDrop: 1.15, pitchTime: 0.1,
      filterFreq: 200, mono: true, volume: 0.85,
    },
  },
  {
    name: 'плюк-бас',
    category: 'бас',
    hint: 'Щипковый бас: Karplus короткой жизни — быстро гаснущая струна, удобно под глухой качающий рисунок',
    track: {
      name: 'плюк', waveform: 'karplus', freq: 65.4, scale: [1, 6 / 5, 3 / 2, 2],
      ksLife: 1.2,
      attack: 0.002, decay: 0.4,
      filterFreq: 2500, mono: true, volume: 0.75,
    },
  },
  {
    name: 'ацид',
    category: 'бас',
    hint: '303-й: пила, Q=11, фильтр-огибание +14 пт — чпокающая атака. «Время» длиннее — скользит, короче — чпокает',
    track: {
      name: 'ацид', waveform: 'sawtooth', freq: 55, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      attack: 0.003, decay: 0.3, sustain: 0.3,
      filterEnvAmount: 14, filterEnvTime: 0.25, filterQ: 11, filterFreq: 700,
      mono: true, volume: 0.6,
      effects: [{ type: 'dist', drive: 3, mix: 0.3 }],
    },
  },
  {
    name: 'скрипка',
    category: 'тоны и лиды',
    hint: 'Смычок: пила в унисоне 3 с разбросом, вибрато дорастает за полсекунды — поёт',
    track: {
      name: 'скрипка', waveform: 'sawtooth', freq: 440, scale: PENTATONIC_MINOR,
      unisonVoices: 3, unisonDetune: 6, unisonSpread: 0.5,
      attack: 0.15, decay: 1, sustain: 0.9,
      vibratoRate: 6, vibratoDepth: 35, vibratoDelay: 0.5,
      filterFreq: 7000, volume: 0.5,
      effects: [{ type: 'reverb', sizeSec: 1.8, mix: 0.22 }],
    },
  },
  {
    name: 'виолончель',
    category: 'тоны и лиды',
    hint: 'Нижний регистр смычка: шире вибрато с долгим подходом — дышит, а не дрожит',
    track: {
      name: 'виолончель', waveform: 'sawtooth', freq: 164.8, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      unisonVoices: 3, unisonDetune: 5, unisonSpread: 0.4,
      attack: 0.2, decay: 1.2, sustain: 0.9,
      vibratoRate: 5, vibratoDepth: 28, vibratoDelay: 0.7,
      filterFreq: 4000, volume: 0.55,
    },
  },
  {
    name: 'дудка',
    category: 'тоны и лиды',
    hint: 'Простая флейта-свисток: чистый синус, вибрато подступает мягко, атака чуть мягкая',
    track: {
      name: 'дудка', waveform: 'sine', freq: 587.3, scale: PENTATONIC_MINOR,
      attack: 0.05, decay: 0.9, sustain: 0.9,
      vibratoRate: 5, vibratoDepth: 30, vibratoDelay: 0.3,
      filterEnvAmount: 4, filterEnvTime: 0.1,
      filterFreq: 9000, volume: 0.5,
    },
  },
  {
    name: 'флейта',
    category: 'тоны и лиды',
    hint: 'Флейта с дыханием: синус + зерно шума 30 мс, вибрато с задержкой — живой оркестровый голос',
    track: {
      name: 'флейта', waveform: 'wave', freq: 523.3, scale: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2],
      wave: {
        partials: [
          { ratio: 1, amp: 0.7, type: 'sine' },
          { ratio: 1, amp: 0.16, type: 'noise' },
        ],
        noiseGrainMs: 30,
      },
      attack: 0.08, decay: 1, sustain: 0.9,
      vibratoRate: 5.5, vibratoDepth: 25, vibratoDelay: 0.5,
      filterFreq: 9000, volume: 0.5,
    },
  },
  {
    name: 'гобой',
    category: 'тоны и лиды',
    hint: 'Язычковый носовой тон: чёт и нечет в балансе (1:0.6:0.35), узкое вибрато',
    track: {
      name: 'гобой', waveform: 'wave', freq: 349.2, scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2, amp: 0.6, type: 'sine' },
          { ratio: 3, amp: 0.35, type: 'sine' },
        ],
      },
      attack: 0.04, decay: 0.9, sustain: 0.85,
      vibratoRate: 5.5, vibratoDepth: 20, vibratoDelay: 0.4,
      filterFreq: 6000, volume: 0.55,
    },
  },
  {
    name: 'синт-лид',
    category: 'тоны и лиды',
    hint: 'Квадрат в унисоне 4 с эхом: широкий, чуть агрессивный сольный голос',
    track: {
      name: 'синт-лид', waveform: 'square', freq: 329.6, scale: PENTATONIC_MINOR,
      unisonVoices: 4, unisonDetune: 14, unisonSpread: 0.6,
      attack: 0.01, decay: 0.8, sustain: 0.7,
      vibratoRate: 5, vibratoDepth: 50, vibratoDelay: 0.4,
      filterFreq: 6500, volume: 0.5,
      effects: [{ type: 'delay', timeSec: 0.3, feedback: 0.35, mix: 0.25 }],
    },
  },
  {
    name: 'портве',
    category: 'тоны и лиды',
    hint: 'Тёплый треугольный лид: широкое позднее вибрато — винтажная sweetness',
    track: {
      name: 'портве', waveform: 'triangle', freq: 261.6, scale: PENTATONIC_MINOR,
      attack: 0.1, decay: 1.2, sustain: 0.95,
      vibratoRate: 4, vibratoDepth: 45, vibratoDelay: 0.8,
      filterFreq: 5000, volume: 0.55,
    },
  },
  {
    name: 'клэп',
    category: 'перкуссия',
    hint: 'Хлопок: шум с обрезанным низом и средним спадом — ставь на вторую долю',
    track: {
      name: 'клэп', waveform: 'noise', freq: 440, scale: [1],
      length: 8, rate: 4, attack: 0.001, decay: 0.16,
      filterLow: 800, filterFreq: 5000, volume: 0.6,
      effects: [{ type: 'reverb', sizeSec: 0.6, mix: 0.2 }],
    },
  },
  {
    name: 'том',
    category: 'перкуссия',
    hint: 'Том: синус соскальзывает с ×2.2 — барабанная бочка среднего регистра',
    track: {
      name: 'том', waveform: 'sine', freq: 100, scale: [1],
      length: 8, rate: 4, attack: 0.001, decay: 0.4,
      pitchDrop: 2.2, pitchTime: 0.2,
      filterFreq: 2500, volume: 0.8,
    },
  },
  {
    name: 'шиммер',
    category: 'перкуссия',
    hint: 'Модальный звон высоко (морф к колоколу) с большим ревербом — бубенцы и пыль',
    track: {
      name: 'шиммер', waveform: 'modal', freq: 880, scale: [1, 3 / 2, 2],
      voiceMorph: 0.95,
      length: 6, rate: 2, attack: 0.001, decay: 0.8,
      filterFreq: 12000, volume: 0.45,
      effects: [{ type: 'reverb', sizeSec: 4, mix: 0.45 }],
    },
  },
  {
    name: 'маракас',
    category: 'перкуссия',
    hint: 'Сыпучий тычок: шум с очень коротким спадом и высоким фильтром',
    track: {
      name: 'маракас', waveform: 'noise', freq: 440, scale: [1],
      length: 8, rate: 2, attack: 0.001, decay: 0.06,
      filterLow: 2000, filterFreq: 10000, volume: 0.4,
    },
  },
  {
    name: 'там-там',
    category: 'перкуссия',
    hint: 'Большой гонг: модальный банк с длинным звоном и ревербом — редкие удары, много воздуха',
    track: {
      name: 'там-там', waveform: 'modal', freq: 150, scale: [1],
      voiceMorph: 0.7,
      length: 4, rate: 8, attack: 0.001, decay: 2.5,
      filterFreq: 12000, volume: 0.55,
      effects: [{ type: 'reverb', sizeSec: 5, mix: 0.4 }],
    },
  },
  {
    name: 'струнные',
    category: 'фоны',
    hint: 'Смычковая подложка: супер-пила, атака четверть секунды, вибрато подступает медленно',
    track: {
      name: 'струнные', waveform: 'supersaw', freq: 110, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      voiceMorph: 0.35,
      length: 4, rate: 8, attack: 0.25, decay: 2.5, sustain: 0.85,
      vibratoRate: 4.5, vibratoDepth: 15, vibratoDelay: 1,
      filterFreq: 4500, volume: 0.4,
      effects: [{ type: 'reverb', sizeSec: 3, mix: 0.35 }],
    },
  },
  {
    name: 'хор',
    category: 'фоны',
    hint: 'Псевдовокальная пелена: форманты «А», медленный вход, вибрато с задержкой — поёт издалека',
    track: {
      name: 'хор', waveform: 'formant', freq: 220, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      voiceMorph: 0.12,
      length: 4, rate: 8, attack: 0.35, decay: 2, sustain: 0.85,
      vibratoRate: 5, vibratoDepth: 22, vibratoDelay: 0.8,
      filterFreq: 7000, volume: 0.45,
      effects: [{ type: 'reverb', sizeSec: 3.5, mix: 0.45 }],
    },
  },
  {
    name: 'стеклянный дождь',
    category: 'фоны',
    hint: 'Негармоничные парциалы высоко + короткий спад и эхо: капли по стеклу',
    track: {
      name: 'капли', waveform: 'wave', freq: 1046.5,
      scale: [1, 9 / 8, 5 / 4, 3 / 2, 2],
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2.76, amp: 0.4, type: 'sine' },
          { ratio: 5.4, amp: 0.25, type: 'sine' },
        ],
      },
      length: 12, rate: 2, attack: 0.002, decay: 0.5,
      filterFreq: 10000, volume: 0.4,
      effects: [
        { type: 'delay', timeSec: 0.36, feedback: 0.5, mix: 0.3 },
        { type: 'reverb', sizeSec: 2.5, mix: 0.3 },
      ],
    },
  },
  {
    name: 'пастель',
    category: 'фоны',
    hint: 'Тёмный свелл: огибающая фильтра −9 пт за 1.5 с — звук выплывает из тени и остаётся мягким',
    track: {
      name: 'пастель', waveform: 'additive', freq: 220, scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2],
      voiceMorph: 0.5,
      length: 4, rate: 8, attack: 0.15, decay: 2.5, sustain: 0.9,
      filterEnvAmount: -9, filterEnvTime: 1.5,
      filterFreq: 5000, volume: 0.4,
    },
  },
  {
    name: 'зонд',
    category: 'прочее',
    hint: 'Космический зонд: FM с большим индексом медленно тает — сигнал из пустоты',
    track: {
      name: 'зонд', waveform: 'fm', freq: 174.6, scale: [1, 2, 3],
      fmRatio: 1.41, fmIndex: 8,
      length: 4, rate: 8, attack: 0.01, decay: 3.5,
      filterFreq: 10000, volume: 0.45,
      effects: [{ type: 'reverb', sizeSec: 5, mix: 0.5 }],
    },
  },
  {
    name: 'маяк',
    category: 'прочее',
    hint: 'Плывущий тон: LFO 0.15 Гц качает панораму из стороны в сторону — пинг-понг на подложке',
    track: {
      name: 'маяк', waveform: 'triangle', freq: 349.2, scale: [1, 3 / 2],
      length: 4, rate: 16, attack: 0.05, decay: 2, sustain: 0.8,
      filterFreq: 4000, volume: 0.4,
      mods: [{ target: 'pan', shape: 'sine', rate: 0.15, depth: 0.8 }],
    },
  },
  {
    name: 'гудок',
    category: 'прочее',
    hint: 'Пароходный гудок: квадрат, фильтр раскрывается секунду — вплывает и гудит',
    track: {
      name: 'гудок', waveform: 'square', freq: 174.6, scale: [1, 6 / 5],
      unisonVoices: 2, unisonDetune: 8,
      length: 4, rate: 16, attack: 0.02, decay: 3, sustain: 0.9,
      filterEnvAmount: -10, filterEnvTime: 1,
      filterFreq: 3500, volume: 0.4,
    },
  },
];

// Пользовательские пресеты: «сохрани как инструмент» — настроенный трек
// под своим именем, в браузере инструментов категорией «мои». Хранилище —
// localStorage (как автосейв патча); состав — те же звуковые поля, что
// переносит applyInstrumentPreset, чтобы сохранённое применялось без потерь.

const USER_KEY = 'barlow.instruments.v1';
export const USER_CATEGORY = 'мои';

const SAVE_FIELDS: (keyof (Track & Instrument))[] = [
  'waveform', 'freq', 'scale', 'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'effects', 'mono',
  'fmRatio', 'fmIndex', 'voiceMorph', 'ksLife', 'sampleMode',
  'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
  'vibratoRate', 'vibratoDepth', 'vibratoDelay', 'scratchPoints', 'mods',
  'unisonVoices', 'unisonDetune', 'unisonSpread',
  'filterEnvAmount', 'filterEnvTime',
  'wave',
];

export function loadUserPresets(): InstrumentPreset[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (p): p is { name: string; track: Partial<Track & Instrument> } =>
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
export function saveUserPreset(
  name: string,
  track: Partial<Track> & Partial<Instrument>,
): void {
  const sound = Object.fromEntries(
    SAVE_FIELDS.filter((f) => track[f] !== undefined).map((f) => [f, track[f]]),
  ) as Partial<Track & Instrument>;
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
