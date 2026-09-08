import { tableFrame, frameWeight, wavetablePosition } from './wavetable';
// Рендер цикла волны для канваса редактора (v39). Прежде здесь жили
// снапшоты моделей (синус, FM, колокол…) — модели стали строками-
// операторами (music/waveRecipes.ts), и канал рисует таблицу напрямую:
// сумму слагаемых плюс фазовую модуляцию маршрутов. Хвосты (decay) —
// поведение во времени, в статичный цикл не попадают.
import type { Instrument, WaveDef, WavePartial } from '../types';

export const CYCLE_N = 2048;

/** Псевдошум для строки «шум»: детерминированный, картинка стабильна. */
function hashNoise(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

function oscAt(type: WavePartial['type'], ph: number): number {
  switch (type) {
    case 'sine':
      return Math.sin(ph);
    case 'square':
      return Math.sin(ph) >= 0 ? 1 : -1;
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.max(-1, Math.min(1, Math.sin(ph))));
    default: {
      // пила: фаза 0..2π → −1..1
      const f = (ph / (2 * Math.PI)) % 1;
      return (f < 0 ? f + 1 : f) * 2 - 1;
    }
  }
}

/** Цикл таблицы операторов: слагаемые суммируются, модуляторы уходят
 *  в фазу своих целей (sin(2πrt + Σ I·sin(2πrm t))). null — таблицы нет. */
export function renderOpCycle(wave: WaveDef | undefined): Float32Array | null {
  if (!wave || wave.partials.length === 0) return null;
  const rows = wave.partials;
  const out = new Float32Array(CYCLE_N);
  // Модуляторы по целям: в фазу цели суммируются их вклады.
  const modsOf = new Map<number, WavePartial[]>();
  rows.forEach((p) => {
    if (p.mod !== undefined) {
      const list = modsOf.get(p.mod);
      if (list) list.push(p);
      else modsOf.set(p.mod, [p]);
    }
  });
  const sumAmp = rows.reduce((s, p) => (p.mod === undefined ? s + p.amp : s), 0);
  const sumScale = sumAmp > 1 ? 1 / sumAmp : 1;
  rows.forEach((p, i) => {
    if (p.mod !== undefined) return;
    const mods = modsOf.get(i) ?? [];
    if (p.type === 'noise') {
      for (let n = 0; n < CYCLE_N; n++) out[n] += p.amp * sumScale * hashNoise(n);
      return;
    }
    for (let n = 0; n < CYCLE_N; n++) {
      const t = n / CYCLE_N;
      let ph = 2 * Math.PI * p.ratio * t;
      for (const m of mods) ph += m.amp * Math.sin(2 * Math.PI * m.ratio * t);
      out[n] += p.amp * sumScale * oscAt(p.type, ph);
    }
  });
  const max = Math.max(...out.map(Math.abs), 0.0001);
  const norm = 0.95 / max;
  for (let n = 0; n < CYCLE_N; n++) out[n] *= norm;
  return out;
}

/** Цикл звучащего инструмента: таблица его волны; сэмпл не рисуем. */
export function renderInstrumentCycle(inst: Instrument): Float32Array | null {
  if (inst.waveform !== 'wave') return null;
  const table = inst.wave?.wavetable;
  if (table) return Float32Array.from({ length: CYCLE_N }, (_, n) => table.frames.reduce((v, f, i) => v + f[Math.floor(n * f.length / CYCLE_N)] * frameWeight(wavetablePosition(table, 0, 0), i, table.frames.length), 0));
  if (inst.wave?.va) { const f = tableFrame(inst.wave.va.shape, inst.wave.va.pulseWidth); return Float32Array.from({ length: CYCLE_N }, (_, n) => f[Math.floor(n * f.length / CYCLE_N)]); }
  return renderOpCycle(inst.wave);
}
