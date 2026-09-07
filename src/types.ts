// Модель патча. Патч = сериализуемые данные (JSON), с которыми работают
// UI, аудио-движок и (в будущем) ИИ-агент. Это контракт между слоями.
//
// Трёхуровневая модель арранжмента (см. docs/DESIGN.md):
//   паттерн (эскиз дорожки) → сцена (какой паттерн играет каждый трек)
//   → цепочка (порядок сцен с длинами = арранжмент).

// Заготовки волны: миграция v39 собирает строки-операторы из прежних
// моделей. Импорт односторонний (waveRecipes берёт из types только типы),
// цикла в рантайме нет.
import { recipeForLegacy } from './music/waveRecipes';
import { validPatchInput } from './patchValidation';
import { PARAMETERS, normalizeParameter, type ParameterId } from './parameters';
import { normalizeMacros, type SoundMacro } from './music/macros';
import { normalizeSampleZones, type SampleZone } from './music/sampleZones';

// v39: модели синтеза стали таблицей строк-операторов (см. WavePartial).
// Источников два: своя волна (таблица) и сэмпл. Прежние модели (FM, колокол,
// струна…) пересобираются в строки при нормализации (music/waveRecipes.ts),
// заготовками живут в выпадашке редактора и в пресетах библиотеки.
export type Waveform = 'wave' | 'sample';

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  wave: 'своя волна',
  sample: 'сэмпл',
};

/** Как сэмплер играет буфер: напрямую, облаком гранул или скрэтчем. */
export type SampleMode = 'plain' | 'grain' | 'scratch';

/** Режимы арпеджиатора (набор как в Ableton Live). */
export type ArpMode = 'up' | 'down' | 'updown' | 'downup' | 'order' | 'chord' | 'random';

export const ARP_MODE_LABELS: Record<ArpMode, string> = {
  up: 'вверх',
  down: 'вниз',
  updown: 'вверх-вниз',
  downup: 'вниз-вверх',
  order: 'как сыграно',
  chord: 'аккорд',
  random: 'случайно',
};

export interface Arp {
  mode: ArpMode;
  // Долей на шаг сетки: нота дробится на равные доли, по ним идёт фигура —
  // перелив короче самой ноты. 1 — доля = шаг, 2 — вдвое чаще.
  div: number;
  // Повтор фигуры по октавам (умножение частоты на 2^o), 1–4.
  octaves: number;
}

/** Довести арпеджиатор до валидного. */
export function normalizeArp(raw: unknown): Arp | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Arp>;
  const mode = (Object.keys(ARP_MODE_LABELS) as ArpMode[]).includes(r.mode as ArpMode)
    ? (r.mode as ArpMode)
    : 'up';
  return {
    mode,
    div: clamp(typeof r.div === 'number' ? r.div : 1, 0.25, 8, 1),
    octaves: Math.round(clamp(typeof r.octaves === 'number' ? r.octaves : 1, 1, 4, 1)),
  };
}

/** Одна строка-оператор своей волны (v39): типовая форма на множителях
 *  к ноте. Множитель может быть дробным — микротюнинг тембра. Строка
 *  либо добавляется в сумму, либо (задан mod) модулирует частоту другой
 *  строки — FM-оператор; её amp тогда индекс модуляции. */
export type PartialType = 'sine' | 'saw' | 'square' | 'triangle' | 'noise';

export interface WavePartial {
  ratio: number;
  // В сумму — амплитуда 0..1; модулятору (задан mod) — индекс модуляции.
  amp: number;
  type: PartialType;
  // Собственный хвост строки, с (T60): гаснет сам и может пережить ноту —
  // звон колокола, темнеющая струна. Нет — живёт под общей огибающей.
  decay?: number;
  // Маршрут: индекс строки, ЧАСТОТУ которой эта модулирует. Нет — в сумму.
  mod?: number;
}

/** Своя волна: аддитивный тембр из парциалов. Компактный JSON в патче
 *  и пресетах; целые синус-парциалы движок сливает в один PeriodicWave. */
export interface WaveDef {
  partials: WavePartial[];
  // Размер зерна шумовых парциалов, мс (характер «крупы»).
  noiseGrainMs?: number;
}

export const PARTIAL_TYPE_LABELS: Record<PartialType, string> = {
  sine: 'синус',
  saw: 'пила',
  square: 'прямоугольник',
  triangle: 'треугольник',
  noise: 'шум',
};

export function canRouteWave(partials: WavePartial[], from: number, to: number): boolean {
  if (!Number.isInteger(to) || !partials[to] || partials[to].type === 'noise') return false;
  const seen = new Set<number>([from]);
  let next: number | undefined = to;
  while (next !== undefined) {
    if (seen.has(next)) return false;
    seen.add(next);
    next = partials[next]?.mod;
  }
  return true;
}

/** Довести определение волны до валидного: клампы, лимит строк,
 *  маршруты в пределах таблицы. */
export function normalizeWave(raw: unknown): WaveDef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const list = (raw as { partials?: unknown }).partials;
  if (!Array.isArray(list)) return undefined;
  const types: PartialType[] = ['sine', 'saw', 'square', 'triangle', 'noise'];
  const partials: WavePartial[] = [];
  for (const p of list as Partial<WavePartial>[]) {
    if (!p || typeof p !== 'object') continue;
    const isMod = typeof p.mod === 'number';
    const ratio = clamp(typeof p.ratio === 'number' ? p.ratio : 1, 0.25, 64, 1);
    // Модулятору amp — индекс (до 24, как прежний fmIndex), сумме — 0..1.
    const amp = clamp(
      typeof p.amp === 'number' ? p.amp : 0.5,
      0,
      isMod ? 24 : 1,
      0.5,
    );
    const type = types.includes(p.type as PartialType) ? (p.type as PartialType) : 'sine';
    const partial: WavePartial = { ratio: +ratio.toFixed(4), amp, type };
    if (typeof p.decay === 'number' && p.decay > 0.001) {
      partial.decay = +clamp(p.decay, 0.05, 8, 1).toFixed(3);
    }
    if (isMod) partial.mod = Math.round(p.mod!);
    partials.push(partial);
    if (partials.length >= 64) break;
  }
  if (partials.length === 0) return undefined;
  // Только существующие осцилляторы; feedback требует отдельной модели.
  partials.forEach((p, i) => {
    if (p.mod !== undefined && (!Number.isInteger(p.mod) || p.mod < 0 || p.mod >= partials.length || p.mod === i || partials[p.mod]?.type === 'noise')) {
      delete p.mod;
    }
  });
  // Разрываем цикл детерминированно: первая замыкающая его строка
  // становится несущей. Повторная нормализация даёт тот же результат.
  partials.forEach((p, i) => {
    const seen = new Set<number>([i]);
    let next = p.mod;
    while (next !== undefined) {
      if (seen.has(next)) { delete p.mod; break; }
      seen.add(next);
      next = partials[next]?.mod;
    }
    if (p.mod === undefined) p.amp = Math.min(1, p.amp);
  });
  const grain = (raw as { noiseGrainMs?: unknown }).noiseGrainMs;
  return {
    partials,
    noiseGrainMs: clamp(typeof grain === 'number' ? grain : 40, 5, 500, 40),
  };
}

