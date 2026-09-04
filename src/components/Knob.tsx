// Крутилка-регулятор: дуга значения + круговые риски, вертикальный драг
// (Shift — мелкий шаг), колесо, двойной клик — точное число (тот же
// NumField под капотом: прикол с численной установкой сохраняется).
// Биполярный режим (детюн, пан) рисует дугу от центра. Фильтры — лог:
// позиция крутилки равномерна по слуху, не по герцам.

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { NumField } from './NumField';

interface Props {
  value: number;
  min: number;
  max: number;
  /** Шаг колеса/драга-клика; драг непрерывен по позиции. */
  step?: number;
  /** Подпись под крутилкой. */
  label?: string;
  title?: string;
  /** Дуга от центра (значения бывают меньше нуля логически: пан, детюн). */
  bipolar?: boolean;
  /** Логарифмическая шкала (частоты фильтров). */
  log?: boolean;
  size?: number;
  onChange: (v: number) => void;
}

const DRAG_PX = 140; // пикселей на весь диапазон

// Угол позиции p (0..1): от 135° до 405° (270° сектор, разрыв внизу).
const ang = (p: number) => 135 + p * 270;
const pt = (p: number, r: number, c: number) => {
  const a = (ang(p) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
};

function arc(p0: number, p1: number, r: number, c: number): string {
  const [x0, y0] = pt(p0, r, c);
  const [x1, y1] = pt(p1, r, c);
  const large = Math.abs(ang(p1) - ang(p0)) > 180 ? 1 : 0;
  const sweep = p1 > p0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function Knob({
  value,
  min,
  max,
  step = 1,
  label,
  title,
  bipolar,
  log,
  size = 34,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const drag = useRef<{ y0: number; p0: number } | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const toPos = (v: number) => {
    const p = log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
    return Math.min(1, Math.max(0, p));
  };
  const ofPos = (p: number) => {
    const v = log ? min * Math.pow(max / min, p) : min + p * (max - min);
    return clamp(Math.round(v / step) * step);
  };
  const snap = (v: number) => Number(clamp(v).toFixed(4));

  const pos = toPos(value);
  // Биполяр: дуга идёт от центрального значения (не от нуля позиции).
  const zeroP = toPos(bipolar ? (min > 0 ? min : 0) : min);
  const from = bipolar ? zeroP : 0;
  const c = size / 2;
  const r = c - 3.5;
  const [px, py] = pt(pos, r - 2.5, c);

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, p0: pos };
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const speed = e.shiftKey ? DRAG_PX * 4 : DRAG_PX;
    onChange(snap(ofPos(Math.min(1, Math.max(0, d.p0 + (d.y0 - e.clientY) / speed)))));
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  if (editing) {
    return (
      <span className="knob-wrap" title={title}>
        <NumField
          value={Number(value.toFixed(4))}
          min={min}
          max={max}
          step={step}
          w={54}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          onChange={(v) => onChange(snap(v))}
        />
        {label && <span className="knob-label">{label}</span>}
      </span>
    );
  }

  return (
    <span className="knob-wrap" title={title}>
      <svg
        className="knob"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => setEditing(true)}
      >
        {/* шкала-риски */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const [x1, y1] = pt(t, r, c);
          const [x2, y2] = pt(t, r - 2.5, c);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} className="knob-tick" />;
        })}
        {/* дорожка и дуга значения */}
        <path d={arc(0, 1, r, c)} className="knob-track" fill="none" />
        {pos > from + 0.001 && <path d={arc(from, pos, r, c)} className="knob-arc" fill="none" />}
        {pos < from - 0.001 && <path d={arc(pos, from, r, c)} className="knob-arc" fill="none" />}
        <line x1={c} y1={c} x2={px} y2={py} className="knob-pointer" />
      </svg>
      <span className="knob-value">{String(Math.round(value * 100) / 100)}</span>
      {label && <span className="knob-label">{label}</span>}
    </span>
  );
}
