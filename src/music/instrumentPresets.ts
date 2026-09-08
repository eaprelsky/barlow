// Пресеты инструментов для добавления трека: готовые параметры,
// пользователю остаётся накидать ноты в нотном стане.

import type { Instrument, Track } from '../types';
import { INSTRUMENT_FIELDS } from '../types';
import { recipeForLegacy } from './waveRecipes';
import { CHARACTER_BANK } from './characterBank';
import { EXPANDED_BANK } from './expandedBank';
import { IDM_BANK } from './idmBank';
import { recommendedHz } from './audition';
const SOUND_FIELDS = INSTRUMENT_FIELDS.filter((f): f is Exclude<typeof f, 'fmRatio' | 'fmIndex' | 'voiceMorph' | 'ksLife'> =>
  !['fmRatio', 'fmIndex', 'voiceMorph', 'ksLife'].includes(f));

export interface InstrumentPreset {
  id?: string;
  tags?: string[];
  packId?: string;
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

// Поля, которые переносит применение пресета (applyPreset в App): по ним
// и опознаём текущий пресет. Тоника и строй партии не меняют его имя.
// recommendedHz — метаданные прослушивания, также не часть сравнения.
const MATCH_FIELDS: (keyof (Track & Instrument))[] = [
  ...SOUND_FIELDS.filter(f => f !== 'recommendedHz'),
  'waveform', 'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'effects', 'mono', 'portamentoSec',
  'vibratoRate', 'vibratoDepth', 'vibratoDelay',
  'sampleMode', 'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
  'unisonVoices', 'unisonDetune', 'unisonSpread',
  'filterEnvAmount', 'filterEnvTime', 'formants',
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
    if (MATCH_FIELDS.every((f) => f === 'portamentoSec'
      ? sameValue(preset[f] ?? 0, track[f] ?? 0)
      : preset[f] === undefined || (f === 'effects'
      ? JSON.stringify(preset[f], (key, value) => key === 'id' ? undefined : value) === JSON.stringify(track[f], (key, value) => key === 'id' ? undefined : value)
      : sameValue(preset[f], track[f])))) {
      return p.name;
    }
  }
  return 'своя настройка';
}

