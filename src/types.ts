// Модель патча. Патч = сериализуемые данные (JSON), с которыми работают
// UI, аудио-движок и (в будущем) ИИ-агент. Это контракт между слоями.
//
// Трёхуровневая модель арранжмента (см. docs/DESIGN.md):
//   паттерн (эскиз дорожки) → сцена (какой паттерн играет каждый трек)
//   → цепочка (порядок сцен с длинами = арранжмент).

export type Waveform =
  | 'sine'
  | 'square'
  | 'triangle'
  | 'sawtooth'
  | 'noise'
  | 'fm'
  | 'karplus'
  | 'supersaw'
  | 'additive'
  | 'formant'
  | 'modal'
  | 'organ'
  | 'sample';

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: 'синус',
  triangle: 'треугольник',
  square: 'прямоугольник',
  sawtooth: 'пила',
  noise: 'шум',
  fm: 'FM',
  karplus: 'струна',
  supersaw: 'супер-пила',
  additive: 'гармоники',
  formant: 'вокал',
  modal: 'колокол',
  organ: 'орган',
  sample: 'сэмпл',
};

// Модели голоса (порт идей Plaits): у каждой — свой смысл ручки «морф».
export const MORPH_LABELS: Partial<Record<Waveform, string>> = {
  supersaw: 'расстройка голосов',
  additive: 'яркость (число гармоник)',
  formant: 'гласная А → У',
  modal: 'материал: маримба → колокол',
  organ: 'регистры: микс верхних',
};

/** Как сэмплер играет буфер: напрямую или облаком гранул. */
export type SampleMode = 'plain' | 'grain';

export interface Note {
  // Индекс строки шкалы (см. scaleOf).
  n: number;
  // Громкость этой ноты 0..1.
  vel: number;
  // Вероятность срабатывания этой ноты 0..1.
  prob: number;
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
  // Скорость шага этой партии (в базовых 1/16 тиках) — переопределяет
  // шаг трека. Undefined — наследуется с трека.
  rate?: number;
  // Паттерн-родитель для форков (навигация «вариация от…»).
  forkedFrom?: string;
  // Партия = ноты + свои ручки. Undefined — берётся с трека.
  volume?: number;
  pan?: number;
  mods?: Mod[];
  // Партия молчит во всех сценах, где играет.
  muted?: boolean;
}

export type ModTarget = 'pan' | 'volume' | 'filterFreq';

export const MOD_TARGET_LABELS: Record<ModTarget, string> = {
  pan: 'панорама',
  volume: 'громкость',
  filterFreq: 'фильтр',
};

/** Вставной эффект трека (после фильтра, до панорамы). */
export type Effect =
  | { type: 'delay'; timeSec: number; feedback: number; mix: number }
  | { type: 'reverb'; sizeSec: number; mix: number };

export const EFFECT_LABELS: Record<Effect['type'], string> = {
  delay: 'задержка (эхо)',
  reverb: 'реверб (пространство)',
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
  depth: number;
}

