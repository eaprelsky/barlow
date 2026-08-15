// Модель патча. Патч = сериализуемые данные (JSON), с которыми работают
// UI, аудио-движок и (в будущем) ИИ-агент. Это контракт между слоями.
//
// Трёхуровневая модель арранжмента (см. docs/DESIGN.md):
//   паттерн (эскиз дорожки) → сцена (какой паттерн играет каждый трек)
//   → цепочка (порядок сцен с длинами = арранжмент).

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise' | 'sample';

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: 'синус',
  triangle: 'треугольник',
  square: 'прямоугольник',
  sawtooth: 'пила',
  noise: 'шум',
  sample: 'сэмпл',
};

export interface Step {
  // Индексы шкалы, звучащие на этом шаге. Пусто — пауза, несколько — аккорд.
  notes: number[];
  // Громкость шага 0..1 (весь аккорд целиком).
  vel: number;
  // Вероятность срабатывания шага 0..1 — живой, дышащий ритм.
  prob: number;
}

interface LegacyStepFields {
  on?: boolean;
  note?: number;
  mul?: number;
}

export interface Pattern {
  id: string;
  name: string;
  // Длина цикла в шагах. Не обязана делить такт — отсюда полиритмия.
  length: number;
  steps: Step[];
  // Паттерн-родитель для форков (навигация «вариация от…»).
  forkedFrom?: string;
  // Партия = ноты + свои ручки. Undefined — берётся с трека.
  volume?: number;
  pan?: number;
  mods?: Mod[];
}

export type ModTarget = 'pan' | 'volume' | 'filterFreq';

export const MOD_TARGET_LABELS: Record<ModTarget, string> = {
  pan: 'панорама',
  volume: 'громкость',
  filterFreq: 'фильтр',
};

/** Источник модуляции: LFO с формой, скоростью (Гц) и глубиной (0..1). */
export interface Mod {
  target: ModTarget;
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
  // Тоника шкалы, Гц.
  freq: number;
  // Падение тона: во сколько раз выше тоники нота стартует и слетает
  // вниз за pitchTime. >1 превращает синус в бочку («вумп»).
  pitchDrop: number;
  // Длительность падения тона, с.
  pitchTime: number;
  // Частота lowpass-фильтра трека, Гц.
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
  // Моно: одна нота за раз, новая мягко глушит хвост предыдущей —
  // убирает фазовую интерференцию наложений (басам включать).
  mono?: boolean;
  // Эскизы дорожки. Какой играет — решает сцена.
  patterns: Pattern[];
}

