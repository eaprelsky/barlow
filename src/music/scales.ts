import { t as msg } from '../i18n/runtime.ts';
// Шкалы трека: произвольные наборы отношений частот (ratios) к тонике.
// Никакой обязательной привязки к 12 полутонам: от чистого строя и равной
// темперации до гамелана, шрути и неоктавных строев. Выбор — в модалке
// с поиском (ScalePicker), «своя» вводится дробями.

export interface ScalePreset {
  name: string;
  sourceName: string;
  ratios: number[];
  group: string;
  hint?: string;
}

export const SCALE_GROUP_ORDER = [
  'запад',
  'индия',
  'ближний восток',
  'восточная и юго-восточная азия',
  'экспериментальные',
];

function edo(steps: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => +(2 ** (i / steps)).toFixed(6));
}

/** Ступени в центах → отношения (для нерегулярных темпераций). */
function cents(values: number[]): number[] {
  return values.map((c) => +(2 ** (c / 1200)).toFixed(6)).concat(2);
}

/** Равные деления произвольного интервала (неоктавные строи Карлос, Болен-Пирс). */
function equalDivisions(interval: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => +(interval ** (i / steps)).toFixed(6));
}

/** Строи Карлос: шаг = доля квинты, октава не замыкается — поэтому рядом
 *  с последней ступенью ниже октавы ставим и саму октаву. */
function carlos(stepsPerOctave: number): number[] {
  const last = Math.floor(stepsPerOctave);
  return Array.from({ length: last + 1 }, (_, i) => +(2 ** (i / stepsPerOctave)).toFixed(6)).concat(2);
}

// Среднетоновый ¼-коммы и Веркмайстер III — канонические таблицы в центах.
const MEANTONE_QUARTER = [0, 76.0, 193.2, 310.3, 386.3, 503.4, 579.5, 696.6, 772.6, 889.7, 1006.8, 1082.9];
const WERCKMEISTER_III = [0, 90.2, 192.2, 294.1, 390.2, 498.0, 588.3, 696.1, 792.2, 888.3, 996.1, 1092.2];

// 22 шрути индийской классики: канонический ряд чистого строя, из него
// выбираются ступени раг. Тоника (са) и квинта (па) всегда чистые.
const SHRUTI_22 = [
  1, 256 / 243, 16 / 15, 10 / 9, 9 / 8, 32 / 27, 6 / 5, 5 / 4, 81 / 64, 4 / 3, 27 / 20, 45 / 32,
  729 / 512, 3 / 2, 128 / 81, 8 / 5, 5 / 3, 27 / 16, 16 / 9, 9 / 5, 15 / 8, 2,
];

// Гарри Партч, 43 ступени в 11-лимите (Genesis of a Music).
const PARTCH_43 = [
  1, 81 / 80, 33 / 32, 21 / 20, 16 / 15, 12 / 11, 11 / 10, 10 / 9, 9 / 8, 8 / 7, 7 / 6, 32 / 27,
  6 / 5, 11 / 9, 5 / 4, 14 / 11, 9 / 7, 21 / 16, 4 / 3, 27 / 20, 11 / 8, 7 / 5, 10 / 7, 16 / 11,
  40 / 27, 3 / 2, 32 / 21, 14 / 9, 11 / 7, 8 / 5, 18 / 11, 5 / 3, 27 / 16, 12 / 7, 7 / 4, 16 / 9,
  9 / 5, 20 / 11, 11 / 6, 15 / 8, 40 / 21, 64 / 33, 160 / 81, 2,
];