/** Точка жеста скрэтча: t — доля от длительности ноты, pos — позиция
 *  иглы в сэмпле (0..1). Жест = ломаная по точкам. */
export interface ScratchPoint {
  t: number;
  pos: number;
}

export interface Note {
  // Индекс строки шкалы (см. scaleOf).
  n: number;
  // Громкость этой ноты 0..1.
  vel: number;
  // Вероятность срабатывания этой ноты 0..1.
  prob: number;
  // Длина ноты, шагов (абсолютная, v37): своя у каждой ноты, поле «нота»
  // трека — только рисовалка по умолчанию для новых. До v37 длина была
  // множителем (gate) от базы трека — миграция пересчитывает в шаги,
  // поле больше не пишется.
  len?: number;
  // Легаси-множитель длины 0.1–4× (v36-): встречается только в старых
  // патчах до нормализации.
  gate?: number;
  // Сдвиг на октавы для арпеджиатора (умножение частоты на 2^oct).
  // В патч не пишется — появляется только в планировщике.
  oct?: number;
}

export interface Step {
  // Звучащие ноты шага. Пусто — пауза, несколько — аккорд.
  // У каждой ноты свои громкость и вероятность.
  notes: Note[];
}

interface LegacyStepFields {
  on?: boolean;
  note?: number;
  mul?: number;
  vel?: number;
  prob?: number;
}

export interface Pattern {
  id: string;
  name: string;
  // Длина цикла в шагах. Не обязана делить такт — отсюда полиритмия.
  length: number;
  steps: Step[];
  // Скорость шага этой партии (в базовых 1/16 тиках). Живёт на эскизе:
  // партии одного трека могут идти в разных темпах. Нормализация
  // заполняет всегда (наследуя трек у старых патчей).
  rate: number;
  // Паттерн-родитель для форков (навигация «вариация от…»).
  forkedFrom?: string;
  // v41: уровень партии × фейдер трека. Undefined = 1 (100%).
  volume?: number;
  // Пан/модуляции при Undefined берутся с дорожки.
  pan?: number;
  mods?: Mod[];
  // Огибающая перехода сцен, сек. fadeIn — как партия входит в сцену
  // (0 — обрыв), fadeOut — как уходит из неё (0 — резкий обрыв).
  // Живут на эскизе: у каждой партии свой характер вступления/ухода.
  // Дефолты 5/50 мс — деклик стыка, атаку нот не глотают.
  fadeIn?: number;
  fadeOut?: number;
  // Кривые партии (v35): громкость/фильтр/панорама по ходу цикла.
  automation?: AutoCurve[];
}

export type ModTarget =
  | 'pan'
  | 'volume'
  | 'filterFreq'
  // Цели эффектов — действуют на первый эффект в списке трека.
  | 'fxMix'
  | 'fxTime'
  | 'fxFeedback';

export const MOD_TARGET_LABELS: Record<ModTarget, string> = {
  pan: 'панорама',
  volume: 'громкость',
  filterFreq: 'фильтр',
  fxMix: 'глубина эффекта',
  fxTime: 'время эха',
  fxFeedback: 'повторы эха',
};

/** Вставной эффект трека (после фильтра, до панорамы). */
export type Effect =
  | { type: 'delay'; timeSec: number; feedback: number; mix: number }
  | { type: 'reverb'; sizeSec: number; mix: number }
  | { type: 'dist'; drive: number; mix: number }
  | { type: 'chorus'; rate: number; mix: number }
  | { type: 'lofi'; bits: number; mix: number };

export const EFFECT_LABELS: Record<Effect['type'], string> = {
  delay: 'задержка (эхо)',
  reverb: 'реверб (пространство)',
  dist: 'перегруз',
  chorus: 'хорус',
  lofi: 'ло-фай (ступеньки)',
};

/** Источник модуляции: LFO с формой / ступени S&H / плавный перлин-шум.
 *  Скорость в Гц, глубина 0..1. */
export type ModSource = 'lfo' | 'sah' | 'perlin';

export interface Mod {
  target: string;
  // Вид источника; отсутствует (старые патчи) = LFO.
  source?: ModSource;
  // Форма — только для LFO.
  shape: 'sine' | 'triangle' | 'square' | 'sawtooth';
  rate: number;
  // Период в четвертных долях. Нет — свободная частота rate в Гц.
  beatsPerCycle?: number;
  depth: number;
}

/** Один перевод периода в частоту для UI, live и offline. */
export function modRateHz(mod: Mod, bpm: number): number {
  return mod.beatsPerCycle !== undefined && mod.beatsPerCycle > 0
    ? bpm / 60 / mod.beatsPerCycle
    : mod.rate;
}

export interface Track {
  id: string;
  name: string;
  // Инструмент дорожки (тембр: источник, огибающая ноты, фильтры).
  // Живёт в patch.instruments; по умолчанию у дорожки свой экземпляр.
  instrumentId: string;
  // Скорость шага в базовых 1/16 тиках. Дробное значение даёт
  // фазовый дрейф относительно других треков (полиметрия).
  // Дефолт для эскизов: у каждого эскиза свой rate (Pattern.rate),
  // старые патчи наследуют его отсюда при нормализации.
  rate: number;
  // Сдвиг цикла в шагах: тот же ритм, но стартует позже/раньше.
  phase: number;
  // Шкала: отношения частот к тонике, по возрастанию. Произвольные
  // значения — микротюнинг без привязки к 12 полутонам.
  scale: number[];
  // Добавленные октавы шкалы вверх/вниз (расширение диапазона стана).
  scaleOctUp?: number;
  scaleOctDown?: number;
  // Тоника шкалы, Гц. Намеренно на дорожке, не на инструменте:
  // строй — свойство «прибора» целиком, стан общий для его партий.
  freq: number;
  // Длина ноты в шагах (привязка к сетке: шаг эскиза × темп).
  // 0/undefined — по огибающей инструмента (атака + спад).
  // Гейт ноты умножает сверху.
  noteSteps?: number;
  // Громкость трека 0..1.
  volume: number;
  // Панорама 0..1 (0.5 — центр).
  pan: number;
  // Модуляции: LFO, подключённые к параметрам трека (см. docs/DESIGN.md).
  mods: Mod[];
  // Моно: одна нота за раз, новая мягко глушит хвост предыдущей —
  // убирает фазовую интерференцию наложений (басам включать).
  mono?: boolean;
  // Мастер-выключатель дорожки: false — молчит во всех сценах, с любым
  // эскизом. Не путать с мьютом партии (на эскизе).
  enabled?: boolean;
  // Вставные эффекты: «комната» дорожки — общая для всех её эскизов.
  effects?: Effect[];
  // Сайдчейн: ноты дорожки-источника приглушают эту дорожку
  // («бас качается под бочку»).
  sidechain?: {
    sourceId: string;
    // Глубина приглушения 0..1.
    amount: number;
    // Время восстановления, с.
    releaseSec: number;
  };
  // Арпеджиатор: аккорд шага разворачивается в перелив внутри ноты.
  arp?: Arp;
  // Эскизы дорожки. Какой играет — решает сцена.
  patterns: Pattern[];
}

