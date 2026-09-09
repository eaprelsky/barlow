import { t as msg, useLocale } from '../i18n';
import { useContext, useEffect, useRef, useState } from 'react';
import { EditGestureContext } from './editGesture';
import { Knob } from './Knob';
import { autoValue, type AutoCurve, type AutoTarget, type Pattern } from '../types';
const silentGestures={begin:()=>{},commit:()=>{},cancel:()=>{}};
/** Step-resolution touch recording uses the same normalized curve as drawing. */
export function AutomationRecorder({pattern,step,target,fxId,base,supported,onChange}:{pattern:Pattern;step:number;target:AutoTarget;fxId?:string;base:number;supported:boolean;onChange:(automation:AutoCurve[])=>void}) {
  useLocale();
 const owner=useContext(EditGestureContext),[recording,setRecording]=useState(false),[value,setValue]=useState(base);
 const latest=useRef({pattern,step,target,fxId,onChange,value});latest.current={pattern,step,target,fxId,onChange,value};
 const active=useRef(false),scope=useRef(`record:${crypto.randomUUID()}`);
 const write=()=>{const s=latest.current;if(s.step<0)return;const t=s.step/s.pattern.length;
   const same=(c:AutoCurve)=>c.target===s.target&&c.fxId===s.fxId,curve=s.pattern.automation?.find(same);
   const points=[...(curve?.points??[{t:0,v:s.value},{t:1,v:s.value}])].filter(p=>Math.abs(p.t-t)>1e-6);
   points.push({t,v:s.value});points.sort((a,b)=>a.t-b.t);
   s.onChange([...(s.pattern.automation??[]).filter(c=>!same(c)),{target:s.target,fxId:s.fxId,points}]);
 };
 useEffect(()=>{if(recording&&step>=0)write();},[step,recording]);
 useEffect(()=>{if(recording&&step<0){owner?.commit(scope.current);active.current=false;setRecording(false);}},[step,recording,owner]);
 useEffect(()=>()=>{if(active.current)owner?.commit(scope.current);},[owner]);
 return <div className="automation-recorder" data-help="automation-record" data-recording-control>
   <button disabled={!supported||step<0} aria-pressed={recording} onClick={()=>{
     if(recording){owner?.commit(scope.current);active.current=false;setRecording(false);}
     else {const curve=pattern.automation?.find(c=>c.target===target&&c.fxId===fxId);setValue(autoValue(curve?.points,Math.max(0,step)/pattern.length)??base);owner?.begin(scope.current);active.current=true;setRecording(true);}
   }}>{recording?msg("automationRecorder.finish"):msg("automationRecorder.recordMovement")}</button>
   {recording&&<><EditGestureContext.Provider value={silentGestures}><Knob help="automation-record-value" label={msg("automationRecorder.value")} value={value*100} min={0} max={100} step={1} onChange={v=>{setValue(v/100);latest.current.value=v/100;write();}}/></EditGestureContext.Provider><button onClick={()=>{owner?.cancel(scope.current);active.current=false;setRecording(false);}}>{msg("automationRecorder.discardTake")}</button></>}
 </div>;
}
