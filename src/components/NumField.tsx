import { useState } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  title?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

// Числовое поле с черновиком: пока печатаешь, поле показывает ровно то,
// что введено (можно стереть, оставить '-' или '.'), а в патч уходит только
// валидное число в диапазоне. Нормализация — при потере фокуса или Enter.
// Обычный контролируемый input так не умеет: value подставляется на каждый
// keystroke и поле «не даёт» себя очистить.
export function NumField({ value, min, max, step = 1, title, disabled, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const commit = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === '') return;
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
  };

  const settle = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value);
    setDraft(null);
  };

  return (
    <input
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
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