/** Цель автоматизации партии (кривая и модуляции — один набор): громкость
 *  — доля от громкости партии, фильтр — 60…12000 Гц по логарифму, панорама
 *  — L…R; цели fx* действуют на первый эффект в списке трека. */
export type AutoTarget =
  | 'volume'
  | 'filterFreq'
  | 'pan'
  | 'fxMix'
  | 'fxTime'
  | 'fxFeedback';

export const AUTO_TARGET_LABELS: Record<AutoTarget, string> = {
  volume: 'громкость',
  filterFreq: 'фильтр',
  pan: 'панорама',
  fxMix: 'микс эффекта',
  fxTime: 'время эха',
  fxFeedback: 'повторы эха',
};

/** Точка кривой: t — доля цикла эскиза (0..1), v — нормированное 0..1. */
export interface AutoPoint {
  t: number;
  v: number;
}

export interface AutoCurve {
  target: AutoTarget;
  points: AutoPoint[];
}

/** Значение кривой в точке цикла; нет точек — undefined. */
export function autoValue(points: AutoPoint[] | undefined, t: number): number | undefined {
  if (!points || points.length === 0) return undefined;
  const pts = points.length > 1 ? [...points].sort((a, b) => a.t - b.t) : points;
  if (t <= pts[0].t) return pts[0].v;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const f = (t - pts[i - 1].t) / Math.max(1e-9, pts[i].t - pts[i - 1].t);
      return pts[i - 1].v + (pts[i].v - pts[i - 1].v) * f;
    }
  }
  return pts[pts.length - 1].v;
}

/** Нормированное 0..1 → значение параметра. */
export function autoToParam(target: AutoTarget, v: number): number {
  if (target === 'filterFreq') return 60 * Math.pow(200, v); // 60…12000 Гц, лог
  if (target === 'fxTime') return 0.01 * Math.pow(200, v); // 10 мс…2 с, лог
  if (target === 'fxFeedback') return v * 0.9; // 0…90% повторы
  return v; // volume 0..1 (доля), pan 0..1 (позже ×2−1), fxMix 0..1 (wet)
}

/** Инструмент — тембр одной ноты: источник (волна/сэмпл), огибающая,
 *  падение тона, фильтры, вибрато. Сущность патча (v34): дорожка
 *  ссылается на инструмент по id; шаринг по ссылке — opt-in на будущее,
 *  по умолчанию экземпляр у дорожки свой. */
export interface Instrument {
  id: string;
  // Имя инструмента (при создании наследует имя дорожки/пресета).
  name: string;
  waveform: Waveform;
  // Своя волна (waveform === 'wave'): аддитивный тембр из гармоник.
  wave?: WaveDef;
  // Ссылка на сэмпл из библиотеки (SHA-256) — для волны «сэмпл».
  sampleId?: string;
  // Отображаемое имя сэмпла (кэш UI, истина — в библиотеке).
  sampleName?: string;
  // Обрезка сэмпла, сек: играет только кусок [sampleStart, sampleEnd].
  // Применимо ко всем режимам сэмплера, включая скрэтч.
  sampleStart?: number;
  // Тоника исходного сэмпла; mapping включается отдельно (legacy = ratio).
  rootHz?: number;
  keyTracking?: boolean;
  sampleEnd?: number;
  // Режим сэмплера: прямой, гранулярный (облако осколков) или скрэтч.
  sampleMode?: SampleMode;
  sampleZones?: SampleZone[];
  macros?: SoundMacro[];
  /** Direct sampler: reverse the selected region, sustain by looping it. */
  sampleReverse?: boolean;
  sampleLoop?: boolean;
  loopCrossfadeMs?: number;
  // Гранулярный режим: длина зерна, мс.
  grainSizeMs?: number;
  // Гранулярный режим: сколько зёрен выпускает одна нота.
  grainCount?: number;
  // Гранулярный режим: центр позиции зерна в сэмпле, 0..1.
  grainPos?: number;
  // Гранулярный режим: разброс позиции зерна вокруг центра, 0..1.
  grainScatter?: number;
  // Скрэтч: жест иглы по сэмплу (ломаная t→pos), проигрывается на нотах.
  scratchPoints?: ScratchPoint[];
  // Вибрато: частота (Гц) и глубина (в центах) на голосах осцилляторов
  // и скорости сэмпла.
  vibratoRate?: number;
  vibratoDepth?: number;
  // Огибающая ноты, сек.
  attack: number;
  decay: number;
  // Плато (sustain): доля 0..1 звуковой части ноты (после атаки), которую
  // нота держит на полной громкости; остаток — экспоненциальный спад.
  // 0 — сразу спад после атаки (классический барлоу-перкуссионный хвост);
  // при 0 длина ноты — триггер: спад звучит свой полный decay, сеточный
  // слот хвост не рубит (бочка в один шаг = бочка в три шага).
  sustain?: number;
  // Падение тона: во сколько раз выше тоники нота стартует и слетает
  // вниз за pitchTime. >1 превращает синус в бочку («вумп»).
  pitchDrop: number;
  // Длительность падения тона, с.
  pitchTime: number;
  // Частоты обрезки: highpass снизу и lowpass сверху, Гц.
  filterLow: number;
  filterFreq: number;
  // Резонанс lowpass (Q): 0.8 — ровный обрез, 4–10 — звонкое «горло»
  // (воббл, сквелч), 15+ — самозвон на частоте среза.
  filterQ?: number;
  // Унисон (любая волна и сэмпл): N расстроенных копий на ноту.
  // Детюн — центы на крайнем голосе, разброс 0..1 — по каналам.
  unisonVoices?: number;
  unisonDetune?: number;
  unisonSpread?: number;
  // Вибрато с задержкой: глубина нарастает от нуля за это время, с —
  // певческое «дойти до вибрато» вместо мгновенного дрожания.
  vibratoDelay?: number;
  // Огибающая фильтра на голос: старт в ±полутонах от ручки «верх»
  // и съезд к базе за время. Плюс — яркая атака (плак), минус — свелл.
  filterEnvAmount?: number;
  filterEnvTime?: number;
  // Формантный слой (v39, универсальный): бугры громкости на фиксированных
  // частотах (Гц) поверх любой волны и сэмпла — вокальные гласные,
  // «горло» инструмента, не зависящее от высоты ноты.
  formants?: { freq: number; gain: number }[];
}

/** Поля Track, принадлежащие инструменту: маршрутизация пресетов и
 *  миграции v33 → v34. fmRatio/fmIndex/voiceMorph/ksLife — легаси v38:
 *  новые инструменты их не получают, но со старых дорожек снимаются. */
export const INSTRUMENT_FIELDS = [
  'waveform', 'wave', 'macros', 'sampleZones', 'sampleId', 'sampleName', 'sampleStart', 'sampleEnd', 'rootHz', 'keyTracking',
  'sampleMode', 'sampleReverse', 'sampleLoop', 'loopCrossfadeMs', 'grainSizeMs', 'grainCount', 'grainPos', 'grainScatter',
  'scratchPoints', 'fmRatio', 'fmIndex', 'voiceMorph', 'ksLife',
  'attack', 'decay', 'sustain', 'pitchDrop', 'pitchTime',
  'filterLow', 'filterFreq', 'filterQ', 'vibratoRate', 'vibratoDepth',
  'unisonVoices', 'unisonDetune', 'unisonSpread', 'vibratoDelay',
  'filterEnvAmount', 'filterEnvTime', 'formants',
] as const;