// Пресеты писались и под прежние модели (v38-): ниже — сырой список,
// при загрузке модуля модели собираются в строки-операторы рецептами
// (music/waveRecipes.ts) — тем же кодом, что мигрирует старые патчи.
const RAW_PRESETS: {
  name: string;
  category: string;
  hint?: string;
  track: Record<string, unknown>;
}[] = [
  // ---- Архетипы: отправные точки классов звуков. Минимум настроек,
  // рецепт — в подсказке: почему именно атака/спад/фильтр такие и что
  // крутить дальше. Готовые характеры — ниже по категориям.
  {
    name: 'удар',
    category: 'стартовые',
    hint: 'Рецепт удара: атака ~1 мс, короткий спад, падение тона сверху. Спад длиннее — тон короче — щелчок. Шум в волне — треск',
    track: {
      name: 'удар', waveform: 'sine', freq: 60,
      length: 8, rate: 4, attack: 0.001, decay: 0.25,
      pitchDrop: 3, pitchTime: 0.07,
      filterFreq: 3000,
    },
  },
  {
    name: 'щипок',
    category: 'стартовые',
    hint: 'Аддитивный щипок: гармоники с независимым затуханием. Хвосты строк дольше — звук тянется; фильтр ниже — глухой палец',
    track: {
      name: 'щипок', waveform: 'karplus', freq: 220,
      ksLife: 2, length: 8, rate: 2, attack: 0.002, decay: 0.35, filterFreq: 6000,
    },
  },
  {
    name: 'пад',
    category: 'стартовые',
    hint: 'Рецепт пада: медленная атака, долгий спад, унисон (супер-пила), реверб. Убери реверб — стена чистая',
    track: {
      name: 'пад', waveform: 'supersaw', freq: 110,
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
      name: 'лид', waveform: 'sawtooth', freq: 330,
      length: 8, rate: 2, attack: 0.01, decay: 0.8, sustain: 0.75,
      vibratoRate: 5.5, vibratoDepth: 40, filterFreq: 6000,
    },
  },
  {
    name: 'язычок',
    category: 'стартовые',
    hint: 'Рецепт язычка (кларнет/шахней): нечётные гармоники 1,3,5 — полый тон, вибрато узкое. Проверни фильтр — саксофон',
    track: {
      name: 'язычок', waveform: 'wave', freq: 220,
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
      name: 'звон', waveform: 'modal', freq: 220,
      voiceMorph: 0.85,
      length: 8, rate: 2, attack: 0.001, decay: 3, filterFreq: 12000,
    },
  },
  {
    name: 'шум-основа',
    category: 'стартовые',
    hint: 'Рецепт шума: белый шум + фильтр решает всё. Верх 6–8к — хэт; 300–600 — ветер; спад 0.03 — тик, 2 с — прибой',
    track: {
      name: 'шум', waveform: 'noise', freq: 440,
      length: 8, rate: 1, attack: 0.005, decay: 0.4, filterFreq: 7000,
    },
  },
  {
    name: 'бас-основа',
    category: 'стартовые',
    hint: 'Рецепт баса: 49–55 Гц (ниже — не слышно на ноутбуках!), лёгкое падение тона — тычок, фильтр 400–600. Квадрат + дисторшн — рейв',
    track: {
      name: 'бас', waveform: 'sine', freq: 55,
      length: 8, rate: 4, attack: 0.006, decay: 0.6,
      pitchDrop: 1.2, pitchTime: 0.15,
      filterFreq: 500, mono: true,
    },
  },
  // ---- Готовые пресеты ----
  {
    name: 'бас',
    category: 'бас',
    hint: 'тёплый бас: тон + октава + квинта чуть тише — слышен и на ноутбуке, фундамент не теряется',
    track: {
      name: 'бас', waveform: 'wave', freq: 55,
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2, amp: 0.4, type: 'sine' },
          { ratio: 3, amp: 0.15, type: 'sine' },
        ],
      },
      length: 8, rate: 4, decay: 0.8, attack: 0.005, filterFreq: 500,
      mono: true,
    },
  },
  {
    name: 'воббл-бас',
    category: 'бас',
    hint: 'дабстеп-вобл: треугольный LFO качает резонансный фильтр, дисторшн плотнит. Rate = восьмые при 118 BPM — под свой темп перецепи селектом «синхр»',
    track: {
      name: 'воббл', waveform: 'supersaw', freq: 55,
      voiceMorph: 0.25,
      length: 16, rate: 4, attack: 0.035, decay: 1.2, sustain: 0.3,
      pitchDrop: 1, pitchTime: 0.1,
      vibratoRate: 5, vibratoDepth: 0,
      filterFreq: 650, filterQ: 2, filterLow: 25,
      mono: true,
      effects: [{ type: 'dist', drive: 3, mix: 0.45 }],
      mods: [{ target: 'filterFreq', shape: 'triangle', rate: 3.93, depth: 0.22 }],
    },
  },
  {
    name: 'лид',
    category: 'тоны и лиды',
    hint: 'пентатоника, поющая нота с плато — мелодия сверху',
    track: {
      name: 'лид', waveform: 'triangle', freq: 329.6,
      length: 7, rate: 2, attack: 0.01, decay: 0.9, sustain: 0.75,
      vibratoRate: 5.5, vibratoDepth: 25, vibratoDelay: 0.4,
      filterFreq: 4500,
      effects: [{ type: 'delay', timeSec: 0.28, feedback: 0.4, mix: 0.25 }],
    },
  },
  {
    name: 'бочка',
    category: 'перкуссия',
    hint: 'бочка: нота стартует высоко и падает вниз — «вумп», опора ритма',
    track: {
      name: 'бочка', waveform: 'sine', freq: 48,
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
      name: 'хэт', waveform: 'noise', freq: 440,
      length: 11, rate: 1, decay: 0.05, filterFreq: 7000, volume: 0.45,
    },
  },
  {
    name: 'дрон',
    category: 'фоны',
    hint: 'тянущийся фон-полотно: тёмная супер-пила, вход полсекунды, держится до перебоя',
    track: {
      name: 'дрон', waveform: 'supersaw', freq: 110,
      voiceMorph: 0.25,
      length: 3, rate: 16, attack: 0.5, decay: 3, sustain: 0.97,
      filterLow: 90, filterFreq: 650,
      effects: [{ type: 'reverb', sizeSec: 4, mix: 0.35 }],
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
    hint: 'Синтетическая струна: сумма гармоник с затухающими хвостами — щипковая окраска',
    track: {
      name: 'струна', waveform: 'karplus', freq: 110,
      ksLife: 3,
      length: 11, rate: 2, attack: 0.002, decay: 1.6, filterFreq: 5000, volume: 0.7,
    },
  },
  {
    name: 'fm-звон',
    category: 'тоны и лиды',
    hint: 'частотная модуляция: колокола и металл — крути FM-отношение (√2 ≈ 1.41 — негармоничный звон)',
    track: {
      name: 'звон', waveform: 'fm', freq: 220,
      fmRatio: 1.41, fmIndex: 4,
      length: 9, rate: 2, attack: 0.002, decay: 0.6, filterFreq: 9000, volume: 0.6,
      effects: [{ type: 'reverb', sizeSec: 2.5, mix: 0.3 }],
    },
  },
  {
    name: 'супер-пила',
    category: 'фоны',
    hint: 'расстроенный унисон семи пил — жирная тянучая стена, атака мягкая, плато держится',
    track: {
      name: 'супер-пила', waveform: 'supersaw', freq: 110,
      voiceMorph: 0.55,
      length: 16, rate: 4, attack: 0.05, decay: 1.5, sustain: 0.8, filterFreq: 5000,
    },
  },
  {
    name: 'вокал',
    category: 'тоны и лиды',
    hint: 'пила сквозь форманты — поёт гласную «А»; вибрато с задержкой, как живой голос',
    track: {
      name: 'вокал', waveform: 'formant', freq: 220,
      voiceMorph: 0.15,
      length: 13, rate: 2, attack: 0.08, decay: 1, sustain: 0.8,
      vibratoRate: 5.5, vibratoDepth: 30, vibratoDelay: 0.4,
      filterFreq: 6500,
      effects: [{ type: 'reverb', sizeSec: 2.5, mix: 0.35 }],
    },
  },
  {
    name: 'колокол',
    category: 'перкуссия',
    hint: 'модальные резонаторы колокольного строя, долгий звон — морф к 1 даёт ярче негармоничность',
    track: {
      name: 'колокол', waveform: 'modal', freq: 220,
      voiceMorph: 0.85,
      length: 9, rate: 2, attack: 0.001, decay: 2.5, filterFreq: 12000,
      effects: [{ type: 'reverb', sizeSec: 3.5, mix: 0.4 }],
    },
  },
  {
    name: 'орган',
    category: 'тоны и лиды',
    hint: 'регистры 1,2,3,4,6,8 — морф открывает их по одному; хорус изображает вращающийся Лесли, вибрато позднее',
    track: {
      name: 'орган', waveform: 'organ', freq: 220,
      voiceMorph: 0.5,
      length: 16, rate: 2, attack: 0.015, decay: 1.2, sustain: 0.9,
      vibratoRate: 5.5, vibratoDepth: 15, vibratoDelay: 0.6,
      filterFreq: 7000,
      effects: [{ type: 'chorus', rate: 0.8, mix: 0.35 }],
    },
  },
  {
    name: 'гармоники',
    category: 'тоны и лиды',
    hint: 'аддитивный: морф = яркость, число гармоник 2–16; нота держится и мягко тает',
    track: {
      name: 'гармоники', waveform: 'additive', freq: 220,
      voiceMorph: 0.3,
      length: 12, rate: 2, attack: 0.02, decay: 0.9, sustain: 0.6,
      filterFreq: 7000,
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
    track: { name: 'трек', waveform: 'square', freq: 220, length: 16, rate: 1 },
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
    name: 'ветер',
    category: 'фоны',
    hint: 'бывший «песок»: на деле — ветер. Шумовое зерно 60 мс, перлин медленно качает фильтр — порывы и затишья',
    track: {
      name: 'ветер', waveform: 'wave', freq: 174.6,
      scale: [1, 3 / 2],
      wave: {
        partials: [
          { ratio: 1, amp: 0.35, type: 'sine' },
          { ratio: 1, amp: 0.85, type: 'noise' },
        ],
        noiseGrainMs: 60,
      },
      length: 4, rate: 8, attack: 0.4, decay: 2.5, sustain: 0.5,
      filterFreq: 2500,
      mods: [{ target: 'filterFreq', source: 'perlin', shape: 'sine', rate: 0.22, depth: 0.55 }],
    },
  },

  // ---- Расширение библиотеки (волна 5): новые поля движка — унисон,
  // вибрато с задержкой, огибающая фильтра — в деле.
  {
    name: 'эл-пиано',
    category: 'клавишные',
    hint: 'FM-пиано: индекс тает к хвосту, огибающая фильтра даёт звяк атаки. Мягче — индекс ниже, злее — выше',
    track: {
      name: 'эл-пиано', waveform: 'fm', freq: 261.6,
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
      name: 'чеймс', waveform: 'fm', freq: 659.3,
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
      name: 'клавесин', waveform: 'sawtooth', freq: 261.6,
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
      name: 'челеста', waveform: 'sine', freq: 523.3,
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
      name: 'орган', waveform: 'organ', freq: 220,
      voiceMorph: 0.7,
      attack: 0.01, decay: 0.8, sustain: 0.85,
      vibratoRate: 5.5, vibratoDepth: 18, vibratoDelay: 0.5,
      filterFreq: 7000, volume: 0.55,
    },
  },
  {
    name: 'ребас',
    category: 'бас',
    hint: 'Рейв-бас: пила, фильтр щёлкает открытее на атаке (+5 пт), перегруз уплотняет',
    track: {
      name: 'ребас', waveform: 'sawtooth', freq: 55,
      attack: 0.003, decay: 0.4, sustain: 0.4,
      filterEnvAmount: 5, filterEnvTime: 0.06,
      filterFreq: 500, filterQ: 2, filterLow: 30,
      mono: true,
      effects: [{ type: 'dist', drive: 5, mix: 0.55 }],
    },
  },
  {
    name: 'саб',
    category: 'бас',
    hint: 'Сабвуферный тон: 49 Гц + чуть октавы (иначе на ноутбуке слышны только щелчки), атака мягкая — без тычка',
    track: {
      name: 'саб', waveform: 'wave', freq: 49,
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2, amp: 0.25, type: 'sine' },
        ],
      },
      attack: 0.008, decay: 1,
      filterFreq: 300, mono: true,
    },
  },
  {
    name: 'плюк-бас',
    category: 'бас',
    hint: 'Щипковый бас: быстро гаснущие гармоники — глухой качающий рисунок',
    track: {
      name: 'плюк', waveform: 'karplus', freq: 65.4,
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
      name: 'ацид', waveform: 'sawtooth', freq: 55,
      attack: 0.003, decay: 0.3, sustain: 0.3,
      filterEnvAmount: 14, filterEnvTime: 0.25, filterQ: 11, filterFreq: 700,
      mono: true, volume: 0.6,
      effects: [{ type: 'dist', drive: 3, mix: 0.3 }],
    },
  },
  {
    name: 'скрипка',
    category: 'тоны и лиды',
    hint: 'смычок: стопка пил (1, 2, 3×) + зерно шума — смычковый шелест; вибрато дорастает за треть секунды',
    track: {
      name: 'скрипка', waveform: 'wave', freq: 440,
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'saw' },
          { ratio: 2, amp: 0.4, type: 'saw' },
          { ratio: 3, amp: 0.22, type: 'saw' },
          { ratio: 1, amp: 0.1, type: 'noise' },
        ],
        noiseGrainMs: 25,
      },
      attack: 0.12, decay: 1, sustain: 0.9,
      vibratoRate: 6, vibratoDepth: 40, vibratoDelay: 0.35,
      filterFreq: 6000,
      effects: [{ type: 'reverb', sizeSec: 1.8, mix: 0.22 }],
    },
  },
  {
    name: 'виолончель',
    category: 'тоны и лиды',
    hint: 'нижний регистр смычка: пилы погуще, фильтр темнее, вибрато широкое с долгим подходом — дышит',
    track: {
      name: 'виолончель', waveform: 'wave', freq: 164.8,
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'saw' },
          { ratio: 2, amp: 0.5, type: 'saw' },
          { ratio: 3, amp: 0.2, type: 'saw' },
          { ratio: 1, amp: 0.07, type: 'noise' },
        ],
        noiseGrainMs: 30,
      },
      attack: 0.18, decay: 1.2, sustain: 0.9,
      vibratoRate: 5, vibratoDepth: 28, vibratoDelay: 0.6,
      filterFreq: 3200,
    },
  },
  {
    name: 'дудка',
    category: 'тоны и лиды',
    hint: 'Простая флейта-свисток: чистый синус, вибрато подступает мягко, атака чуть мягкая',
    track: {
      name: 'дудка', waveform: 'sine', freq: 587.3,
      attack: 0.05, decay: 0.9, sustain: 0.9,
      vibratoRate: 5, vibratoDepth: 30, vibratoDelay: 0.3,
      filterEnvAmount: 4, filterEnvTime: 0.1,
      filterFreq: 9000, volume: 0.5,
    },
  },
  {
    name: 'флейта',
    category: 'тоны и лиды',
    hint: 'Мягкая синтетическая флейта: основной тон с тихими обертонами и едва заметным дыханием. Начни с 523 Гц и плавной мелодии; вибрато появляется после начала ноты.',
    track: {
      name: 'флейта', waveform: 'wave', freq: 523.3,
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2, amp: 0.18, type: 'sine' },
          { ratio: 3, amp: 0.065, type: 'sine' },
          { ratio: 4, amp: 0.018, type: 'sine' },
          { ratio: 1, amp: 0.008, type: 'noise' },
        ],
        noiseGrainMs: 250,
      },
      attack: 0.06, decay: 1, sustain: 0.9,
      vibratoRate: 5.2, vibratoDepth: 9, vibratoDelay: 0.35,
      filterFreq: 2800,
    },
  },
  {
    name: 'гобой',
    category: 'тоны и лиды',
    hint: 'язычковый носовой тон: вторая гармоника главнее первой, гора спектра около 1 кГц',
    track: {
      name: 'гобой', waveform: 'wave', freq: 349.2,
      wave: {
        partials: [
          { ratio: 1, amp: 0.8, type: 'sine' },
          { ratio: 2, amp: 1, type: 'sine' },
          { ratio: 3, amp: 0.6, type: 'sine' },
          { ratio: 4, amp: 0.35, type: 'sine' },
          { ratio: 5, amp: 0.18, type: 'sine' },
        ],
      },
      attack: 0.035, decay: 1, sustain: 0.85,
      vibratoRate: 5.5, vibratoDepth: 22, vibratoDelay: 0.4,
      filterFreq: 5500,
    },
  },
  {
    name: 'синт-лид',
    category: 'тоны и лиды',
    hint: 'Квадрат в унисоне 4 с эхом: широкий, чуть агрессивный сольный голос',
    track: {
      name: 'синт-лид', waveform: 'square', freq: 329.6,
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
      name: 'портве', waveform: 'triangle', freq: 261.6,
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
      name: 'клэп', waveform: 'noise', freq: 440,
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
      name: 'том', waveform: 'sine', freq: 100,
      length: 8, rate: 4, attack: 0.001, decay: 0.4,
      pitchDrop: 2.2, pitchTime: 0.2,
      filterFreq: 2500, volume: 0.8,
    },
  },
  {
    name: 'шиммер',
    category: 'перкуссия',
    hint: 'Модальный звон высоко (морф к колоколу, Q звенит долго) с большим ревербом — бубенцы и пыль',
    track: {
      name: 'шиммер', waveform: 'modal', freq: 660,
      voiceMorph: 0.9,
      length: 6, rate: 2, attack: 0.001, decay: 1.2,
      filterFreq: 12000,
      effects: [{ type: 'reverb', sizeSec: 4, mix: 0.5 }],
    },
  },
  {
    name: 'маракас',
    category: 'перкуссия',
    hint: 'Сыпучий тычок с пересыпанием: шум сыплется ~0.16 с, ступенчатый LFO (S&H 11 Гц) трясёт громкость — семена стучат',
    track: {
      name: 'маракас', waveform: 'noise', freq: 440,
      length: 8, rate: 2, attack: 0.001, decay: 0.16,
      filterLow: 2500, filterFreq: 10000,
      mods: [{ target: 'volume', source: 'sah', shape: 'sine', rate: 11, depth: 0.35 }],
    },
  },
  {
    name: 'низкий барабанный том',
    category: 'перкуссия',
    hint: 'Барабанный там-там: короткий удар по коже, низкий округлый корпус и быстро затухающие обертоны. Попробуй 80–160 Гц, чередуя сильные и тихие удары. Это синтетический барабан, а не гонг.',
    track: {
      name: 'низкий том', waveform: 'wave', freq: 95,
      wave: { partials: [
        { type: 'sine', ratio: 1, amp: 1, decay: .32 },
        { type: 'sine', ratio: 1.59, amp: .28, decay: .12 },
        { type: 'sine', ratio: 2.14, amp: .12, decay: .06 },
        { type: 'noise', ratio: 1, amp: .1, decay: .018 },
      ] },
      length: 4, rate: 8, attack: .004, decay: .36, sustain: 0,
      pitchDrop: 1.45, pitchTime: .065, filterFreq: 2800,
    },
  },
  {
    name: 'струнные',
    category: 'фоны',
    hint: 'Смычковая подложка: узкая расстройка, фильтр приглушён — шелковое полотно, а не пила; вибрато подступает медленно',
    track: {
      name: 'струнные', waveform: 'supersaw', freq: 110,
      voiceMorph: 0.2,
      length: 4, rate: 8, attack: 0.3, decay: 2, sustain: 0.9,
      vibratoRate: 4.5, vibratoDepth: 12, vibratoDelay: 1,
      filterLow: 150, filterFreq: 3000,
      effects: [{ type: 'reverb', sizeSec: 3, mix: 0.35 }],
    },
  },
  {
    name: 'хор',
    category: 'фоны',
    hint: 'Псевдовокальная пелена: форманты «А», медленный вход, вибрато с задержкой — поёт издалека',
    track: {
      name: 'хор', waveform: 'formant', freq: 220,
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
      name: 'пастель', waveform: 'additive', freq: 220,
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
      name: 'зонд', waveform: 'fm', freq: 174.6,
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
      name: 'маяк', waveform: 'triangle', freq: 349.2,
      length: 4, rate: 16, attack: 0.05, decay: 2, sustain: 0.8,
      filterFreq: 4000, volume: 0.4,
      mods: [{ target: 'pan', shape: 'sine', rate: 0.15, depth: 0.8 }],
    },
  },
  {
    name: 'гудок',
    category: 'прочее',
    hint: 'Пароход: тон + октава, медленно вплывает, вибрато появляется через секунду — далёкий туман',
    track: {
      name: 'гудок', waveform: 'wave', freq: 116.5,
      wave: {
        partials: [
          { ratio: 1, amp: 1, type: 'sine' },
          { ratio: 2, amp: 0.35, type: 'sine' },
        ],
      },
      length: 4, rate: 16, attack: 0.2, decay: 2.5, sustain: 0.95,
      vibratoRate: 4, vibratoDepth: 12, vibratoDelay: 1.2,
      filterFreq: 2200,
    },
  },
];