export interface Track {
  id: string;
  name: string;
  // Скорость шага в базовых 1/16 тиках. Дробное значение даёт
  // фазовый дрейф относительно других треков (полиметрия).
  rate: number;
  // Сдвиг цикла в шагах: тот же ритм, но стартует позже/раньше.
  phase: number;
  waveform: Waveform;
  // Шкала: отношения частот к тонике, по возрастанию. Произвольные
  // значения — микротюнинг без привязки к 12 полутонам.
  scale: number[];
  // Добавленные октавы шкалы вверх/вниз (расширение диапазона стана).
  scaleOctUp?: number;
  scaleOctDown?: number;
  // Тоника шкалы, Гц.
  freq: number;
  // Падение тона: во сколько раз выше тоники нота стартует и слетает
  // вниз за pitchTime. >1 превращает синус в бочку («вумп»).
  pitchDrop: number;
  // Длительность падения тона, с.
  pitchTime: number;
  // Частоты обрезки: highpass снизу и lowpass сверху, Гц.
  filterLow: number;
  filterFreq: number;
  // Огибающая ноты, сек.
  attack: number;
  decay: number;
  // Громкость трека 0..1.
  volume: number;
  // Панорама 0..1 (0.5 — центр).
  pan: number;
  // Модуляции: LFO, подключённые к параметрам трека (см. docs/DESIGN.md).
  mods: Mod[];
  // Ссылка на сэмпл из библиотеки (SHA-256) — для волны «сэмпл».
  sampleId?: string;
  // Отображаемое имя сэмпла (кэш UI, истина — в библиотеке).
  sampleName?: string;
  // FM: отношение частоты модулятора к ноте. Целые — гармоничные тембры,
  // иррациональные (≈√2) — колокола и металл.
  fmRatio?: number;
  // FM: индекс модуляции (девиация = индекс × частота модулятора).
  fmIndex?: number;
  // Модели голоса: морф 0..1, смысл зависит от волны (см. MORPH_LABELS).
  voiceMorph?: number;
  // Вибрато: частота (Гц) и глубина (в центах) на голосах осцилляторов
  // и скорости сэмпла.
  vibratoRate?: number;
  vibratoDepth?: number;
  // Karplus-Strong: время собственного затухания струны, с (T60).
  ksLife?: number;
  // Режим сэмплера: прямой или гранулярный (нота = облако осколков).
  sampleMode?: SampleMode;
  // Гранулярный режим: длина зерна, мс.
  grainSizeMs?: number;
  // Гранулярный режим: сколько зёрен выпускает одна нота.
  grainCount?: number;
  // Гранулярный режим: центр позиции зерна в сэмпле, 0..1.
  grainPos?: number;
  // Гранулярный режим: разброс позиции зерна вокруг центра, 0..1.
  grainScatter?: number;
  // Моно: одна нота за раз, новая мягко глушит хвост предыдущей —
  // убирает фазовую интерференцию наложений (басам включать).
  mono?: boolean;
  // Мастер-выключатель дорожки: false — молчит во всех сценах, с любым
  // эскизом. Не путать с мьютом партии (на эскизе).
  enabled?: boolean;
  // Вставные эффекты: задержка (эхо) и реверб.
  effects?: Effect[];
  // Эскизы дорожки. Какой играет — решает сцена.
  patterns: Pattern[];
}

export interface Scene {
  id: string;
  name: string;
  // trackId → patternId: какой эскиз играет дорожка в этой сцене.
  slots: Record<string, string>;
  // Эксклюзивное соло этой сцены: слышна только эта дорожка (любой её
  // эскиз). Соло — свойство сцены, с эскизами не переносится.
  soloTrackId?: string;
}

export interface ChainItem {
  sceneId: string;
  bars: number;
}

export interface Patch {
  version: number;
  bpm: number;
  // Общая громкость 0..2. Выше 1 — tanh-лимитер мягко пережимает,
  // звук плотнеет (мастер-сатурация) без клиппинга.
  masterVolume: number;
  // Играть сцены по цепочке (арранжмент) или держать текущую сцену.
  followChain: boolean;
  scenes: Scene[];
  chain: ChainItem[];
  tracks: Track[];
}

export const PATCH_VERSION = 20;

let idSeq = 0;
export const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function makeStep(on = false, note = 0, vel = 0.8, prob = 1): Step {
  return { notes: on ? [{ n: note, vel, prob }] : [] };
}

export function makeNote(n = 0, vel = 0.8, prob = 1): Note {
  return { n, vel, prob };
}

export function makePattern(name: string, length: number, steps?: Step[]): Pattern {
  return {
    id: uid('p'),
    name,
    length,
    steps:
      steps ??
      Array.from({ length }, () => makeStep()),
  };
}

export function makeTrack(
  partial: Partial<Track> & { id: string; name: string; length?: number },
): Track {
  return {
    rate: partial.rate ?? 1,
    phase: partial.phase ?? 0,
    waveform: partial.waveform ?? 'sine',
    scale: partial.scale && partial.scale.length > 0 ? partial.scale : [1],
    freq: partial.freq ?? 220,
    pitchDrop: partial.pitchDrop ?? 1,
    pitchTime: partial.pitchTime ?? 0.08,
    filterLow: partial.filterLow ?? 20,
    filterFreq: partial.filterFreq ?? 8000,
    attack: partial.attack ?? 0.002,
    decay: partial.decay ?? 0.25,
    volume: partial.volume ?? 0.8,
    pan: partial.pan ?? 0.5,
    mods: partial.mods ?? [],
    sampleId: partial.sampleId,
    sampleName: partial.sampleName,
    fmRatio: partial.fmRatio,
    fmIndex: partial.fmIndex,
    voiceMorph: partial.voiceMorph,
    vibratoRate: partial.vibratoRate,
    vibratoDepth: partial.vibratoDepth,
    ksLife: partial.ksLife,
    sampleMode: partial.sampleMode,
    grainSizeMs: partial.grainSizeMs,
    grainCount: partial.grainCount,
    grainPos: partial.grainPos,
    grainScatter: partial.grainScatter,
    mono: partial.mono,
    effects: partial.effects,
    scaleOctUp: partial.scaleOctUp,
    scaleOctDown: partial.scaleOctDown,
    patterns: partial.patterns ?? [makePattern('A', partial.length ?? 16)],
    id: partial.id,
    name: partial.name,
  };
}

