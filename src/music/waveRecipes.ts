// Заготовки волны (v39): единственный источник таблиц строк-операторов
// для трёх потребителей — миграции патчей (types.ts: прежние модели
// пересобираются в строки), библиотеки пресетов и выпадашки «заготовка»
// в редакторе инструмента. Рецепты зеркалят математику прежних моделей
// (voices.ts до v39) и снапшотов (waveSnapshot.ts).
//
// Из types.ts здесь только типы (import type — стирается): types.ts сам
// импортирует recipeForLegacy в рантайме, цикла не возникает.
import type { WaveDef, WavePartial } from '../types';

export interface RecipeOpts {
  // Прежний морф модели, 0..1 (у каждой заготовки свой смысл).
  morph?: number;
  // FM: отношение частоты модулятора и индекс.
  fmRatio?: number;
  fmIndex?: number;
  // Струна: время жизни, с.
  ksLife?: number;
}

export interface RecipeResult {
  wave: WaveDef;
  // Вокал оставляет формантный слой — универсальное поле инструмента.
  formants?: { freq: number; gain: number }[];
  // Супер-пила живёт унисоном — универсальные ручки инструмента.
  unison?: { voices: number; detune: number };
}

export type RecipeId =
  | 'sine'
  | 'saw'
  | 'square'
  | 'triangle'
  | 'noise'
  | 'additive'
  | 'organ'
  | 'bell'
  | 'string'
  | 'fm'
  | 'supersaw'
  | 'vocal';

export const RECIPE_LABELS: Record<RecipeId, string> = {
  sine: 'синус',
  saw: 'пила',
  square: 'прямоугольник',
  triangle: 'треугольник',
  noise: 'шум',
  additive: 'гармоники',
  organ: 'орган',
  bell: 'колокол',
  string: 'струна',
  fm: 'FM',
  supersaw: 'супер-пила',
  vocal: 'вокал',
};

const r4 = (v: number) => +v.toFixed(4);

const row = (
  ratio: number,
  amp: number,
  type: WavePartial['type'],
  decay?: number,
  mod?: number,
): WavePartial => ({
  ratio: r4(ratio),
  amp: r4(amp),
  type,
  ...(decay ? { decay: +decay.toFixed(3) } : {}),
  ...(mod !== undefined ? { mod } : {}),
});

/** Нормировка суммы: громчайшая строка = 1. */
const norm = (rows: WavePartial[]): WavePartial[] => {
  const max = Math.max(...rows.map((p) => p.amp), 0.0001);
  return rows.map((p) => ({ ...p, amp: r4(p.amp / max) }));
};

// Колокол/маримба: частоты мод интерполируются материалом (морфом).
const MODAL_A = [1, 3.9, 9.2, 13.4];
const MODAL_B = [1, 2.32, 4.25, 6.63];

// Вокальные форманты: пять гласных (F1, F2, F3), морф их интерполирует.
const VOWELS: [number, number, number][] = [
  [800, 1150, 2800], // А
  [500, 1900, 2550], // Э
  [280, 2250, 2890], // И
  [550, 950, 2400], // О
  [350, 800, 2300], // У
];
const VOWEL_GAINS = [1, 0.55, 0.3];

