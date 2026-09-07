import { useEffect, useRef, useState } from 'react';
import { NumField } from './NumField';

type Variant =
  // «подпись [ползунок значение]» — строка панели трека (span.inline)
  | 'inline'
  // «подпись ползунок значение» — шапка и панель шага (текст рядом)
  | 'label'
  // микшер: подпись со значением сверху, контрол на всю ширину
  | 'mix'
  // строка эффекта/модуляции: контрол + значение <i>, подписи нет
  | 'mr'
  // голый контрол (свёрнутая дорожка): класс на обёртку
  | 'bare';

interface Props {
  /** Видимая подпись; двойной клик по ней (или по значению) — точное число. */
  label?: string;
  title?: string;
  /** Значение и диапазон — в единицах поля (проценты, миллисекунды);
   *  конверсию в модель делает вызывающий. */
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Строка значения рядом с ползунком («75%», «L20», «центр»). */
  display: string;
  /** Единица в режиме ввода («%»); по умолчанию — display. */
  unit?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

// Ползунок, превращающийся по двойному клику в поле ввода и обратно —
// обобщение приёма громкости/пана трека на все ползунки приложения.
export function SliderField({
  label,
  title,
  value,
  min,
  max,
  step = 1,
  display,
  unit,
  variant = 'label',
  className,
  disabled,
  onChange,
}: Props) {
  const [field, setField] = useState(false);
  const rangeRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => { if (!field && returnFocus.current) { rangeRef.current?.focus(); returnFocus.current = false; } }, [field]);
  const toggle = () => setField((v) => !v);
  const num = (narrow: boolean) => (
    <NumField
      value={value} min={min} max={max} step={step} narrow={narrow}
      disabled={disabled} onChange={onChange}
      ariaLabel={label ?? title ?? 'значение'} autoFocus
      onBlur={() => setField(false)}
      onFocus={e => e.currentTarget.select()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') returnFocus.current = true; }}
    />
  );
  const range = (
    <input
      ref={rangeRef}
      aria-label={label ?? title ?? 'значение'}
      type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setField(true); } }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
  const trailing = field ? (unit ?? '') : display;

  if (variant === 'mr') {
    return (
      <span className="mr" title={title}>
        {field ? num(true) : range}
        <i onDoubleClick={toggle} title="Двойной клик — точное число">{trailing}</i>
      </span>
    );
  }
  if (variant === 'mix') {
    return (
      <label className="mix-ctl" title={title}>
        <span className="mc-cap" onDoubleClick={toggle} title="Двойной клик — точное число">
          {label}
          <i>{trailing}</i>
        </span>
        {field ? num(false) : range}
      </label>
    );
  }
  if (variant === 'bare') {
    return (
      <span className={className} onDoubleClick={toggle} title={title}>
        {field ? num(true) : range}
      </span>
    );
  }
  return (
    <label
      className={variant === 'inline' ? undefined : className}
      title={title}
      onDoubleClick={toggle}
    >
      {label}
      {variant === 'inline' ? (
        <span className="inline">
          {field ? num(false) : range}
          <span className="pan-label">{trailing}</span>
        </span>
      ) : (
        <>
          {field ? num(false) : range} {trailing}
        </>
      )}
    </label>
  );
}
