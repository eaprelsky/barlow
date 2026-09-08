/** Bounded, piecewise-linear amplitude envelope. Endpoints are silent. */
export interface Mseg { seconds: number; points: { t: number; v: number }[] }
export const MSEG_LIMIT = 32;
export const MSEG_SHAPES: Record<string, Mseg['points']> = {
  'удар': [{ t: 0, v: 0 }, { t: .02, v: 1 }, { t: .25, v: .3 }, { t: 1, v: 0 }],
  'взлёт': [{ t: 0, v: 0 }, { t: .7, v: .5 }, { t: .9, v: 1 }, { t: 1, v: 0 }],
  'две атаки': [{ t: 0, v: 0 }, { t: .02, v: 1 }, { t: .35, v: 0 }, { t: .5, v: 0 }, { t: .52, v: .8 }, { t: 1, v: 0 }],
};
export function validMseg(raw: unknown): boolean {
  if (raw === undefined) return true;
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Mseg;
  return Number.isFinite(e.seconds) && e.seconds >= .01 && e.seconds <= 16
    && Array.isArray(e.points) && e.points.length >= 2 && e.points.length <= MSEG_LIMIT
    && e.points.every((p, i) => p && Number.isFinite(p.t) && Number.isFinite(p.v)
      && p.t >= 0 && p.t <= 1 && p.v >= 0 && p.v <= 1
      && (i === 0 || p.t - e.points[i - 1].t >= .001 - 1e-9))
    && e.points[0].t === 0 && e.points[0].v === 0
    && e.points.at(-1)!.t === 1 && e.points.at(-1)!.v === 0;
}
export function normalizeMseg(raw: unknown): Mseg | undefined {
  if (raw === undefined || !validMseg(raw)) return undefined;
  const e = raw as Mseg;
  return { seconds: e.seconds, points: e.points.map(({ t, v }) => ({ t, v })) };
}
export function scheduleMseg(param: AudioParam, envelope: Mseg, time: number, duration: number): void {
  param.setValueAtTime(0, time);
  for (const point of envelope.points.slice(1)) param.linearRampToValueAtTime(point.v, time + point.t * duration);
}