/** v39: пресет прежней модели (или юзерский, сохранённый до v39)
 *  пересобрать в строки-операторы; современные — без изменений. */
const convertPresetV39 = (p: {
  name: string;
  category: string;
  hint?: string;
  track: Record<string, unknown>;
}): InstrumentPreset => {
  const conv = recipeForLegacy(p.track);
  if (!conv) return p as unknown as InstrumentPreset;
  const track = { ...p.track };
  delete track.fmRatio;
  delete track.fmIndex;
  delete track.voiceMorph;
  delete track.ksLife;
  track.waveform = 'wave';
  track.wave = conv.wave;
  if (conv.formants) track.formants = conv.formants;
  if (
    conv.unison &&
    (typeof track.unisonVoices !== 'number' || track.unisonVoices < conv.unison.voices)
  ) {
    track.unisonVoices = conv.unison.voices;
    track.unisonDetune = conv.unison.detune;
  }
  return { ...p, track: track as unknown as InstrumentPreset['track'] };
};

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [...RAW_PRESETS.map((p, index) => ({
  ...convertPresetV39(p), id: `factory-v39-${String(index + 1).padStart(3, '0')}`,
  tags: [p.category, p.track.waveform === 'sample' ? 'sample' : 'synthesis'], packId: 'core-v39',
})), ...IDM_BANK.map(p => ({ ...p, packId: 'idm-01' })), ...EXPANDED_BANK, ...CHARACTER_BANK].map(p => ({ ...p,
  track: { ...p.track, recommendedHz: recommendedHz(p.track) } }));

