import type { DrumPad, Patch, Track } from '../types';
import type { Instrument } from '../types';
import { instrumentOfFields, makeTrackWithInstrument, uid, scaleOf } from '../types';
import type { InstrumentPreset } from './instrumentPresets';
import { recommendedHz } from './audition';
import { instantiateEffects } from './effectAddress';

export const padTrackId = (trackId:string,padId:string) => `rack:${encodeURIComponent(trackId)}:${encodeURIComponent(padId)}`;
export const rackPads = (track:Track):DrumPad[] => track.device?.kind==='rack'?track.device.pads:[];
export const libraryTracks = (patch:Patch):Track[] => patch.tracks.flatMap(t=>t.device?.kind==='rack'?rackPads(t).map(p=>padTrack(t,p)):[t]);
export function findPad(patch:Patch, address:string) {
  for(const track of patch.tracks)for(const pad of rackPads(track))if(padTrackId(track.id,pad.id)===address)return {track,pad};
}
export function updatePad(patch:Patch,trackId:string,padId:string,update:Partial<DrumPad>):Patch {
  return {...patch,tracks:patch.tracks.map(t=>t.id===trackId&&t.device?.kind==='rack'
    ?{...t,device:{kind:'rack',pads:t.device.pads.map(p=>p.id===padId?{...p,...update,id:p.id}:p)}}:t)};
}
/** Add an exact tuning ratio and remap every existing note by its old ratio. */
export function setRackHitHz(patch:Patch,trackId:string,patternId:string,padId:string,step:number,hz:number):Patch {
  const track=patch.tracks.find(t=>t.id===trackId),pad=track&&rackPads(track).find(p=>p.id===padId);
  if(!track||!pad||!Number.isFinite(hz)||hz<=0)return patch;
  const old=scaleOf(track),ratio=+(hz/pad.freq).toFixed(9);
  const scale=[...new Set([...old,ratio])].sort((a,b)=>a-b);
  return {...patch,tracks:patch.tracks.map(t=>t!==track?t:{...t,scale,scaleOctUp:0,scaleOctDown:0,
    patterns:t.patterns.map(pt=>({...pt,steps:pt.steps.map((s,i)=>({...s,notes:s.notes.map(n=>({...n,n:scale.indexOf(pt.id===patternId&&i===step&&n.padId===padId?ratio:old[n.n]??1)}))}))}))})};
}
export function updatePadInstrument(patch:Patch,trackId:string,padId:string,update:Partial<Instrument>):Patch {
  const track=patch.tracks.find(t=>t.id===trackId),pad=track&&rackPads(track).find(p=>p.id===padId);
  const inst=pad&&patch.instruments.find(i=>i.id===pad.instrumentId);if(!pad||!inst)return patch;
  const owners=patch.tracks.flatMap(t=>[t.instrumentId,...rackPads(t).map(p=>p.instrumentId)]).filter(id=>id===inst.id).length;
  const next={...inst,...update,id:owners>1?uid('i'):inst.id};
  const p=owners>1?updatePad(patch,trackId,padId,{instrumentId:next.id}):patch;
  return {...p,instruments:owners>1?[...p.instruments,next]:p.instruments.map(i=>i.id===next.id?next:i)};
}
export function applyPadPreset(patch:Patch,address:string,preset:InstrumentPreset):Patch {
  const found=findPad(patch,address);if(!found)return patch;
  const {track,pad}=found,hz=recommendedHz(preset.track);
  const inst=instrumentOfFields({...preset.track,recommendedHz:hz},pad.instrumentId,preset.name);
  return updatePad(updatePadInstrument(patch,track.id,pad.id,inst),track.id,pad.id,
    {name:preset.name,freq:hz,...instantiateEffects(preset.track.effects,preset.track.mods),mono:preset.track.mono});
}
export function appendPad(patch:Patch,trackId:string,name:string,preset?:InstrumentPreset):Patch {
  const track=patch.tracks.find(t=>t.id===trackId);if(!track||track.device?.kind!=='rack'||track.device.pads.length>=32)return patch;
  const instrument=instrumentOfFields(preset?.track??{},uid('i'),preset?.name??name);
  const pad:DrumPad={id:uid('pad'),name:preset?.name??name,instrumentId:instrument.id,
    freq:preset?recommendedHz(preset.track):220,volume:preset?.track.volume??.8,pan:preset?.track.pan??.5,...instantiateEffects(preset?.track.effects,preset?.track.mods),mono:preset?.track.mono};
  return {...patch,instruments:[...patch.instruments,instrument],tracks:patch.tracks.map(t=>t.id===trackId?{...t,device:{kind:'rack',pads:[...rackPads(t),pad]}}:t)};
}
export function addRack(patch:Patch,name:string,presets:InstrumentPreset[]=[]):Patch {
  const {track,instrument}=makeTrackWithInstrument({id:uid('t'),name,scale:[1],volume:.8});
  instrument.filterFreq=12000;instrument.filterLow=20;
  track.device={kind:'rack',pads:[]};
  let result:Patch={...patch,version:59,tracks:[track,...patch.tracks],instruments:[...patch.instruments,instrument],
    scenes:patch.scenes.map(s=>({...s,slots:{...s.slots,[track.id]:{patternId:track.patterns[0].id}}}))};
  for(const preset of presets)result=appendPad(result,track.id,preset.name,preset);
  return result;
}

