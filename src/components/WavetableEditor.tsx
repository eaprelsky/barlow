import { useRef, useState, type PointerEvent } from 'react';
import { tableFrame, type Wavetable } from '../music/wavetable';
import { NumField } from './NumField';
import { useEditGesture } from './editGesture';

export function WavetableEditor({ value, onChange }: { value: Wavetable; onChange: (value: Wavetable) => void }) {
  const [selected, select] = useState(0), drag = useRef(false), gesture = useEditGesture();
  const last = useRef<{ n: number; v: number } | null>(null);
  const index = Math.min(selected, value.frames.length - 1);
  const replace = (frame: number[]) => onChange({ ...value, frames: value.frames.map((f, i) => i === index ? frame : f) });
  const draw = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), n = Math.max(0, Math.min(127, Math.round((e.clientX - r.left) / r.width * 127))), v = Math.max(-1, Math.min(1, 1 - (e.clientY - r.top) / r.height * 2));
    const frame = [...value.frames[index]], previous = last.current;
    if (previous && previous.n !== n) for (let k = Math.min(previous.n, n); k <= Math.max(previous.n, n); k++) frame[k] = previous.v + (v - previous.v) * (k - previous.n) / (n - previous.n);
    frame[n] = v; last.current = { n, v }; replace(frame);
  };
  return <div className="wavetable-editor" data-ob="wavetable">
    <div className="mseg-toolbar">
      <label>кадр <select aria-label="Кадр wavetable" value={index} onChange={e => select(+e.target.value)}>{value.frames.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
      <select aria-label="Форма кадра" value="" onChange={e => replace(tableFrame(e.target.value as 'sine'))}><option value="" disabled>форма кадра…</option><option value="sine">синус</option><option value="triangle">треугольник</option><option value="saw">пила</option><option value="pulse">импульс</option></select>
      <button disabled={value.frames.length >= 8} onClick={() => { onChange({ ...value, frames: [...value.frames, [...value.frames[index]]] }); select(value.frames.length); }}>+ копия кадра</button>
      <button disabled={value.frames.length <= 2} onClick={() => { onChange({ ...value, frames: value.frames.filter((_, i) => i !== index) }); select(Math.max(0, index - 1)); }}>удалить кадр</button>
    </div>
    <svg viewBox="0 0 560 120" preserveAspectRatio="none" className="mseg-graph" aria-label="Рисование кадра wavetable" tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); drag.current = false; last.current = null; gesture.cancel(); } }}
      onPointerDown={e => { drag.current = true; last.current = null; gesture.begin(); e.currentTarget.setPointerCapture(e.pointerId); draw(e); }}
      onPointerMove={e => { if (drag.current) draw(e); }}
      onPointerUp={() => { drag.current = false; gesture.commit(); }} onPointerCancel={() => { drag.current = false; gesture.cancel(); }}>
      <line x1="0" x2="560" y1="60" y2="60" className="mseg-grid" />
      {value.frames.map((frame, i) => <polyline key={i} points={frame.map((v, n) => `${n / 127 * 560},${60 - v * 55}`).join(' ')} fill="none" stroke={i === index ? 'var(--accent)' : 'var(--border)'} strokeWidth={i === index ? 2 : 1} />)}
    </svg>
    <div className="mseg-toolbar">
      <label>начало, % <NumField ariaLabel="Позиция wavetable, %" value={value.position * 100} min={0} max={100} step={1} onChange={v => onChange({ ...value, position: v / 100 })} /></label>
      <label>проход, % <NumField ariaLabel="Проход wavetable, %" value={value.sweep * 100} min={-100} max={100} step={1} onChange={v => onChange({ ...value, sweep: v / 100 })} /></label>
      <span>0 — статичный тембр · +100 — до последнего кадра за ноту</span>
    </div>
    <span className="sub-cap">Рисуй выбранный кадр мышью или выбери форму. Кадры смешиваются плавно, высота ноты сохраняется.</span>
  </div>;
}