/** Дорожка со слитым инструментом — то, что получает синтез. */
export type SoundingTrack = Track & Instrument;

/** Слот сцены: что играет дорожка в этой сцене. muted — тишина вместо
 *  эскиза (v38, переехал с эскиза): в ДРУГИХ сценах тот же эскиз играет
 *  как ни в чём не было — мьют стал свойством пары (сцена, дорожка).
 *  Часы партии идут и под мьютом — сняв, войдёшь в фазе. */
export interface SceneSlot {
  patternId: string;
  muted?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  // trackId → слот: какой эскиз играет дорожка в этой сцене.
  slots: Record<string, SceneSlot>;
  // Эксклюзивное соло этой сцены: слышна только эта дорожка (любой её
  // эскиз). Соло — свойство сцены, с эскизами не переносится.
  soloTrackId?: string;
}

export interface ChainItem {
  sceneId: string;
  bars: number;
  // Темп этого пункта (v35): undefined — как в шапке патча.
  bpm?: number;
}

export type MasterNoise = 'off' | 'white' | 'pink';

export interface Patch {
  version: number;
  bpm: number;
  // Название пьесы — попадает в имена файлов экспорта (транслит).
  title?: string;
  // Общая громкость 0..2. Выше 1 — tanh-лимитер мягко пережимает,
  // звук плотнеет (мастер-сатурация) без клиппинга.
  masterVolume: number;
  // Панорама всего микса 0..1 (0.5 — центр): сдвигает стерео поле целиком,
  // трековые паны и их модуляции остаются как есть.
  masterPan?: number;
  // Фоновый шум мастера (после лимитера — не качается компрессией):
  // естественность ленты/воздуха. Уровень 0..1.
  masterNoise?: MasterNoise;
  masterNoiseLevel?: number;
  // Мастер-компрессия 0..1: 0 — выключена, дальше плотнее и сочнее
  // (порог ниже,_ratio выше, компенсация громкости больше).
  masterComp?: number;
  // Играть сцены по цепочке (арранжмент) или держать текущую сцену.
  followChain: boolean;
  scenes: Scene[];
  chain: ChainItem[];
  tracks: Track[];
  // Инструменты дорожек (v34): тембр как сущность патча.
  instruments: Instrument[];
}

export const PATCH_VERSION = 43;

let idSeq = 0;
export const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function makeStep(on = false, note = 0, vel = 0.8, prob = 1): Step {
  return { notes: on ? [{ n: note, vel, prob }] : [] };
}

export function makeNote(n = 0, vel = 0.8, prob = 1, len?: number): Note {
  if (len !== undefined && len > 0) return { n, vel, prob, len: Math.round(len * 100) / 100 };
  return { n, vel, prob };
}

export function makePattern(name: string, length: number, steps?: Step[], rate?: number): Pattern {
  return {
    id: uid('p'),
    name,
    length,
    rate: rate ?? 1,
    steps:
      steps ??
      Array.from({ length }, () => makeStep()),
  };
}

export function makeInstrument(
  partial: Partial<Instrument> & { id: string; name: string },
): Instrument {
  return {
    waveform: partial.waveform ?? 'wave',
    // Дефолт — честный синус одной строкой: патч всегда валиден.
    wave: partial.wave ?? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] },
    pitchDrop: partial.pitchDrop ?? 1,
    pitchTime: partial.pitchTime ?? 0.08,
    filterLow: partial.filterLow ?? 20,
    filterFreq: partial.filterFreq ?? 8000,
    attack: partial.attack ?? 0.002,
    decay: partial.decay ?? 0.25,
    sustain: partial.sustain,
    sampleId: partial.sampleId,
    sampleName: partial.sampleName,
    sampleStart: partial.sampleStart,
    rootHz: partial.rootHz,
    keyTracking: partial.keyTracking,
    sampleEnd: partial.sampleEnd,
    vibratoRate: partial.vibratoRate,
    vibratoDepth: partial.vibratoDepth,
    sampleMode: partial.sampleMode,
    sampleZones: normalizeSampleZones(partial.sampleZones),
    macros: normalizeMacros(partial.macros),
    sampleReverse: partial.sampleReverse,
    sampleLoop: partial.sampleLoop,
    loopCrossfadeMs: partial.loopCrossfadeMs,
    grainSizeMs: partial.grainSizeMs,
    grainCount: partial.grainCount,
    grainPos: partial.grainPos,
    grainScatter: partial.grainScatter,
    scratchPoints: partial.scratchPoints,
    filterQ: partial.filterQ,
    unisonVoices: partial.unisonVoices,
    unisonDetune: partial.unisonDetune,
    unisonSpread: partial.unisonSpread,
    vibratoDelay: partial.vibratoDelay,
    filterEnvAmount: partial.filterEnvAmount,
    filterEnvTime: partial.filterEnvTime,
    formants: partial.formants,
    id: partial.id,
    name: partial.name,
  };
}

/** Инструмент из «сырых» звуковых полей (пресеты, миграция v33 → v34):
 *  забирает только поля из INSTRUMENT_FIELDS. */
export function instrumentOfFields(
  fields: Partial<Record<(typeof INSTRUMENT_FIELDS)[number], unknown>>,
  id: string,
  name: string,
): Instrument {
  const picked = Object.fromEntries(
    INSTRUMENT_FIELDS.filter((f) => fields[f] !== undefined).map((f) => [f, fields[f]]),
  );
  return normalizeInstrument(picked, id, name);
}

export function makeTrackWithInstrument(
  partial: Partial<Track> & { id: string; name: string; length?: number },
): { track: Track; instrument: Instrument } {
  // Звуковые поля (INSTRUMENT_FIELDS) уходят в инструмент дорожки (v34),
  // остальные — на дорожку.
  const instrument = instrumentOfFields(
    partial as Partial<Record<(typeof INSTRUMENT_FIELDS)[number], unknown>>,
    uid('i'),
    partial.name,
  );
  const track: Track = {
    instrumentId: instrument.id,
    rate: partial.rate ?? 1,
    phase: partial.phase ?? 0,
    scale: partial.scale && partial.scale.length > 0 ? partial.scale : [1],
    freq: partial.freq ?? 220,
    // Новый трек — ноты ровно в клетку (1 шаг); «авто» по огибающей —
    // только если пользователь явно обнулил поле «нота».
    noteSteps: partial.noteSteps ?? 1,
    volume: partial.volume ?? 0.8,
    pan: partial.pan ?? 0.5,
    mods: partial.mods ?? [],
    arp: partial.arp,
    mono: partial.mono,
    effects: partial.effects,
    scaleOctUp: partial.scaleOctUp,
    scaleOctDown: partial.scaleOctDown,
    patterns:
      partial.patterns ?? [makePattern('A', partial.length ?? 16, undefined, partial.rate ?? 1)],
    id: partial.id,
    name: partial.name,
  };
  return { track, instrument };
}

