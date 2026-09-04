// Мини-иконки форм волны для выбора осциллятора: одна волна — один
// узнаваемый глиф, «как на приборе». 16×14, штрих currentColor.

import type { Waveform } from '../types';

const P: Record<Waveform, string> = {
  sine: 'M1 7c2-5 4-5 6 0s4 5 6 0',
  square: 'M1 11V3h5v8h5V3h4',
  triangle: 'M1 11 6 3l5 8 4-8',
  sawtooth: 'M1 11 6 3v8l5-8v8l4-8',
  // шум: мелкая рваная пила
  noise: 'M1 8l2-4 1 6 2-7 1 8 2-6 1 5 2-3 1 4 2-6',
  // FM: несущая + тихий модулятор сверху
  fm: 'M1 7c2-5 4-5 6 0s4 5 6 0M3 3c1-1.5 3-1.5 4 0',
  // Karplus: щипок — вспышка и затухающие периоды
  karplus: 'M2 10 4 2l2 7 2-6 2 5 2-3 2 2',
  // супер-пила: три расстроенные пилы
  supersaw: 'M1 11 4 3v8M4 11 8 4v7M8 11 12 3v8M12 11 15 4',
  // аддитив: тонкая + жирная гармоника
  additive: 'M1 7c2-3 3-3 4 0s2 3 4 0M1 11h13',
  // формант: волна в «обёртке рта»
  formant: 'M1 7c1.5-4 3.5-5 6-4s4.5 1 6-1M2 5c2 1 4 1.5 6 1s3-.5 4-1',
  // модальный: звон — затухающие дуги
  modal: 'M1 4c3-3 8-3 12 0M3 8c2-2 6-2 8 0M5 11.5c1.5-1 3.5-1 5 0',
  // орган: регистры-трубы
  organ: 'M3 11V5M6.5 11V2M10 11V4M13.5 11V6',
  // своя волна: столбики парциалов
  wave: 'M2 11V3M5.5 11V6M9 11V4M12.5 11V8',
  // сэмпл: лента с волной
  sample: 'M1 4h14M1 4v7h14V4M3 8c1-1.5 2-1.5 3 0s2 1.5 3 0 2-1.5 3 0',
};

export function WaveIcon({ wave, size = 16 }: { wave: Waveform; size?: number }) {
  return (
    <svg width={size} height={size - 2} viewBox="0 0 16 13" aria-hidden="true">
      <path d={P[wave]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
