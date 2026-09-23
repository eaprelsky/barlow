import {useState} from 'react';
import type {Patch} from '../types';
import {t as msg} from '../i18n';
import {mergeRackIssue} from '../music/mergeDrumRack';
import {Modal} from './Modal';
export function MergeDrumRack({patch,sceneId,onMerge,onClose}:{patch:Patch;sceneId:string;onMerge:(ids:string[])=>void;onClose:()=>void}) {
  const [ids,setIds]=useState<string[]>([]),issue=mergeRackIssue(patch,sceneId,ids);
  const tracks=patch.tracks.filter(t=>t.device?.kind!=='rack'),available=tracks.length>=2;
  return <Modal label={msg('rack.mergeTitle')} onClose={onClose}><div data-help="rack-merge" style={{maxWidth:560}}>
    <h2>{msg('rack.mergeTitle')}</h2><p>{msg(available?'rack.mergeHelp':'rack.mergeEmpty')}</p>
    {available&&<div style={{display:'grid',gap:8,maxHeight:360,overflowY:'auto',margin:'16px 0'}}>{tracks.map(t=><label key={t.id} style={{display:'flex',gap:8,alignItems:'center'}}>
      <input type="checkbox" style={{width:'auto'}} checked={ids.includes(t.id)} onChange={e=>setIds(v=>e.target.checked?[...v,t.id]:v.filter(id=>id!==t.id))}/>{t.name}
    </label>)}</div>}
    {available&&issue&&<p role="status">{msg(issue==='count'?'rack.mergeCount':issue==='timing'?'rack.mergeTiming':'rack.mergeRouting')}</p>}
    <div className="rack-actions">{available&&<button data-help="rack-merge" disabled={!!issue} onClick={()=>onMerge(ids)}>{msg('rack.mergeCreate')}</button>}<button data-help="rack-merge" onClick={onClose}>{msg('dialog.cancel')}</button></div>
  </div></Modal>;
}
