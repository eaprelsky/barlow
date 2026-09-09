import { t as msg, useLocale } from '../i18n';
import { EFFECT_LABELS, uid, type Effect, type Instrument } from '../types';
import { newEqBand } from '../music/equalizer';
import { EqEditor } from './EqEditor';
import { Knob } from './Knob';
import { NumField } from './NumField';

export function VoiceProcessing({sound,onChange}:{sound:Partial<Instrument>;onChange:(patch:Partial<Instrument>,command?:boolean)=>void}) {
  useLocale();
  const effects=sound.voiceEffects??[], range=sound.voiceRange;
  const put=(next:Effect[],command=false)=>onChange({voiceEffects:next},command);
  const update=(i:number,patch:object)=>put(effects.map((e,j)=>j===i?{...e,...patch} as Effect:e));
  const create=(type:Effect['type']):Effect=>{
    const id=uid('vfx'),mix=.3;
    switch(type){case 'eq':return {id,type,bands:[newEqBand()],mix:1};case 'delay':return {id,type,timeSec:.25,feedback:.3,mix};case 'reverb':return {id,type,sizeSec:1,mix};case 'dist':return {id,type,drive:6,mix};case 'chorus':return {id,type,rate:.6,mix};case 'lofi':return {id,type,bits:6,mix};}
  };
  const move=(i:number,d:number)=>{const next=[...effects];[next[i],next[i+d]]=[next[i+d],next[i]];put(next,true);};
  return <details className="voice-processing" data-help="voice-processing">
    <summary>{msg("voiceProcessing.processingAndRange")}</summary>
    <div className="voice-range" data-help="voice-range">
      <label><input type="checkbox" checked={!!range} onChange={e=>onChange({voiceRange:e.target.checked?{minHz:20,maxHz:20000,minVelocity:0,maxVelocity:1}:undefined},true)}/>{msg("voiceProcessing.voiceRange")}</label>
      {range&&<><label>{msg("voiceProcessing.hzFrom")}<NumField ariaLabel={msg("voiceProcessing.voiceMinimumFrequency")} value={range.minHz} min={1} max={range.maxHz} step={1} onChange={minHz=>onChange({voiceRange:{...range,minHz}})}/></label><label>{msg("voiceProcessing.to")}<NumField ariaLabel={msg("voiceProcessing.voiceMaximumFrequency")} value={range.maxHz} min={range.minHz} max={24000} step={1} onChange={maxHz=>onChange({voiceRange:{...range,maxHz}})}/></label>
      <label>{msg("voiceProcessing.velocityFrom")}<NumField ariaLabel={msg("voiceProcessing.minimumNoteVelocity")} value={range.minVelocity*100} min={0} max={range.maxVelocity*100} step={1} onChange={v=>onChange({voiceRange:{...range,minVelocity:v/100}})}/></label><label>{msg("voiceProcessing.to")}<NumField ariaLabel={msg("voiceProcessing.maximumNoteVelocity")} value={range.maxVelocity*100} min={range.minVelocity*100} max={100} step={1} onChange={v=>onChange({voiceRange:{...range,maxVelocity:v/100}})}/> %</label></>}
    </div>
    <div className="voice-fx" data-help="voice-effects">
      {effects.map((fx,i)=><div key={fx.id??i} className="mod-row">
        <span>{EFFECT_LABELS[fx.type]}</span>
        <button aria-label={msg("voiceProcessing.moveVoiceEffectUp", {p0: i+1})} disabled={!i} onClick={()=>move(i,-1)}>↑</button><button aria-label={msg("voiceProcessing.moveVoiceEffectDown", {p0: i+1})} disabled={i===effects.length-1} onClick={()=>move(i,1)}>↓</button>
        <button aria-label={msg("voiceProcessing.removeVoiceEffect", {p0: i+1})} onClick={()=>put(effects.filter((_,j)=>i!==j),true)}>×</button>
        <Knob help="effect.mix" label={msg("voiceProcessing.mix")} value={fx.mix*100} min={0} max={100} step={1} onChange={v=>update(i,{mix:v/100})}/>
        {fx.type==='eq'?<><button data-help="eq-bypass" aria-pressed={!!fx.bypass} onClick={()=>update(i,{bypass:!fx.bypass})}>{msg("voiceProcessing.bypass")}</button><EqEditor bands={fx.bands} onChange={bands=>update(i,{bands})}/></>:null}
        {fx.type==='delay'?<><Knob help="effect.timeSec" label={msg("voiceProcessing.timeMs")} value={fx.timeSec*1000} min={10} max={2000} step={10} log onChange={v=>update(i,{timeSec:v/1000})}/><Knob help="effect.feedback" label={msg("voiceProcessing.feedback")} value={fx.feedback*100} min={0} max={90} step={1} onChange={v=>update(i,{feedback:v/100})}/></>:null}
        {fx.type==='reverb'?<Knob help="voice-effects" label={msg("voiceProcessing.tailS")} value={fx.sizeSec} min={.2} max={8} step={.1} onChange={sizeSec=>update(i,{sizeSec})}/>:null}
        {fx.type==='dist'?<Knob help="voice-effects" label={msg("voiceProcessing.drive")} value={fx.drive} min={1} max={40} step={.5} onChange={drive=>update(i,{drive})}/>:null}
        {fx.type==='chorus'?<Knob help="mod-rate" label={msg("voiceProcessing.rateHz")} value={fx.rate} min={.05} max={8} step={.05} log onChange={rate=>update(i,{rate})}/>:null}
        {fx.type==='lofi'?<Knob help="voice-effects" label={msg("voiceProcessing.bits")} value={fx.bits} min={2} max={12} step={1} onChange={bits=>update(i,{bits})}/>:null}
      </div>)}
      <select aria-label={msg("voiceProcessing.addVoiceEffect")} disabled={effects.length>=4} value="" onChange={e=>put([...effects,create(e.target.value as Effect['type'])],true)}><option value="" disabled>{msg("voiceProcessing.voiceEffect")}</option>{Object.entries(EFFECT_LABELS).map(([type,label])=><option key={type} value={type}>{label}</option>)}</select>
    </div>
  </details>;
}