export function makeScene(name: string, tracks: Track[], patternOf: (t: Track) => string): Scene {
  const slots: Record<string, SceneSlot> = {};
  for (const t of tracks) slots[t.id] = { patternId: patternOf(t) };
  return { id: uid('s'), name, slots };
}

/** Паттерн трека в конкретной сцене (fallback — первый). */
export function patternInScene(track: Track, scene: Scene | undefined): Pattern {
  const wanted = scene?.slots[track.id]?.patternId;
  return track.patterns.find((p) => p.id === wanted) ?? track.patterns[0];
}

/** Мьют слота сцены (v38): дорожка молчит в ЭТОЙ сцене — как пустой
 *  эскиз, но часы партии идут. Другие сцены с тем же эскизом играют. */
export function slotMuted(scene: Scene | undefined, trackId: string): boolean {
  return scene?.slots[trackId]?.muted === true;
}

/** Строки нотного стана: базовая шкала + добавленные октавы. Шкала
 *  может уже содержать свою октаву (пентатоника с 2) — пересечения с
 *  добавленными октавами схлопываются в одну строку, итог сортирован. */
export function scaleOf(track: Track): number[] {
  const up = track.scaleOctUp ?? 0;
  const down = track.scaleOctDown ?? 0;
  const seen = new Set<number>();
  const rows: number[] = [];
  for (let o = -down; o <= up; o++) {
    const k = 2 ** o;
    for (const r of track.scale) {
      const v = +(r * k).toFixed(9);
      if (!seen.has(v)) {
        seen.add(v);
        rows.push(v);
      }
    }
  }
  return rows.sort((a, b) => a - b);
}

/** Частоты всех нот шага (аккорда), Гц. Пусто — пауза. */
export function stepFreqs(track: Track, step: Step): number[] {
  const rows = scaleOf(track);
  const max = rows.length - 1;
  return step.notes.map((nt) => {
    const idx = Math.min(Math.max(Math.round(nt.n), 0), max);
    return track.freq * (rows[idx] ?? 1);
  });
}

// До миграции проверяются версия, бюджет структуры, ID и ссылки.
export function isPatch(value: unknown): value is Patch {
  return validPatchInput(value, PATCH_VERSION);
}

const clamp = (v: number, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const MOD_SHAPES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
const MOD_TARGETS = ['pan', 'volume', 'filterFreq', 'fxTime', 'fxFeedback', 'fxMix'] as const;

function normalizeEffects(raw: unknown): Effect[] {
  if (!Array.isArray(raw)) return [];
  const out: Effect[] = [];
  for (const item of raw) {
    const e = item as {
      type?: unknown;
      timeSec?: unknown;
      feedback?: unknown;
      mix?: unknown;
      sizeSec?: unknown;
      drive?: unknown;
      rate?: unknown;
      bits?: unknown;
    };
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'delay') {
      out.push({
        type: 'delay',
        timeSec: clamp(typeof e.timeSec === 'number' ? e.timeSec : 0.28, 0.01, 2, 0.28),
        feedback: clamp(typeof e.feedback === 'number' ? e.feedback : 0.35, 0, 0.9, 0.35),
        mix: clamp(typeof e.mix === 'number' ? e.mix : 0.3, 0, 1, 0.3),
      });
    } else if (e.type === 'reverb') {
      out.push({
        type: 'reverb',
        sizeSec: clamp(typeof e.sizeSec === 'number' ? e.sizeSec : 1.8, 0.2, 8, 1.8),
        mix: clamp(typeof e.mix === 'number' ? e.mix : 0.25, 0, 1, 0.25),
      });
    } else if (e.type === 'dist') {
      out.push({
        type: 'dist',
        drive: clamp(typeof e.drive === 'number' ? e.drive : 6, 1, 40, 6),
        mix: clamp(typeof e.mix === 'number' ? e.mix : 0.5, 0, 1, 0.5),
      });
    } else if (e.type === 'chorus') {
      out.push({
        type: 'chorus',
        rate: clamp(typeof e.rate === 'number' ? e.rate : 0.6, 0.05, 8, 0.6),
        mix: clamp(typeof e.mix === 'number' ? e.mix : 0.5, 0, 1, 0.5),
      });
    } else if (e.type === 'lofi') {
      out.push({
        type: 'lofi',
        bits: Math.round(clamp(typeof e.bits === 'number' ? e.bits : 6, 2, 12, 6)),
        mix: clamp(typeof e.mix === 'number' ? e.mix : 0.7, 0, 1, 0.7),
      });
    }
  }
  return out;
}

const MOD_SOURCES = ['lfo', 'sah', 'perlin'] as const;

function normalizeMods(raw: unknown): Mod[] {
  if (!Array.isArray(raw)) return [];
  const out: Mod[] = [];
  for (const m of raw as Partial<Mod>[]) {
    if (!m || typeof m !== 'object') continue;
    const target = (MOD_TARGETS as readonly string[]).includes(String(m.target))
      ? (m.target as ModTarget)
      : null;
    const shape = (MOD_SHAPES as readonly string[]).includes(String(m.shape))
      ? (m.shape as Mod['shape'])
      : null;
    if (!target || !shape) continue;
    const source = (MOD_SOURCES as readonly string[]).includes(String(m.source))
      ? (m.source as Mod['source'])
      : undefined;
    out.push({
      target,
      source,
      shape,
      rate: clamp(m.rate ?? 0.2, 0.01, 40, 0.2),
      beatsPerCycle: typeof m.beatsPerCycle === 'number' && Number.isFinite(m.beatsPerCycle)
        ? clamp(m.beatsPerCycle, 1 / 64, 64, 1) : undefined,
      depth: clamp(m.depth ?? 0.5, 0, 1, 0.5),
    });
  }
  return out;
}

function normalizeSteps(
  raw: unknown,
  length: number,
  rowsLen: number,
  scale: number[],
): Step[] {
  const maxNote = rowsLen - 1;
  const rawSteps = Array.isArray(raw) ? (raw as (Partial<Step> & LegacyStepFields)[]) : [];
  return Array.from({ length }, (_, i) => {
    const s = rawSteps[i];
    // v12: ноты — объекты со своими vel/prob; v11 — индексы с общими
    // vel/prob шага; старше — одиночные note/mul/on.
    let notes: Note[];
    if (Array.isArray(s?.notes) && s.notes.length > 0 && typeof s.notes[0] === 'object') {
      notes = (s.notes as Partial<Note>[])
        .filter((nt) => nt && typeof nt.n === 'number')
        .map((nt) => ({
          n: Math.min(Math.max(Math.round(nt.n!), 0), maxNote),
          vel: clamp(nt.vel ?? 0.8, 0, 1, 0.8),
          prob: clamp(nt.prob ?? 1, 0, 1, 1),
          len:
            typeof nt.len === 'number' && nt.len > 0
              ? clamp(nt.len, 0.1, 64, 1)
              : undefined,
          gate: clamp(nt.gate ?? 1, 0.1, 4, 1),
        }));
    } else if (Array.isArray(s?.notes)) {
      const vel = clamp(s?.vel ?? 0.8, 0, 1, 0.8);
      const prob = clamp(s?.prob ?? 1, 0, 1, 1);
      notes = (s.notes as unknown as number[])
        .filter((n): n is number => typeof n === 'number')
        .map((n) => ({ n: Math.min(Math.max(Math.round(n), 0), maxNote), vel, prob, gate: 1 }));
    } else {
      let note = typeof s?.note === 'number' ? Math.round(s.note) : 0;
      if (typeof s?.mul === 'number' && s.mul > 0) {
        const idx = scale.indexOf(s.mul);
        if (idx >= 0) note = idx;
      }
      notes = s?.on
        ? [{ n: Math.min(Math.max(note, 0), maxNote), vel: clamp(s?.vel ?? 0.8, 0, 1, 0.8), prob: clamp(s?.prob ?? 1, 0, 1, 1), gate: 1 }]
        : [];
    }
    return { notes };
  });
}