export const SCALE_PRESETS: ScalePreset[] = [
  // — запад —
  { sourceName: "одна высота", get name() { return msg("scales.singlePitch"); }, ratios: [1], group: 'запад', get hint() { return msg("scales.oneRowForDrumsOrASingle"); } },
  { sourceName: "пентатоника, минор", get name() { return msg("scales.minorPentatonic"); }, ratios: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2], group: 'запад' },
  { sourceName: "пентатоника, мажор", get name() { return msg("scales.majorPentatonic"); }, ratios: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2], group: 'запад' },
  { sourceName: "мажор (just intonation)", get name() { return msg("scales.majorJustIntonation"); }, ratios: [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2], group: 'запад' },
  { sourceName: "минор (just intonation)", get name() { return msg("scales.minorJustIntonation"); }, ratios: [1, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2], group: 'запад' },
  // Семь ладов в чистом строе: сексты 5/3 (мажорные) и 8/5 (минорные),
  // септимы 15/8 и 16/9, увеличенная кварта 45/32 у лидийского/локрийского.
  { sourceName: "лад: ионийский", get name() { return msg("scales.modeIonian"); }, ratios: [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2], group: 'запад' },
  { sourceName: "лад: дорийский", get name() { return msg("scales.modeDorian"); }, ratios: [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 16 / 9, 2], group: 'запад' },
  { sourceName: "лад: фригийский", get name() { return msg("scales.modePhrygian"); }, ratios: [1, 16 / 15, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 16 / 9, 2], group: 'запад' },
  { sourceName: "лад: лидийский", get name() { return msg("scales.modeLydian"); }, ratios: [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8, 2], group: 'запад' },
  { sourceName: "лад: миксолидийский", get name() { return msg("scales.modeMixolydian"); }, ratios: [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 16 / 9, 2], group: 'запад' },
  { sourceName: "лад: эолийский", get name() { return msg("scales.modeAeolian"); }, ratios: [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 16 / 9, 2], group: 'запад' },
  { sourceName: "лад: локрийский", get name() { return msg("scales.modeLocrian"); }, ratios: [1, 16 / 15, 6 / 5, 45 / 32, 3 / 2, 8 / 5, 16 / 9, 2], group: 'запад' },
  { sourceName: "12 равных полутонов", get name() { return msg("scales.12ToneEqualTemperament"); }, ratios: edo(12, 12), group: 'запад', get hint() { return msg("scales.equalSemitones"); } },
  { sourceName: "24 четвертитона", get name() { return msg("scales.24QuarterTones"); }, ratios: edo(24, 24), group: 'запад' },
  {
    sourceName: "пифагоров строй", get name() { return msg("scales.pythagoreanTuning"); },
    ratios: [
      1, 2187 / 2048, 9 / 8, 19683 / 16384, 81 / 64, 4 / 3, 729 / 512, 3 / 2,
      6561 / 4096, 27 / 16, 59049 / 32768, 243 / 128, 2,
    ],
    group: 'запад',
    get hint() { return msg("scales.12PitchesFromAChainOfPure"); },
  },
  {
    sourceName: "среднетоновый ¼-коммы", get name() { return msg("scales.quarterCommaMeantone"); },
    ratios: cents(MEANTONE_QUARTER),
    group: 'запад',
    get hint() { return msg("scales.pureMajorThirdsAssociatedWithRenaissanceAnd"); },
  },
  {
    sourceName: "Веркмайстер III", get name() { return msg("scales.werckmeisterIII"); },
    ratios: cents(WERCKMEISTER_III),
    group: 'запад',
    get hint() { return msg("scales.aHistoricalUnequalTemperamentWithDifferentKey"); },
  },
  {
    sourceName: "блюз (7-лимит)", get name() { return msg("scales.blues7Limit"); },
    ratios: [1, 6 / 5, 4 / 3, 7 / 4, 9 / 5, 2],
    group: 'запад',
    get hint() { return msg("scales.usesTheSeventhHarmonic74As"); },
  },

  // — индия —
  {
    sourceName: "22 шрути", get name() { return msg("scales.22Shruti"); },
    ratios: SHRUTI_22,
    group: 'индия',
    get hint() { return msg("scales.oneTheoreticalSetOf22ShrutiNot"); },
  },

  // — ближний восток —
  {
    sourceName: "макам Раст (24-EDO)", get name() { return msg("scales.maqamRast24EDO"); },
    ratios: [0, 4, 7, 10, 14, 17, 20, 24].map((k) => +(2 ** (k / 24)).toFixed(6)),
    group: 'ближний восток',
    get hint() { return msg("scales.a24EDOApproximationWithANeutral"); },
  },

  // — восточная и юго-восточная азия —
  // Индонезийские строи гамелана. Единого стандарта нет — каждый оркестр
  // настроен по-своему; слендро обычно близок к 5 равным ступеням, пелог —
  // к подмножеству 9 равных (степени 0,1,2,4,5,7,8).
  {
    sourceName: "слендро (≈5 равных)", get name() { return msg("scales.slendroApprox5EqualSteps"); },
    ratios: edo(5, 5),
    group: 'восточная и юго-восточная азия',
    get hint() { return msg("scales.anExperimentalApproximationActualGamelanTuningsVary"); },
  },
  {
    sourceName: "пелог (≈из 9 равных)", get name() { return msg("scales.pelogApprox9EDOSubset"); },
    ratios: [0, 1, 2, 4, 5, 7, 8].map((k) => +(2 ** (k / 9)).toFixed(6)).concat(2),
    group: 'восточная и юго-восточная азия',
    get hint() { return msg("scales.anExperimentalApproximationActualGamelanTuningsVary"); },
  },
  {
    sourceName: "тайский (7 равных)", get name() { return msg("scales.thaiInspired7EqualSteps"); },
    ratios: edo(7, 7),
    group: 'восточная и юго-восточная азия',
    get hint() { return msg("scales.anEqualStepApproximationNotAMeasured"); },
  },
  {
    sourceName: "хирадзёси", get name() { return msg("scales.hirajoshi"); },
    ratios: [1, 16 / 15, 6 / 5, 3 / 2, 8 / 5, 2],
    group: 'восточная и юго-восточная азия',
    get hint() { return msg("scales.aJapanesePentatonicScaleContainingSemitoneIntervals"); },
  },
  {
    sourceName: "инсэн", get name() { return msg("scales.insen"); },
    ratios: [1, 16 / 15, 4 / 3, 3 / 2, 16 / 9, 2],
    group: 'восточная и юго-восточная азия',
    get hint() { return msg("scales.aJapanesePentatonicScale"); },
  },
  {
    sourceName: "ивато", get name() { return msg("scales.iwato"); },
    ratios: [1, 16 / 15, 4 / 3, 45 / 32, 16 / 9, 2],
    group: 'восточная и юго-восточная азия',
    get hint() { return msg("scales.aJapanesePentatonicScaleContainingATritone"); },
  },

  // — экспериментальные —
  {
    sourceName: "Болен-Пирс", get name() { return msg("scales.bohlenPierce"); },
    ratios: equalDivisions(3, 13),
    group: 'экспериментальные',
    get hint() { return msg("scales.13EqualDivisionsOfThe31"); },
  },
  {
    sourceName: "Партч (43 ступени)", get name() { return msg("scales.partch43Steps"); },
    ratios: PARTCH_43,
    group: 'экспериментальные',
    get hint() { return msg("scales.11LimitJustIntonationGenesisOfA"); },
  },
  {
    sourceName: "Карлос альфа", get name() { return msg("scales.carlosAlphaApprox"); },
    ratios: carlos(15.396),
    group: 'экспериментальные',
    get hint() { return msg("scales.approximationNineEqualDivisionsOfAPure"); },
  },
  {
    sourceName: "Карлос бета", get name() { return msg("scales.carlosBetaApprox"); },
    ratios: carlos(18.809),
    group: 'экспериментальные',
    get hint() { return msg("scales.approximationElevenEqualDivisionsOfAPure"); },
  },
  {
    sourceName: "Карлос гамма", get name() { return msg("scales.carlosGammaApprox"); },
    ratios: carlos(34.188),
    group: 'экспериментальные',
    get hint() { return msg("scales.approximationTwentyEqualDivisionsOfAPure"); },
  },
  { sourceName: "гармоники 1–8", get name() { return msg("scales.harmonics18"); }, ratios: [1, 2, 3, 4, 5, 6, 7, 8], group: 'экспериментальные' },
  {
    sourceName: "гармоники 8–16", get name() { return msg("scales.harmonics816"); },
    ratios: [8, 9, 10, 11, 12, 13, 14, 15, 16],
    group: 'экспериментальные',
    get hint() { return msg("scales.aClusterFromTheHarmonicSeries"); },
  },
];