// Пользовательские пресеты: «сохрани как инструмент» — настроенный тембр
// с несущей под своим именем, в браузере инструментов категорией «мои».
// Хранилище — localStorage (как автосейв патча); состав — те же звуковые
// поля, что переносит применение пресета, чтобы сохранённое применялось
// без потерь. Шкала — трека, в пресет не входит.

const USER_KEY = 'barlow.instruments.v1';
export const USER_CATEGORY = 'мои';

/** Событие на window: список своих пресетов изменился (сохранение из
 *  редактора инструмента, удаление из панели). SoundBrowser по нему
 *  перечитывает localStorage — иначе кешированный список протухает. */
export const USER_PRESETS_EVENT = 'barlow:user-presets';

export const SAVE_FIELDS: (keyof (Track & Instrument))[] = [
  ...SOUND_FIELDS,
  'waveform', 'freq', 'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'effects', 'mono', 'portamentoSec',
  'sampleMode', 'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
  'vibratoRate', 'vibratoDepth', 'vibratoDelay', 'scratchPoints', 'mods',
  'unisonVoices', 'unisonDetune', 'unisonSpread',
  'filterEnvAmount', 'filterEnvTime', 'formants',
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
        (p): p is { name: string; track: Record<string, unknown> } =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as { name?: unknown }).name === 'string' &&
          typeof (p as { track?: unknown }).track === 'object' &&
          (p as { track?: unknown }).track !== null,
      )
      // Сохранённые до v39 модели пересобираются в строки рецептами.
      .map((p) => ({ ...convertPresetV39({ name: p.name, category: USER_CATEGORY, track: p.track }),
        id: typeof (p as InstrumentPreset).id === 'string' ? (p as InstrumentPreset).id : `user:${p.name}`,
        packId: 'user', hint: typeof (p as InstrumentPreset).hint === 'string' ? (p as InstrumentPreset).hint?.slice(0, 600) : undefined,
        tags: Array.isArray((p as InstrumentPreset).tags)
          ? (p as InstrumentPreset).tags!.filter((t) => typeof t === 'string').slice(0, 16) : ['user'],
      }));
  } catch {
    /* повреждённое хранилище — своих пресетов просто нет */
    return [];
  }
}