export function makeScene(name: string, tracks: Track[], patternOf: (t: Track) => string): Scene {
  const slots: Record<string, string> = {};
  for (const t of tracks) slots[t.id] = patternOf(t);
  return { id: uid('s'), name, slots };
}

/** Паттерн трека в конкретной сцене (fallback — первый). */
export function patternInScene(track: Track, scene: Scene | undefined): Pattern {
  const wanted = scene?.slots[track.id];
  return track.patterns.find((p) => p.id === wanted) ?? track.patterns[0];
}

/** Строки нотного стана: базовая шкала + добавленные октавы. */
export function scaleOf(track: Track): number[] {
  const up = track.scaleOctUp ?? 0;
  const down = track.scaleOctDown ?? 0;
  const rows: number[] = [];
  for (let o = -down; o <= up; o++) {
    const k = 2 ** o;
    for (const r of track.scale) rows.push(r * k);
  }
  return rows;
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

// Поверхностная валидация при импорте JSON (zod подключим, когда схема разрастётся).
export function isPatch(value: unknown): value is Patch {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.version === 'number' &&
    typeof p.bpm === 'number' &&
    Array.isArray(p.tracks)
  );
}

const clamp = (v: number, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const MOD_SHAPES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
const MOD_TARGETS = ['pan', 'volume', 'filterFreq', 'fxTime', 'fxFeedback', 'fxMix'] as const;

function normalizeEffects(raw: unknown): Effect[] {
  if (!Array.isArray(raw)) return [];
  const out: Effect[] = [];
  for (const item of raw) {
    const e = item as { type?: unknown; timeSec?: unknown; feedback?: unknown; mix?: unknown; sizeSec?: unknown };
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
        }));
    } else if (Array.isArray(s?.notes)) {
      const vel = clamp(s?.vel ?? 0.8, 0, 1, 0.8);
      const prob = clamp(s?.prob ?? 1, 0, 1, 1);
      notes = (s.notes as unknown as number[])
        .filter((n): n is number => typeof n === 'number')
        .map((n) => ({ n: Math.min(Math.max(Math.round(n), 0), maxNote), vel, prob }));
    } else {
      let note = typeof s?.note === 'number' ? Math.round(s.note) : 0;
      if (typeof s?.mul === 'number' && s.mul > 0) {
        const idx = scale.indexOf(s.mul);
        if (idx >= 0) note = idx;
      }
      notes = s?.on
        ? [{ n: Math.min(Math.max(note, 0), maxNote), vel: clamp(s?.vel ?? 0.8, 0, 1, 0.8), prob: clamp(s?.prob ?? 1, 0, 1, 1) }]
        : [];
    }
    return { notes };
  });
}

