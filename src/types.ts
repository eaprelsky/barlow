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
}

export interface Track {
  id: string;
  name: string;
  // Длина цикла в шагах. Не обязана делить такт — отсюда полиритмия.
  length: number;
  // Скорость шага в базовых 1/16 тиках. Дробное значение даёт
  // фазовый дрейф относительно других треков (полиметрия).
  rate: number;
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

export const PATCH_VERSION = 1;

export function makeStep(on = false, mul = 1, vel = 0.8): Step {
  return { on, mul, vel };
}

export function makeTrack(partial: Partial<Track> & { id: string; name: string }): Track {
  const length = partial.length ?? 16;
  return {
    id: partial.id,
    name: partial.name,
    length,
    rate: partial.rate ?? 1,
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
