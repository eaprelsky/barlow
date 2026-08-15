// Модель патча. Патч = сериализуемые данные (JSON), с которыми работают
// UI, аудио-движок и (в будущем) ИИ-агент. Это контракт между слоями.

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

export interface Step {
  on: boolean;
  // Множитель частоты шага относительно базовой частоты трека.
  // Произвольные вещественные значения => микротюнинг без 12 полутонов.
  mul: number;
  // Громкость шага 0..1.
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
  // Сдвиг цикла в шагах: тот же ритм, но старует позже/раньше.
  phase: number;
  waveform: Waveform;
  // Базовая частота, Гц — произвольная, не привязана к нотной сетке.
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

export const PATCH_VERSION = 2;

export function makeStep(on = false, mul = 1, vel = 0.8, prob = 1): Step {
  return { on, mul, vel, prob };
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

// Доводит любой патч (в т.ч. старой версии) до валидного состояния текущей схемы:
// дефолты, диапазоны, длина массива шагов равна length.
export function normalizePatch(p: Patch): Patch {
  const clamp = (v: number, lo: number, hi: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

  const tracks = p.tracks
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t): Track => {
      const length = Math.round(clamp(t.length, 1, 64, 16));
      const steps = Array.from({ length }, (_, i) => {
        const s = t.steps?.[i];
        return {
          on: !!s?.on,
          mul: clamp(s?.mul ?? 1, 0.05, 16, 1),
          vel: clamp(s?.vel ?? 0.8, 0, 1, 0.8),
          prob: clamp(s?.prob ?? 1, 0, 1, 1),
        };
      });
      return {
        ...t,
        length,
        steps,
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
