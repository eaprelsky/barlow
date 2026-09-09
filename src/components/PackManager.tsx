import { t as msg, useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { loadFactoryPresets, loadUserPresets } from '../music/instrumentPresets';
import { presetMatches } from '../music/soundSearch';
import { exportPack, preparePack, installPack, type PreparedPack } from '../audio/instrumentPack';
import { pickInstrumentFile, saveBlob } from '../platform';

export function PackManager({onClose}:{onClose:()=>void}) {
  useLocale();
  const presets = [...loadUserPresets(), ...loadFactoryPresets()];
  const [query,setQuery]=useState(''),[name,setName]=useState(msg("packManager.myPack")),[description,setDescription]=useState('');
  const [prepared,setPrepared]=useState<PreparedPack|null>(null),[selected,setSelected]=useState<Set<number>>(new Set());
  const [busy,setBusy]=useState(''),[progress,setProgress]=useState(0),[message,setMessage]=useState('');
  const job=useRef<AbortController|null>(null),input=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>job.current?.abort(),[]);
  const close=()=>{job.current?.abort();onClose();};
  const run=async(label:string,work:(controller:AbortController)=>Promise<void>)=>{
    if(job.current)return;const controller=new AbortController();job.current=controller;setBusy(label);setMessage('');setProgress(0);
    try{await work(controller);}catch(e){if(!controller.signal.aborted)setMessage(String(e));}finally{if(job.current===controller){job.current=null;setBusy('');}}
  };
  const read=(file:File)=>run(msg("packManager.checkingPack"),async c=>{const p=await preparePack(file,{signal:c.signal,progress:setProgress});c.signal.throwIfAborted();setPrepared(p);setName(p.name);setDescription(p.description);setSelected(new Set(p.presets.map((_,i)=>i)));setQuery('');});
  const list=prepared?.presets??presets, filtered=list.map((p,i)=>({p,i})).filter(({p})=>presetMatches(p,query));
  const names=new Set(loadUserPresets().map(p=>p.name)),preview=new Map<number,string>();
  if(prepared)for(const i of [...selected].sort((a,b)=>a-b)){const base=list[i].name;let candidate=base;for(let n=2;names.has(candidate);n++)candidate=`${base.slice(0,150)} (${n})`;names.add(candidate);preview.set(i,candidate);}
  return <Modal label={msg("packManager.instrumentPacks")} className="pack-manager" onClose={close}>
    <header data-help="portable-packs"><h2>{msg("packManager.instrumentPacks")}</h2><button aria-label={msg("packManager.closePacks")} onClick={close}>×</button></header>
    <div className="pack-toolbar" data-help="pack-file"><button disabled={!!busy} onClick={()=>void (async()=>{try{const file=await pickInstrumentFile(()=>input.current?.click());if(file)await read(file);}catch(e){setMessage(String(e));}})()}>{msg("packManager.openPack")}</button>
      {prepared&&<button disabled={!!busy} onClick={()=>{setPrepared(null);setSelected(new Set());setName(msg("packManager.myPack"));setDescription('');}}>{msg("packManager.createPack")}</button>}
      <input ref={input} type="file" accept=".zip" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void read(file);}}/>
    </div>
    <div className="pack-meta" data-help="pack-metadata"><label>{msg("packManager.name")}<input maxLength={160} value={name} disabled={!!prepared||!!busy} onChange={e=>setName(e.target.value)}/></label><label>{msg("packManager.description")}<textarea maxLength={2000} value={description} disabled={!!prepared||!!busy} onChange={e=>setDescription(e.target.value)} rows={2}/></label></div>
    <div className="pack-toolbar" data-help="pack-selection"><input type="search" aria-label={msg("packManager.searchPack")} placeholder={msg("packManager.findInstrument")} value={query} onChange={e=>setQuery(e.target.value)}/><button disabled={!!busy} onClick={()=>setSelected(new Set(filtered.slice(0,64).map(({i})=>i)))}>{msg("packManager.selectMatching")}</button><button disabled={!!busy} onClick={()=>setSelected(new Set())}>{msg("packManager.clearSelection")}</button><span>{selected.size}/64</span></div>
    <div className="pack-list" data-help="pack-selection">{filtered.map(({p,i})=><label key={i}><input type="checkbox" disabled={!!busy||!selected.has(i)&&selected.size>=64} checked={selected.has(i)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(i);else next.delete(i);return next;})}/><span title={p.hint}>{p.name}</span><small>{prepared&&preview.get(i)!==p.name?preview.get(i):p.category}</small></label>)}</div>
    <footer data-help="pack-transfer">{busy?<><span role="status">{busy}</span><progress value={progress} max={100}/><button onClick={()=>job.current?.abort()}>{msg("packManager.cancel")}</button></>:<button disabled={!selected.size||!name.trim()} onClick={()=>void run(prepared?msg("packManager.addingInstruments"):msg("packManager.buildingPack"),async c=>{
      const indices=[...selected].sort((a,b)=>a-b),options={signal:c.signal,progress:setProgress};
      if(prepared){const added=await installPack(prepared,indices,options);setMessage(msg("packManager.added", {p0: added.length}));setSelected(new Set());}
      else {const blob=await exportPack(name,description,indices.map(i=>presets[i]),options);c.signal.throwIfAborted();await saveBlob(blob,`${name.replace(/[<>:"/\\|?*]/g,'_')}.barlow-pack.zip`);}
    })}>{prepared?msg("packManager.addSelected"):msg("packManager.exportPack")}</button>}
      {message&&<span role="status">{message}</span>}
    </footer>
  </Modal>;
}