// Доводит патч любой версии до валидного состояния текущей схемы.
// v5 и ниже: единственный рисунок трека становится паттерном «A»,
// создаётся одна сцена и цепочка из неё.
// v16 → v17: соло переезжает с эскиза в сцену (эксклюзивное soloTrackId).
/** v39: модели синтеза (синус, пила, FM, колокол, струна, вокал…)
 *  пересобираются в таблицу строк-операторов — см. music/waveRecipes.ts.
 *  Звук близкий, но не бит-в-бит: модели были живыми алгоритмами,
 *  таблица — честный срез их спектра. Работает и для легаси-полей
 *  дорожек v33 (они проходят через normalizeInstrument при миграции). */
function migrateV39(raw: Record<string, unknown>): Record<string, unknown> {
  const wf = raw.waveform;
  if (wf !== 'wave' && wf !== 'sample') {
    const r = recipeForLegacy(raw);
    if (r) {
      const out: Record<string, unknown> = { ...raw, waveform: 'wave', wave: r.wave };
      if (r.formants) out.formants = r.formants;
      // Супер-пиле нужен её унисон; пользовательские настройки не трогаем,
      // только поднимаем до её минимальной ширины.
      if (r.unison) {
        const cur = typeof raw.unisonVoices === 'number' ? raw.unisonVoices : 1;
        if (cur < r.unison.voices) out.unisonVoices = r.unison.voices;
        if (cur < r.unison.voices) out.unisonDetune = r.unison.detune;
      }
      return out;
    }
  }
  return raw;
}

/** Довести инструмент до валидного: клампы звуковых полей (v34;
 *  переехали из нормализации трека без изменений). */
function normalizeInstrument(
  rawIn: Record<string, unknown>,
  id: string,
  name: string,
): Instrument {
  // Приведение через unknown: сырой JSON, поля могут быть чем угодно.
  const raw = migrateV39(rawIn);
  const t = raw as unknown as Partial<Instrument>;
  const waveforms = Object.keys(WAVEFORM_LABELS) as Waveform[];
  const formants = Array.isArray(t.formants)
    ? (t.formants as { freq?: unknown; gain?: unknown }[])
        .filter(
          (b) => b && typeof b === 'object' && typeof b.freq === 'number' && Number.isFinite(b.freq),
        )
        .slice(0, 5)
        .map((b) => ({
          freq: clamp(b.freq as number, 80, 9000, 800),
          gain: clamp(typeof b.gain === 'number' ? b.gain : 1, 0, 2, 1),
        }))
    : undefined;
  const normalized: Instrument = {
    id,
    name,
    waveform: waveforms.includes(t.waveform as Waveform) ? (t.waveform as Waveform) : 'wave',
    wave: normalizeWave(t.wave),
    pitchDrop: clamp(t.pitchDrop ?? 1, 1, 16, 1),
    pitchTime: clamp(t.pitchTime ?? 0.08, 0, 2, 0.08),
    filterLow: clamp(t.filterLow ?? 20, 20, 4000, 20),
    filterFreq: clamp(t.filterFreq ?? 8000, 60, 12000, 8000),
    filterQ: clamp(t.filterQ ?? 0.8, 0.5, 20, 0.8),
    attack: clamp(t.attack ?? 0.002, 0, 1, 0.002),
    decay: clamp(t.decay ?? 0.25, 0.01, 4, 0.25),
    sustain: clamp(t.sustain ?? 0, 0, 1, 0),
    sampleId: typeof t.sampleId === 'string' ? t.sampleId : undefined,
    sampleName: typeof t.sampleName === 'string' ? t.sampleName : undefined,
    rootHz: typeof t.rootHz === 'number' ? clamp(t.rootHz, 1, 24000, 440) : 440,
    keyTracking: t.keyTracking === true,
    sampleZones: normalizeSampleZones(t.sampleZones),
    macros: normalizeMacros(t.macros),
    sampleReverse: t.sampleReverse === true,
    sampleLoop: t.sampleLoop === true,
    loopCrossfadeMs: clamp(t.loopCrossfadeMs ?? 10, 0, 500, 10),
    // Обрезка сэмпла: конец должен быть дальше начала.
    sampleStart:
      typeof t.sampleStart === 'number' ? clamp(t.sampleStart, 0, 3600, 0) : undefined,
    sampleEnd:
      typeof t.sampleEnd === 'number' ? clamp(t.sampleEnd, 0.001, 3600, 3600) : undefined,
    vibratoRate: clamp(t.vibratoRate ?? 5, 0.1, 30, 5),
    vibratoDepth: clamp(t.vibratoDepth ?? 0, 0, 1200, 0),
    sampleMode:
      t.sampleMode === 'grain' || t.sampleMode === 'scratch' ? t.sampleMode : 'plain',
    grainSizeMs: clamp(t.grainSizeMs ?? 120, 10, 1000, 120),
    grainCount: Math.round(clamp(t.grainCount ?? 10, 1, 32, 10)),
    grainPos: clamp(t.grainPos ?? 0.3, 0, 1, 0.3),
    grainScatter: clamp(t.grainScatter ?? 0.15, 0, 1, 0.15),
    scratchPoints: Array.isArray(t.scratchPoints)
      ? (t.scratchPoints as ScratchPoint[])
          .filter((pt) => pt && Number.isFinite(pt.t) && Number.isFinite(pt.pos))
          .map((pt) => ({
            t: clamp(pt.t, 0, 1, 0),
            pos: clamp(pt.pos, 0, 1, 0),
          }))
          .sort((a, b) => a.t - b.t)
          .slice(0, 256)
      : undefined,
    // Унисон/вибрато-задержка/огибающая фильтра (v36): всё опционально,
    // дефолты выключены — старые патчи звучат как звучали.
    unisonVoices: Math.round(clamp(t.unisonVoices ?? 1, 1, 8, 1)),
    unisonDetune: clamp(t.unisonDetune ?? 12, 0, 50, 12),
    unisonSpread: clamp(t.unisonSpread ?? 0, 0, 1, 0),
    vibratoDelay: clamp(t.vibratoDelay ?? 0, 0, 4, 0),
    filterEnvAmount: clamp(t.filterEnvAmount ?? 0, -24, 24, 0),
    filterEnvTime: clamp(t.filterEnvTime ?? 0.3, 0.01, 4, 0.3),
    formants: formants && formants.length > 0 ? formants : undefined,
  };
  const values = normalized as unknown as Record<string, unknown>;
  for (const [id, spec] of Object.entries(PARAMETERS)) {
    if (spec.owner !== 'instrument') continue;
    const field = id.slice('instrument.'.length);
    if (values[field] !== undefined) values[field] = normalizeParameter(id as ParameterId, values[field]);
  }
  return normalized;
}

