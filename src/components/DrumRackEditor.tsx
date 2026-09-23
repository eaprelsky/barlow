import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, DragEvent } from 'react';
import { t as msg, useLocale } from '../i18n';
import type { DrumPad, Instrument, Note, Patch, Pattern, Track } from '../types';
import { makeNote, uid, scaleOf } from '../types';
import { appendPad, padTrack, padTrackId, rackPads, updatePad, updatePadInstrument, setRackHitHz } from '../music/drumRack';
import type { AudioBackend } from '../audio/backend';
import { putSample } from '../audio/library';
import type { SampleMeta } from '../audio/library';
import { InstrumentWorkspace } from './InstrumentWorkspace';
import type { InstEditorTab } from './InstrumentEditor';
import { SamplePicker } from './SamplePicker';
import { NumField } from './NumField';
import { SliderField } from './SliderField';
import { NoteLocksEditor } from './NoteLocksEditor';
import { alertDialog } from './dialogs';


import { exportDrumRack } from '../audio/drumRackFile';
import { saveBlob } from '../platform';
import { applyPadPreset } from '../music/drumRack';
import type { InstrumentPreset } from '../music/instrumentPresets';
import './DrumRackEditor.css';
import { PadEffects } from './PadEffects';


type Setter=Dispatch<SetStateAction<Patch>>;
let copiedHit:Note|null=null;
export function DrumRackEditor({patch,track,pattern,engine,activeStep,change,command,onLibrary,selected,select}: {
  patch:Patch;track:Track;pattern:Pattern;engine:AudioBackend;activeStep:number;
  change:Setter;command:Setter;onLibrary:(id:string)=>void;
  selected:string;select:(id:string)=>void;
}) {
  useLocale();
  const pads=rackPads(track);
  const hasSolo=pads.some(p=>p.solo);
  const padAudible=(p:DrumPad)=>track.enabled!==false&&!p.muted&&(!hasSolo||!!p.solo);
  const [editor,showEditor]=useState(false),[picker,showPicker]=useState(false);
  const [tab,setTab]=useState<InstEditorTab>('snd');
  const [hit,setHit]=useState<{padId:string;step:number}|null>(null);
  const grid=useRef<HTMLDivElement>(null);
  const draggedPad=useRef<string|null>(null);
  const [dropTarget,setDropTarget]=useState<{id:string;after:boolean}|null>(null);


  const [,clipboardRevision]=useState(0);
  const latest=useRef({patch,selected});latest.current={patch,selected};
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;engine.scratchEnd();};},[engine]);
  useEffect(()=>{engine.scratchEnd();showPicker(false);},[engine,selected]);
  const pad=pads.find(p=>p.id===selected),inst=pad&&patch.instruments.find(i=>i.id===pad.instrumentId);
  const leaf=pad?padTrack(track,pad):null;
  const editPad=(id:string,update:Partial<DrumPad>,discrete=false)=>{
    if('muted' in update||'solo' in update)engine.stopAudition();
    (discrete?command:change)(p=>updatePad(p,track.id,id,update));
  };
  const editInstrument=(update:Partial<Instrument>,discrete=false)=>(discrete?command:change)(p=>updatePadInstrument(p,track.id,selected,update));
  const editPattern=(fn:(p:Pattern)=>Pattern,discrete=true)=>(discrete?command:change)(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,patterns:t.patterns.map(pt=>pt.id===pattern.id?fn(pt):pt)}:t)}));
  const toggle=(id:string,step:number)=>{
    editPattern(p=>({...p,steps:p.steps.map((s,i)=>i===step?{notes:s.notes.some(n=>n.padId===id)?s.notes.filter(n=>n.padId!==id):[...s.notes,{...makeNote(0,.8),padId:id,len:1}]}:s)}));
  };
  const noteInst=hit&&patch.instruments.find(i=>i.id===pads.find(p=>p.id===hit.padId)?.instrumentId);
  const editNote=(update:Partial<Note>,discrete=false,padId=hit?.padId)=>{if(hit)editPattern(p=>({...p,steps:p.steps.map((s,i)=>i===hit.step?{notes:s.notes.map(n=>n.padId===padId?{...n,...update}:n)}:s)}),discrete);};
  const wheelEdit=useRef<(e:WheelEvent)=>void>(()=>{});
  wheelEdit.current=(e:WheelEvent)=>{
    const cell=(e.target as HTMLElement).closest<HTMLElement>('.rack-cell');
    if(!cell)return;
    const step=Number(cell.dataset.step),padId=cell.dataset.pad;
    if(!pattern.steps[step]?.notes.some(n=>n.padId===padId))return;
    e.preventDefault();
    const delta=e.deltaY<0?1:-1;
    editPattern(p=>({...p,steps:p.steps.map((s,i)=>i===step?{...s,notes:s.notes.map(n=>n.padId!==padId?n:
      e.altKey?{...n,len:Math.min(64,Math.max(.1,+((n.len??1)+delta*.1).toFixed(2)))}:
      e.shiftKey?{...n,prob:Math.min(1,Math.max(0,n.prob+delta*.05))}:
      {...n,vel:Math.min(1,Math.max(.05,n.vel+delta*.05))})}:s)}),false);
  };
  useEffect(()=>{const el=grid.current;if(!el)return;const wheel=(e:WheelEvent)=>wheelEdit.current(e);el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
  const preview=(p:DrumPad,sound?:Instrument)=>{
    if(!padAudible(p))return;
    const i=sound??patch.instruments.find(i=>i.id===p.instrumentId);
    if(i)engine.previewSounding({...padTrack(track,p),...i,id:padTrackId(track.id,p.id),enabled:true});
  };
  const pick=(meta:SampleMeta)=>{editInstrument({waveform:'sample',sampleId:meta.id,sampleName:meta.name,sampleStart:undefined,sampleEnd:undefined},true);showPicker(false);};
  const load=async(file:File)=>{
    const owner=selected,source=inst;
    try{
      const meta=await putSample(file,file.name);
      const state=latest.current,currentPad=rackPads(state.patch.tracks.find(t=>t.id===track.id)??track).find(p=>p.id===owner);
      const current=state.patch.instruments.find(i=>i.id===currentPad?.instrumentId);
      if(mounted.current&&state.selected===owner&&current?.sampleId===source?.sampleId&&current?.waveform===source?.waveform)pick(meta);
    }catch(e){void alertDialog(String(e));}
  };
  const reorder=(id:string,targetId:string,after:boolean)=>{
    const from=pads.findIndex(p=>p.id===id),target=pads.findIndex(p=>p.id===targetId);
    const to=target+(after?1:0)-(from<target+(after?1:0)?1:0);
    if(from<0||target<0||from===to)return;
    select(id);command(p=>({...p,tracks:p.tracks.map(t=>{
    if(t.id!==track.id||t.device?.kind!=='rack')return t;
    const next=[...t.device.pads],index=next.findIndex(p=>p.id===id),at=next.findIndex(p=>p.id===targetId);
    if(index<0||at<0)return t;
    const [moved]=next.splice(index,1);next.splice(at+(after?1:0)-(index<at+(after?1:0)?1:0),0,moved);
    return {...t,device:{kind:'rack',pads:next}};
  })}));};
  const padDrop=(e:DragEvent<HTMLDivElement>,id:string,commit=false)=>{
    if(!draggedPad.current||!e.dataTransfer.types.includes('application/x-barlow-rack-pad'))return;
    e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';
    const box=e.currentTarget.querySelector('.rack-pad')!.getBoundingClientRect(),after=e.clientY>box.y+box.height/2;
    if(commit){reorder(draggedPad.current,id,after);draggedPad.current=null;setDropTarget(null);}
    else setDropTarget({id,after});
  };
  const duplicatePad=(pad:DrumPad)=>{
    const id=uid('pad');
    command(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,device:{kind:'rack',pads:[...rackPads(t),{...pad,id,name:`${pad.name} +`}]},
      patterns:t.patterns.map(pt=>({...pt,steps:pt.steps.map(s=>({notes:[...s.notes,...s.notes.filter(n=>n.padId===pad.id).map(n=>({...structuredClone(n),padId:id}))]}))}))}:t)}));
    select(id);
  };
  const removePad=(id:string)=>{
    const index=pads.findIndex(p=>p.id===id),next=pads[index+1]??pads[index-1];
    setHit(hit=>hit?.padId===id?(next?{...hit,padId:next.id}:null):hit);
    if(id===selected){
      if(next)select(next.id);
      engine.stopAudition();engine.scratchEnd();
    }
    command(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,device:{kind:'rack',pads:rackPads(t).filter(x=>x.id!==id)}}:t)}));
  };
  return <div className="drum-rack" data-help="drum-rack" data-ob="drum-rack">
    <div className="rack-actions">
      <strong>{msg('rack.title')}</strong>
      <label>{msg('rollTools.phase')}<NumField help="track.phase" value={track.phase} min={-64} max={64} onChange={phase=>change(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,phase}:t)}))}/></label>
      <button data-help="drum-rack" disabled={pads.length>=32} onClick={()=>command(p=>appendPad(p,track.id,`${msg('rack.pad')} ${pads.length+1}`))}
        onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-barlow-preset'))e.preventDefault();}}
        onDrop={e=>{e.preventDefault();try{const preset=JSON.parse(e.dataTransfer.getData('application/x-barlow-preset')) as InstrumentPreset;command(p=>appendPad(p,track.id,preset.name,preset));}catch{/* foreign drag */}}}>{msg('rack.addPad')}</button>

      <button data-help="rack-export" onClick={()=>{void exportDrumRack(patch,track).then(blob=>saveBlob(blob,`${track.name.replace(/[<>:"/\\|?*]/g,'-')}.barlow-rack.zip`)).catch(e=>alertDialog(String(e)));}}>{msg('rack.export')}</button>
      <div className="playback-controls-host"/>
    </div>
    <div className="rack-grid-scroll" ref={grid}><div className="rack-grid" style={{gridTemplateColumns:`300px repeat(${pattern.length}, 24px)`}}>
      <div className="playback-range-host"/>
      <span/>{pattern.steps.map((_,i)=><button className={'col-num rack-step'+(hit?.step===i?' sel':'')} data-help="rack-hit" key={i}
        aria-label={msg('rack.stepSettings',{p0:i+1})} aria-pressed={hit?.step===i}
        onClick={()=>setHit(hit?.step===i?null:{padId:selected,step:i})}>{i+1}</button>)}
      {pads.map(p=><div className={'rack-grid-row'+(dropTarget?.id===p.id?(dropTarget.after?' drop-after':' drop-before'):'')} key={p.id}
        onDragOver={e=>padDrop(e,p.id)} onDrop={e=>padDrop(e,p.id,true)}
        onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropTarget(null);}}>
        <div className={'rack-pad'+(p.id===selected?' selected':'')+(!padAudible(p)?' muted':'')} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-barlow-preset'))e.preventDefault();}}
          onDrop={e=>{const raw=e.dataTransfer.getData('application/x-barlow-preset');if(!raw)return;e.preventDefault();try{const preset=JSON.parse(raw) as InstrumentPreset;command(patch=>applyPadPreset(patch,padTrackId(track.id,p.id),preset));}catch{/* foreign drag */}}}>
          <span className="rack-pad-grip" data-help="rack-reorder" role="button" tabIndex={0} draggable title={msg('rack.reorder')} aria-label={`${msg('rack.reorder')}: ${p.name}`}
            onDragStart={e=>{e.stopPropagation();draggedPad.current=p.id;select(p.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-barlow-rack-pad',p.id);}}
            onDragEnd={()=>{draggedPad.current=null;setDropTarget(null);}}
            onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();const next=pads[pads.indexOf(p)+(e.key==='ArrowUp'?-1:1)];if(next)reorder(p.id,next.id,e.key==='ArrowDown');}}}>⠿</span>
          <button className="rack-pad-remove" data-help="rack-remove" title={msg('rack.remove')} aria-label={`${msg('rack.remove')}: ${p.name}`} onClick={()=>removePad(p.id)}>×</button>
          <button data-help="rack-duplicate" title={msg('rack.duplicate')} aria-label={`${msg('rack.duplicate')}: ${p.name}`} disabled={pads.length>=32} onClick={()=>duplicatePad(p)}>⧉</button>
          <button data-help="drum-rack" aria-label={`${msg('rack.preview')}: ${p.name}`} onClick={()=>preview(p)}>▶</button>
          <button className="rack-pad-name" data-help="drum-rack" aria-pressed={p.id===selected} onClick={()=>select(p.id)}>{p.name}</button>
          <button data-help="drum-rack" className={p.muted?'on':''} aria-label={`${msg('rack.mute')}: ${p.name}`} aria-pressed={!!p.muted} onClick={()=>editPad(p.id,{muted:!p.muted},true)}>M</button>
          <button data-help="drum-rack" className={p.solo?'on':''} aria-label={`${msg('rack.solo')}: ${p.name}`} aria-pressed={!!p.solo} onClick={()=>editPad(p.id,{solo:!p.solo},true)}>S</button>
        </div>
        {pattern.steps.map((step,i)=>{
          const n=step.notes.find(n=>n.padId===p.id);
          return <button key={i} className={'rack-cell'+(n?' on':'')+(activeStep===i?' playing':'')+(hit?.step===i?' inspected':'')}
            data-help="rack-hit" data-step={i} data-pad={p.id} aria-label={msg('rack.hit',{p0:p.name,p1:i+1})} aria-pressed={!!n}
            title={n?msg('rack.hitValues',{p0:Math.round(n.vel*100),p1:Math.round(n.prob*100)}):undefined}
            style={n?{opacity:.55+.45*n.vel}:undefined}
            onClick={e=>{select(p.id);if(e.shiftKey)setHit({padId:p.id,step:i});else toggle(p.id,i);}}
            onContextMenu={e=>{e.preventDefault();select(p.id);setHit({padId:p.id,step:i});}}
            onKeyDown={e=>{if(e.key==='F2'){e.preventDefault();select(p.id);setHit({padId:p.id,step:i});}}}>{n&&<>{n.prob<.995?Math.round(n.prob*100):(n.ratchet??1)>1?`×${n.ratchet}`:'●'}{n.prob<.995&&<span className="rack-prob" style={{width:`${n.prob*100}%`}}/>}</>}</button>;
        })}
      </div>)}
    </div></div>
    {pattern.steps.some(s=>s.notes.some(n=>!pads.some(p=>p.id===n.padId)))&&<p role="status">{msg('rack.missing')}</p>}
    {hit&&<div className="step-panel rack-step-panel" data-help="rack-hit">
      <div className="rack-step-heading"><span>{msg('trackRow.step').trim()} {hit.step+1}</span>
      {!pattern.steps[hit.step]?.notes.length&&<span>{msg('rack.emptyStep')}</span>}</div>
      {pattern.steps[hit.step]?.notes.map(note=>{
        const owner=pads.find(p=>p.id===note.padId);if(!owner)return null;
        const noteInst=patch.instruments.find(i=>i.id===owner.instrumentId);
        const leaf=padTrack(track,owner);
        const editHit=(update:Partial<Note>,discrete=false)=>editNote(update,discrete,owner.id);
        return <div key={owner.id} className="note-panel rack-hit-controls" data-help="rack-hit">
      <strong>{owner.name}</strong>
      <button data-help="drum-rack" onClick={()=>{copiedHit=structuredClone(note);clipboardRevision(v=>v+1);}}>{msg('rack.copyHit')}</button>
      <SliderField className="sp-field" variant="label" label={msg('trackRow.velocity')} title={msg('trackRow.thisNoteSVelocityAlsoAdjustableWith')} value={Math.round(note.vel*100)} min={5} max={100} step={5} display={`${Math.round(note.vel*100)}%`} unit="%" onChange={v=>editHit({vel:v/100})}/>
      <SliderField className="sp-field" variant="label" label={msg('trackRow.probability')} title={msg('trackRow.theChanceOfThisNotePlayingOn')} value={Math.round(note.prob*100)} min={0} max={100} step={5} display={`${Math.round(note.prob*100)}%`} unit="%" onChange={v=>editHit({prob:v/100})}/>
      <label>{msg('rack.pitchHz')}<NumField help="rack-hit" ariaLabel={msg('rack.pitchHz')} value={+(owner.freq*(scaleOf(track)[note.n]??1)).toFixed(2)} min={1} max={24000} step={1} onChange={hz=>change(p=>setRackHitHz(p,track.id,pattern.id,owner.id,hit.step,hz))}/></label>
      <label>{msg('trackRow.lengthLabel')}<NumField help="rack-hit" value={note.len??1} min={.1} max={64} step={.1} onChange={len=>editHit({len})}/></label>
      <label>{msg('trackRow.ratchets')}<NumField help="rack-hit" value={note.ratchet??1} min={1} max={8} onChange={ratchet=>editHit({ratchet})}/></label>
      <label>{msg('trackRow.offsetMs')}<NumField help="rack-hit" value={note.microTimingMs??0} min={-50} max={50} onChange={microTimingMs=>editHit({microTimingMs})}/></label>
      {!!noteInst?.sampleSlices?.length&&<select aria-label={msg('rack.slices')} value={note.sliceId??''} onChange={e=>editHit({sliceId:e.target.value||undefined})}><option value="">—</option>{noteInst.sampleSlices.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      {noteInst&&<NoteLocksEditor note={note} sounding={{...leaf,...noteInst}} onChange={(locks,command)=>editHit({locks},command)}/>}
    </div>;})}</div>}
    {pad&&leaf&&inst&&<>
      <div className="rack-pad-controls" data-ob="rack-pad-controls">
        <input aria-label={msg('rack.pad')} value={pad.name} maxLength={80} onChange={e=>editPad(pad.id,{name:e.target.value})}/>
        <button data-help="drum-rack" onClick={()=>onLibrary(leaf.id)}>{msg('rack.library')}</button>
        <button data-help="drum-rack" aria-pressed={editor} onClick={()=>showEditor(v=>!v)}>{msg('rack.sound')}</button>
        <span data-help="rack-volume"><SliderField variant="label" label={msg('rack.level')} value={Math.round(pad.volume*100)} min={0} max={100} display={`${Math.round(pad.volume*100)}%`} unit="%" onChange={v=>editPad(pad.id,{volume:v/100})}/></span>
        <span data-help="rack-pan"><SliderField variant="label" label={msg('trackRow.pan')} value={Math.round(pad.pan*100)} min={0} max={100} display={pad.pan===.5?msg('trackRow.center'):`${pad.pan<.5?'L':'R'}${Math.round(Math.abs(pad.pan-.5)*200)}`} unit="%" onChange={v=>editPad(pad.id,{pan:v/100})}/></span>
        <label>Hz <NumField help="drum-rack" value={pad.freq} min={20} max={9000} onChange={freq=>editPad(pad.id,{freq})}/></label>
        {!!inst.sampleSlices?.length&&<button data-help="drum-rack" disabled={pads.length+inst.sampleSlices.length>32} onClick={()=>command(p=>{
          let result=p;
          for(const slice of inst.sampleSlices??[])result=appendPad(result,track.id,slice.name,{name:slice.name,category:'мои',track:{...inst,sampleId:slice.sampleId,sampleName:slice.sampleName,sampleStart:slice.start,sampleEnd:slice.end,sampleSlices:undefined,sampleZones:undefined,freq:pad.freq}});
          return result;
        })}>{msg('rack.slices')}</button>}
      </div>
      <div className="rack-pad-controls">
        <label><input type="checkbox" checked={!!pad.mono} onChange={e=>editPad(pad.id,{mono:e.target.checked},true)}/>{msg('rack.mono')}</label>
        <label>{msg('rack.choke')}<NumField help="drum-rack" value={pad.chokeGroup??0} min={0} max={16} onChange={v=>editPad(pad.id,{chokeGroup:v||undefined})}/></label>
        <label>{msg('rack.priority')}<NumField help="drum-rack" value={pad.chokePriority??0} min={0} max={16} onChange={chokePriority=>editPad(pad.id,{chokePriority})}/></label>
      </div>
      <PadEffects effects={pad.effects??[]} onChange={(effects,command)=>editPad(pad.id,{effects},command)}/>
      {editor&&<InstrumentWorkspace key={pad.id} padSource track={leaf} inst={inst} pattern={pattern} bpm={patch.bpm} tab={tab} onTab={setTab}
        onChangeInst={editInstrument} onChangeTrack={()=>{}} onSlicePattern={()=>{}} onClose={()=>showEditor(false)}
        onPickSample={()=>showPicker(true)} onLoadSampleFile={file=>void load(file)} getPCM={id=>engine.getSamplePCM(id)}
        onPreviewRegion={(sound,a,b)=>engine.previewSampleRegion({...leaf,...sound,id:leaf.id},a,b)} onPreviewNote={sound=>preview(pad,sound)}
        onTransformSample={()=>{}} onGenerateSample={()=>{}} busy={false} onCancelSampleJob={()=>{}}
        onScratchBegin={pos=>engine.scratchBegin(leaf,pos)} onScratchMove={pos=>engine.scratchMove(pos)} onScratchEnd={()=>engine.scratchEnd()}
        onScratchPreview={()=>{void engine.previewScratch(leaf).then(why=>{if(why)void alertDialog(why);});}}
        onScratchSave={async(_,name)=>{try{await putSample(await engine.renderScratchWav(leaf),name??pad.name);}catch(e){void alertDialog(String(e));}}}
        onScratchPeaks={()=>engine.getSamplePeaks(inst.sampleId)} />}
      {picker&&<SamplePicker currentId={inst.sampleId} onPick={pick} onClose={()=>showPicker(false)}/>}
    </>}
    {hit&&<button data-help="drum-rack" disabled={!copiedHit} onClick={()=>{
      if(!copiedHit)return;
      if(copiedHit.sliceId&&!noteInst?.sampleSlices?.some(s=>s.id===copiedHit!.sliceId)){void alertDialog(msg('rack.pasteSlice'));return;}
      editPattern(p=>({...p,steps:p.steps.map((s,i)=>i===hit.step?{notes:[...s.notes.filter(n=>n.padId!==hit.padId),{...structuredClone(copiedHit!),padId:hit.padId}]}:s)}));
    }}>{msg('rack.pasteHit')}</button>}
  </div>;
}
