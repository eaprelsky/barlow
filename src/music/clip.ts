// Буфер копипаста нот между треками. activeTrackId — дорожка, чей нотный
// стан работал последним: только она обрабатывает Ctrl+C/V/Delete/Escape.

import type { Note } from '../types';
export interface ClipNote extends Note {
  col: number;
}

export const clip: { notes: ClipNote[]; activeTrackId: string } = {
  notes: [],
  activeTrackId: '',
};
