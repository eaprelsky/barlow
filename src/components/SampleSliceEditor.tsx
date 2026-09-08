import { useState } from 'react';
import { uid, type Instrument } from '../types';
import { SAMPLE_SLICE_LIMIT, type SampleSlice } from '../music/sampleSlices';
import { NumField } from './NumField';
import { useEditGesture } from './editGesture';

export function SampleSliceEditor({ inst, duration, selection, onChange, onPreview, onCreatePattern, canCreatePattern }: {
  inst: Instrument; duration: number; selection: [number, number] | null;
  onChange: (slices: SampleSlice[], command: boolean) => void;
  onPreview: (inst: Instrument, start: number, end: number) => void;
  onCreatePattern: () => void; canCreatePattern: boolean;
}) {
  const [count, setCount] = useState(8), slices = inst.sampleSlices ?? [];
  const nameGesture = useEditGesture();
  const update = (id: string, patch: Partial<SampleSlice>) => onChange(slices.map(s => s.id === id ? { ...s, ...patch } : s), false);
  const add = (parts: number, start: number, end: number) => {
    if (!inst.sampleId || (end - start) / parts < .001 - 1e-9 || end > 3600 || slices.length + parts > SAMPLE_SLICE_LIMIT) return;
    onChange([...slices, ...Array.from({ length: parts }, (_, i) => ({ id: uid('cut'), name: `фрагмент ${slices.length + i + 1}`,
      sampleId: inst.sampleId!, sampleName: inst.sampleName, start: start + (end - start) * i / parts, end: start + (end - start) * (i + 1) / parts }))], true);
  };
  return <details className="sample-slices"><summary>нарезка сэмплов ({slices.length})</summary>
    <p>Фрагменты выбираются у отдельных нот. Исходные файлы сохраняются. Удалённый фрагмент оставляет ноту без звука, пока ты не выберешь другой или «обычный источник».</p>
    <div className="slice-actions">
      <button disabled={!inst.sampleId || !selection || selection[1] - selection[0] < .001 || selection[1] > 3600 || slices.length >= SAMPLE_SLICE_LIMIT}
        onClick={() => selection && add(1, selection[0], selection[1])}>добавить выделение</button>
      <label>равных частей <NumField value={count} min={2} max={64} step={1} onChange={v => setCount(Math.round(v))} /></label>
      <button disabled={!inst.sampleId || duration / count < .001 || slices.length + count > SAMPLE_SLICE_LIMIT}
        onClick={() => add(count, 0, Math.min(duration, 3600))}>нарезать весь сэмпл</button>
      <span>до {SAMPLE_SLICE_LIMIT} фрагментов; границы — в первых 3600 с файла</span>
      <button disabled={!slices.length || !canCreatePattern} onClick={onCreatePattern}>новый эскиз: фрагменты по порядку</button>
    </div>
    {slices.map((slice, index) => <fieldset key={slice.id}><legend>фрагмент {index + 1}</legend>
      <label>имя <input aria-label={`Имя фрагмента ${index + 1}`} value={slice.name} maxLength={160} onChange={e => update(slice.id, { name: e.target.value })}
        onFocus={nameGesture.begin} onBlur={nameGesture.commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); nameGesture.cancel(); e.currentTarget.blur(); } }} /></label>
      <span title={slice.sampleId}>{slice.sampleName ?? slice.sampleId.slice(0, 12)}</span>
      <label>от, с <NumField value={slice.start} min={0} max={Math.max(0, slice.end - .001)} step={.001} onChange={v => update(slice.id, { start: v })} /></label>
      <label>до, с <NumField value={slice.end} min={slice.start + .001} max={slice.sampleId === inst.sampleId && duration > slice.start ? Math.min(3600, duration) : 3600} step={.001} onChange={v => update(slice.id, { end: v })} /></label>
      <button aria-label={`Прослушать фрагмент ${index + 1}`} onClick={() => onPreview({ ...inst, sampleId: slice.sampleId, sampleName: slice.sampleName }, slice.start, slice.end)}>▶</button>
      <button aria-label={`Удалить фрагмент ${index + 1}`} onClick={() => onChange(slices.filter(s => s.id !== slice.id), true)}>удалить</button>
    </fieldset>)}
  </details>;
}
