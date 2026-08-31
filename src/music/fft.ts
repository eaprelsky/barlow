// FFT для редактора волны: разложение одного цикла в гармоники и сборка
// обратно. Radix-2, ин-плейс, без внешних зависимостей — цикл волны ≤ 4096
// точек, это копейки даже на каждый чекбокс.

import type { WaveDef, WavePartial } from '../types';

/** Ближайшая степень двойки ≥ n. */
export const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/** FFT (in-place, size — степень двойки). re/im длиной size. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Бит-реверс перестановка.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Бабочки.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Детерминированный шум (mulberry32): канвас волны не мигает на ререндерах. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Один цикл волны из парциалов: сумма типовых форм на своих множителях.
 *  Шумовой парциал — зацикленное окно зерна (детерминированное, с сидом):
 *  характер «крупы» задаёт размер зерна, звук в патче — свой, живой. */
export function renderWaveCycle(wave: WaveDef, n = 2048): Float32Array {
  const out = new Float32Array(n);
  const grain = Math.max(2, Math.round((n * (wave.noiseGrainMs ?? 40)) / 1000));
  for (const p of wave.partials) {
    const amp = Math.min(1, Math.max(0, p.amp));
    if (amp <= 0) continue;
    if (p.type === 'noise') {
      const rnd = seededRandom(Math.round(p.ratio * 997) + 7);
      // Цикл зерна: длина зависит от множителя — «частота пересыпания».
      const g = Math.max(2, Math.round(grain / Math.max(0.25, p.ratio)));
      let v = rnd() * 2 - 1;
      for (let i = 0; i < n; i++) {
        if (i % g === 0) v = rnd() * 2 - 1;
        out[i] += v * amp;
      }
      continue;
    }
    const ph = 2 * Math.PI * p.ratio;
    if (p.type === 'sine') {
      for (let i = 0; i < n; i++) out[i] += Math.sin((ph * i) / n) * amp;
    } else if (p.type === 'square') {
      // Меандр со скважностью по множителю: бесконечная сумма синусов
      // не сходится на коротком цикле — берём 16 первых гармоник.
      for (let i = 0; i < n; i++) {
        const t = ((p.ratio * i) / n) % 1;
        out[i] += (t % 1 < 0.5 ? 1 : -1) * amp;
      }
    } else {
      // Пила: линейный рост-обрыв.
      for (let i = 0; i < n; i++) {
        const t = ((p.ratio * i) / n) % 1;
        out[i] += (t * 2 - 1) * amp;
      }
    }
  }
  // Нормализация: пик цикла = 1 — громкость волны задают ручки трека.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.0001) for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}

/** Таблица точек одного цикла → гармоники (целые множители, синусы).
 *  Точки биполярные (-1..1, как и нарисованная волна). Порог — в дБ от
 *  максимума; максимум maxPartials штук. Фазы нулевые:
 *  детерминированно и на слух форма не важнее амплитуд. */
export function cycleToPartials(
  points: Float32Array,
  maxPartials = 64,
  thresholdDb = -60,
): WavePartial[] {
  const n = nextPow2(points.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < points.length; i++) re[i] = points[i];
  fft(re, im);
  const mags: { k: number; amp: number }[] = [];
  for (let k = 1; k <= n / 2; k++) {
    const mag = (2 * Math.hypot(re[k], im[k])) / n;
    mags.push({ k, amp: mag });
  }
  const max = Math.max(...mags.map((m) => m.amp), 0.0001);
  const floor = max * Math.pow(10, thresholdDb / 20);
  return mags
    .filter((m) => m.amp >= floor)
    .sort((a, b) => b.amp - a.amp)
    .slice(0, maxPartials)
    .sort((a, b) => a.k - b.k)
    .map((m) => ({ ratio: m.k, amp: Math.min(1, m.amp), type: 'sine' as const }));
}

/** Оценка фундаментальной частоты автокорреляцией (окно в начале куска).
 *  Диапазон 40–2000 Гц; 0 — не нашла (нетональный материал). Работает
 *  на копии: буфер сэмпла не трогаем. */
export function detectF0(src: Float32Array, sampleRate: number): number {
  const win = Math.min(src.length, 8192);
  if (win < 1024) return 0;
  const data = src.slice(0, win);
  // Убираем постоянную составляющую.
  let mean = 0;
  for (let i = 0; i < win; i++) mean += data[i];
  mean /= win;
  for (let i = 0; i < win; i++) data[i] -= mean;
  let energy = 0;
  for (let i = 0; i < win; i++) energy += data[i] * data[i];
  if (energy < 1e-6) return 0;
  const lagMin = Math.max(2, Math.floor(sampleRate / 2000));
  const lagMax = Math.min(win - 2, Math.floor(sampleRate / 40));
  const corrAt = (lag: number) => {
    let corr = 0;
    for (let i = 0; i < win - lag; i += 2) corr += data[i] * data[i + lag];
    return corr / (win - lag);
  };
  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const corr = corrAt(lag);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestCorr / (energy / win) < 0.2) return 0;
  // Октавная ловушка: на лаге 2T корреляция тоже высокая. Подкратные
  // лаги почти так же хороши — настоящий период меньше.
  for (let d = 4; d >= 2; d--) {
    const cand = Math.round(bestLag / d);
    if (cand >= lagMin && corrAt(cand) >= bestCorr * 0.85) bestLag = cand;
  }
  return sampleRate / bestLag;
}