export function normalizePatch(p: Patch): Patch {
  // Миграция v34: инструменты дорожек. Валидируем существующие, а у
  // дорожек без инструмента забираем звуковые поля из старого JSON
  // (они лежали прямо на треке до v34) в новый экземпляр 1:1 —
  // на слух ничего не меняется.
  const instruments: Instrument[] = Array.isArray(
    (p as { instruments?: unknown }).instruments,
  )
    ? ((p as { instruments?: unknown }).instruments as Instrument[])
        .filter((i) => i && typeof i.id === 'string')
        .map((i) =>
          normalizeInstrument(
            i as unknown as Record<string, unknown>,
            i.id,
            typeof i.name === 'string' ? i.name : '?',
          ),
        )
    : [];
  const instIds = new Set(instruments.map((i) => i.id));

  // Миграция v16: trackId → id эскизов со старым флагом solo.
  const soloByTrack = new Map<string, Set<string>>();
  // Миграция v38: мьют партии (жил на эскизе — молчал во всех сценах)
  // переезжает в слоты сцен, где этот эскиз выбран: тишина стала
  // свойством сцены, в прочих сценах эскиз играет.
  const mutedPids = new Set<string>();
  const tracks: Track[] = p.tracks
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t): Track => {
      const legacySolo = new Set(
        (Array.isArray(t.patterns) ? t.patterns : []).map((pt) => (pt as { solo?: unknown }).solo ? pt.id : ''),
      );
      legacySolo.delete('');
      if (legacySolo.size > 0) soloByTrack.set(t.id, legacySolo);
      // Сырые паттерны: из v6 пришли patterns, из старых — steps/length на треке.
      let rawPatterns: {
        id?: string;
        name?: string;
        length?: number;
        steps?: unknown;
        forkedFrom?: string;
        volume?: number;
        pan?: number;
        rate?: unknown;
        mods?: unknown;
        muted?: unknown;
        fadeIn?: number;
        fadeOut?: number;
      }[];
      if (Array.isArray(t.patterns) && t.patterns.length > 0) {
        rawPatterns = t.patterns as typeof rawPatterns;
      } else {
        const legacy = t as unknown as { steps?: unknown[]; length?: number };
        rawPatterns = Array.isArray(legacy.steps)
          ? [{ id: uid('p'), name: 'A', length: legacy.length ?? 16, steps: legacy.steps }]
          : [{ id: uid('p'), name: 'A', length: 16 }];
      }

      // v41: один master gain дорожки × относительный уровень эскиза.
      // Старые абсолютные overrides сохраняют слышимый уровень: поднимаем
      // базу до максимума старых уровней и делим каждый эскиз на эту базу.
      const oldVolume = clamp(t.volume, 0, 1, 0.8);
      const trackVolume = p.version < 41
        ? Math.max(oldVolume, ...rawPatterns.map(pt => typeof pt?.volume === 'number' ? clamp(pt.volume, 0, 1, oldVolume) : oldVolume))
        : oldVolume;

      // Шкала: из патча, либо из уникальных mul старых шагов.
      let scale: number[];
      if (Array.isArray(t.scale) && t.scale.length > 0) {
        scale = t.scale
          .filter((r): r is number => typeof r === 'number' && r > 0)
          .sort((a, b) => a - b);
      } else {
        const set = new Set<number>([1]);
        for (const pt of rawPatterns) {
          for (const s of (Array.isArray(pt.steps) ? pt.steps : []) as { mul?: number }[]) {
            if (typeof s.mul === 'number' && s.mul > 0) set.add(s.mul);
          }
        }
        scale = [...set].sort((a, b) => a - b);
      }
      if (scale.length === 0) scale = [1];

      const octUp = Math.round(clamp((t as { scaleOctUp?: number }).scaleOctUp ?? 0, 0, 4, 0));
      const octDown = Math.round(clamp((t as { scaleOctDown?: number }).scaleOctDown ?? 0, 0, 4, 0));
      const rowsLen = scale.length * (1 + octUp + octDown);
      const patterns: Pattern[] = rawPatterns
        .filter((pt) => pt && typeof pt.id === 'string')
        .map((pt) => {
          const length = Math.round(clamp(pt.length ?? 16, 1, 64, 16));
          const mods = normalizeMods((pt as { mods?: unknown }).mods);
          if (pt.muted) mutedPids.add(pt.id!);
          return {
            id: pt.id!,
            name: typeof pt.name === 'string' && pt.name ? pt.name : '?',
            length,
            // Шаг живёт на эскизе (v33): старые патчи наследуют шаг трека.
            rate: clamp(typeof pt.rate === 'number' ? pt.rate : t.rate, 0.25, 32, 1),
            steps: normalizeSteps(pt.steps, length, rowsLen, scale),
            forkedFrom: pt.forkedFrom,
            volume: p.version < 41
              ? trackVolume > 0 ? clamp(pt.volume ?? oldVolume, 0, 1, oldVolume) / trackVolume : 1
              : typeof pt.volume === 'number' ? clamp(pt.volume, 0, 1, 1) : undefined,
            pan: typeof pt.pan === 'number' ? clamp(pt.pan, 0, 1, 0.5) : undefined,
            mods: mods.length > 0 ? mods : undefined,
            // Огибающая перехода сцен (v30): старые патчи получают
            // дефолты-деклики 5/50 мс.
            fadeIn: clamp(pt.fadeIn ?? 0.005, 0, 8, 0.005),
            fadeOut: clamp(pt.fadeOut ?? 0.05, 0, 8, 0.05),
            // Кривые партии (v35): валидируем точки, пустые кривые — долой.
            automation: (() => {
              const rawAuto = (pt as { automation?: unknown }).automation;
              if (!Array.isArray(rawAuto)) return undefined;
              const targets: AutoTarget[] = [
                'volume',
                'filterFreq',
                'pan',
                'fxMix',
                'fxTime',
                'fxFeedback',
              ];
              const out: AutoCurve[] = [];
              for (const c of rawAuto as Partial<AutoCurve>[]) {
                if (!c || !targets.includes(c.target as AutoTarget)) continue;
                const points = (Array.isArray(c.points) ? c.points : [])
                  .filter(
                    (pt2): pt2 is AutoPoint =>
                      !!pt2 && Number.isFinite(pt2.t) && Number.isFinite(pt2.v),
                  )
                  .map((pt2) => ({
                    t: clamp(pt2.t, 0, 1, 0),
                    v: clamp(pt2.v, 0, 1, 0),
                  }))
                  .sort((a2, b2) => a2.t - b2.t)
                  .slice(0, 33);
                if (points.length >= 2) out.push({ target: c.target as AutoTarget, points });
              }
              return out.length > 0 ? out : undefined;
            })(),
          };
        });
      if (patterns.length === 0) patterns.push(makePattern('A', 16));

      // Инструмент: валидный instrumentId из патча, иначе новый экземпляр
      // из звуковых полей старого JSON (миграция v33 → v34, звук тот же).
      const legacyInstId =
        typeof t.instrumentId === 'string' && instIds.has(t.instrumentId)
          ? t.instrumentId
          : null;
      let instrumentId: string;
      if (legacyInstId) {
        instrumentId = legacyInstId;
      } else {
        instrumentId = uid('i');
        instruments.push(
          normalizeInstrument(
            t as unknown as Record<string, unknown>,
            instrumentId,
            t.name,
          ),
        );
      }

      // v34-гигиена: с дорожки снимаются звуковые поля — они теперь
      // живут только в инструменте. Иначе «мёртвые» значения из старого
      // JSON забивают правки инструмента при слиянии в SoundingTrack.
      const tr0 = { ...t, instrumentId, patterns } as Record<string, unknown>;
      for (const f of INSTRUMENT_FIELDS) delete tr0[f];

      return {
        ...(tr0 as unknown as Track),
        scale,
        phase: Math.round(clamp(t.phase ?? 0, -64, 64, 0)),
        freq: clamp(t.freq, 20, 9000, 220),
        noteSteps:
          typeof t.noteSteps === 'number' && t.noteSteps > 0
            ? clamp(t.noteSteps, 0.1, 16, 1)
            : undefined,
        volume: trackVolume,
        pan: clamp((t as { pan?: number }).pan ?? 0.5, 0, 1, 0.5),
        mods: normalizeMods((t as { mods?: unknown }).mods),
        arp: normalizeArp((t as { arp?: unknown }).arp),
        mono: !!t.mono,
        enabled: t.enabled === false ? false : undefined,
        sidechain: (() => {
          const sc = t.sidechain;
          if (!sc || typeof sc.sourceId !== 'string') return undefined;
          return {
            sourceId: sc.sourceId,
            amount: clamp(sc.amount ?? 0.5, 0, 1, 0.5),
            releaseSec: clamp(sc.releaseSec ?? 0.25, 0.05, 2, 0.25),
          };
        })(),
        effects: normalizeEffects((t as { effects?: unknown }).effects),
        scaleOctUp: octUp,
        scaleOctDown: octDown,
      };
    });


  let scenes: Scene[] = Array.isArray(p.scenes)
    ? p.scenes.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
    : [];
  if (scenes.length === 0) {
    scenes = [makeScene('сцена 1', tracks, (t) => t.patterns[0].id)];
  }

  // Слоты чистим от несуществующих треков/паттернов, добавляем недостающие.
  // v38: слот — объект {patternId, muted?}; строковые слоты старых патчей
  // и мьют эскиза переносятся сюда (см. mutedPids выше).
  // Соло сцены: существующее валидируем, иначе мигрируем со старого
  // solo эскиза (эскиз в соло играл в этой сцене → солирует трек).
  for (const scene of scenes) {
    const slots: Record<string, SceneSlot> = {};
    for (const t of tracks) {
      const raw = (scene.slots ?? {})[t.id];
      const wantRaw = typeof raw === 'string' ? raw : (raw as SceneSlot | undefined)?.patternId;
      const pid =
        wantRaw && t.patterns.some((pt) => pt.id === wantRaw) ? wantRaw : t.patterns[0].id;
      const muted = (typeof raw === 'object' && raw ? raw.muted === true : false) || mutedPids.has(pid);
      slots[t.id] = muted ? { patternId: pid, muted: true } : { patternId: pid };
      if (!scene.soloTrackId && soloByTrack.get(t.id)?.has(pid)) {
        scene.soloTrackId = t.id;
      }
    }
    scene.slots = slots;
    if (scene.soloTrackId && !tracks.some((t) => t.id === scene.soloTrackId)) {
      scene.soloTrackId = undefined;
    }
  }

  const sceneIds = new Set(scenes.map((s) => s.id));
  let chain: ChainItem[] = Array.isArray(p.chain)
    ? p.chain
        .filter((it) => it && sceneIds.has(it.sceneId))
        .map((it) => ({
          sceneId: it.sceneId,
          bars: Math.round(clamp(it.bars, 1, 256, 8)),
          bpm:
            typeof (it as { bpm?: unknown }).bpm === 'number' &&
              (it as { bpm?: number }).bpm! >= 30
              ? clamp((it as { bpm?: number }).bpm!, 30, 300, 120)
              : undefined,
        }))
    : [];
  if (chain.length === 0) {
    chain = [{ sceneId: scenes[0].id, bars: 8 }];
  }

  // v37: длина ноты — абсолютная, в шагах. Легаси-гейт (множитель базы,
  // v36-) и безгейтовые ноты фиксируются: len = база × гейт. База — «нота»
  // трека (шаги) или огибающая в шагах при темпе патча. После миграции
  // смена «ноты» трека трогает только новые ноты, потолок растягивания
  // — длина цикла, а не 4×.
  for (const t of tracks) {
    const inst = instruments.find((i) => i.id === t.instrumentId);
    const atk = inst?.attack ?? 0.002;
    const dec = inst?.decay ?? 0.25;
    const tick = 60 / (Math.round(clamp(p.bpm, 30, 300, 120)) || 120) / 4;
    for (const pt of t.patterns) {
      const stepSec = Math.max((pt.rate ?? t.rate) * tick, 1e-6);
      const base =
        t.noteSteps && t.noteSteps > 0
          ? t.noteSteps
          : (Math.max(atk, 0.0005) + dec) / stepSec;
      for (const s of pt.steps) {
        for (const nt of s.notes) {
          const cur = typeof nt.len === 'number' && nt.len > 0 ? nt.len : base * (nt.gate ?? 1);
          nt.len = Math.round(clamp(cur, 0.1, 64, 1) * 100) / 100;
          delete nt.gate;
        }
      }
    }
  }

  return {
    version: PATCH_VERSION,
    bpm: Math.round(clamp(p.bpm, 30, 300, 120)),
    title:
      typeof (p as { title?: unknown }).title === 'string' &&
      (p as { title?: string }).title!.trim()
        ? (p as { title?: string }).title!.trim().slice(0, 80)
        : undefined,
    masterVolume: clamp((p as { masterVolume?: number }).masterVolume ?? 1, 0, 2, 1),
    masterNoise:
      (p as { masterNoise?: unknown }).masterNoise === 'white' ||
      (p as { masterNoise?: unknown }).masterNoise === 'pink'
        ? ((p as { masterNoise?: MasterNoise }).masterNoise!)
        : 'off',
    masterNoiseLevel: clamp((p as { masterNoiseLevel?: number }).masterNoiseLevel ?? 0.03, 0, 0.15, 0.03),
    masterPan: clamp((p as { masterPan?: number }).masterPan ?? 0.5, 0, 1, 0.5),
    masterComp: clamp((p as { masterComp?: number }).masterComp ?? 0, 0, 1, 0),
    followChain: !!p.followChain,
    scenes,
    chain,
    tracks,
    instruments,
  };
}
