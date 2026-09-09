import { t as msg, useLocale, getLocale } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { NumField } from './NumField';
import { pickAudioFile, saveBlob } from '../platform';
import { audioBufferToWav } from '../audio/wav';
import { putSample } from '../audio/library';
import { exportInstrument } from '../audio/instrumentFile';
import { loadUserPresets, saveUserPreset, type InstrumentPreset } from '../music/instrumentPresets';
import { separateFragment, STEM_LABELS, type Stem } from '../ai/separation';
import type { Instrument } from '../types';

export function SoundWorkshop({ apiKey, onPreview, onStop, onClose }: {apiKey:string;onStop:()=>void;onPreview:(preset:InstrumentPreset)=>void;onClose:()=>void}) {
  useLocale();
  const fileInput=useRef<HTMLInputElement>(null), context=useRef<AudioContext|null>(null), source=useRef<AudioBufferSourceNode|null>(null);
  const worker=useRef<Worker|null>(null), job=useRef<AbortController|null>(null), drag=useRef<number|null>(null);
  const stopPreview=useRef(onStop);stopPreview.current=onStop;
  const [buffer,setBuffer]=useState<AudioBuffer>(),[original,setOriginal]=useState<AudioBuffer>(),[stems,setStems]=useState<Partial<Record<Stem,AudioBuffer>>>({});
  const [from,setFrom]=useState(0),[to,setTo]=useState(1),[root,setRoot]=useState(110),[name,setName]=useState(msg("soundWorkshop.myRegion"));
  const [model,setModel]=useState<Partial<Instrument>>(),[busy,setBusy]=useState(''),[status,setStatus]=useState(''),[selected,setSelected]=useState(msg("soundWorkshop.region"));
  const stop=()=>{onStop();try{source.current?.stop();}catch{}source.current=null;};
  const cancel=()=>{job.current?.abort();job.current=null;worker.current?.terminate();worker.current=null;setBusy('');};
  useEffect(()=>()=>{stopPreview.current();job.current?.abort();worker.current?.terminate();try{source.current?.stop();}catch{}void context.current?.close();},[]);
  const ctx=()=>context.current??(context.current=new AudioContext());
  const valid=!!buffer&&to>from&&to-from<=30&&to-from>=.03;
  const region=()=>{if(!buffer||!valid)throw Error(msg("soundWorkshop.selectARegionLasting00330"));return {from:Math.round(from*buffer.sampleRate),to:Math.round(to*buffer.sampleRate),fadeFrames:Math.round(.003*buffer.sampleRate)};};
  const fragment=()=>audioBufferToWav(buffer!,region());
  const resetSelection=(b:AudioBuffer,label:string)=>{stop();setBuffer(b);setFrom(0);setTo(Math.floor(Math.min(5,b.duration)*1000)/1000);setModel(undefined);setSelected(label);};
  const run=async(label:string,fn:(signal:AbortSignal)=>Promise<void>)=>{
    if(job.current)return;const controller=new AbortController();job.current=controller;setBusy(label);setStatus('');
    try{await fn(controller.signal);}catch(e){if(!controller.signal.aborted)setStatus(String(e instanceof Error?e.message:e));}finally{if(job.current===controller){job.current=null;setBusy('');}}
  };
  const open=async(f:File)=>run(msg("soundWorkshop.readingAudio"),async signal=>{
    if(f.size>32*1024*1024)throw Error(msg("soundWorkshop.fileExceeds32MiBPrepareAShorter"));
    const b=await ctx().decodeAudioData(await f.arrayBuffer());signal.throwIfAborted();
    if(b.duration>600||b.numberOfChannels>2)throw Error(msg("soundWorkshop.recordingsMustBeMonoOrStereoAnd"));
    setOriginal(b);setStems({});resetSelection(b,msg("soundWorkshop.original"));setName(f.name.replace(/\.[^.]+$/,'').slice(0,140));
  });
  const waveform=useMemo(()=>{if(!buffer)return '';const x=buffer.getChannelData(0);return Array.from({length:600},(_,i)=>{const a=Math.floor(i*x.length/600),b=Math.floor((i+1)*x.length/600);let peak=0;for(let n=a;n<b;n++)peak=Math.max(peak,Math.abs(x[n]));return `M${i},${55-peak*50}V${55+peak*50}`;}).join(' ');},[buffer]);
  const analyze=(pitchOnly=false)=>void run(pitchOnly?msg("soundWorkshop.detectingRootFrequency"):msg("soundWorkshop.buildingSoundModel"),async signal=>{
    const r=region(),b=buffer!,samples=new Float32Array(r.to-r.from);
    for(let c=0;c<b.numberOfChannels;c++){const data=b.getChannelData(c);for(let i=0;i<samples.length;i++)samples[i]+=data[r.from+i]/b.numberOfChannels;}
    const w=new Worker(new URL('../audio/timbreAnalysis.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{w.terminate();reject(new DOMException(msg("soundWorkshop.canceled"),'AbortError'));};signal.addEventListener('abort',abort,{once:true});
      const end=()=>{signal.removeEventListener('abort',abort);w.terminate();worker.current=null;};
      w.onmessage=e=>{end();if(e.data.error){reject(Error(e.data.error));return;}if(e.data.pitch){setRoot(e.data.pitch.hz);setModel(undefined);setStatus(e.data.pitch.confidence<.6?msg("soundWorkshop.couldNotDetectAReliablePitchSet"):msg("soundWorkshop.estimateHzCheckByEar", {p0: e.data.pitch.hz}));}else{setModel(e.data.sound);setStatus(msg("soundWorkshop.harmonicModelReady"));}resolve();};
      w.onerror=()=>{end();reject(Error(msg("soundWorkshop.analysisFailed")));};w.postMessage({locale:getLocale(),samples,sampleRate:b.sampleRate,...(pitchOnly?{}:{rootHz:root})},[samples.buffer]);
    });
  });
  const preset=async(synthetic:boolean):Promise<InstrumentPreset>=>{
    if(!name.trim())throw Error(msg("soundWorkshop.giveTheInstrumentAName"));
    let sound:Partial<Instrument>;
    if(synthetic){if(!model)throw Error(msg("soundWorkshop.buildAModelFirst"));sound=model;}
    else{const meta=await putSample(fragment(),name);sound={waveform:'sample',sampleId:meta.id,sampleName:name,sampleMode:'plain',rootHz:root,recommendedHz:root,attack:.003,decay:.1,sustain:1,sampleStart:0,sampleEnd:to-from};}
    return {name:name.trim().slice(0,160),category:'свои',track:sound,tags:['workshop',synthetic?'resynthesis':'sample'],hint:synthetic?msg("soundWorkshop.approximateHarmonicModelOfARecordingRegion"):msg("soundWorkshop.samplerFromASelectedRecordingRegion")};
  };
  const save=(synthetic:boolean,exportFile=false)=>void run(exportFile?msg("soundWorkshop.preparingFile"):msg("soundWorkshop.savingInstrument"),async signal=>{
    const p=await preset(synthetic);signal.throwIfAborted();
    if(exportFile){const blob=await exportInstrument(p);signal.throwIfAborted();await saveBlob(blob,`${p.name}.barlow-instrument.zip`);}
    else{const names=new Set(loadUserPresets().map(x=>x.name));const base=p.name;for(let n=2;names.has(p.name);n++)p.name=`${base.slice(0,150)} (${n})`;saveUserPreset(p.name,p.track,{tags:p.tags,hint:p.hint});}
    setStatus(exportFile?msg("soundWorkshop.fileReady"):msg("soundWorkshop.inLibrary")+p.name);
  });
  return <Modal label={msg("soundWorkshop.soundWorkshop")} className="sound-workshop" onClose={onClose}><div data-help="sound-workshop">
    <header className="studio-heading"><h3>{msg("soundWorkshop.soundWorkshop")}</h3><button aria-label={msg("soundWorkshop.closeWorkshop")} onClick={onClose}>×</button></header>
    <input hidden ref={fileInput} type="file" accept="audio/*" onChange={e=>{if(e.target.files?.[0])void open(e.target.files[0]);e.target.value='';}} />
    <div className="mseg-toolbar"><button disabled={!!busy} onClick={()=>void pickAudioFile(()=>fileInput.current?.click()).then(f=>{if(f)void open(f);}).catch(e=>setStatus(String(e)))}>{msg("soundWorkshop.openAudio")}</button><span>{selected}</span><button onClick={stop}>{msg("soundWorkshop.stop")}</button></div>
    {buffer&&<><svg data-help="workshop-region" className="workshop-wave" viewBox="0 0 600 110" preserveAspectRatio="none" aria-label={msg("soundWorkshop.regionSelection")} onPointerDown={e=>{if(busy)return;const r=e.currentTarget.getBoundingClientRect();drag.current=Math.max(0,Math.min(buffer.duration,(e.clientX-r.left)/r.width*buffer.duration));e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current===null)return;const r=e.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(buffer.duration,(e.clientX-r.left)/r.width*buffer.duration));setFrom(Math.min(drag.current,x));setTo(Math.max(drag.current,x));setModel(undefined);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><path d={waveform} stroke="var(--accent)" strokeWidth="1"/><rect x={from/buffer.duration*600} width={(to-from)/buffer.duration*600} height="110" fill="var(--accent)" opacity=".18"/></svg>
    <div className="mseg-toolbar" data-help="workshop-region"><label>{msg("soundWorkshop.startS")}<NumField disabled={!!busy} value={from} min={0} max={Math.max(0,to-.03)} step={.001} onChange={v=>{setFrom(v);setModel(undefined);}}/></label><label>{msg("soundWorkshop.endS")}<NumField disabled={!!busy} value={to} min={from+.03} max={buffer.duration} step={.001} onChange={v=>{setTo(v);setModel(undefined);}}/></label><output>{(to-from).toFixed(2)} {msg("soundWorkshop.s")}</output><button disabled={!valid||!!busy} onClick={()=>{stop();void ctx().resume();const s=ctx().createBufferSource();s.buffer=buffer;s.connect(ctx().destination);s.start(0,from,to-from);source.current=s;}}>{msg("soundWorkshop.region32")}</button></div>
    <div className="mseg-toolbar"><label>{msg("soundWorkshop.name")}<input disabled={!!busy} value={name} maxLength={160} onChange={e=>setName(e.target.value)}/></label><label data-help="workshop-root">{msg("soundWorkshop.rootHz")}<NumField disabled={!!busy} value={root} min={30} max={2000} step={.1} onChange={v=>{setRoot(v);setModel(undefined);}}/></label><button data-help="workshop-root" disabled={!valid||!!busy} onClick={()=>analyze(true)}>{msg("soundWorkshop.detect")}</button></div>
    <div className="mseg-toolbar"><button disabled={!valid||!!busy} onClick={()=>save(false)}>{msg("soundWorkshop.saveSamplerToLibrary")}</button><button disabled={!valid||!!busy} onClick={()=>save(false,true)}>{msg("soundWorkshop.exportSampler")}</button></div>
    <details data-help="workshop-separate"><summary>{msg("soundWorkshop.separateSources")}</summary><div className="mseg-toolbar"><button disabled={!valid||!!busy||!apiKey} onClick={()=>void run(msg("soundWorkshop.separating"),async signal=>{const blobs=await separateFragment(fragment(),apiKey,signal,setBusy),decoded:Partial<Record<Stem,AudioBuffer>>={};for(const [k,v]of Object.entries(blobs)){decoded[k as Stem]=await ctx().decodeAudioData(await v.arrayBuffer());signal.throwIfAborted();}setStems(decoded);setStatus(msg("soundWorkshop.chooseAStem"));})}>{msg("soundWorkshop.sendRegionToFalAiPaid")}</button>{!apiKey&&<span role="status">{msg("soundWorkshop.addAFalAiKeyInSettings")}</span>}</div><div className="mseg-toolbar">{original&&<button disabled={!!busy} onClick={()=>resetSelection(original,msg("soundWorkshop.original"))}>{msg("soundWorkshop.original")}</button>}{Object.entries(stems).map(([k,b])=><button key={k} disabled={!!busy} onClick={()=>resetSelection(b!,STEM_LABELS[k as Stem])}>{STEM_LABELS[k as Stem]}</button>)}</div></details>
    <details data-help="workshop-model"><summary>{msg("soundWorkshop.approximateSoundModeling")}</summary><div className="mseg-toolbar"><button disabled={!valid||!!busy} onClick={()=>analyze()}>{msg("soundWorkshop.buildModel")}</button><button disabled={!model||!!busy} onClick={()=>{stop();onPreview({name,category:'свои',track:model!});}}>{msg("soundWorkshop.model")}</button><button disabled={!model||!!busy} onClick={()=>save(true)}>{msg("soundWorkshop.saveModelToLibrary")}</button><button disabled={!model||!!busy} onClick={()=>save(true,true)}>{msg("soundWorkshop.exportModel")}</button></div></details></>}
    {busy&&<div className="mseg-toolbar"><progress aria-label={busy}/><span>{busy}</span><button onClick={cancel}>{msg("soundWorkshop.cancel")}</button></div>}{status&&<p role="status">{status}</p>}
  </div></Modal>;
}
