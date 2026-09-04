// Арпеджиатор: аккорд шага разворачивается в перелив внутри самой ноты.
// Нота дробится на равные доли (div долей на шаг сетки); по долям идёт
// фигура (вверх/вниз/…) — каждая доля короче ноты, всё умещается в неё.
// Живёт на уровне нот — работает одинаково для осцилляторов и сэмплов.
// Единая точка для live-планировщика и оффлайн-рендера — звук совпадает.

import type { Arp, Note } from '../types';

export interface ArpEvent {
  note: Note;
  // Начало доли от начала ноты, в шагах (дробное).
  dt: number;
  // Длина доли, в шагах (уже с гейтом ноты). Ноль событий — пауза.
  len: number;
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

/** Развернуть ноты шага в перелив внутри ноты. noteLenSteps — длина
 *  аккорда в шагах сетки (максимум по нотам: своя длина len (v37), иначе
 *  «нота» трека или огибающая × гейт); нота делится на
 *  noteLenSteps × div долей длиной 1/div, фигура по долям циклится.
 *  random недетерминирован — в golden-фикстуру арпеджиатор не включать
 *  (как и вероятность). */
export function arpEvents(
  notes: Note[],
  arp: Arp,
  noteLenSteps: number,
  rnd: () => number = Math.random,
): ArpEvent[] {
  if (notes.length === 0) return [];
  const div = Math.max(0.25, arp.div || 1);
  const octaves = Math.min(4, Math.max(1, Math.round(arp.octaves)));
  // Своя длина ноты — абсолютная (v37); легаси-гейт множит базу аккорда.
  const noteLen = (nt: Note) =>
    typeof nt.len === 'number' && nt.len > 0
      ? Math.min(64, Math.max(0.05, nt.len))
      : noteLenSteps * Math.min(4, Math.max(0.1, nt.gate ?? 1));
  const slot = 1 / div;

  // «аккорд» — все ноты разом, каждая своей длины (как без арпеджиатора).
  if (arp.mode === 'chord') {
    return notes.map((note) => ({ note, dt: 0, len: noteLen(note) }));
  }

  const slots = Math.max(1, Math.round(noteLenSteps * div));

  if (arp.mode === 'random') {
    return Array.from({ length: slots }, (_, i) => {
      const note = notes[Math.floor(rnd() * notes.length)];
      const oct = octaves > 1 ? Math.floor(rnd() * octaves) : 0;
      return {
        note: oct ? { ...note, oct: (note.oct ?? 0) + oct } : note,
        dt: i * slot,
        len: slot,
      };
    });
  }

  const figure = figureOf(notes, arp.mode);
  // Полный проход фигуры с октавами — по долям ноты циклится.
  const seq: { note: Note; oct: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const note of figure) seq.push({ note, oct: o });
  }
  return Array.from({ length: slots }, (_, i) => {
    const { note, oct } = seq[i % seq.length];
    return {
      note: oct ? { ...note, oct: (note.oct ?? 0) + oct } : note,
      dt: i * slot,
      len: slot,
    };
  });
}
