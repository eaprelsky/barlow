import { t as msg, useLocale } from '../i18n';
import { useState } from 'react';
import { uid, type Instrument } from '../types';
import { SAMPLE_SLICE_LIMIT, type SampleSlice } from '../music/sampleSlices';
import { NumField } from './NumField';
import { useEditGesture } from './editGesture';

export function SampleSliceEditor({ inst, duration, selection, onChange, onPreview, onCreatePattern, canCreatePattern, hidePatternAction = false }: {
  inst: Instrument; duration: number; selection: [number, number] | null;
  onChange: (slices: SampleSlice[], command: boolean) => void;
  onPreview: (inst: Instrument, start: number, end: number) => void;
  onCreatePattern: () => void; canCreatePattern: boolean; hidePatternAction?: boolean;
}) {
  useLocale();
  const [count, setCount] = useState(8), slices = inst.sampleSlices ?? [];
  const nameGesture = useEditGesture();
  const update = (id: string, patch: Partial<SampleSlice>) => onChange(slices.map(s => s.id === id ? { ...s, ...patch } : s), false);
  const add = (parts: number, start: number, end: number) => {
    if (!inst.sampleId || (end - start) / parts < .001 - 1e-9 || end > 3600 || slices.length + parts > SAMPLE_SLICE_LIMIT) return;
    onChange([...slices, ...Array.from({ length: parts }, (_, i) => ({ id: uid('cut'), name: msg("sampleSliceEditor.slice", {p0: slices.length + i + 1}),
      sampleId: inst.sampleId!, sampleName: inst.sampleName, start: start + (end - start) * i / parts, end: start + (end - start) * (i + 1) / parts }))], true);
  };
  return <details className="sample-slices" data-ob="sample-slices"><summary>{msg("sampleSliceEditor.sampleSlices")}{slices.length})</summary>

    <div className="slice-actions">
      <button data-help="slice-selection" disabled={!inst.sampleId || !selection || selection[1] - selection[0] < .001 || selection[1] > 3600 || slices.length >= SAMPLE_SLICE_LIMIT}
        onClick={() => selection && add(1, selection[0], selection[1])}>{msg("sampleSliceEditor.addSelection")}</button>
      <label>{msg("sampleSliceEditor.equalSlices")}<NumField help="slice-count" value={count} min={2} max={64} step={1} onChange={v => setCount(Math.round(v))} /></label>
      <button data-help="slice-all" disabled={!inst.sampleId || duration / count < .001 || slices.length + count > SAMPLE_SLICE_LIMIT}
        onClick={() => add(count, 0, Math.min(duration, 3600))}>{msg("sampleSliceEditor.sliceWholeSample")}</button>
      <span>{msg("sampleSliceEditor.upTo")}{SAMPLE_SLICE_LIMIT} {msg("sampleSliceEditor.slicesBoundariesWithinTheFirst3600S")}</span>
      {!hidePatternAction && <button data-help="slice-pattern" disabled={!slices.length || !canCreatePattern} onClick={onCreatePattern}>{msg("sampleSliceEditor.newClipSlicesInOrder")}</button>}
    </div>
    {slices.map((slice, index) => <fieldset key={slice.id}><legend>{msg("sampleSliceEditor.slice8")}{index + 1}</legend>
      <label>{msg("sampleSliceEditor.name")}<input data-help="slice-name" aria-label={msg("sampleSliceEditor.sliceName", {p0: index + 1})} value={slice.name} maxLength={160} onChange={e => update(slice.id, { name: e.target.value })}
        onFocus={nameGesture.begin} onBlur={nameGesture.commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); nameGesture.cancel(); e.currentTarget.blur(); } }} /></label>
      <span title={slice.sampleId}>{slice.sampleName ?? slice.sampleId.slice(0, 12)}</span>
      <label>{msg("sampleSliceEditor.startS")}<NumField help="slice-start" value={slice.start} min={0} max={Math.max(0, slice.end - .001)} step={.001} onChange={v => update(slice.id, { start: v })} /></label>
      <label>{msg("sampleSliceEditor.endS")}<NumField help="slice-end" value={slice.end} min={slice.start + .001} max={slice.sampleId === inst.sampleId && duration > slice.start ? Math.min(3600, duration) : 3600} step={.001} onChange={v => update(slice.id, { end: v })} /></label>
      <button data-help="slice-preview" aria-label={msg("sampleSliceEditor.auditionSlice", {p0: index + 1})} onClick={() => onPreview({ ...inst, sampleId: slice.sampleId, sampleName: slice.sampleName }, slice.start, slice.end)}>▶</button>
      <button data-help="slice-delete" aria-label={msg("sampleSliceEditor.deleteSlice", {p0: index + 1})} onClick={() => onChange(slices.filter(s => s.id !== slice.id), true)}>{msg("sampleSliceEditor.delete")}</button>
    </fieldset>)}
  </details>;
}
