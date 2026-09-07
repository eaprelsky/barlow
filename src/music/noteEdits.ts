import type { Note, Step } from '../types';
import type { ClipNote } from './clip';

export const copyNote = (note: Note): Note => structuredClone(note);
export function copySelection(steps: Step[], selection: ReadonlySet<string>): ClipNote[] {
  return steps.flatMap((step, col) => step.notes.filter(n => selection.has(`${col}:${n.n}`)).map(note => ({ ...copyNote(note), col })));
}
export function moveSelection(steps: Step[], selection: ReadonlySet<string>, dc: number, dr: number, rowCount: number) {
  const notes = copySelection(steps, selection);
  const unchanged = { steps, selection: new Set(selection), blocked: false };
  if (!notes.length) return unchanged;
  const bounds = notes.reduce((b, note) => ({ minCol: Math.min(b.minCol, note.col), maxCol: Math.max(b.maxCol, note.col),
    minRow: Math.min(b.minRow, note.n), maxRow: Math.max(b.maxRow, note.n) }),
    { minCol: Infinity, maxCol: -Infinity, minRow: Infinity, maxRow: -Infinity });
  dc = Math.max(-bounds.minCol, Math.min(steps.length - 1 - bounds.maxCol, dc));
  dr = Math.max(-bounds.minRow, Math.min(rowCount - 1 - bounds.maxRow, dr));
  if (!dc && !dr) return unchanged;
  const out = steps.map((step, col) => ({ ...step, notes: step.notes.filter(n => !selection.has(`${col}:${n.n}`)) }));
  if (notes.some(note => out[note.col + dc].notes.some(n => n.n === note.n + dr)))
    return { ...unchanged, blocked: true };
  const moved = new Set<string>();
  for (const { col, ...note } of notes) {
    const n = note.n + dr, c = col + dc;
    out[c].notes = [...out[c].notes, { ...note, n }]; moved.add(`${c}:${n}`);
  }
  return { steps: out, selection: moved, blocked: false };
}
export function pasteNotes(steps: Step[], notes: ClipNote[], targetCol: number, rowCount: number) {
  const out = steps.map(step => ({ ...step, notes: [...step.notes] }));
  const added = new Set<string>(); let skipped = 0;
  const minCol = notes.reduce((min, note) => Math.min(min, note.col), Infinity);
  for (const item of notes) {
    const { col, ...note } = item;
    const c = col - minCol + targetCol, n = Math.min(rowCount - 1, Math.max(0, note.n));
    if (c < 0 || c >= out.length || out[c].notes.some(note => note.n === n)) { skipped++; continue; }
    out[c].notes.push({ ...copyNote(note), n }); added.add(`${c}:${n}`);
  }
  return { steps: out, selection: added, skipped };
}
