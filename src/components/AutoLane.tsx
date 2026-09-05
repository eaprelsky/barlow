// Дорожка автоматизации партии: кривая громкости/фильтра/панорамы прямо
// на сетке шагов стана — вертикали совпадают с границами столбцов, точки
// прилипают к границам шагов (Shift — свободно). Клик — точка, тяни —
// двигай, правый клик — убрать. На цели «громкость» по краям — рампы
// входа/выхода из сцены (fadeIn/fadeOut эскиза): тянутся за вершину.
// Значение кривой нормировано 0..1 (autoToParam переводит в параметр);
// движок применяет его на границе каждого шага — потому снап к границам
// и есть честная сетка слышимого.

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AutoCurve, AutoPoint, AutoTarget, Mod } from '../types';
import { AUTO_TARGET_LABELS } from '../types';
import { modCurveValue } from '../music/modCurve';

const PITCH = 27; // px на шаг — клетка 24 + гэп 3, как у стана
const H = 64; // высота дорожки
const V_PAD = 6; // поля по вертикали под кривую
const HIT_PX = 10;
const MAXPTS = 33;

const Y_LABELS: Record<AutoTarget, [string, string]> = {
  volume: ['100%', '0'],
  filterFreq: ['12k Гц', '60 Гц'],
  pan: ['L', 'R'],
  fxMix: ['мокро', 'сухо'],
  fxTime: ['2 с', '10 мс'],
  fxFeedback: ['90%', '0'],
};

const MOD_SOURCE_TITLE: Record<string, string> = {
  lfo: 'LFO',
  sah: 'ступени S&H',
  perlin: 'перлин',
};

