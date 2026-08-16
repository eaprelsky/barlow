// Буфер копипаста нот между треками. activeTrackId — дорожка, чей нотный
// стан работал последним: только она обрабатывает Ctrl+C/V/Delete/Escape.

export interface ClipNote {
  col: number;
  n: number;
  vel: number;
  prob: number;
}

export const clip: { notes: ClipNote[]; activeTrackId: string } = {
  notes: [],
  activeTrackId: '',
};
