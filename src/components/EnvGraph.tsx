// Визуализации ноты: амплитуда (атака-плато-спад) и падение тона.
// Математика та же, что в triggerVoice: длина ноты — сетка (noteSteps ×
// шаг эскиза) или огибающая; падение — экспонента в лог-домене.
// Разметка (шаги сетки, длительность, множитель тона) — прямо на графике,
// отдельного текста читать не надо. График тона интерактивный: тяни —
// меняются падение и его время.

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface EnvProps {
  attack: number;
  decay: number;
  sustain: number; // доля плато (0..1) звуковой части после атаки
  // Полная длина ноты, с — как её посчитает triggerVoice (без гейта).
  voiceLen: number;
  // Длительность шага эскиза, с — вертикали сетки; null — без сетки.
  stepSec: number | null;
  // Длина ноты в шагах (нота по сетке); null — «авто» по огибающей.
  steps: number | null;
  // Ручки на изломах: драг меняет атаку/плато/спад. decayEditable —
  // длина ноты свободная (без сетки), спадом можно тянуть хвост.
  onEdit?: (upd: { attack?: number; sustain?: number; decay?: number }) => void;
  decayEditable?: boolean;
}

interface PitchProps {
  pitchDrop: number;
  pitchTime: number;
  // Длина ноты, с — падение не бывает длиннее.
  total: number;
  onChange?: (upd: { pitchDrop: number; pitchTime: number }) => void;
}

const W = 280;
const H = 84;

