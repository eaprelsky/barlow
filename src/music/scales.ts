// Шкалы трека: произвольные наборы отношений частот (ratios) к тонике.
// Никакой обязательной привязки к 12 полутонам: just intonation, четвертитоны,
// ряд гармоник — всё на равных. Пользовательские шкалы добавим позже.

export interface ScalePreset {
  name: string;
  ratios: number[];
}

function edo(steps: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Math.pow(2, i / steps));
}

export const SCALE_PRESETS: ScalePreset[] = [
  { name: 'одна высота', ratios: [1] },
  { name: 'пентатоника, минор', ratios: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2] },
  { name: 'пентатоника, мажор', ratios: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2] },
  { name: 'мажор (just intonation)', ratios: [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2] },
  { name: 'минор (just intonation)', ratios: [1, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2] },
  { name: '12 равных полутонов', ratios: edo(12, 12) },
  { name: '24 четвертитона', ratios: edo(24, 24) },
  { name: 'гармоники 1–8', ratios: [1, 2, 3, 4, 5, 6, 7, 8] },
];

const sameRatios = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/** Имя пресета для селекта; 'своя' — если массив ни с одним не совпал. */
export function presetName(ratios: number[]): string {
  for (const p of SCALE_PRESETS) {
    if (sameRatios(p.ratios, ratios)) return p.name;
  }
  return 'своя';
}