/** Разложение куска сэмпла в гармоники: усреднённый спектр (Ханн-окна,
 *  кадры по выбору) собирается на сетке f0·k. Точность — максимум
 *  парциалов; дефолт 64 звучит практически как оригинал и почти ничего
 *  не стоит движку (один PeriodicWave). */
export function sampleToPartials(
  data: Float32Array,
  sampleRate: number,
  from: number,
  to: number,
  opts?: { maxPartials?: number; f0?: number; thresholdDb?: number },
): { partials: WavePartial[]; f0: number } {
  const maxPartials = opts?.maxPartials ?? 64;
  const thresholdDb = opts?.thresholdDb ?? -60;
  const i0 = Math.max(0, Math.floor(from * sampleRate));
  const i1 = Math.min(data.length, Math.ceil(to * sampleRate));
  const seg = data.subarray(i0, i1);
  const f0 = opts?.f0 && opts.f0 > 20 ? opts.f0 : detectF0(seg, sampleRate);
  if (!f0) return { partials: [], f0: 0 };
  // Спектр: окно 2048, до 64 кадров равномерно по куску.
  const WIN = 2048;
  if (seg.length < WIN) return { partials: [], f0 };
  const hop = Math.max(WIN, Math.floor((seg.length - WIN) / 63));
  const frames = Math.floor((seg.length - WIN) / hop) + 1;
  const hann = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
  const avg = new Float64Array(WIN / 2);
  const re = new Float64Array(WIN);
  const im = new Float64Array(WIN);
  let done = 0;
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < WIN; i++) {
      re[i] = seg[off + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < WIN / 2; k++) avg[k] += Math.hypot(re[k], im[k]);
    done++;
  }
  if (!done) return { partials: [], f0 };
  for (let k = 1; k < avg.length; k++) avg[k] /= done;
  // Сетка f0·k: амплитуда гармоники — максимум по ±1 бину (неточность f0).
  const maxK = Math.min(maxPartials, Math.floor((WIN / 2 - 2) / ((f0 * WIN) / sampleRate)));
  const mags: { k: number; amp: number }[] = [];
  const binHz = sampleRate / WIN;
  for (let k = 1; k <= maxK; k++) {
    const center = (k * f0) / binHz;
    const b0 = Math.max(1, Math.round(center) - 1);
    const b1 = Math.min(avg.length - 1, Math.round(center) + 1);
    let m = 0;
    for (let b = b0; b <= b1; b++) m = Math.max(m, avg[b]);
    mags.push({ k, amp: m });
  }
  const max = Math.max(...mags.map((m) => m.amp), 1e-9);
  const floor = max * Math.pow(10, thresholdDb / 20);
  const partials = mags
    .filter((m) => m.amp >= floor)
    .sort((a, b) => b.amp - a.amp)
    .slice(0, maxPartials)
    .sort((a, b) => a.k - b.k)
    .map((m) => ({ ratio: m.k, amp: Math.min(1, m.amp / max), type: 'sine' as const }));
  return { partials, f0 };
}