function vowelBands(m: number): { freq: number; gain: number }[] {
  const pos = Math.min(0.9999, Math.max(0, m)) * (VOWELS.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = VOWELS[i];
  const b = VOWELS[i + 1];
  return [0, 1, 2].map((k) => ({
    freq: Math.round(a[k] + (b[k] - a[k]) * frac),
    gain: VOWEL_GAINS[k],
  }));
}

/** Собрать заготовку: таблица строк (+ форманты/унисон, если заготовке
 *  они нужны). Параметры — прежние ручки моделей, пригодится миграции. */
export function recipe(id: RecipeId, o: RecipeOpts = {}): RecipeResult {
  const m = Math.min(1, Math.max(0, o.morph ?? 0.5));
  switch (id) {
    case 'sine':
      return { wave: { partials: [row(1, 1, 'sine')] } };
    case 'saw':
      return { wave: { partials: [row(1, 1, 'saw')] } };
    case 'square':
      return { wave: { partials: [row(1, 1, 'square')] } };
    case 'triangle':
      return { wave: { partials: [row(1, 1, 'triangle')] } };
    case 'noise':
      return { wave: { partials: [row(1, 1, 'noise')], noiseGrainMs: 40 } };
    case 'additive': {
      // Яркость = число гармоник (2..16), спад k^-1.5.
      const n = 2 + Math.round(m * 14);
      return {
        wave: {
          partials: norm(Array.from({ length: n }, (_, i) => row(i + 1, Math.pow(i + 1, -1.5), 'sine'))),
        },
      };
    }
    case 'organ': {
      // Регистры 1,2,3,4,6,8: морф открывает их по одному снизу,
      // но ни один не закрывается в ноль (пол 0.15).
      const regs = [1, 2, 3, 4, 6, 8];
      return {
        wave: {
          partials: regs.map((rt, i) => row(rt, Math.max(0.15, Math.min(1, m * regs.length * 1.15 - i)), 'sine')),
        },
      };
    }
    case 'bell': {
      // Материал = интерполяция частот мод маримба ↔ колокол; хвост
      // каждой строки — её звон (длиннее у нижних, как Q прежних
      // резонаторов).
      const base = 0.6 + m * 2.4;
      return {
        wave: {
          partials: MODAL_A.map((pa, i) => {
            const ratio = pa + (MODAL_B[i] - pa) * m;
            return row(ratio, 0.9 / (i + 1), 'sine', base / (1 + i * 0.55));
          }),
        },
      };
    }
    case 'string': {
      // Струна: щипковый спектр k^-1.3, хвост темнеет — верхние строки
      // гаснут быстрее (петля с усреднением прежнего Karplus-Strong).
      const life = Math.min(8, Math.max(0.2, o.ksLife ?? 2.5));
      return {
        wave: {
          partials: norm(
            Array.from({ length: 12 }, (_, i) =>
              row(i + 1, Math.pow(i + 1, -1.3), 'sine', life / Math.pow(i + 1, 0.7)),
            ),
          ),
        },
      };
    }
    case 'fm': {
      // Классический FM: несущая ×1 + модулятор, его «громкость» —
      // индекс модуляции. Целые отношения — гармоничные тембры,
      // иррациональные (≈√2) — колокола и металл.
      const ratio = Math.min(24, Math.max(0.125, o.fmRatio ?? 2));
      const index = Math.min(24, Math.max(0, o.fmIndex ?? 3));
      return { wave: { partials: [row(1, 1, 'sine'), row(ratio, index, 'sine', undefined, 0)] } };
    }
    case 'supersaw':
      // Семь расстроенных пил — это унисон поверх одной пилы.
      return {
        wave: { partials: [row(1, 1, 'saw')] },
        unison: { voices: 7, detune: 4 + m * 36 },
      };
    case 'vocal':
      // Пила сквозь формантный слой — гласная не зависит от высоты ноты.
      return {
        wave: { partials: [row(1, 1, 'saw')] },
        formants: vowelBands(m),
      };
  }
}

/** Пересобрать прежнюю модель (v38-) в строки-операторы. null — источник
 *  и так современный (wave/sample) или неизвестный. */
export function recipeForLegacy(raw: Record<string, unknown>): RecipeResult | null {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  switch (raw.waveform) {
    case 'sine':
      return recipe('sine');
    case 'triangle':
      return recipe('triangle');
    case 'square':
      return recipe('square');
    case 'sawtooth':
      return recipe('saw');
    case 'noise':
      return recipe('noise');
    case 'additive':
      return recipe('additive', { morph: num(raw.voiceMorph, 0.5) });
    case 'organ':
      return recipe('organ', { morph: num(raw.voiceMorph, 0.5) });
    case 'modal':
      return recipe('bell', { morph: num(raw.voiceMorph, 0.5) });
    case 'karplus':
      return recipe('string', { ksLife: num(raw.ksLife, 2.5) });
    case 'fm':
      return recipe('fm', { fmRatio: num(raw.fmRatio, 2), fmIndex: num(raw.fmIndex, 3) });
    case 'supersaw':
      return recipe('supersaw', { morph: num(raw.voiceMorph, 0.5) });
    case 'formant':
      return recipe('vocal', { morph: num(raw.voiceMorph, 0.5) });
    default:
      return null;
  }
}
