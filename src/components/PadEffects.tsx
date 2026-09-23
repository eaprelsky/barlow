import type { Effect } from '../types';
import { EFFECT_LABELS, uid } from '../types';
import { t as msg } from '../i18n';
import { newEqBand } from '../music/equalizer';
import { EqEditor } from './EqEditor';
import { NumField } from './NumField';

export function PadEffects({effects,onChange}:{effects:Effect[];onChange:(effects:Effect[],command?:boolean)=>void}) {
  const set=(index:number,value:Partial<Effect>)=>onChange(effects.map((fx,i)=>i===index?{...fx,...value} as Effect:fx));
  const move=(index:number,delta:number)=>{const next=[...effects];[next[index],next[index+delta]]=[next[index+delta],next[index]];onChange(next,true);};
  return <div data-help="track-effects">
    <select aria-label={msg('trackRow.addAnEffectToTheChainUp')} value="" disabled={effects.length>=16} onChange={e=>{
      const id=uid('fx'),type=e.target.value as Effect['type'];
      const fx:Effect=type==='eq'?{id,type,bands:[newEqBand()],mix:1}:type==='delay'?{id,type,timeSec:.25,feedback:.25,mix:.25}:type==='reverb'?{id,type,sizeSec:1,mix:.2}:type==='dist'?{id,type,drive:2,mix:.3}:type==='chorus'?{id,type,rate:.6,mix:.3}:{id,type:'lofi',bits:6,mix:.3};
      onChange([...effects,fx],true);
    }}><option value="">{msg('trackRow.effect')}</option>{(Object.keys(EFFECT_LABELS) as Effect['type'][]).map(type=><option key={type} value={type}>{EFFECT_LABELS[type]}</option>)}</select>
    {effects.map((fx,i)=><div className="rack-pad-controls" key={fx.id??i}>
      <strong>{EFFECT_LABELS[fx.type]}</strong>
      <button data-help="track-effects" aria-label={msg('trackRow.moveEffectUp',{p0:i+1})} disabled={!i} onClick={()=>move(i,-1)}>↑</button>
      <button data-help="track-effects" aria-label={msg('trackRow.moveEffectDown',{p0:i+1})} disabled={i===effects.length-1} onClick={()=>move(i,1)}>↓</button>
      {fx.type==='delay'&&<><label>{msg('trackRow.timeMs')}<NumField help="effect.timeSec" value={fx.timeSec*1000} min={10} max={2000} onChange={v=>set(i,{timeSec:v/1000})}/></label><label>{msg('trackRow.feedback')}<NumField help="effect.feedback" value={fx.feedback*100} min={0} max={90} onChange={v=>set(i,{feedback:v/100})}/></label></>}
      {fx.type==='reverb'&&<label>{msg('trackRow.tailS')}<NumField value={fx.sizeSec} min={.2} max={8} step={.1} onChange={sizeSec=>set(i,{sizeSec})}/></label>}
      {fx.type==='dist'&&<label>{msg('trackRow.drive')}<NumField value={fx.drive} min={1} max={40} step={.5} onChange={drive=>set(i,{drive})}/></label>}
      {fx.type==='chorus'&&<label>{msg('trackRow.rateHz')}<NumField value={fx.rate} min={.05} max={8} step={.05} onChange={rate=>set(i,{rate})}/></label>}
      {fx.type==='lofi'&&<label>{msg('trackRow.bits')}<NumField value={fx.bits} min={2} max={12} onChange={bits=>set(i,{bits})}/></label>}
      {fx.type==='eq'&&<EqEditor bands={fx.bands} onChange={bands=>set(i,{bands})}/>}
      <label>{msg('trackRow.mix')}<NumField help="effect.mix" value={fx.mix*100} min={0} max={100} onChange={v=>set(i,{mix:v/100})}/></label>
      <button data-help="track-effects" aria-label={msg('trackRow.removeEffect')} onClick={()=>onChange(effects.filter((_,j)=>j!==i),true)}>×</button>
    </div>)}
  </div>;
}
