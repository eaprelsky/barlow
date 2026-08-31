import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  title?: string;
  disabled?: boolean;
  /** «узкий» — короткие поля (длина цикла, проценты): 2–4 символа */
  narrow?: boolean;
  onChange: (v: number) => void;
}

const DRAG_PX = 4; // порог, после которого вертикальное движение — крутилка
const PX_PER_STEP = 4; // пикселей на один шаг

// Числовое поле с двумя способами ввода: печать (с черновиком — можно
// стереть, поставить '.'), нормализация при blur/Enter — и крутилка:
// потяни поле вертикально, Shift — мелкий шаг. Порог отделяет клик-в-поле
// от начала драга, поэтому набор текста не ломается.
export function NumField({ value, min, max, step = 1, title, disabled, narrow, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const drag = useRef<{ y0: number; v0: number } | null>(null);
  const shown = draft ?? String(value);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commit = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === '') return;
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
  };

  const settle = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    onChange(Number.isFinite(n) ? clamp(n) : value);
    setDraft(null);
  };

  const down = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (disabled || e.button !== 0) return;
    drag.current = { y0: e.clientY, v0: value };
  };

  const move = (e: ReactPointerEvent<HTMLInputElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;
    if (Math.abs(dy) <= DRAG_PX) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId) === false) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    const px = e.shiftKey ? PX_PER_STEP * 10 : PX_PER_STEP;
    const nv = clamp(Math.round((d.v0 + (dy / px) * step) / step) * step);
    setDraft(String(Number(nv.toFixed(4))));
    onChange(nv);
  };

  const up = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  return (
    <input
      className={narrow ? 'narrow' : undefined}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      title={title}
      disabled={disabled}
      value={shown}
      onChange={(e) => commit(e.target.value)}
      onBlur={settle}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
