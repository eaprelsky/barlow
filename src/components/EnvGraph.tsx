import { t as msg, useLocale, pluralCategory } from '../i18n';
// Форма ноты одним графиком: громкость (атака-плато-спад) и падение тона
// на общей оси времени. Ширина графика = длина ноты — она подписана
// размерной линией со стрелками, как на чертеже. Математика та же, что
// в triggerVoice: длина — сетка (noteSteps × шаг эскиза) или огибающая;
// падение — экспонента в лог-домене на фиксированной оси ×1…×16.
// Ручки на изломах тянутся горизонтально, кривая тона — по двум осям
// (курсоры подсказывают, за что хватился).

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface NoteGraphProps {
  attack: number;
  decay: number;
  sustain: number; // доля плато (0..1) звуковой части после атаки
  pitchDrop: number;
  pitchTime: number;
  // Полная длина ноты, с — как её посчитает triggerVoice (без гейта).
  voiceLen: number;
  // Длительность шага эскиза, с — вертикали сетки; null — без сетки.
  stepSec: number | null;
  // Длина ноты в шагах (нота по сетке); null — «авто» по огибающей.
  steps: number | null;
  // Ручки на изломах: драг меняет атаку/плато/спад. decayEditable —
  // длина ноты свободная (без сетки), спадом можно тянуть хвост.
  onEdit?: (upd: { attack?: number; sustain?: number; decay?: number }) => void;
  onPitch?: (upd: { pitchDrop: number; pitchTime: number }) => void;
  decayEditable?: boolean;
}

const W = 560;
const H = 134;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 104; // низ графика: тишина = ×1 тона
const DIM_Y = 124; // размерная линия длины ноты

/** «1 шаг», «2 шага», «5 шагов», дробное — «1.5 шага». */
function stepsLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const category = pluralCategory(rounded);
  return msg(category === 'one' ? 'envGraph.step' : category === 'few' ? 'envGraph.steps2' : category === 'many' ? 'envGraph.steps' : 'envGraph.steps4', {p0: rounded});
}

const DROPS = [2, 4, 8, 16];
const PITCH_MAX = 16;

