import { useRef, useState } from 'react';
import { MSEG_LIMIT, MSEG_SHAPES, msegValue, type Mseg } from '../music/mseg';
import { useEditGesture } from './editGesture';
import { NumField } from './NumField';
import { Knob } from './Knob';

export function MsegEditor({ value, onChange }: { value: Mseg; onChange: (value: Mseg, command?: boolean) => void }) {
  const [selected, select] = useState(1);
  const drag = useRef<number | null>(null);
  const gesture = useEditGesture();
  const i = Math.min(selected, value.points.length - 1), point = value.points[i];
  const interior = i > 0 && i < value.points.length - 1;
  const edit = (index: number, t: number, v: number) => {
    if (index <= 0 || index >= value.points.length - 1) return;
    const points = value.points.map(p => ({ ...p }));
    points[index] = { ...points[index], t: Math.max(points[index - 1].t + .001, Math.min(points[index + 1].t - .001, t)), v: Math.max(0, Math.min(1, v)) };
    onChange({ ...value, points });
  };
  const remove = () => {
    if (!interior) return;
    const hold = value.sustainPoint;
    const sustainPoint = hold === i ? undefined : hold === undefined ? undefined : hold > i ? hold - 1 : hold;
    const loop = sustainPoint === undefined || value.loop?.startPoint === i ? undefined : value.loop
      ? { ...value.loop, startPoint: value.loop.startPoint > i ? value.loop.startPoint - 1 : value.loop.startPoint } : undefined;
    onChange({ ...value, sustainPoint, loop, points: value.points.filter((_, n) => n !== i) }, true); select(i - 1);
  };
  const add = (t: number, v: number) => {
    if (value.points.length >= MSEG_LIMIT || value.points.some(p => Math.abs(p.t - t) < .001)) return;
    const points = [...value.points, { t, v }].sort((a, b) => a.t - b.t);
    const index = points.findIndex(p => p.t === t);
    select(index); onChange({ ...value, points,
      sustainPoint: value.sustainPoint === undefined ? undefined : value.sustainPoint >= index ? value.sustainPoint + 1 : value.sustainPoint,
      loop: value.loop ? { ...value.loop, startPoint: value.loop.startPoint >= index ? value.loop.startPoint + 1 : value.loop.startPoint } : undefined }, true);
  };
  const curvePoints = value.points.slice(1).flatMap((p, index) => Array.from({ length: 33 }, (_, step) => {
    const t = value.points[index].t + (p.t - value.points[index].t) * step / 32;
    return `${t * 560},${120 - msegValue(value, t) * 110}`;
  })).join(' ');
  const hold = value.sustainPoint;
  return <div className="mseg-editor" data-ob="mseg">
    <div className="mseg-toolbar">
      <select aria-label="Форма огибающей" value="" onChange={e => { onChange({ ...value, points: structuredClone(MSEG_SHAPES[e.target.value]), sustainPoint: undefined, loop: undefined }, true); select(1); }}>
        <option value="" disabled>готовая форма…</option>{Object.keys(MSEG_SHAPES).map(name => <option key={name}>{name}</option>)}
      </select>
      <label data-help="mseg-duration">{hold === undefined ? 'без длины ноты, с' : 'масштаб формы, с'} <NumField ariaLabel="Длительность MSEG, с" value={value.seconds} min={.01} max={16} step={.01} onChange={seconds => onChange({ ...value, seconds })} /></label>
      <span>{value.points.length}/{MSEG_LIMIT} точек</span>
    </div>
    <div className="mseg-toolbar mseg-playback" data-help="mseg-playback">
      <label>удержание <select data-help="mseg-sustain" aria-label="Точка удержания MSEG" value={hold ?? ''} onChange={e => onChange({ ...value, sustainPoint: e.target.value === '' ? undefined : +e.target.value, loop: undefined }, true)}>
        <option value="">нет · вся форма</option>{value.points.slice(1, -1).map((_, n) => <option key={n} value={n + 1}>точка {n + 2}</option>)}
      </select></label>
      {hold !== undefined && <>
        <label data-help="mseg-loop"><input aria-label="Цикл MSEG туда-обратно" type="checkbox" checked={!!value.loop} onChange={e => onChange({ ...value, loop: e.target.checked ? { startPoint: Math.max(0, hold - 1), repeats: 2 } : undefined }, true)} />туда-обратно</label>
        {value.loop && <>
          <label>от точки <select data-help="mseg-loop-start" aria-label="Начало цикла MSEG" value={value.loop.startPoint} onChange={e => onChange({ ...value, loop: { ...value.loop!, startPoint: +e.target.value } }, true)}>{value.points.slice(0, hold).map((_, n) => <option key={n} value={n}>{n + 1}</option>)}</select></label>
          <label>повторов <NumField help="mseg-loop-repeats" ariaLabel="Повторы MSEG" w={44} value={value.loop.repeats} min={1} max={32} step={1} onChange={repeats => onChange({ ...value, loop: { ...value.loop!, repeats: Math.round(repeats) } })} /></label>
        </>}
      </>}
    </div>
    <svg viewBox="0 0 560 140" preserveAspectRatio="none" className="mseg-graph" aria-label="График громкости по точкам"
      onDoubleClick={e => { const r = e.currentTarget.getBoundingClientRect(); add(Math.max(.001, Math.min(.999, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - ((e.clientY - r.top) / r.height * 140 - 10) / 110))); }}
      onPointerMove={e => { if (drag.current === null) return; const r = e.currentTarget.getBoundingClientRect(); edit(drag.current, (e.clientX - r.left) / r.width, 1 - ((e.clientY - r.top) / r.height * 140 - 10) / 110); }}
      onPointerUp={() => { drag.current = null; gesture.commit(); }} onPointerCancel={() => { drag.current = null; gesture.cancel(); }}>
      {[0, .25, .5, .75, 1].map(v => <line key={v} x1="0" x2="560" y1={120 - v * 110} y2={120 - v * 110} className="mseg-grid" />)}
      {value.loop && hold !== undefined && <rect data-help="mseg-loop" x={value.points[value.loop.startPoint].t * 560} y="10" width={(value.points[hold].t - value.points[value.loop.startPoint].t) * 560} height="110" fill="var(--accent)" opacity=".1" />}
      {hold !== undefined && <line data-help="mseg-sustain" x1={value.points[hold].t * 560} x2={value.points[hold].t * 560} y1="10" y2="120" stroke="var(--accent)" strokeDasharray="3 3" />}
      <polyline points={curvePoints} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {value.points.map((p, n) => <circle key={n} cx={p.t * 560} cy={120 - p.v * 110} r={n === i ? 5 : 3.5} fill={n === i ? 'var(--accent)' : 'var(--text)'} tabIndex={0} data-help="mseg-point" role="button" aria-label={`Точка ${n + 1}`}
        onFocus={() => select(n)} onPointerDown={e => { e.stopPropagation(); select(n); drag.current = n; gesture.begin(); e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId); }}
        onKeyDown={e => { if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); remove(); } if (e.key === 'Escape') { drag.current = null; gesture.cancel(); } }} />)}
      <text x="0" y="137">начало</text><text x="560" y="137" textAnchor="end">{hold === undefined ? 'конец ноты →' : 'затухание после ноты →'}</text>
    </svg>
    <div className="mseg-toolbar">
      <label>точка <select data-help="mseg-point" aria-label="Точка огибающей" value={i} onChange={e => select(+e.target.value)}>{value.points.map((_, n) => <option key={n} value={n}>{n + 1}</option>)}</select></label>
      <label>время, % <NumField help="mseg-time" ariaLabel="Время точки, %" w={55} value={point.t * 100} min={interior ? (value.points[i - 1].t + .001) * 100 : 0} max={interior ? (value.points[i + 1].t - .001) * 100 : 100} disabled={!interior} step={.1} onChange={t => edit(i, t / 100, point.v)} /></label>
      <label>уровень, % <NumField help="mseg-level" ariaLabel="Уровень точки, %" w={55} value={point.v * 100} min={0} max={100} disabled={!interior} step={1} onChange={v => edit(i, point.t, v / 100)} /></label>
      {i > 0 && <Knob help="mseg-curve" label="изгиб до точки" value={(point.curve ?? 0) * 25} min={-100} max={100} step={1} bipolar
        onChange={v => onChange({ ...value, points: value.points.map((p, n) => n === i ? { ...p, curve: v / 25 || undefined } : p) })} />}
      <button data-help="mseg-add" disabled={value.points.length >= MSEG_LIMIT} onClick={() => { let n = 0; for (let k = 1; k < value.points.length - 1; k++) if (value.points[k + 1].t - value.points[k].t > value.points[n + 1].t - value.points[n].t) n = k; add((value.points[n].t + value.points[n + 1].t) / 2, (value.points[n].v + value.points[n + 1].v) / 2); }}>+ точка</button>
      <button data-help="mseg-delete" disabled={!interior} onClick={remove}>удалить</button>
    </div>
  </div>;
}