// Доводит патч любой версии до валидного состояния текущей схемы.
// v5 и ниже: единственный рисунок трека становится паттерном «A»,
// создаётся одна сцена и цепочка из неё.
// v16 → v17: соло переезжает с эскиза в сцену (эксклюзивное soloTrackId).
export function normalizePatch(p: Patch): Patch {
  // Миграция v16: trackId → id эскизов со старым флагом solo.
  const soloByTrack = new Map<string, Set<string>>();
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
      }[];
      if (Array.isArray(t.patterns) && t.patterns.length > 0) {
        rawPatterns = t.patterns as typeof rawPatterns;
      } else {
        const legacy = t as unknown as { steps?: unknown[]; length?: number };
        rawPatterns = Array.isArray(legacy.steps)
          ? [{ id: uid('p'), name: 'A', length: legacy.length ?? 16, steps: legacy.steps }]
          : [{ id: uid('p'), name: 'A', length: 16 }];
      }

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
          return {
            id: pt.id!,
            name: typeof pt.name === 'string' && pt.name ? pt.name : '?',
            length,
            steps: normalizeSteps(pt.steps, length, rowsLen, scale),
            forkedFrom: pt.forkedFrom,
            volume: typeof pt.volume === 'number' ? clamp(pt.volume, 0, 1, 0.8) : undefined,
            pan: typeof pt.pan === 'number' ? clamp(pt.pan, 0, 1, 0.5) : undefined,
            rate:
              typeof pt.rate === 'number' && Number.isFinite(pt.rate)
                ? clamp(pt.rate, 0.25, 32, 1)
                : undefined,
            mods: mods.length > 0 ? mods : undefined,
            muted: !!(pt as { muted?: unknown }).muted,
          };
        });
      if (patterns.length === 0) patterns.push(makePattern('A', 16));

      return {
        ...t,
        patterns,
        scale,
        rate: clamp(t.rate, 0.25, 32, 1),
        phase: Math.round(clamp(t.phase ?? 0, -64, 64, 0)),
        freq: clamp(t.freq, 20, 9000, 220),
        pitchDrop: clamp(t.pitchDrop ?? 1, 1, 16, 1),
        pitchTime: clamp(t.pitchTime ?? 0.08, 0, 2, 0.08),
        filterLow: clamp((t as { filterLow?: number }).filterLow ?? 20, 20, 4000, 20),
        filterFreq: clamp(t.filterFreq, 60, 12000, 8000),
        attack: clamp(t.attack, 0, 1, 0.002),
        decay: clamp(t.decay, 0.01, 4, 0.25),
        volume: clamp(t.volume, 0, 1, 0.8),
        pan: clamp((t as { pan?: number }).pan ?? 0.5, 0, 1, 0.5),
        mods: normalizeMods((t as { mods?: unknown }).mods),
        sampleId: typeof t.sampleId === 'string' ? t.sampleId : undefined,
        sampleName: typeof t.sampleName === 'string' ? t.sampleName : undefined,
        fmRatio: clamp(t.fmRatio ?? 2, 0.125, 24, 2),
        fmIndex: clamp(t.fmIndex ?? 3, 0, 24, 3),
        voiceMorph: clamp(t.voiceMorph ?? 0.5, 0, 1, 0.5),
        vibratoRate: clamp(t.vibratoRate ?? 5, 0.1, 12, 5),
        vibratoDepth: clamp(t.vibratoDepth ?? 0, 0, 100, 0),
        ksLife: clamp(t.ksLife ?? 2.5, 0.2, 8, 2.5),
        sampleMode: t.sampleMode === 'grain' ? 'grain' : 'plain',
        grainSizeMs: clamp(t.grainSizeMs ?? 120, 10, 1000, 120),
        grainCount: Math.round(clamp(t.grainCount ?? 10, 1, 32, 10)),
        grainPos: clamp(t.grainPos ?? 0.3, 0, 1, 0.3),
        grainScatter: clamp(t.grainScatter ?? 0.15, 0, 1, 0.15),
        mono: !!t.mono,
        enabled: t.enabled === false ? false : undefined,
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
  // Соло сцены: существующее валидируем, иначе мигрируем со старого
  // solo эскиза (эскиз в соло играл в этой сцене → солирует трек).
  for (const scene of scenes) {
    const slots: Record<string, string> = {};
    for (const t of tracks) {
      const want = scene.slots?.[t.id];
      slots[t.id] = t.patterns.some((pt) => pt.id === want) ? want : t.patterns[0].id;
      if (!scene.soloTrackId && soloByTrack.get(t.id)?.has(slots[t.id])) {
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
        .map((it) => ({ sceneId: it.sceneId, bars: Math.round(clamp(it.bars, 1, 256, 8)) }))
    : [];
  if (chain.length === 0) {
    chain = [{ sceneId: scenes[0].id, bars: 8 }];
  }

  return {
    version: PATCH_VERSION,
    bpm: Math.round(clamp(p.bpm, 30, 300, 120)),
    masterVolume: clamp((p as { masterVolume?: number }).masterVolume ?? 1, 0, 2, 1),
    followChain: !!p.followChain,
    scenes,
    chain,
    tracks,
  };
}
