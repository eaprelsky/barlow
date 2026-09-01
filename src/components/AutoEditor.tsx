// Редактор кривых партии: громкость/фильтр/панорама по ходу цикла эскиза.
// Клик — добавить точку, тянуть — двигать, правый клик — убрать.
// Значение кривой нормировано 0..1; в параметр его переводит autoToParam.

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AutoCurve, AutoPoint, AutoTarget } from '../types';

const W = 560;
const H = 72;
const HIT_PX = 12;
const MAXPTS = 33;

export function AutoEditor({
  curves,
  target,
  onChange,
}: {
  curves: AutoCurve[];
  target: AutoTarget;
  onChange: (curves: AutoCurve[]) => void;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const drag = useRef<number | null>(null);
  // Кривая коммитится в патч от двух точек: пока их меньше, живёт локально —
  // иначе первый клик по пустому графику пропадал и линию не нарисовать.
  const [pending, setPending] = useState<AutoPoint[] | null>(null);
  const curve = curves.find((c) => c.target === target);
  const points = pending ?? curve?.points ?? [];

  // Смена цели (или внешняя правка) — недозревшая кривая не про эту вкладку.
  useEffect(() => setPending(null), [target]);

  const setPoints = (pts: AutoPoint[]) => {
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    if (sorted.length >= 2) {
      setPending(null);
      const rest = curves.filter((c) => c.target !== target);
      onChange([...rest, { target, points: sorted }]);
    } else {
      setPending(sorted);
    }
  };

  const fromEvent = (e: ReactPointerEvent<SVGSVGElement>): AutoPoint => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(
      1,
      Math.max(0, (H - 4 - ((e.clientY - r.top) / r.height) * H) / (H - 8)),
    );
    return { t, v };
  };

  const applyDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const i = drag.current;
    if (i === null || !points[i]) return;
    const p = fromEvent(e);
    // края не дают точке вылезти и слиться с соседями по t
    const lo = i > 0 ? points[i - 1].t + 0.005 : 0;
    const hi = i < points.length - 1 ? points[i + 1].t - 0.005 : 1;
    const pts = points.map((pt, j) =>
      j === i ? { t: Math.min(hi, Math.max(lo, p.t)), v: p.v } : pt,
    );
    setPoints(pts);
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault(); // драг не выделяет текст страницы
    if (e.button !== 0 || points.length >= MAXPTS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = fromEvent(e);
    const px = (t: number) => t * r.width;
    let nearest = -1;
    let best = HIT_PX;
    points.forEach((pt, i) => {
      const d = Math.abs(px(pt.t) - (e.clientX - r.left));
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (nearest >= 0) {
      drag.current = nearest;
      applyDrag(e);
      return;
    }
    // новый пункт в отсортированную позицию
    let at = points.findIndex((pt) => pt.t > p.t);
    if (at < 0) at = points.length;
    const pts = [...points.slice(0, at), p, ...points.slice(at)];
    setPoints(pts);
    drag.current = at;
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current !== null) applyDrag(e);
  };

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  const removeAt = (i: number) => {
    if (points.length <= 2) {
      setPending(null);
      onChange(curves.filter((c) => c.target !== target));
      return;
    }
    setPoints(points.filter((_, j) => j !== i));
  };

  const toXY = (p: AutoPoint) => ({ x: p.t * W, y: H - 4 - p.v * (H - 8) });
  const line = points.map((p) => `${toXY(p).x.toFixed(1)},${toXY(p).y.toFixed(1)}`).join(' ');

  return (
    <svg
      className="auto-editor"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - r.left;
        let nearest = -1;
        let best = HIT_PX;
        points.forEach((pt, i) => {
          const d = Math.abs(pt.t * W - cx);
          if (d < best) {
            best = d;
            nearest = i;
          }
        });
        if (nearest >= 0) removeAt(nearest);
      }}
    >
      <title>Кривая партии: клик — точка, тяни — двигай, правый клик — убрать</title>
      <line x1={0} y1={H - 4} x2={W} y2={H - 4} className="env-axis" />
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={g * W} y1={4} x2={g * W} y2={H - 4} className="env-grid" />
      ))}
      {points.length < 2 && (
        <>
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="env-grid mid" />
          <text x={W / 2} y={H / 2 - 8} textAnchor="middle" className="env-text dim">
            пусто — клик поставит точку, параметр держится на ручке
          </text>
        </>
      )}
      {points.length >= 2 && <polyline points={line} className="env-amp" />}
      {points.map((p, i) => {
        const xy = toXY(p);
        return <circle key={i} cx={xy.x} cy={xy.y} r={3.5} className="env-handle" />;
      })}
    </svg>
  );
}
