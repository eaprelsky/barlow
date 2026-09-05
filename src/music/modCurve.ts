// Превью и запечка модуляций в кривые партии. Живой движок крутит
// модуляции непрерывным Web Audio-графом (fx.ts: осциллятор / буферы
// S&H и перлина); здесь — детерминированный аналог той же математики,
// чтобы нарисовать вклад модуляции на дорожке автоматизации и запечь
// её в точки кривой. Случайные источники (S&H, перлин) сидируются
// номером модуляции: картинка не прыгает при каждом рендере, а запечённая
// кривая перестаёт плыть — это уже точки, не живой генератор.

import type { AutoPoint, AutoTarget, Mod } from '../types';

/** Псевдослучайное -1..1 по целочисленному индексу (без состояния). */
function hashNoise(seed: number, i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 0x7fffffff - 1;
}

/** Значение источника модуляции в момент t (сек от старта), -1..1.
 *  Аналог генераторов fx.ts: LFO — форма волны; буферы S&H/перлина —
 *  16 узлов на период, период = 16/rate сек, луп бесшовный. */
export function modSampleAt(m: Mod, t: number, seed = 0): number {
  const src = m.source ?? 'lfo';
  if (src === 'lfo') {
    const ph = (m.rate * t) % 1;
    switch (m.shape) {
      case 'square':
        return ph < 0.5 ? 1 : -1;
      case 'sawtooth':
        return ph * 2 - 1;
      case 'triangle':
        return 1 - Math.abs(ph - 0.5) * 4;
      default:
        return Math.sin(ph * Math.PI * 2);
    }
  }
  const nodes = (t * m.rate) % 16;
  const i0 = Math.floor(nodes);
  if (src === 'sah') return hashNoise(seed, ((i0 % 16) + 16) % 16);
  // Перлин: косинусная интерполяция между узлами, узел 16 = узел 0.
  const a = hashNoise(seed, ((i0 % 16) + 16) % 16);
  const b = hashNoise(seed, (((i0 + 1) % 16) + 16) % 16);
  const f = nodes - i0;
  return a + (b - a) * (0.5 - 0.5 * Math.cos(f * Math.PI));
}

/** Вклад модуляции в нормализованное значение цели кривой (0..1) в
 *  момент t. Обратная задача autoToParam/modScale: volume — множитель
 *  громкости (вверх разрешаем до 1.25 — «не громче базы чуть-чуть»),
 *  pan — центр ± глубина, filterFreq — лог-шкала 60…12000 Гц. fx-цели
 *  качают параметр первого эффекта вокруг базы (base — его текущее
 *  значение: микс / время, с / фидбек), нормализация обратна autoToParam. */
export function modCurveValue(
  m: Mod,
  target: AutoTarget,
  t: number,
  base: number,
  seed = 0,
): number {
  const s = modSampleAt(m, t, seed);
  if (target === 'pan') return 0.5 + (m.depth * s) / 2;
  if (target === 'volume') return 1 + m.depth * 0.5 * s;
  if (target === 'filterFreq') {
    const f = base + m.depth * Math.max(1800, base * 2.5) * s;
    return Math.log(Math.max(20, f) / 60) / Math.log(200);
  }
  if (target === 'fxMix') return Math.min(1, Math.max(0, base + m.depth * 0.35 * s));
  if (target === 'fxTime') {
    const p = Math.max(0.005, base + m.depth * 0.12 * s);
    return Math.log(p / 0.01) / Math.log(200);
  }
  // fxFeedback: кривая 0..1 = 0..90% повторов.
  return Math.min(0.9, Math.max(0, base + m.depth * 0.35 * s)) / 0.9;
}

/** Запечь модуляцию в точки кривой по границам шагов цикла.
 *  Сэмплы сглаживаются прореживанием: точка удаляется, если почти лежит
 *  на отрезке соседей — кривая честная, точек мало (лимит дорожки 33). */
export function bakeModToPoints(
  m: Mod,
  target: AutoTarget,
  length: number,
  cycleSec: number,
  base: number,
  seed = 0,
): AutoPoint[] {
  const grid = Math.max(2, length);
  // volume разрешает перелёт над базой (до 1.25), остальные цели 0..1.
  const top = target === 'volume' ? 1.25 : 1;
  let pts: AutoPoint[] = [];
  for (let i = 0; i <= grid; i++) {
    const t = i / grid;
    pts.push({
      t,
      v: Math.min(top, Math.max(0, modCurveValue(m, target, t * cycleSec, base, seed))),
    });
  }
  // Прореживание с сохранением концов.
  let changed = true;
  while (changed && pts.length > 2) {
    changed = false;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const f = (b.t - a.t) / Math.max(1e-9, c.t - a.t);
      const approx = a.v + (c.v - a.v) * f;
      if (Math.abs(b.v - approx) < 0.012) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}