export function NoteGraph({
  attack,
  decay,
  sustain,
  pitchDrop,
  pitchTime,
  voiceLen,
  stepSec,
  steps,
  onEdit,
  onPitch,
  decayEditable,
}: NoteGraphProps) {
  useLocale();
  const ref = useRef<SVGSVGElement | null>(null);
  const drag = useRef<'a' | 's' | 'd' | 'pitch' | null>(null);
  const attackClamped = Math.max(attack, 0.0005);
  const total = Math.max(voiceLen, attackClamped + 0.02) * 1.04;
  const x = (t: number) => (t / total) * W;
  const sus = Math.min(1, Math.max(0, sustain));
  // Та же форма, что в triggerVoice: атака → плато (sus доли звуковой
  // части) → экспоненциальный спад к концу ноты.
  const holdEnd = attackClamped + (voiceLen - attackClamped) * sus;
  const amp = (t: number): number => {
    if (t <= attackClamped) return t / attackClamped;
    if (t <= holdEnd) return 1;
    const tail = Math.max(0.005, voiceLen - holdEnd);
    const fall = Math.min(Math.max(decay, 0.01), tail);
    return Math.max(0.0001, Math.exp(-4 * ((t - holdEnd) / fall)));
  };
  const yAmp = (a: number) => PLOT_BOTTOM - a * (PLOT_BOTTOM - PLOT_TOP);
  // Тон: фиксированная лог-ось ×1…×16, чтобы сетка октав не ездила.
  const yPitch = (r: number) =>
    PLOT_BOTTOM - (Math.log(Math.max(r, 1)) / Math.log(PITCH_MAX)) * (PLOT_BOTTOM - PLOT_TOP);

  const ampPts: string[] = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * total;
    ampPts.push(`${x(t).toFixed(1)},${yAmp(amp(t)).toFixed(1)}`);
  }

  // Кривая падения тона (и её «путь» для прозрачной зоны схвата).
  const hasPitch = pitchDrop > 1 && pitchTime > 0;
  const span = Math.max(Math.min(pitchTime, total), 0.001);
  const pitchPts: string[] = [];
  const NP = 48;
  for (let i = 0; i <= NP; i++) {
    const t = (i / NP) * span;
    const r = pitchDrop * Math.pow(1 / pitchDrop, t / pitchTime);
    pitchPts.push(`${x(t).toFixed(1)},${yPitch(r).toFixed(1)}`);
  }
  const pitchPath = pitchPts.join(' ');

  // Сетка шагов эскиза: каждая; если плотно (>20 линий) — через 4.
  const lines: number[] = [];
  if (stepSec && stepSec > 0) {
    let step = stepSec;
    if (voiceLen / step > 20) step *= 4;
    for (let t = step; t < total - 0.001; t += step) lines.push(t);
  }

  // Подпись размерной линии — как на чертеже: длина ноты целиком.
  const dimLabel =
    steps !== null
      ? msg("envGraph.s", {p0: stepsLabel(steps), p1: voiceLen.toFixed(2)})
      : msg("envGraph.noteS", {p0: voiceLen.toFixed(2)});

  // ---- Драг: ручки по горизонтали, тон — по двум осям ----
  const xToT = (clientX: number): number => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * total;
  };
  const applyDrag = (clientX: number) => {
    if (!onEdit || !drag.current || drag.current === 'pitch') return;
    const t = Math.max(0, xToT(clientX));
    if (drag.current === 'a') {
      onEdit({ attack: +Math.min(0.5, Math.max(0.0005, t)).toFixed(4) });
    } else if (drag.current === 's') {
      const frac = (t - attackClamped) / Math.max(0.001, voiceLen - attackClamped);
      onEdit({ sustain: +Math.min(1, Math.max(0, frac)).toFixed(3) });
    } else if (drag.current === 'd' && decayEditable) {
      onEdit({ decay: +Math.min(4, Math.max(0.01, t - attackClamped)).toFixed(3) });
    }
  };
  const applyPitch = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el || !onPitch) return;
    const r = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    // Экранная высота → ось ×1…×16 (лог): низ графика = ×1 (выключено).
    const py = ((clientY - r.top) / r.height) * H;
    const rel = Math.min(1, Math.max(0, py - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP));
    const drop = Math.max(1, Math.round(Math.pow(PITCH_MAX, 1 - rel) * 10) / 10);
    const time = Math.min(Math.max(fx * total, 0.01), Math.max(total, 0.01));
    onPitch({ pitchDrop: drop, pitchTime: +time.toFixed(3) });
  };
  const handleYs = { a: PLOT_TOP + 2, s: PLOT_TOP + 11, d: PLOT_BOTTOM - 6 };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault(); // никакой синей выделенности подписей при драге
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = ((e.clientY - r.top) / r.height) * H;
    // 1) Ручки огибающей: по горизонтали ±12px и по вертикали ±14px.
    if (onEdit) {
      const cands: { id: 'a' | 's' | 'd'; t: number; on: boolean }[] = [
        { id: 'a', t: attackClamped, on: true },
        { id: 's', t: holdEnd, on: true },
        { id: 'd', t: voiceLen, on: !!decayEditable },
      ];
      let best: 'a' | 's' | 'd' | null = null;
      let bestD = Infinity;
      for (const c of cands) {
        if (!c.on) continue;
        const d = Math.abs(px - x(c.t) * (r.width / W)) + Math.abs(py - handleYs[c.id]) * 0.6;
        if (Math.abs(px - x(c.t) * (r.width / W)) < 12 && d < bestD) {
          best = c.id;
          bestD = d;
        }
      }
      if (best) {
        drag.current = best;
        e.currentTarget.setPointerCapture(e.pointerId);
        applyDrag(e.clientX);
        return;
      }
    }
    // 2) Тон: сам элемент-хит (кривая или пунктир ×1) решает по курсору.
    if (onPitch && (e.target as Element)?.classList?.contains('pitch-hit')) {
      drag.current = 'pitch';
      e.currentTarget.setPointerCapture(e.pointerId);
      applyPitch(e.clientX, e.clientY);
    }
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    if (drag.current === 'pitch') applyPitch(e.clientX, e.clientY);
    else applyDrag(e.clientX);
  };
  const up = () => {
    drag.current = null;
  };

  // Ширины сегментов в px — короткие не подписываем, чтобы не слипались.
  const wA = x(attackClamped);
  const wS = x(holdEnd) - wA;
  const wD = x(voiceLen) - x(holdEnd);
  const dimX0 = 3;
  const dimX1 = x(voiceLen);

  return (
    <svg
      className={'env-graph note-graph' + (onEdit ? ' editable' : '')}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <title>
        {msg("envGraph.noteAttackMsHoldDecaySDrag", {p0: (attackClamped * 1000).toFixed(0), p1: Math.round(sus * 100), p2: decay.toFixed(2), p3: hasPitch ? msg("envGraph.pitchDropOverMs", {p0: pitchDrop, p1: (pitchTime * 1000).toFixed(0)}) : ''})}
      </title>
      {lines.map((t, i) => (
        <line key={i} x1={x(t)} y1={PLOT_TOP - 8} x2={x(t)} y2={PLOT_BOTTOM} className="env-grid" />
      ))}
      {/* ось тона: октавы ×2…×16 */}
      {DROPS.map((o) => (
        <line key={o} x1={0} y1={yPitch(o)} x2={W} y2={yPitch(o)} className="env-grid oct" />
      ))}
      {DROPS.map((o) => (
        <text key={o} x={W - 4} y={yPitch(o) - 3} textAnchor="end" className="env-text dim">
          {`×${o}`}
        </text>
      ))}
      {/* ось громкости: 0 и 1 слева */}
      <text x={3} y={PLOT_TOP + 2} className="env-text dim">1</text>
      <text x={3} y={PLOT_BOTTOM - 3} className="env-text dim">0</text>
      <line x1={0} y1={PLOT_BOTTOM} x2={W} y2={PLOT_BOTTOM} className="env-axis" />
      {/* тон: кривая падения; выключен — пунктир ×1, который можно снять вверх */}
      {hasPitch && (
        <>
          <polyline points={pitchPath} className="env-pitch" />
          {x(span) < x(total) && (
            <line x1={x(span)} y1={yPitch(1)} x2={x(total)} y2={yPitch(1)} className="env-pitch" />
          )}
          <text
            x={Math.min(x(span) + 6, W - 96)}
            y={Math.max(yPitch(pitchDrop) - 6, 12)}
            className="env-text strong"
          >
            {msg("envGraph.ms", {p0: pitchDrop, p1: (pitchTime * 1000).toFixed(0)})}
          </text>
        </>
      )}
      <path
        d={hasPitch ? `M ${pitchPath.replace(/ /g, ' L ')}` : `M 0 ${yPitch(1)} L ${W} ${yPitch(1)}`}
        className="pitch-hit"
      />
      {!hasPitch && (
        <text x={W / 2} y={yPitch(1) - 26} textAnchor="middle" className="env-text dim">
          {msg("envGraph.pitchDropOffDragTheDashedLine")}</text>
      )}
      {/* громкость поверх тона: сплошная кривая и ручки изломов */}
      <polyline points={ampPts.join(' ')} className="env-amp" />
      <line x1={x(voiceLen)} y1={PLOT_TOP - 8} x2={x(voiceLen)} y2={PLOT_BOTTOM} className="env-note-end" />
      {/* сегменты прямо на кривой: атака / плато / спад со значениями */}
      <text x={18} y={12} className="env-text">
        {msg("envGraph.aMs", {p0: (attackClamped * 1000).toFixed(0)})}
      </text>
      {sus > 0.005 && wS > 26 && (
        <text x={(wA + wA + wS) / 2} y={12} textAnchor="middle" className="env-text">
          {msg("envGraph.hold", {p0: Math.round(sus * 100)})}
        </text>
      )}
      {wD > 56 && (
        <text
          x={(x(holdEnd) + x(voiceLen)) / 2}
          y={Math.min(PLOT_BOTTOM - 22, yAmp(amp(holdEnd + (voiceLen - holdEnd) * 0.3)) + 8)}
          textAnchor="middle"
          className="env-text"
        >
          {msg("envGraph.decayS", {p0: decay.toFixed(2)})}
        </text>
      )}
      {onEdit && (
        <g className="env-handles">
          <circle cx={x(attackClamped)} cy={handleYs.a} r={3.5} className="env-handle" />
          <circle cx={x(holdEnd)} cy={handleYs.s} r={3.5} className="env-handle" />
          {decayEditable && (
            <circle cx={x(voiceLen)} cy={handleYs.d} r={3.5} className="env-handle" />
          )}
        </g>
      )}
      {/* размерная линия длины ноты: риски, стрелки, цифра над линией */}
      <g className="env-dim">
        <line x1={dimX0} y1={DIM_Y - 8} x2={dimX0} y2={DIM_Y + 2} className="env-dim-line" />
        <line x1={dimX1} y1={DIM_Y - 8} x2={dimX1} y2={DIM_Y + 2} className="env-dim-line" />
        <line x1={dimX0} y1={DIM_Y - 3} x2={dimX1} y2={DIM_Y - 3} className="env-dim-line" />
        <path d={`M ${dimX0 + 6} ${DIM_Y - 6} L ${dimX0} ${DIM_Y - 3} L ${dimX0 + 6} ${DIM_Y}`} className="env-dim-line" />
        <path d={`M ${dimX1 - 6} ${DIM_Y - 6} L ${dimX1} ${DIM_Y - 3} L ${dimX1 - 6} ${DIM_Y}`} className="env-dim-line" />
        <text x={(dimX0 + dimX1) / 2} y={DIM_Y - 7} textAnchor="middle" className="env-text strong">
          {dimLabel}
        </text>
      </g>
    </svg>
  );
}
