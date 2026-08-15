// Модель патча. Патч = сериализуемые данные (JSON), с которыми работают
// UI, аудио-движок и (в будущем) ИИ-агент. Это контракт между слоями.

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: 'синус',
  triangle: 'треугольник',
  square: 'прямоугольник',
  sawtooth: 'пила',
  noise: 'шум',
};

export interface Step {
  // Индексы шкалы, звучащие на этом шаге. Пусто — пауза, несколько — аккорд.
  notes: number[];
  // Громкость шага 0..1 (весь аккорд целиком).
  vel: number;
  // Вероятность срабатывания шага 0..1 — живой, дышащий ритм.
  prob: number;
}

export interface Track {
  id: string;
  name: string;
  // Длина цикла в шагах. Не обязана делить такт — отсюда полиритмия.
  length: number;
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
  // Частота lowpass-фильтра трека, Гц.
  filterFreq: number;
  // Огибающая ноты, сек.
  attack: number;
  decay: number;
  // Громкость трека 0..1.
  volume: number;
  steps: Step[];
}

export interface Patch {
  version: number;
  bpm: number;
  tracks: Track[];
}

export const PATCH_VERSION = 4;

export function makeStep(on = false, note = 0, vel = 0.8, prob = 1): Step {
  return { notes: on ? [note] : [], vel, prob };
}

/** Шаг звучит, если на нём есть хотя бы одна нота. */
export function stepOn(step: Step): boolean {
  return step.notes.length > 0;
}

export function makeTrack(partial: Partial<Track> & { id: string; name: string }): Track {
  const length = partial.length ?? 16;
  return {
    id: partial.id,
    name: partial.name,
    length,
    rate: partial.rate ?? 1,
    phase: partial.phase ?? 0,
    waveform: partial.waveform ?? 'sine',
    scale: partial.scale && partial.scale.length > 0 ? partial.scale : [1],
    freq: partial.freq ?? 220,
    filterFreq: partial.filterFreq ?? 8000,
    attack: partial.attack ?? 0.002,
    decay: partial.decay ?? 0.25,
    volume: partial.volume ?? 0.8,
    steps:
      partial.steps ??
      Array.from({ length }, () => makeStep()),
  };
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

// Доводит патч любой версии до валидного состояния текущей схемы.
// v2 (множители mul) и v3 (одиночные note) переводятся в v4 автоматически,
// звучание сохраняется.
export function normalizePatch(p: Patch): Patch {
  const clamp = (v: number, lo: number, hi: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

  const tracks = p.tracks
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t): Track => {
      const length = Math.round(clamp(t.length, 1, 64, 16));
      const rawSteps = Array.isArray(t.steps) ? t.steps : [];

      let scale: number[];
      if (Array.isArray(t.scale) && t.scale.length > 0) {
        scale = t.scale
          .filter((r): r is number => typeof r === 'number' && r > 0)
          .sort((a, b) => a - b);
      } else {
        // v2: шкала из уникальных множителей старого патча.
        const set = new Set<number>([1]);
        for (const s of rawSteps) {
          const mul = (s as { mul?: unknown })?.mul;
          if (typeof mul === 'number' && mul > 0) set.add(mul);
        }
        scale = [...set].sort((a, b) => a - b);
      }
      if (scale.length === 0) scale = [1];
      const maxNote = scale.length - 1;

      const steps = Array.from({ length }, (_, i) => {
        const s = rawSteps[i] as Partial<Step> & { mul?: number; note?: number; on?: boolean } | undefined;
        const clampNote = (n: number) => Math.min(Math.max(Math.round(n), 0), maxNote);

        let notes: number[];
        if (Array.isArray(s?.notes)) {
          notes = [...new Set(s.notes.filter((n): n is number => typeof n === 'number').map(clampNote))];
        } else {
          // v3/v2: одиночная нота.
          let note = typeof s?.note === 'number' ? clampNote(s.note) : 0;
          if (typeof s?.mul === 'number' && s.mul > 0) {
            const idx = scale.indexOf(s.mul);
            if (idx >= 0) note = idx;
          }
          notes = s?.on ? [note] : [];
        }

        return {
          notes,
          vel: clamp(s?.vel ?? 0.8, 0, 1, 0.8),
          prob: clamp(s?.prob ?? 1, 0, 1, 1),
        };
      });

      return {
        ...t,
        length,
        steps,
        scale,
        rate: clamp(t.rate, 0.25, 32, 1),
        phase: Math.round(clamp(t.phase ?? 0, -64, 64, 0)),
        freq: clamp(t.freq, 20, 9000, 220),
        filterFreq: clamp(t.filterFreq, 60, 12000, 8000),
        attack: clamp(t.attack, 0, 1, 0.002),
        decay: clamp(t.decay, 0.01, 4, 0.25),
        volume: clamp(t.volume, 0, 1, 0.8),
      };
    });

  return {
    version: PATCH_VERSION,
    bpm: Math.round(clamp(p.bpm, 30, 300, 120)),
    tracks,
  };
}
