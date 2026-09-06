// Снимок тембра в редактируемые гармоники. Правка волны начинается не с
// синуса, а с честного слепка того, что звучит: базовые волны — формулами,
// аддитивные модели (гармоники, орган, модальные) — теми же рецептами, что
// и в triggerVoice, FM/супер-пила/вокал — своими уравнениями. Редактор
// волны и канвас пользуются одним модулем — картинка и таблица гармоник
// не расходятся со звучащим тембром.

import type { Instrument, WaveDef, WavePartial } from '../types';
import { cycleToPartials, renderWaveCycle } from './fft';

export const CYCLE_N = 2048;

const SINE_WAVE: WaveDef = { partials: [{ ratio: 1, amp: 1, type: 'sine' }] };

const oddHarmonics = (count: number, amp: (k: number) => number): WavePartial[] => {
  const out: WavePartial[] = [];
  for (let i = 0; i < count; i++) {
    const k = i * 2 + 1;
    out.push({ ratio: k, amp: amp(k), type: 'sine' });
  }
  return out;
};

const normAmps = (partials: WavePartial[]): WavePartial[] => {
  const max = Math.max(...partials.map((p) => p.amp), 1e-9);
  return partials.map((p) => ({ ...p, amp: Math.min(1, p.amp / max) }));
};

// Рецепты моделей — те же константы, что в triggerVoice (voices.ts):
// снапшот обязан звучать как снятый с модели тембр, а не «похожий».

// Модальные партиалы: маримба → колокол, морф их интерполирует.
const MODAL_A = [1, 3.9, 9.2, 13.4];
const MODAL_B = [1, 2.32, 4.25, 6.63];

/** Гармоники источников с точным спектром — по рецептам triggerVoice. */
function modelPartials(inst: Instrument): WavePartial[] | null {
  const m = inst.voiceMorph ?? 0.5;
  switch (inst.waveform) {
    case 'sine':
      return [{ ratio: 1, amp: 1, type: 'sine' }];
    case 'triangle':
      // Треугольник — нечётные гармоники спадом 1/k².
      return oddHarmonics(8, (k) => 1 / (k * k));
    case 'square':
      // Меандр: нечётные 1/k.
      return oddHarmonics(8, (k) => 1 / k);
    case 'sawtooth':
      return Array.from({ length: 16 }, (_, i) => ({
        ratio: i + 1,
        amp: 1 / (i + 1),
        type: 'sine' as const,
      }));
    case 'additive': {
      const n = 2 + Math.round(m * 14);
      return Array.from({ length: n }, (_, i) => ({
        ratio: i + 1,
        amp: Math.pow(i + 1, -1.5),
        type: 'sine' as const,
      }));
    }
    case 'organ': {
      const regs = [1, 2, 3, 4, 6, 8];
      return regs.map((r, i) => ({
        ratio: r,
        amp: Math.max(0.15, Math.min(1, m * regs.length * 1.15 - i)),
        type: 'sine' as const,
      }));
    }
    case 'modal':
      return MODAL_A.map((pa, i) => ({
        ratio: pa + (MODAL_B[i] - pa) * m,
        amp: 0.9 / (i + 1),
        type: 'sine' as const,
      }));
    default:
      return null;
  }
}

// Вокал: пила сквозь три формантных резонатора (как в triggerVoice).
// Резонаторы — абсолютные герцы, поэтому снапшот зависит от тоники: для
// каждой гармоники k считаем усиление |H| на её частоте (формула RBJ
// полосового фильтра) и множим на амплитуду пилы 1/k.
const VOWELS: [number, number, number][] = [
  [800, 1150, 2800], // А
  [500, 1900, 2550], // Э
  [280, 2250, 2890], // И
  [550, 950, 2400], // О
  [350, 800, 2300], // У
];

function vowelOf(m: number): [number, number, number] {
  const pos = Math.min(0.9999, Math.max(0, m)) * (VOWELS.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = VOWELS[i];
  const b = VOWELS[i + 1] ?? a;
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * frac) as [number, number, number];
}

/** |H(ω)| резонатора: 1/sqrt(1 + Q²(ω/ω0 − ω0/ω)²). */
const bpGain = (q: number, f0: number, f: number): number => {
  if (f <= 0) return 0;
  const x = f / f0 - f0 / f;
  return 1 / Math.sqrt(1 + q * q * x * x);
};

/** Гармоники вокала на тонике дорожки (freq, Гц). */
function formantPartials(inst: Instrument, freq: number): WavePartial[] {
  const [f1, f2, f3] = vowelOf(inst.voiceMorph ?? 0.5);
  const bands: [number, number, number][] = [
    [f1, 10, 1],
    [f2, 12, 0.55],
    [f3, 14, 0.3],
  ];
  const out: WavePartial[] = [];
  for (let k = 1; k <= 48; k++) {
    const f = freq * k;
    let g = 0.12; // сухая пила — тело голоса под формантами
    for (const [ff, q, level] of bands) g += level * bpGain(q, ff, f);
    const amp = (1 / k) * g;
    if (amp > 0.004) out.push({ ratio: k, amp, type: 'sine' });
  }
  return normAmps(out);
}

