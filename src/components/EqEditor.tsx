import { useMemo, useState } from 'react';
import { EQ_LABELS, newEqBand, type EqBand, type EqShape } from '../music/equalizer';
import { makeEq } from '../audio/equalizer';
import { Knob } from './Knob';

export function EqEditor({bands,onChange}:{bands:EqBand[];onChange:(bands:EqBand[])=>void}) {
  const [selected,select]=useState(0), index=Math.min(selected,Math.max(0,bands.length-1)), band=bands[index];
  const response=useMemo(()=>{
    const ctx=new OfflineAudioContext(1,1,48000),nodes=makeEq(ctx,bands);
    const frequencies=Float32Array.from({length:241},(_,i)=>20*1000**(i/240));
    const magnitude=new Float32Array(241),phase=new Float32Array(241),sum=new Float32Array(241);
    for(const node of nodes){node.getFrequencyResponse(frequencies,magnitude,phase);for(let i=0;i<241;i++)sum[i]+=20*Math.log10(Math.max(1e-9,magnitude[i]));node.disconnect();}
    return Array.from(sum,(db,i)=>`${i*2},${70-Math.max(-24,Math.min(24,db))*2}`).join(' ');
  },[bands]);
  const update=(patch:Partial<EqBand>)=>onChange(bands.map((b,i)=>i===index?{...b,...patch}:b));
  return <div className="eq-editor" data-help="equalizer">
    <svg viewBox="0 0 480 155" role="img" aria-label="Частотная характеристика эквалайзера" data-help="eq-graph">
      {[22,70,118].map(y=><line key={y} x1="0" x2="480" y1={y} y2={y} className="eq-grid"/>)}
      {[20,100,1000,10000].map(hz=><g key={hz}><line x1={160*Math.log10(hz/20)} x2={160*Math.log10(hz/20)} y1="12" y2="128" className="eq-grid"/><text x={Math.max(3,Math.min(449,160*Math.log10(hz/20)))} y="147">{hz>=1000?`${hz/1000}к`:hz}</text></g>)}
      <polyline points={response} fill="none" stroke="var(--accent)" strokeWidth="2"/>
      <text x="4" y="18">+24 дБ</text><text x="4" y="66">0</text><text x="4" y="132">−24</text>
    </svg>
    <div className="eq-controls">
      <div className="eq-bands" data-help="eq-band">
        {bands.map((b,i)=><button key={i} aria-label={`Полоса ${i+1}`} aria-pressed={index===i} onClick={()=>select(i)} className={b.enabled?'':'eq-disabled'}>{i+1}</button>)}
        <button disabled={bands.length>=6} aria-label="Добавить полосу EQ" onClick={()=>{onChange([...bands,newEqBand()]);select(bands.length);}}>+</button>
      </div>
      {band && <><div className="eq-bands">
        <button data-help="eq-band-enabled" aria-label="Включить полосу" aria-pressed={band.enabled} onClick={()=>update({enabled:!band.enabled})}>{band.enabled?'вкл':'выкл'}</button>
        <select data-help="eq-shape" aria-label="Форма полосы" value={band.type} onChange={e=>update({type:e.target.value as EqShape})}>{Object.entries(EQ_LABELS).map(([type,label])=><option key={type} value={type}>{label}</option>)}</select>
        <button data-help="eq-band" aria-label="Удалить полосу EQ" onClick={()=>onChange(bands.filter((_,i)=>i!==index))}>×</button>
      </div><div className="eq-knobs">
        <Knob help="eq-frequency" label="частота, Гц" value={band.frequency} min={20} max={20000} step={1} log onChange={frequency=>update({frequency})}/>
        {!['highpass','lowpass'].includes(band.type)&&<Knob help="eq-gain" label="уровень, дБ" value={band.gain} min={-18} max={18} step={.1} bipolar onChange={gain=>update({gain})}/>}
        {!['lowshelf','highshelf'].includes(band.type)&&<Knob help="eq-q" label="ширина, Q" value={band.q} min={.1} max={18} step={.1} log onChange={q=>update({q})}/>}
      </div></>}
    </div>
  </div>;
}
