import { useEffect, useState } from 'react';
import { listSamples, type SampleMeta } from '../audio/library';
import type { SampleZone } from '../music/sampleZones';
import { NumField } from './NumField';
export function SampleZoneEditor({ zones, onChange }: { zones?: SampleZone[]; onChange: (zones: SampleZone[]) => void }) {
  const [samples, setSamples] = useState<SampleMeta[]>([]), [error, setError] = useState('');
  const list = zones ?? [];
  useEffect(() => { let alive = true; void listSamples().then(s => { if (alive) setSamples(s); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, []);
  const update = (index: number, value: Partial<SampleZone>) => onChange(list.map((z, i) => i === index ? { ...z, ...value } : z));
  return <details className="sample-zones"><summary>зоны сэмплера ({list.length})</summary>
    <p className="hint">Частота и сила ноты выбирают запись. При пересечении играет первая зона; вне зон — основной сэмпл. Прямой и зернистый режимы настроены по тонике записи; в скрэтче скорость задаёт жест.</p>
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
    </fieldset>)}
    <button disabled={!samples.length || list.length>=64} onClick={()=>onChange([...list,{id:crypto.randomUUID(),sampleId:samples[0].id,sampleName:samples[0].name,rootHz:440,lowHz:20,highHz:24000,lowVelocity:0,highVelocity:1}])}>+ зона из библиотеки</button>
    {!samples.length && <p className="hint">Сначала загрузи запись в библиотеку.</p>}
  </details>;
}
