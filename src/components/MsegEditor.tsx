import { useRef, useState } from 'react';
import { MSEG_LIMIT, MSEG_SHAPES, type Mseg } from '../music/mseg';
import { useEditGesture } from './editGesture';
import { NumField } from './NumField';

export function MsegEditor({ value, onChange }: { value: Mseg; onChange: (value: Mseg) => void }) {
  const [selected, select] = useState(1);
  const drag = useRef<number | null>(null);
  const gesture = useEditGesture();
  const i = Math.min(selected, value.points.length - 1), point = value.points[i];
  const interior = i > 0 && i < value.points.length - 1;
  const edit = (index: number, t: number, v: number) => {
    if (index <= 0 || index >= value.points.length - 1) return;
    const points = value.points.map(p => ({ ...p }));
    points[index] = { t: Math.max(points[index - 1].t + .001, Math.min(points[index + 1].t - .001, t)), v: Math.max(0, Math.min(1, v)) };
    onChange({ ...value, points });
  };
  const remove = () => { if (interior) { onChange({ ...value, points: value.points.filter((_, n) => n !== i) }); select(i - 1); } };
  const add = (t: number, v: number) => {
    if (value.points.length >= MSEG_LIMIT || value.points.some(p => Math.abs(p.t - t) < .001)) return;
    const points = [...value.points, { t, v }].sort((a, b) => a.t - b.t);
    select(points.findIndex(p => p.t === t)); onChange({ ...value, points });
  };
  return <div className="mseg-editor" data-ob="mseg">
    <div className="mseg-toolbar">
      <select aria-label="Форма огибающей" value="" onChange={e => { onChange({ ...value, points: structuredClone(MSEG_SHAPES[e.target.value]) }); select(1); }}>
        <option value="" disabled>готовая форма…</option>{Object.keys(MSEG_SHAPES).map(name => <option key={name}>{name}</option>)}
      </select>
      <label title="Когда длина ноты не задана на стане, используется это время">без длины ноты, с <NumField ariaLabel="Длительность MSEG, с" value={value.seconds} min={.01} max={16} step={.01} onChange={seconds => onChange({ ...value, seconds })} /></label>
      <span>{value.points.length}/{MSEG_LIMIT} точек</span>
    </div>
    <svg viewBox="0 0 560 140" preserveAspectRatio="none" className="mseg-graph" aria-label="График громкости по точкам"
      onDoubleClick={e => { const r = e.currentTarget.getBoundingClientRect(); add(Math.max(.001, Math.min(.999, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - ((e.clientY - r.top) / r.height * 140 - 10) / 110))); }}
      onPointerMove={e => { if (drag.current === null) return; const r = e.currentTarget.getBoundingClientRect(); edit(drag.current, (e.clientX - r.left) / r.width, 1 - ((e.clientY - r.top) / r.height * 140 - 10) / 110); }}
      onPointerUp={() => { drag.current = null; gesture.commit(); }} onPointerCancel={() => { drag.current = null; gesture.cancel(); }}>
      {[0, .25, .5, .75, 1].map(v => <line key={v} x1="0" x2="560" y1={120 - v * 110} y2={120 - v * 110} className="mseg-grid" />)}
      <polyline points={value.points.map(p => `${p.t * 560},${120 - p.v * 110}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {value.points.map((p, n) => <circle key={n} cx={p.t * 560} cy={120 - p.v * 110} r={n === i ? 5 : 3.5} fill={n === i ? 'var(--accent)' : 'var(--text)'} tabIndex={0} role="button" aria-label={`Точка ${n + 1}`}
        onFocus={() => select(n)} onPointerDown={e => { e.stopPropagation(); select(n); drag.current = n; gesture.begin(); e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId); }}
        onKeyDown={e => { if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); remove(); } if (e.key === 'Escape') { drag.current = null; gesture.cancel(); } }} />)}
      <text x="0" y="137">начало</text><text x="560" y="137" textAnchor="end">конец ноты →</text>
    </svg>
    <div className="mseg-toolbar">
      <label>точка <select aria-label="Точка огибающей" value={i} onChange={e => select(+e.target.value)}>{value.points.map((_, n) => <option key={n} value={n}>{n + 1}</option>)}</select></label>
      <label>время, % <NumField ariaLabel="Время точки, %" value={point.t * 100} min={interior ? (value.points[i - 1].t + .001) * 100 : 0} max={interior ? (value.points[i + 1].t - .001) * 100 : 100} disabled={!interior} step={.1} onChange={t => edit(i, t / 100, point.v)} /></label>
      <label>уровень, % <NumField ariaLabel="Уровень точки, %" value={point.v * 100} min={0} max={100} disabled={!interior} step={1} onChange={v => edit(i, point.t, v / 100)} /></label>
      <button disabled={value.points.length >= MSEG_LIMIT} onClick={() => { let n = 0; for (let k = 1; k < value.points.length - 1; k++) if (value.points[k + 1].t - value.points[k].t > value.points[n + 1].t - value.points[n].t) n = k; add((value.points[n].t + value.points[n + 1].t) / 2, (value.points[n].v + value.points[n + 1].v) / 2); }}>+ точка</button>
      <button disabled={!interior} onClick={remove}>удалить</button>
    </div>
    <span className="sub-cap">Двойной клик добавляет точку; перетаскивай или вводи числа. Форма растягивается по длине каждой ноты.</span>
  </div>;
}