export interface Scene {
  id: string;
  name: string;
  // trackId → patternId: какой эскиз играет дорожка в этой сцене.
  slots: Record<string, string>;
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

export const PATCH_VERSION = 10;

let idSeq = 0;
export const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function makeStep(on = false, note = 0, vel = 0.8, prob = 1): Step {
  return { notes: on ? [note] : [], vel, prob };
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
    filterFreq: partial.filterFreq ?? 8000,
    attack: partial.attack ?? 0.002,
    decay: partial.decay ?? 0.25,
    volume: partial.volume ?? 0.8,
    pan: partial.pan ?? 0.5,
    mods: partial.mods ?? [],
    sampleId: partial.sampleId,
    sampleName: partial.sampleName,
    mono: partial.mono,
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

/** Частоты всех нот шага (аккорда), Гц. Пусто — пауза. */
export function stepFreqs(track: Track, step: Step): number[] {
  const max = track.scale.length - 1;
  return step.notes.map((i) => {
    const idx = Math.min(Math.max(Math.round(i), 0), max);
    return track.freq * (track.scale[idx] ?? 1);
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
const MOD_TARGETS = ['pan', 'volume', 'filterFreq'] as const;

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
    out.push({
      target,
      shape,
      rate: clamp(m.rate ?? 0.2, 0.01, 40, 0.2),
      depth: clamp(m.depth ?? 0.5, 0, 1, 0.5),
    });
  }
  return out;
}

function normalizeSteps(raw: unknown, length: number, scale: number[]): Step[] {
  const maxNote = scale.length - 1;
  const rawSteps = Array.isArray(raw) ? (raw as (Partial<Step> & LegacyStepFields)[]) : [];
  return Array.from({ length }, (_, i) => {
    const s = rawSteps[i];
    let notes: number[];
    if (Array.isArray(s?.notes)) {
      notes = [
        ...new Set(
          s.notes
            .filter((n): n is number => typeof n === 'number')
            .map((n) => Math.min(Math.max(Math.round(n), 0), maxNote)),
        ),
      ];
    } else {
      // v3/v2: одиночная нота на шаге.
      let note = typeof s?.note === 'number' ? Math.round(s.note) : 0;
      if (typeof s?.mul === 'number' && s.mul > 0) {
        const idx = scale.indexOf(s.mul);
        if (idx >= 0) note = idx;
      }
      notes = s?.on ? [Math.min(Math.max(note, 0), maxNote)] : [];
    }
    return {
      notes,
      vel: clamp(s?.vel ?? 0.8, 0, 1, 0.8),
      prob: clamp(s?.prob ?? 1, 0, 1, 1),
    };
  });
}

// Доводит патч любой версии до валидного состояния текущей схемы.
// v5 и ниже: единственный рисунок трека становится паттерном «A»,
// создаётся одна сцена и цепочка из неё.
export function normalizePatch(p: Patch): Patch {
  const tracks: Track[] = p.tracks
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t): Track => {
      // Сырые паттерны: из v6 пришли patterns, из старых — steps/length на треке.
      let rawPatterns: {
        id?: string;
        name?: string;
        length?: number;
        steps?: unknown;
        forkedFrom?: string;
        volume?: number;
        pan?: number;
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

      const patterns: Pattern[] = rawPatterns
        .filter((pt) => pt && typeof pt.id === 'string')
        .map((pt) => {
          const length = Math.round(clamp(pt.length ?? 16, 1, 64, 16));
          const mods = normalizeMods((pt as { mods?: unknown }).mods);
          return {
            id: pt.id!,
            name: typeof pt.name === 'string' && pt.name ? pt.name : '?',
            length,
            steps: normalizeSteps(pt.steps, length, scale),
            forkedFrom: pt.forkedFrom,
            volume: typeof pt.volume === 'number' ? clamp(pt.volume, 0, 1, 0.8) : undefined,
            pan: typeof pt.pan === 'number' ? clamp(pt.pan, 0, 1, 0.5) : undefined,
            mods: mods.length > 0 ? mods : undefined,
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
        filterFreq: clamp(t.filterFreq, 60, 12000, 8000),
        attack: clamp(t.attack, 0, 1, 0.002),
        decay: clamp(t.decay, 0.01, 4, 0.25),
        volume: clamp(t.volume, 0, 1, 0.8),
        pan: clamp((t as { pan?: number }).pan ?? 0.5, 0, 1, 0.5),
        mods: normalizeMods((t as { mods?: unknown }).mods),
        sampleId: typeof t.sampleId === 'string' ? t.sampleId : undefined,
        sampleName: typeof t.sampleName === 'string' ? t.sampleName : undefined,
        mono: !!t.mono,
      };
    });

  let scenes: Scene[] = Array.isArray(p.scenes)
    ? p.scenes.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
    : [];
  if (scenes.length === 0) {
    scenes = [makeScene('сцена 1', tracks, (t) => t.patterns[0].id)];
  }

  // Слоты чистим от несуществующих треков/паттернов, добавляем недостающие.
  for (const scene of scenes) {
    const slots: Record<string, string> = {};
    for (const t of tracks) {
      const want = scene.slots?.[t.id];
      slots[t.id] = t.patterns.some((pt) => pt.id === want) ? want : t.patterns[0].id;
    }
    scene.slots = slots;
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