/** FM-цикл по уравнению синтеза (несущая + модулятор, как triggerVoice). */
function fmCycle(inst: Instrument): Float32Array {
  const out = new Float32Array(CYCLE_N);
  const ratio = inst.fmRatio ?? 2;
  const index = inst.fmIndex ?? 3;
  for (let i = 0; i < CYCLE_N; i++) {
    const t = i / CYCLE_N;
    out[i] = Math.sin(2 * Math.PI * t + index * Math.sin(2 * Math.PI * ratio * t));
  }
  return out;
}

/** Супер-пила по формуле звука (triggerVoice): 7 пил, расстройка и
 *  гейны — из «морфа». */
function supersawCycle(inst: Instrument): Float32Array {
  const out = new Float32Array(CYCLE_N);
  const detune = 4 + (inst.voiceMorph ?? 0.5) * 36;
  const gains = [1, 0.7, 0.7, 0.5, 0.5, 0.32, 0.32];
  const offs = [0, -0.33, 0.33, -0.66, 0.66, -1, 1];
  const norm = gains.reduce((a, b) => a + b, 0);
  for (let i = 0; i < CYCLE_N; i++) {
    const t = i / CYCLE_N;
    let v = 0;
    for (let k = 0; k < gains.length; k++) {
      const ph = ((t * (1 + (offs[k] * detune) / 1200)) % 1 + 1) % 1;
      v += (ph * 2 - 1) * gains[k];
    }
    out[i] = v / norm;
  }
  return out;
}

/** Честный цикл звучащего тембра для канваса. null — только сэмпл (у
 *  него канвас сэмпла). Чистый визуал: живой синтез — в triggerVoice. */
export function renderInstrumentCycle(inst: Instrument): Float32Array | null {
  switch (inst.waveform) {
    case 'sample':
      return null;
    case 'noise': {
      // Сглаженный псевдошум: «пыль» той же природы, что audible шум.
      const out = new Float32Array(CYCLE_N);
      let v = 0;
      for (let i = 0; i < CYCLE_N; i++) {
        if (i % 24 === 0) v = Math.random() * 2 - 1;
        out[i] = v;
      }
      return out;
    }
    case 'fm':
      return fmCycle(inst);
    case 'supersaw':
      return supersawCycle(inst);
    case 'formant':
      // Картинка формы на эталонной тонике 220 Гц: визуал гласной,
      // не привязка к высоте дорожки.
      return renderWaveCycle({ partials: formantPartials(inst, 220) }, CYCLE_N);
    case 'wave':
      return renderWaveCycle(inst.wave ?? SINE_WAVE, CYCLE_N);
    default: {
      const model = modelPartials(inst);
      return model ? renderWaveCycle({ partials: normAmps(model) }, CYCLE_N) : null;
    }
  }
}

/** Снапшот тембра в парциалы: стартовая точка редактора волны. Правка
 *  любой гармоники превращает инструмент в «свою волну» с этими
 *  парциалами — звучание наследует спектр источника. */
export function snapshotWave(inst: Instrument, freq = 220): WaveDef {
  if (inst.waveform === 'wave' && inst.wave && inst.wave.partials.length > 0) {
    return {
      partials: inst.wave.partials.map((p) => ({ ...p })),
      noiseGrainMs: inst.wave.noiseGrainMs,
    };
  }
  if (inst.waveform === 'noise') {
    return { partials: [{ ratio: 1, amp: 0.8, type: 'noise' }], noiseGrainMs: 40 };
  }
  if (inst.waveform === 'karplus') {
    // Струна из шума: спектр близок к гармонической пиле — снимаем
    // «щипковую пилу».
    return {
      partials: Array.from({ length: 12 }, (_, i) => ({
        ratio: i + 1,
        amp: Math.pow(i + 1, -1.3),
        type: 'sine' as const,
      })),
    };
  }
  if (inst.waveform === 'formant') {
    return { partials: formantPartials(inst, freq > 20 ? freq : 220) };
  }
  const model = modelPartials(inst);
  if (model && model.length > 0) return { partials: normAmps(model) };
  // FM и супер-пила: цикл уравнением → БПФ в гармоники.
  const cycle = inst.waveform === 'fm' ? fmCycle(inst) : supersawCycle(inst);
  const partials = cycleToPartials(cycle, 64);
  return partials.length > 0 ? { partials } : SINE_WAVE;
}