/** «1 шаг», «2 шага», «5 шагов», дробное — «1.5 шага». */
function stepsLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Number.isInteger(rounded)) {
    const mod100 = Math.abs(rounded) % 100;
    const mod10 = mod100 % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${rounded} шагов`;
    if (mod10 === 1) return `${rounded} шаг`;
    if (mod10 >= 2 && mod10 <= 4) return `${rounded} шага`;
    return `${rounded} шагов`;
  }
  return `${rounded} шага`;
}

export function EnvGraph({
  attack,
  decay,
  sustain,
  voiceLen,
  stepSec,
  steps,
  onEdit,
  decayEditable,
}: EnvProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const drag = useRef<'a' | 's' | 'd' | null>(null);
  const attackClamped = Math.max(attack, 0.0005);
  const total = Math.max(voiceLen, attackClamped + 0.02) * 1.04;
  const x = (t: number) => (t / total) * W;
  const sus = Math.min(1, Math.max(0, sustain));
  // Та же форма, что в triggerVoice: атака → плато (sus доли звуковой
  // части) → экспоненциальный спад к концу ноты.
  const holdEnd = attackClamped + (voiceLen - attackClamped) * sus;
  // Спад как в triggerVoice: экспонента за decay секунд от конца
  // плато (короче — догорает и держит тишину до конца ноты).
  const amp = (t: number): number => {
    if (t <= attackClamped) return t / attackClamped;
    if (t <= holdEnd) return 1;
    const tail = Math.max(0.005, voiceLen - holdEnd);
    const fall = Math.min(Math.max(decay, 0.01), tail);
    const v = Math.exp(-4 * ((t - holdEnd) / fall));
    return Math.max(0.0001, v);
  };
  const pts: string[] = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * total;
    pts.push(`${x(t).toFixed(1)},${(H - 6 - amp(t) * (H - 22)).toFixed(1)}`);
  }

  // Сетка шагов эскиза: каждая; если плотно (>20 линий) — через 4.
  const lines: number[] = [];
  if (stepSec && stepSec > 0) {
    let step = stepSec;
    if (voiceLen / step > 20) step *= 4;
    for (let t = step; t < total - 0.001; t += step) lines.push(t);
  }

  // Подпись ноты — в правом верхнем углу; слева — подписи сегментов ADSR.
  const cap =
    steps !== null
      ? `${stepsLabel(steps)} ≈ ${voiceLen.toFixed(2)} с`
      : `≈ ${voiceLen.toFixed(2)} с`;
  // Ширины сегментов в px — короткие не подписываем, чтобы не слипались.
  const wA = x(attackClamped);
  const wS = x(holdEnd) - wA;
  const wD = x(voiceLen) - x(holdEnd);

  // ---- Ручки на изломах: горизонтальный драг меняет параметр ----
  const xToT = (clientX: number): number => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * total;
  };
  const applyDrag = (clientX: number) => {
    if (!onEdit || !drag.current) return;
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
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onEdit) return;
    // Ближайшая ручка по горизонтали (в px), порог схвата ~12px.
    const el = ref.current;
    if (!el) return;
    const pxPerT = el.getBoundingClientRect().width / total;
    const cands: { id: 'a' | 's' | 'd'; t: number; on: boolean }[] = [
      { id: 'a', t: attackClamped, on: true },
      { id: 's', t: holdEnd, on: true },
      { id: 'd', t: voiceLen, on: !!decayEditable },
    ];
    let best: { id: 'a' | 's' | 'd' } | null = null;
    let bestD = Infinity;
    for (const c of cands) {
      if (!c.on) continue;
      const d = Math.abs(xToT(e.clientX) - c.t) * pxPerT;
      if (d < 12 && d < bestD) {
        best = { id: c.id };
        bestD = d;
      }
    }
    if (!best) return;
    drag.current = best.id;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyDrag(e.clientX);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current) applyDrag(e.clientX);
  };
  const up = () => {
    drag.current = null;
  };
  const yTop = 16;
  const yEnd = H - 6;

  return (
    <svg
      className={'env-graph' + (onEdit ? ' editable' : '')}
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
        {onEdit
          ? 'Тяни ручки: атака — левый верх, плато — конец полки, спад — правый нижний (конец ноты)'
          : `нота ${cap}, атака ${(attackClamped * 1000).toFixed(0)} мс, плато ${Math.round(sus * 100)}%, спад ${decay.toFixed(2)} с`}
      </title>
      {lines.map((t, i) => (
        <line key={i} x1={x(t)} y1={4} x2={x(t)} y2={H - 6} className="env-grid" />
      ))}
      <line x1={0} y1={H - 6} x2={W} y2={H - 6} className="env-axis" />
      {/* конец ноты: огибающая доигрывает здесь */}
      <line x1={x(voiceLen)} y1={4} x2={x(voiceLen)} y2={H - 6} className="env-note-end" />
      <polyline points={pts.join(' ')} className="env-amp" />
      <text x={W - 5} y={14} textAnchor="end" className="env-text">{cap}</text>
      {/* сегменты прямо на кривой: атака / плато / спад со значениями */}
      <text x={5} y={14} className="env-text">
        {`A ${(attackClamped * 1000).toFixed(0)} мс`}
      </text>
      {sus > 0.005 && wS > 26 && (
        <text x={(wA + wA + wS) / 2} y={14} textAnchor="middle" className="env-text">
          {`плато ${Math.round(sus * 100)}%`}
        </text>
      )}
      {wD > 56 && (
        <text
          x={(x(holdEnd) + x(voiceLen)) / 2}
          y={Math.min(H - 22, amp(holdEnd + (voiceLen - holdEnd) * 0.3) * (H - 22) + 8)}
          textAnchor="middle"
          className="env-text"
        >
          {`спад ${decay.toFixed(2)} с`}
        </text>
      )}
      {onEdit && (
        <g className="env-handles">
          <circle cx={x(attackClamped)} cy={yTop} r={3.5} className="env-handle" />
          <circle cx={x(holdEnd)} cy={yTop + 9} r={3.5} className="env-handle" />
          {decayEditable && (
            <circle cx={x(voiceLen)} cy={yEnd - 5} r={3.5} className="env-handle" />
          )}
        </g>
      )}
    </svg>
  );
}

const DROPS = [2, 4, 8, 16];

export function PitchGraph({ pitchDrop, pitchTime, total, onChange }: PitchProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const apply = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el || !onChange) return;
    const r = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    // Низ графика = ×1 (выключено), верх = ×16, лог-шкала по октавам.
    const drop = Math.max(1, Math.round(Math.pow(2, (1 - fy) * 4) * 10) / 10);
    const time = Math.min(Math.max(fx * total, 0.01), Math.max(total, 0.01));
    onChange({ pitchDrop: drop, pitchTime: +time.toFixed(3) });
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onChange) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(e.clientX, e.clientY);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging.current) apply(e.clientX, e.clientY);
  };
  const up = () => {
    dragging.current = false;
  };

  const hasPitch = pitchDrop > 1 && pitchTime > 0;
  const span = Math.max(Math.min(pitchTime, total), 0.001);
  const x = (t: number) => (t / total) * W;
  // Экспоненциальная рампа частоты — линейна в лог-домене.
  const y = (r: number) => {
    const k = Math.log(Math.max(r, 1)) / Math.log(Math.max(pitchDrop, 1.0001));
    return H - 10 - k * (H - 24);
  };
  const yOct = (o: number) => {
    const k = Math.log(o) / Math.log(Math.max(pitchDrop, 1.0001));
    return H - 10 - k * (H - 24);
  };
  const pts: string[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * span;
    const r = pitchDrop * Math.pow(1 / pitchDrop, t / pitchTime);
    pts.push(`${x(t).toFixed(1)},${y(r).toFixed(1)}`);
  }
  const endX = x(span);
  const totalX = x(total);

  return (
    <svg
      className={'env-graph pitch-graph' + (onChange ? ' editable' : '')}
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
        {hasPitch
          ? `тон ×${pitchDrop} → ×1 за ${(pitchTime * 1000).toFixed(0)} мс. Тяни график: вверх-вниз — глубина падения, влево-вправо — время`
          : 'Падение тона выключено. Потяни график вверх — нота стартует выше и слетает вниз (бочка: «вумп»)'}
      </title>
      {/* октавные уровни — с чем сравнивать падение */}
      {DROPS.filter((o) => pitchDrop >= o && hasPitch).map((o) => (
        <line key={o} x1={0} y1={yOct(o)} x2={W} y2={yOct(o)} className="env-grid" />
      ))}
      <line x1={0} y1={y(1)} x2={W} y2={y(1)} className="env-axis" />
      <text x={4} y={Math.max(y(1) - 4, 12)} className="env-text">×1</text>
      {hasPitch && <polyline points={pts.join(' ')} className="env-pitch" />}
      {hasPitch && endX < totalX && (
        <line x1={endX} y1={y(1)} x2={totalX} y2={y(1)} className="env-pitch" />
      )}
      {hasPitch && (
        <>
          <text x={4} y={Math.min(yOct(DROPS[0]) + 12, H - 4)} className="env-text">×2</text>
          <text
            x={Math.min(endX + 4, W - 58)}
            y={Math.max(y(pitchDrop) - 5, 12)}
            className="env-text strong"
          >
            {`×${pitchDrop} · ${(pitchTime * 1000).toFixed(0)} мс`}
          </text>
        </>
      )}
      {!hasPitch && (
        <text x={W / 2} y={H / 2} textAnchor="middle" className="env-text dim">
          тяни вверх — включишь падение
        </text>
      )}
    </svg>
  );
}
