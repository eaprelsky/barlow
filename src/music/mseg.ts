/** JSON contract v54. curve belongs to the segment arriving at this point. */
export interface Mseg {
  seconds: number;
  points: { t: number; v: number; curve?: number }[];
  sustainPoint?: number;
  /** Complete backward/forward trips during the held part of one note. */
  loop?: { startPoint: number; repeats: number };
}
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
      && (p.curve === undefined || Number.isFinite(p.curve) && p.curve >= -4 && p.curve <= 4)
      && p.t >= 0 && p.t <= 1 && p.v >= 0 && p.v <= 1
      && (i === 0 || p.t - e.points[i - 1].t >= .001 - 1e-9))
    && e.points[0].t === 0 && e.points[0].v === 0
    && e.points.at(-1)!.t === 1 && e.points.at(-1)!.v === 0
    && (e.sustainPoint === undefined || Number.isInteger(e.sustainPoint) && e.sustainPoint > 0 && e.sustainPoint < e.points.length - 1)
    && (e.loop === undefined || !!e.loop && typeof e.loop === 'object' && e.sustainPoint !== undefined
      && Number.isInteger(e.loop.startPoint) && e.loop.startPoint >= 0 && e.loop.startPoint < e.sustainPoint
      && Number.isInteger(e.loop.repeats) && e.loop.repeats >= 1 && e.loop.repeats <= 32);
}
export function normalizeMseg(raw: unknown): Mseg | undefined {
  if (raw === undefined || !validMseg(raw)) return undefined;
  const e = raw as Mseg;
  return { seconds: e.seconds, points: e.points.map(({ t, v, curve }) => ({ t, v, ...(curve ? { curve } : {}) })),
    ...(e.sustainPoint === undefined ? {} : { sustainPoint: e.sustainPoint }),
    ...(e.loop ? { loop: { ...e.loop } } : {}) };
}
/** Continuous monotone interpolation, including exact linear legacy shape. */
export function msegCurve(u: number, curve = 0): number {
  const x = Math.max(0, Math.min(1, u));
  return Math.abs(curve) < 1e-6 ? x : Math.expm1(curve * x) / Math.expm1(curve);
}
export function msegValue(envelope: Mseg, t: number): number {
  const points = envelope.points;
  for (let i = 1; i < points.length; i++) if (t <= points[i].t) {
    const a = points[i - 1], b = points[i];
    return a.v + (b.v - a.v) * msegCurve((t - a.t) / (b.t - a.t), b.curve);
  }
  return points.at(-1)!.v;
}
export function msegDuration(envelope: Mseg, gate: number): number {
  return gate + (envelope.sustainPoint === undefined ? 0 : (1 - envelope.points[envelope.sustainPoint].t) * envelope.seconds);
}
export interface MsegSegment { duration: number; from: number; to: number; curve: number }
/** At most 2015 segments: no timers, open-ended scheduling or per-frame allocations. */
export function msegSegments(envelope: Mseg, gate: number): MsegSegment[] {
  const out: MsegSegment[] = [], p = envelope.points, hold = envelope.sustainPoint;
  const add = (duration: number, from: number, to: number, curve = 0) => { if (duration > 0) out.push({ duration, from, to, curve }); };
  if (hold === undefined) {
    for (let i = 1; i < p.length; i++) add((p[i].t - p[i - 1].t) * gate, p[i - 1].v, p[i].v, p[i].curve);
    return out;
  }
  const attackEnd = p[hold].t * envelope.seconds;
  for (let i = 1; i <= hold; i++) {
    const from = p[i - 1].t * envelope.seconds, to = p[i].t * envelope.seconds;
    if (from >= gate) break;
    const fraction = Math.min(1, (gate - from) / (to - from));
    add(Math.min(to, gate) - from, p[i - 1].v, p[i - 1].v + (p[i].v - p[i - 1].v) * msegCurve(fraction, p[i].curve), (p[i].curve ?? 0) * fraction);
  }
  if (gate > attackEnd) {
    const loop = envelope.loop;
    if (!loop) add(gate - attackEnd, p[hold].v, p[hold].v);
    else {
      const span = p[hold].t - p[loop.startPoint].t;
      const scale = (gate - attackEnd) / (2 * loop.repeats * span);
      for (let repeat = 0; repeat < loop.repeats; repeat++) {
        for (let i = hold; i > loop.startPoint; i--) add((p[i].t - p[i - 1].t) * scale, p[i].v, p[i - 1].v, -(p[i].curve ?? 0));
        for (let i = loop.startPoint + 1; i <= hold; i++) add((p[i].t - p[i - 1].t) * scale, p[i - 1].v, p[i].v, p[i].curve);
      }
    }
  }
  const releaseFrom = gate < attackEnd ? msegValue(envelope, gate / envelope.seconds) : p[hold].v;
  for (let i = hold + 1; i < p.length; i++) add((p[i].t - p[i - 1].t) * envelope.seconds,
    i === hold + 1 ? releaseFrom : p[i - 1].v, p[i].v, p[i].curve);
  return out;
}
export function scheduleMseg(param: AudioParam, envelope: Mseg, time: number, duration: number): void {
  param.setValueAtTime(0, time);
  // Preserve previously released envelopes without numerical or timing changes.
  if (envelope.sustainPoint === undefined && envelope.points.every(p => !p.curve)) {
    for (const point of envelope.points.slice(1)) param.linearRampToValueAtTime(point.v, time + point.t * duration);
    return;
  }
  let cursor = time;
  for (const segment of msegSegments(envelope, duration)) {
    const count = segment.curve ? 65 : 2;
    const values = Float32Array.from({ length: count }, (_, i) => segment.from + (segment.to - segment.from) * msegCurve(i / (count - 1), segment.curve));
    param.setValueCurveAtTime(values, cursor, segment.duration);
    // Use precisely the previous AudioParam curve end to avoid overlap by roundoff.
    cursor += segment.duration;
  }
}
