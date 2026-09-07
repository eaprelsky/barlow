import { useCallback, useEffect, useRef, useState } from 'react';
import { listSamples, LIBRARY_CHANGED_EVENT, type SampleMeta } from '../audio/library';
import type { SampleZone } from '../music/sampleZones';
import { NumField } from './NumField';
export function SampleZoneEditor({ zones, onChange }: { zones?: SampleZone[]; onChange: (zones: SampleZone[]) => void }) {
  const [samples, setSamples] = useState<SampleMeta[]>([]), [error, setError] = useState('');
  const list = zones ?? [];
  const request = useRef(0);
  const refresh = useCallback(() => {
    const token = ++request.current;
    void listSamples().then(s => { if (token === request.current) { setSamples(s); setError(''); } }).catch(e => { if (token === request.current) setError(String(e)); });
  }, []);
  useEffect(() => { refresh(); window.addEventListener(LIBRARY_CHANGED_EVENT, refresh); return () => { ++request.current; window.removeEventListener(LIBRARY_CHANGED_EVENT, refresh); }; }, [refresh]);
  const update = (index: number, value: Partial<SampleZone>) => onChange(list.map((z, i) => i === index ? { ...z, ...value } : z));
  return <details className="sample-zones" onToggle={e => { if (e.currentTarget.open) refresh(); }}><summary>зоны сэмплера ({list.length})</summary>
    <p className="hint">Частота и сила ноты выбирают зону. При пересечении играет первая; вне зон — основной сэмпл. Round-robin чередует до 8 записей зоны по кругу. Каждая запись настроена по своей тонике; в скрэтче скорость задаёт жест.</p>
    {error && <p role="alert">{error}</p>}
    {list.map((z, index) => <fieldset key={z.id}><legend>зона {index + 1}</legend>
      <label>запись <select value={z.sampleId} onChange={e => update(index, { sampleId:e.target.value, sampleName:samples.find(s=>s.id===e.target.value)?.name })}>
        {!samples.some(s=>s.id===z.sampleId) && <option value={z.sampleId}>{z.sampleName ?? 'запись не найдена'}</option>}
        {samples.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <div className="inline">
        <label>тоника записи, Гц <NumField value={z.rootHz} min={1} max={24000} step={1} onChange={rootHz=>update(index,{rootHz})} /></label>
        <label>от, Гц <NumField value={z.lowHz} min={1} max={z.highHz-.001} step={1} onChange={lowHz=>update(index,{lowHz})} /></label>
        <label>до, Гц <NumField value={z.highHz} min={z.lowHz+.001} max={24000} step={1} onChange={highHz=>update(index,{highHz})} /></label>
        <label>сила от <NumField value={z.lowVelocity} min={0} max={z.highVelocity-.001} step={.05} onChange={lowVelocity=>update(index,{lowVelocity})} /></label>
        <label>сила до <NumField value={z.highVelocity} min={z.lowVelocity+.001} max={1} step={.05} onChange={highVelocity=>update(index,{highVelocity})} /></label>
        <button disabled={index===0} onClick={()=>{ const next=[...list]; [next[index-1],next[index]]=[next[index],next[index-1]]; onChange(next); }}>выше</button>
        <button aria-label={`удалить зону ${index + 1}`} onClick={()=>onChange(list.filter((_,i)=>i!==index))}>удалить</button>
      </div>
      {(z.alternates ?? []).map((v, vi) => <div className="sample-variant" key={vi}>
        <label>вариант {vi + 2} <select aria-label={`Запись варианта ${vi + 2} зоны ${index + 1}`} value={v.sampleId} onChange={e => update(index, { alternates: z.alternates!.map((a, ai) => ai === vi ? { ...a, sampleId: e.target.value, sampleName: samples.find(s => s.id === e.target.value)?.name } : a) })}>
          {!samples.some(s => s.id === v.sampleId) && <option value={v.sampleId}>{v.sampleName ?? 'запись не найдена'}</option>}
          {samples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>тоника, Гц <NumField ariaLabel={`Тоника варианта ${vi + 2} зоны ${index + 1}`} value={v.rootHz} min={1} max={24000} onChange={rootHz => update(index, { alternates: z.alternates!.map((a, ai) => ai === vi ? { ...a, rootHz } : a) })} /></label>
        <button aria-label={`Поднять вариант ${vi + 2} зоны ${index + 1}`} onClick={() => {
          const a = [...z.alternates!];
          if (vi === 0) { a[0] = { sampleId: z.sampleId, sampleName: z.sampleName, rootHz: z.rootHz }; update(index, { sampleId: v.sampleId, sampleName: v.sampleName, rootHz: v.rootHz, alternates: a }); }
          else { [a[vi - 1], a[vi]] = [a[vi], a[vi - 1]]; update(index, { alternates: a }); }
        }}>выше</button>
        <button aria-label={`Удалить вариант ${vi + 2} зоны ${index + 1}`} onClick={() => update(index, { alternates: z.alternates!.filter((_, ai) => ai !== vi) })}>удалить вариант</button>
      </div>)}
      <button disabled={!samples.length || (z.alternates?.length ?? 0) >= 7} onClick={() => { const sample = samples.find(s => s.id !== z.sampleId && !z.alternates?.some(a => a.sampleId === s.id)) ?? samples[0]; update(index, { alternates: [...(z.alternates ?? []), { sampleId: sample.id, sampleName: sample.name, rootHz: z.rootHz }] }); }}>+ вариант round-robin</button>
    </fieldset>)}
    <button disabled={!samples.length || list.length>=64} onClick={()=>onChange([...list,{id:crypto.randomUUID(),sampleId:samples[0].id,sampleName:samples[0].name,rootHz:440,lowHz:20,highHz:24000,lowVelocity:0,highVelocity:1}])}>+ зона из библиотеки</button>
    {!samples.length && <p className="hint">Сначала загрузи запись в библиотеку.</p>}
  </details>;
}
