import { t as msg, useLocale } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listSamples, LIBRARY_CHANGED_EVENT, type SampleMeta } from '../audio/library';
import type { SampleZone } from '../music/sampleZones';
import { NumField } from './NumField';
export function SampleZoneEditor({ zones, onChange }: { zones?: SampleZone[]; onChange: (zones: SampleZone[]) => void }) {
  useLocale();
  const [samples, setSamples] = useState<SampleMeta[]>([]), [error, setError] = useState('');
  const list = zones ?? [];
  const request = useRef(0);
  const refresh = useCallback(() => {
    const token = ++request.current;
    void listSamples().then(s => { if (token === request.current) { setSamples(s); setError(''); } }).catch(e => { if (token === request.current) setError(String(e)); });
  }, []);
  useEffect(() => { refresh(); window.addEventListener(LIBRARY_CHANGED_EVENT, refresh); return () => { ++request.current; window.removeEventListener(LIBRARY_CHANGED_EVENT, refresh); }; }, [refresh]);
  const update = (index: number, value: Partial<SampleZone>) => onChange(list.map((z, i) => i === index ? { ...z, ...value } : z));
  return <details data-help="sample-zones" className="sample-zones" onToggle={e => { if (e.currentTarget.open) refresh(); }}><summary>{msg("sampleZoneEditor.samplerZones")}{list.length})</summary>
    <p className="hint">{msg("sampleZoneEditor.noteFrequencyAndVelocitySelectAZone")}</p>
    {error && <p role="alert">{error}</p>}
    {list.map((z, index) => <fieldset key={z.id}><legend>{msg("sampleZoneEditor.zone")}{index + 1}</legend>
      <label>{msg("sampleZoneEditor.recording")}<select data-help="zone-recording" value={z.sampleId} onChange={e => update(index, { sampleId:e.target.value, sampleName:samples.find(s=>s.id===e.target.value)?.name })}>
        {!samples.some(s=>s.id===z.sampleId) && <option value={z.sampleId}>{z.sampleName ?? msg("sampleZoneEditor.recordingNotFound")}</option>}
        {samples.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <div className="inline">
        <label>{msg("sampleZoneEditor.sampleRootHz")}<NumField help="instrument.rootHz" value={z.rootHz} min={1} max={24000} step={1} onChange={rootHz=>update(index,{rootHz})} /></label>
        <label>{msg("sampleZoneEditor.fromHz")}<NumField help="zone-low" value={z.lowHz} min={1} max={z.highHz-.001} step={1} onChange={lowHz=>update(index,{lowHz})} /></label>
        <label>{msg("sampleZoneEditor.toHz")}<NumField help="zone-high" value={z.highHz} min={z.lowHz+.001} max={24000} step={1} onChange={highHz=>update(index,{highHz})} /></label>
        <label>{msg("sampleZoneEditor.velocityFrom")}<NumField help="zone-velocity-low" value={z.lowVelocity} min={0} max={z.highVelocity-.001} step={.05} onChange={lowVelocity=>update(index,{lowVelocity})} /></label>
        <label>{msg("sampleZoneEditor.velocityTo")}<NumField help="zone-velocity-high" value={z.highVelocity} min={z.lowVelocity+.001} max={1} step={.05} onChange={highVelocity=>update(index,{highVelocity})} /></label>
        <button data-help="zone-up" disabled={index===0} onClick={()=>{ const next=[...list]; [next[index-1],next[index]]=[next[index],next[index-1]]; onChange(next); }}>{msg("sampleZoneEditor.up")}</button>
        <button data-help="zone-delete" aria-label={msg("sampleZoneEditor.deleteZone", {p0: index + 1})} onClick={()=>onChange(list.filter((_,i)=>i!==index))}>{msg("sampleZoneEditor.delete")}</button>
      </div>
      {(z.alternates ?? []).map((v, vi) => <div className="sample-variant" key={vi}>
        <label>{msg("sampleZoneEditor.variation")}{vi + 2} <select data-help="round-robin" aria-label={msg("sampleZoneEditor.recordingForVariationInZone", {p0: vi + 2, p1: index + 1})} value={v.sampleId} onChange={e => update(index, { alternates: z.alternates!.map((a, ai) => ai === vi ? { ...a, sampleId: e.target.value, sampleName: samples.find(s => s.id === e.target.value)?.name } : a) })}>
          {!samples.some(s => s.id === v.sampleId) && <option value={v.sampleId}>{v.sampleName ?? msg("sampleZoneEditor.recordingNotFound")}</option>}
          {samples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>{msg("sampleZoneEditor.rootHz")}<NumField help="instrument.rootHz" ariaLabel={msg("sampleZoneEditor.rootFrequencyForVariationInZone", {p0: vi + 2, p1: index + 1})} value={v.rootHz} min={1} max={24000} onChange={rootHz => update(index, { alternates: z.alternates!.map((a, ai) => ai === vi ? { ...a, rootHz } : a) })} /></label>
        <button data-help="variant-up" aria-label={msg("sampleZoneEditor.moveVariationUpInZone", {p0: vi + 2, p1: index + 1})} onClick={() => {
          const a = [...z.alternates!];
          if (vi === 0) { a[0] = { sampleId: z.sampleId, sampleName: z.sampleName, rootHz: z.rootHz }; update(index, { sampleId: v.sampleId, sampleName: v.sampleName, rootHz: v.rootHz, alternates: a }); }
          else { [a[vi - 1], a[vi]] = [a[vi], a[vi - 1]]; update(index, { alternates: a }); }
        }}>{msg("sampleZoneEditor.up")}</button>
        <button data-help="variant-delete" aria-label={msg("sampleZoneEditor.deleteVariationFromZone", {p0: vi + 2, p1: index + 1})} onClick={() => update(index, { alternates: z.alternates!.filter((_, ai) => ai !== vi) })}>{msg("sampleZoneEditor.deleteVariation")}</button>
      </div>)}
      <button data-help="round-robin" disabled={!samples.length || (z.alternates?.length ?? 0) >= 7} onClick={() => { const sample = samples.find(s => s.id !== z.sampleId && !z.alternates?.some(a => a.sampleId === s.id)) ?? samples[0]; update(index, { alternates: [...(z.alternates ?? []), { sampleId: sample.id, sampleName: sample.name, rootHz: z.rootHz }] }); }}>{msg("sampleZoneEditor.roundRobinVariation")}</button>
    </fieldset>)}
    <button data-help="zone-add" disabled={!samples.length || list.length>=64} onClick={()=>onChange([...list,{id:crypto.randomUUID(),sampleId:samples[0].id,sampleName:samples[0].name,rootHz:440,lowHz:20,highHz:24000,lowVelocity:0,highVelocity:1}])}>{msg("sampleZoneEditor.zoneFromLibrary")}</button>
    {!samples.length && <p className="hint">{msg("sampleZoneEditor.importARecordingIntoTheLibraryFirst")}</p>}
  </details>;
}