export function AutoLane({
  curves,
  target,
  length,
  activeStep,
  fadeIn,
  fadeOut,
  stepSec,
  mods,
  base,
  onCurves,
  onFade,
}: {
  curves: AutoCurve[];
  target: AutoTarget;
  /** Шагов в цикле эскиза. */
  length: number;
  /** Текущий шаг (плейхед) или −1. */
  activeStep: number;
  /** Фейды эскиза, сек — рампы на цели «громкость». */
  fadeIn: number;
  fadeOut: number;
  /** Длительность шага, сек — px рампы честны по времени. */
  stepSec: number;
  /** Эффективные модуляции партии: их вклад на цель рисуется штрихом
   *  поверх кривой — видно, как параметр «гуляет» от LFO/шума. */
  mods: Mod[];
  /** База цели: фильтр — частота «верха» инструмента, fx* — текущее
   *  значение первого эффекта (вокруг базы штрих модуляции). */
  base: number;
  onCurves: (curves: AutoCurve[]) => void;
  onFade: (which: 'in' | 'out', sec: number) => void;
}) {
  const W = length * PITCH - 3;
  const drag = useRef<number | null>(null);
  const fadeDrag = useRef<'in' | 'out' | null>(null);
  // Кривая коммитится в патч от двух точек: пока их меньше, живёт локально —
  // иначе первый клик по пустой дорожке пропадал и линию не нарисовать.
  const [pending, setPending] = useState<AutoPoint[] | null>(null);
  const [dragLabel, setDragLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const curve = curves.find((c) => c.target === target);
  const points = pending ?? curve?.points ?? [];

  // Смена цели (или внешняя правка) — недозревшая кривая не про эту цель.
  useEffect(() => setPending(null), [target]);
  useEffect(() => setDragLabel(null), [target]);

  const yb = H - V_PAD;
  const vToY = (v: number) => yb - v * (H - V_PAD * 2);
  const yToV = (y: number) => Math.min(1, Math.max(0, (yb - y) / (H - V_PAD * 2)));
  const snapT = (t: number, free: boolean) =>
    free ? Math.min(1, Math.max(0, t)) : Math.min(1, Math.max(0, Math.round(t * length) / length));

  const setPoints = (pts: AutoPoint[]) => {
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    if (sorted.length >= 2) {
      setPending(null);
      const rest = curves.filter((c) => c.target !== target);
      onCurves([...rest, { target, points: sorted }]);
    } else {
      setPending(sorted);
    }
  };

  // viewBox в пикселях = размер на экране, но зум браузера меняет масштаб —
  // считаем через rect, чтобы попадать мышью при любом зуме.
  const local = (e: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };

  const fadePx = (sec: number) => Math.min(W, (sec / Math.max(stepSec, 1e-6)) * PITCH);
  const axIn = fadePx(fadeIn);
  const axOut = W - fadePx(fadeOut);

  const applyDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const i = drag.current;
    if (i === null || !points[i]) return;
    const { x, y } = local(e);
    const free = e.shiftKey;
    // края не дают точке вылезти и слиться с соседями по t; на снапе
    // соседние границы и так в шаге друг от друга — половина шага хватает
    const lo = i > 0 ? points[i - 1].t + (free ? 0.005 : 0.5 / length) : 0;
    const hi = i < points.length - 1 ? points[i + 1].t - (free ? 0.005 : 0.5 / length) : 1;
    const t = Math.min(hi, Math.max(lo, snapT(x / W, free)));
    const v = yToV(y);
    setDragLabel({ x: t * W, y: vToY(v), text: `шаг ${(t * length).toFixed(1)}` });
    setPoints(points.map((pt, j) => (j === i ? { t, v } : pt)));
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault(); // драг не выделяет текст страницы
    if (e.button !== 0) return;
    const { x, y } = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    // 1) точка кривой рядом — тянуть её
    let nearest = -1;
    let best = HIT_PX;
    points.forEach((pt, i) => {
      const d = Math.abs(pt.t * W - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest >= 0) {
      drag.current = nearest;
      applyDrag(e);
      return;
    }
    // 2) вершина рампы фейда (цель «громкость») — тянуть длительность
    if (target === 'volume') {
      if (Math.abs(axIn - x) < HIT_PX && Math.abs(V_PAD - y) < HIT_PX * 1.5) {
        fadeDrag.current = 'in';
        return;
      }
      if (Math.abs(axOut - x) < HIT_PX && Math.abs(V_PAD - y) < HIT_PX * 1.5) {
        fadeDrag.current = 'out';
        return;
      }
    }
    if (points.length >= MAXPTS) return;
    // 3) пустое место — новая точка (снап к границе шага, Shift — свободно)
    const p = { t: snapT(x / W, e.shiftKey), v: yToV(y) };
    let at = points.findIndex((pt) => pt.t > p.t);
    if (at < 0) at = points.length;
    setDragLabel({ x: p.t * W, y: vToY(p.v), text: `шаг ${(p.t * length).toFixed(1)}` });
    setPoints([...points.slice(0, at), p, ...points.slice(at)]);
    drag.current = at;
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (fadeDrag.current) {
      const { x } = local(e);
      const px = fadeDrag.current === 'in' ? x : W - x;
      onFade(fadeDrag.current, Math.min(8, Math.max(0, (px / PITCH) * stepSec)));
      return;
    }
    if (drag.current !== null) applyDrag(e);
  };

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    fadeDrag.current = null;
    setDragLabel(null);
  };

  const removeAt = (i: number) => {
    if (points.length <= 2) {
      setPending(null);
      onCurves(curves.filter((c) => c.target !== target));
      return;
    }
    setPoints(points.filter((_, j) => j !== i));
  };

  const yTop = Y_LABELS[target][0];
  const yBot = Y_LABELS[target][1];
  const line = points.map((p) => `${(p.t * W).toFixed(1)},${vToY(p.v).toFixed(1)}`).join(' ');

  // Вклад модуляций на эту цель: штриховые полилинии (по одной на
  // модуляцию). Фаза условна — живой LFO идёт своим ходом от старта
  // пьесы, здесь видна форма и размах качания по длине цикла.
  const modLines = mods
    .map((m, i) => ({ m, seed: i }))
    .filter(({ m }) => m.target === target && m.depth > 0.001)
    .map(({ m, seed }) => {
      const N = 96;
      const cycleSec = stepSec * length;
      const pts = Array.from({ length: N + 1 }, (_, k) => {
        const t = k / N;
        const v = Math.min(
          1.22,
          Math.max(0, modCurveValue(m, target, t * cycleSec, base, seed)),
        );
        return `${(t * W).toFixed(1)},${vToY(v).toFixed(1)}`;
      }).join(' ');
      return (
        <polyline
          key={`mod-${seed}-${m.target}`}
          points={pts}
          className="lane-mod"
          vectorEffect="non-scaling-stroke"
        >
          <title>
            {`Вклад модуляции (${MOD_SOURCE_TITLE[m.source ?? 'lfo']}, ${m.rate.toFixed(2)} Гц, глубина ${Math.round(m.depth * 100)}%) — живой генератор идёт своим ходом, показана форма качания. «→ в кривую» в списке модуляций запечёт её точками`}
          </title>
        </polyline>
      );
    });

  return (
    <svg
      className="auto-lane"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => {
        e.preventDefault();
        const { x } = local(e);
        let nearest = -1;
        let best = HIT_PX;
        points.forEach((pt, i) => {
          const d = Math.abs(pt.t * W - x);
          if (d < best) {
            best = d;
            nearest = i;
          }
        });
        if (nearest >= 0) removeAt(nearest);
      }}
    >
      <title>
        {`Кривая «${AUTO_TARGET_LABELS[target]}» по шагам: клик — точка на границе шага (Shift — свободно), тяни — двигай, правый клик — убрать`}
      </title>
      {/* сетка — границы шагов, те же, что столбцы стана */}
      {Array.from({ length: length - 1 }, (_, k) => k + 1).map((k) => (
        <line key={k} x1={(k / length) * W} y1={V_PAD} x2={(k / length) * W} y2={yb} className="env-grid" />
      ))}
      <line x1={0} y1={yb} x2={W} y2={yb} className="env-axis" />
      <text x={2} y={V_PAD + 8} className="env-text dim">{yTop}</text>
      <text x={2} y={yb - 2} className="env-text dim">{yBot}</text>
      {target === 'pan' && (
        <line x1={0} y1={vToY(0.5)} x2={W} y2={vToY(0.5)} className="env-grid mid" />
      )}
      {activeStep >= 0 && activeStep < length && (
        <line
          x1={(activeStep / length) * W}
          y1={V_PAD}
          x2={(activeStep / length) * W}
          y2={yb}
          className="lane-ph"
        />
      )}
      {points.length < 2 && (
        <text x={W / 2} y={(V_PAD + yb) / 2 + 3} textAnchor="middle" className="env-text dim">
          пусто — клик поставит точку на границе шага, параметр держится на ручке
        </text>
      )}
      {points.length >= 2 && <polyline points={line} className="env-amp" />}
      {/* вклад модуляций — штрихом, поверх своей кривой */}
      {modLines}
      {modLines.length > 0 && (
        <text x={W - 4} y={V_PAD + 8} textAnchor="end" className="env-text dim">
          – – модуляции
        </text>
      )}
      {/* рампы входа/выхода сцены — только на громкости: во время рампы
          кривая молчит (движок отдаёт gain плану перехода) */}
      {target === 'volume' && (
        <>
          <polygon points={`0,${yb} ${axIn},${V_PAD} ${axIn},${yb}`} className="lane-fade" />
          <line x1={0} y1={yb} x2={axIn} y2={V_PAD} className="lane-fade-edge" />
          <circle cx={axIn} cy={V_PAD} r={4} className="lane-fade-handle" data-ob="fade-in">
            <title>Вход в сцену: потяни вершину — длительность ({Math.round(fadeIn * 1000)} мс)</title>
          </circle>
          <text x={axIn + 5} y={V_PAD + 3} className="env-text dim">{Math.round(fadeIn * 1000)} мс</text>
          <polygon points={`${W},${yb} ${axOut},${V_PAD} ${axOut},${yb}`} className="lane-fade" />
          <line x1={W} y1={yb} x2={axOut} y2={V_PAD} className="lane-fade-edge" />
          <circle cx={axOut} cy={V_PAD} r={4} className="lane-fade-handle" data-ob="fade-out">
            <title>Выход из сцены: потяни вершину — длительность ({Math.round(fadeOut * 1000)} мс)</title>
          </circle>
          <text x={axOut - 5} y={V_PAD + 3} textAnchor="end" className="env-text dim">
            {Math.round(fadeOut * 1000)} мс
          </text>
        </>
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p.t * W} cy={vToY(p.v)} r={3.5} className="env-handle" />
      ))}
      {dragLabel && (
        <text x={Math.min(dragLabel.x + 6, W - 30)} y={Math.max(dragLabel.y - 8, 10)} className="env-text strong">
          {dragLabel.text}
        </text>
      )}
    </svg>
  );
}