/** Portable sound snapshot: musical phrases and scene state are excluded. */
export function presetFields(track: Partial<Track> & Partial<Instrument>): InstrumentPreset['track'] {
  const withRegister = { ...track, recommendedHz: recommendedHz(track) };
  const sound = Object.fromEntries(
    SAVE_FIELDS.filter((f) => withRegister[f] !== undefined).map((f) => [f, withRegister[f]]),
  ) as Partial<Track & Instrument>;
  return sound;
}

/** Записать (или перезаписать по имени) пресет из звуковых полей трека. */
export function saveUserPreset(
  name: string,
  track: Partial<Track> & Partial<Instrument>,
  metadata?: {hint?:string;tags?:string[]},
): void {
  const sound = presetFields(track);
  const existing = loadUserPresets();
  const list = existing.filter((p) => p.name !== name);
  list.push({ id: existing.find((p) => p.name === name)?.id ?? `user:${crypto.randomUUID()}`,
    name, category: USER_CATEGORY, packId: 'user', tags: metadata?.tags ?? existing.find(p => p.name === name)?.tags ?? ['user'],
    hint: metadata?.hint ?? existing.find(p => p.name === name)?.hint, track: sound });
  localStorage.setItem(USER_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(USER_PRESETS_EVENT));
}

export function deleteUserPreset(name: string): void {
  const list = loadUserPresets().filter((p) => p.name !== name);
  localStorage.setItem(USER_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(USER_PRESETS_EVENT));
}
