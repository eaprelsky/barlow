import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { t as msg, useLocale } from '../i18n';
import type { AudioBackend } from '../audio/backend';
import type { PlaybackRange, Track, Pattern } from '../types';
import { MIN_RANGE_BEATS, normalizePlaybackRange } from '../audio/playbackRange';
import { effectiveRate, startStepIndex } from '../audio/timing';
import './PlaybackRangeEditor.css';

export function PlaybackRangeEditor({engine,sceneId,playing,maxBeats,onPlay,track,pattern}: {
  engine:AudioBackend;sceneId:string;playing:boolean;maxBeats?:number;onPlay:()=>void;track?:Track;pattern?:Pattern;
}) {
  useLocale();
  const key=`barlow.range.v1.${sceneId}`;
  const [range,setRange]=useState<PlaybackRange>(()=>{
    let saved={};try{saved=JSON.parse(localStorage.getItem(key)??'{}');}catch{/* optional workspace */}
    return normalizePlaybackRange({sceneId,startBeat:0,endBeat:4,variation:'evolving',seed:1,...saved,enabled:false},maxBeats);
  });
  const rangeRef=useRef(range);rangeRef.current=range;
  const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('barlow.range.collapsed')==='true';}catch{return false;}});
  const [past,setPast]=useState<PlaybackRange[]>([]);
  const [host,setHost]=useState<HTMLElement|null>(null);
  const [controlsHost,setControlsHost]=useState<HTMLElement|null>(null);
  const [cycle,setCycle]=useState(0);
  const stepBeat=track?effectiveRate(track,pattern)/4:.25;
  const length=pattern?.length??16;
  const phase=track&&pattern?startStepIndex(track,pattern):0;
  const extent=length*stepBeat,origin=(cycle*length-phase)*stepBeat;
  const limit=maxBeats??4096;
  const ruler=useRef<HTMLDivElement>(null);
  const gesture=useRef<{before:PlaybackRange;start:number;clientX:number;marker:'a'|'b'|'select'|'move';moved:boolean}|null>(null);
  // Moving the portal preserves the scene's range and undo history.
  useLayoutEffect(()=>{
    const refresh=()=>{
      const row=[...document.querySelectorAll<HTMLElement>('[data-track-id]')].find(el=>el.dataset.trackId===track?.id);
      setHost(row?.querySelector<HTMLElement>('.playback-range-host')??null);
      setControlsHost(row?.querySelector<HTMLElement>('.playback-controls-host')??null);
    };
    refresh();const observer=new MutationObserver(refresh);observer.observe(document.body,{subtree:true,childList:true});return()=>observer.disconnect();
  },[track?.id]);
  useEffect(()=>{setCycle(Math.max(0,Math.floor((rangeRef.current.startBeat/stepBeat+phase)/length)));},[track?.id,stepBeat,phase,length]);
  const update=(next:PlaybackRange,remember=true)=>{
    next=normalizePlaybackRange(next,maxBeats);const before=rangeRef.current;
    if(remember)setPast(p=>[...p.slice(-49),before]);
    rangeRef.current=next;setRange(next);engine.setPlaybackRange(next);
    try{localStorage.setItem(key,JSON.stringify({...next,enabled:false}));}catch{/* optional workspace */}
  };
  useEffect(()=>{engine.setPlaybackRange(rangeRef.current);return()=>engine.setPlaybackRange(null);},[engine,sceneId]);
  useEffect(()=>{const valid=normalizePlaybackRange(rangeRef.current,maxBeats);if(valid.endBeat!==rangeRef.current.endBeat)update(valid);},[maxBeats]);
  const engineEnabled=engine.playbackRange?.enabled;
  useEffect(()=>{if(playing&&range.enabled&&engineEnabled===false)setRange(r=>({...r,enabled:false}));},[playing,range.enabled,engineEnabled]);
  const coordinate=(e:PointerEvent)=>{
    const box=ruler.current!.getBoundingClientRect();
    const column=Math.max(0,Math.min(length,(e.clientX-box.left)/27));
    return Math.max(0,Math.min(limit,origin+(e.shiftKey?column:Math.round(column))*stepBeat));
  };
  const down=(e:PointerEvent,marker:'a'|'b'|'select'|'move')=>{
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus({preventScroll:true});
    gesture.current={before:rangeRef.current,start:coordinate(e),clientX:e.clientX,marker,moved:false};
  };
  const move=(e:PointerEvent)=>{
    const g=gesture.current;if(!g)return;
    if(Math.abs(e.clientX-g.clientX)>=3)g.moved=true;if(!g.moved)return;
    const beat=coordinate(e),before=g.before;
    let next=before;
    if(g.marker==='move'){
      const delta=Math.max(-before.startBeat,Math.min(limit-before.endBeat,beat-g.start));
      next={...before,startBeat:before.startBeat+delta,endBeat:before.endBeat+delta};
    }else if(g.marker==='a')next={...before,startBeat:Math.min(beat,before.endBeat-MIN_RANGE_BEATS)};
    else if(g.marker==='b')next={...before,endBeat:Math.max(beat,before.startBeat+MIN_RANGE_BEATS)};
    else next={...before,startBeat:Math.min(g.start,beat),endBeat:Math.max(g.start,beat)};
    rangeRef.current=normalizePlaybackRange(next,maxBeats);setRange(rangeRef.current);
  };
  const cancel=()=>{const g=gesture.current;if(g){rangeRef.current=g.before;setRange(g.before);gesture.current=null;}};
  const up=(e:PointerEvent)=>{
    const g=gesture.current;if(!g)return;move(e);gesture.current=null;
    if(!g.moved)return;
    const next=rangeRef.current;if(next.startBeat===g.before.startBeat&&next.endBeat===g.before.endBeat)return;
    setPast(p=>[...p.slice(-49),g.before]);update(next,false);
  };
  const pixel=(beat:number)=>(beat-origin)/stepBeat*27;
  const width=length*27-3;
  const left=Math.max(0,Math.min(width,pixel(range.startBeat))),right=Math.max(0,Math.min(width,pixel(range.endBeat)));
  const nudge=(delta:number)=>{const d=Math.max(-range.startBeat,Math.min(limit-range.endBeat,delta));update({...range,startBeat:range.startBeat+d,endBeat:range.endBeat+d});};
  if(!host||!track||!pattern)return null;
  const controls=<div className="range-controls" data-help="playback-range">
      <button data-help="playback-panel" aria-label={msg(collapsed?'range.show':'range.hide')} title={msg(collapsed?'range.show':'range.hide')} aria-expanded={!collapsed} onClick={()=>{setCollapsed(!collapsed);try{localStorage.setItem('barlow.range.collapsed',String(!collapsed));}catch{/* optional workspace */}}}>{collapsed?'▸':'▾'} {msg('range.panel')}</button>
      <button data-help="playback-toggle" aria-label={msg('range.title')} title={msg('range.title')} aria-pressed={range.enabled} onClick={()=>update({...range,enabled:!range.enabled})}>↻</button>
      {!collapsed&&<>
      <button data-help="playback-start" aria-label={msg('range.play')} title={msg('range.play')} onClick={()=>{update({...range,enabled:true});setCycle(Math.max(0,Math.floor((range.startBeat/stepBeat+phase)/length)));if(playing)engine.seekBeat(range.startBeat);else onPlay();}}>▶</button>
      <button data-help="playback-variations" title={msg('range.fixedHelp')} aria-label={msg('range.fixed')} aria-pressed={range.variation==='fixed'} onClick={()=>update({...range,variation:range.variation==='fixed'?'evolving':'fixed'})}>⚄</button>
      </>}
    </div>;
  return <>{controlsHost&&createPortal(controls,controlsHost)}{createPortal(<section className={'playback-range'+(controlsHost?' inline-controls':'')+(collapsed?' collapsed':'')} data-help="playback-range" data-ob="playback-range" style={{width}} onKeyDown={e=>{
    if(e.key==='Escape'&&gesture.current){e.preventDefault();e.stopPropagation();cancel();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();e.stopPropagation();const previous=past.at(-1);if(previous){setPast(p=>p.slice(0,-1));update(previous,false);}}
    if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();e.stopPropagation();setCycle(c=>Math.max(0,Math.min(Math.ceil((limit/stepBeat+phase)/length)-1,c+(e.key==='PageUp'?-1:1))));}
  }}>
    {!controlsHost&&controls}
    {!collapsed&&<div className="range-ruler" data-help="playback-ruler" ref={ruler} tabIndex={0} aria-label={msg('range.title')} onPointerDown={e=>down(e,'select')} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
      {right>left&&<div role="button" tabIndex={0} aria-label={msg('range.move')} title={msg('range.move')} data-help="playback-move" className="range-selection" style={{left,width:right-left}}
        onPointerDown={e=>down(e,'move')} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();nudge((e.key==='ArrowLeft'?-1:1)*stepBeat*(e.shiftKey?.04:1));}}}/>}
      {(['a','b'] as const).map(marker=>{const field=marker==='a'?'startBeat':'endBeat',at=range[field];if(at<origin||at>origin+extent)return null;return <button key={marker} className={'range-marker '+marker} data-help={marker==='a'?'playback-a':'playback-b'}
        aria-label={msg(marker==='a'?'range.start':'range.end')} title={`${marker.toUpperCase()}: ${+((at-origin)/stepBeat+1).toFixed(3)}`} style={{left:Math.max(0,Math.min(width,pixel(at)))}}
        onPointerDown={e=>down(e,marker)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const at=range[field]+(e.key==='ArrowLeft'?-1:1)*stepBeat*(e.shiftKey?.04:1);update({...range,[field]:marker==='a'?Math.min(at,range.endBeat-MIN_RANGE_BEATS):Math.max(at,range.startBeat+MIN_RANGE_BEATS)});}}}>{marker.toUpperCase()}</button>;})}
      {playing&&engine.currentBeat>=origin&&engine.currentBeat<=origin+extent&&<i className="range-playhead" style={{left:Math.min(width,pixel(engine.currentBeat))}}/>}
    </div>}
  </section>,host)}</>;
}