/** A pad uses the existing instrument engine; its owner stays distinct for
 * mono, round robin, scratch, budgets and deterministic random streams. */
export function padTrack(track:Track,pad:DrumPad):Track {
  const solo=rackPads(track).some(p=>p.solo);
  return {...track,id:padTrackId(track.id,pad.id),name:`${track.name} / ${pad.name}`,instrumentId:pad.instrumentId,
    device:undefined,rackParentId:track.id,rackPadId:pad.id,rackBus:false,
    freq:pad.freq,volume:pad.volume,pan:pad.pan,
    mono:pad.mono,chokeGroup:pad.chokeGroup,chokePriority:pad.chokePriority,portamentoSec:0,
    effects:pad.effects,mods:pad.mods??[],sidechain:undefined,arp:undefined,spaceSend:0,
    enabled:track.enabled!==false&&!pad.muted&&(!solo||!!pad.solo),
    patterns:track.patterns.map(pattern=>({...pattern,id:padTrackId(pattern.id,pad.id),
      volume:1,pan:undefined,mods:undefined,automation:undefined,fadeIn:0,fadeOut:0,
      steps:pattern.steps.map(step=>({notes:step.notes.filter(note=>note.padId===pad.id)}))}))};
}

const cache=new WeakMap<Patch,Patch>();
/** Compile rack destinations to leaf voices plus a shared bus. Neither the
 * editable patch nor persisted IDs are changed. Used by BOTH live and WAV. */
export function expandDrumRacks(patch:Patch):Patch {
  if(!patch.tracks.some(t=>t.device?.kind==='rack'))return patch;
  const cached=cache.get(patch);if(cached)return cached;
  const tracks:Track[]=[];
  for(const [index,track] of patch.tracks.entries()) {
    if(track.device?.kind!=='rack'){tracks.push(track);continue;}
    tracks.push({...track,device:undefined,rackBus:true,mono:false,arp:undefined,
      patterns:track.patterns.map(p=>({...p,steps:p.steps.map(()=>({notes:[]}))}))});
    for(const pad of track.device.pads) {
      const leaf=padTrack(track,pad);
      if(!patch.instruments.some(i=>i.id===pad.instrumentId))leaf.enabled=false;
      // Local groups never collide with legacy global groups 1…16.
      if(leaf.chokeGroup)leaf.chokeGroup=17+index*16+leaf.chokeGroup;
      tracks.push(leaf);
    }
  }
  const scenes=patch.scenes.map(scene=>{
    const slots={...scene.slots};
    for(const leaf of tracks.filter(t=>t.rackParentId)){
      const parent=slots[leaf.rackParentId!];
      slots[leaf.id]={patternId:parent?padTrackId(parent.patternId,leaf.rackPadId!):leaf.patterns[0].id,
        muted:!!parent?.muted||!!scene.soloTrackId&&scene.soloTrackId!==leaf.rackParentId};
    }
    // Solo was resolved above for pads; mute other root tracks explicitly.
    if(scene.soloTrackId)for(const track of patch.tracks)if(track.id!==scene.soloTrackId&&slots[track.id])slots[track.id]={...slots[track.id],muted:true};
    return {...scene,slots,soloTrackId:undefined};
  });
  const result={...patch,tracks,scenes};cache.set(patch,result);return result;
}