const sameRatios = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/** Имя пресета для кнопки; 'своя' — если массив ни с одним не совпал. */
export function presetName(ratios: number[]): string {
  for (const p of SCALE_PRESETS) {
    if (sameRatios(p.ratios, ratios)) return p.name;
  }
  return msg("scales.custom");
}

/** Парсер своей шкалы: числа и дроби через запятую/пробел, до 48 значений
 *  (каждое 0–16, тоника 1 добавляется сама). «1, 9/8, 5/4, 3/2, 2» — JI. */
export function parseRatios(text: string): number[] | null {
  const tokens = text.split(/[,\s]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const out: number[] = [];
  for (const t of tokens) {
    let v: number;
    if (t.includes('/')) {
      const [a, b] = t.split('/');
      const num = Number(a);
      const den = Number(b);
      v = den > 0 && Number.isFinite(num) ? num / den : NaN;
    } else {
      v = Number(t);
    }
    if (!Number.isFinite(v) || v <= 0 || v > 16) return null;
    out.push(v);
  }
  out.push(1); // тоника — всегда
  const uniq = [...new Set(out.map((v) => +v.toFixed(6)))].sort((a, b) => a - b);
  return uniq.length > 48 ? null : uniq;
}

export function scaleGroupName(group: string): string {
  switch(group) {
    case "запад": return msg("scales.groupWest");
    case "индия": return msg("scales.groupIndia");
    case "ближний восток": return msg("scales.groupMiddleEast");
    case "восточная и юго-восточная азия": return msg("scales.groupAsia");
    case "экспериментальные": return msg("scales.groupExperimental");
    default: return group;
  }
}
