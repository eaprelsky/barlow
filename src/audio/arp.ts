// Арпеджиатор: аккорд шага разворачивается в последовательность нот.
// Живёт на уровне нот — работает одинаково для осцилляторов и сэмплов.
// Набор режимов как в Ableton Live; октавы повторяют фигуру выше (2^o).
// Единая точка для live-планировщика и оффлайн-рендера — звук совпадает.

import type { Arp, Note } from '../types';

export interface ArpEvent {
  note: Note;
  // Сдвиг от начала шага, в шагах (дробный — быстрее сетки).
  dt: number;
}

/** Порядок нот фигуры по режиму (без октав). */
function figureOf(notes: Note[], mode: Arp['mode']): Note[] {
  const byPitch = [...notes].sort((a, b) => a.n - b.n);
  switch (mode) {
    case 'up':
      return byPitch;
    case 'down':
      return byPitch.reverse();
    case 'updown': {
      // Вверх и вниз без повторения крайних нот.
      const up = byPitch;
      const down = [...byPitch].reverse().slice(1, -1);
      return [...up, ...down];
    }
    case 'downup': {
      const down = [...byPitch].reverse();
      const up = byPitch.slice(1, -1);
      return [...down, ...up];
    }
    case 'order':
      return [...notes];
    case 'chord':
    case 'random':
    default:
      return notes;
  }
}

/** Развернуть ноты шага в события арпеджиатора. dt — в шагах: события
 *  идут с плотностью arp.div на шаг. random недетерминирован — в
 *  golden-фикстуру арпеджиатор не включать (как и вероятность). */
export function arpEvents(notes: Note[], arp: Arp, rnd: () => number = Math.random): ArpEvent[] {
  if (notes.length === 0) return [];
  const div = Math.max(0.25, arp.div || 1);
  const octaves = Math.min(4, Math.max(1, Math.round(arp.octaves)));
  if (arp.mode === 'chord') return notes.map((note) => ({ note, dt: 0 }));
  const step = 1 / div;

  if (arp.mode === 'random') {
    const count = notes.length * octaves;
    return Array.from({ length: count }, (_, i) => {
      const note = notes[Math.floor(rnd() * notes.length)];
      const oct = octaves > 1 ? Math.floor(rnd() * octaves) : 0;
      return { note: oct ? { ...note, oct: (note.oct ?? 0) + oct } : note, dt: i * step };
    });
  }

  const figure = figureOf(notes, arp.mode);
  const events: ArpEvent[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const note of figure) {
      events.push({ note: o ? { ...note, oct: (note.oct ?? 0) + o } : note, dt: events.length * step });
    }
  }
  return events;
}
