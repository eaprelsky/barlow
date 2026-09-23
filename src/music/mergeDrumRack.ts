import type { Patch } from '../types';
import { patternInScene, uid } from '../types';
import { addRack } from './drumRack';

/** Copy compatible parts of ONE scene. Keep originals, muted in that scene.
 * Refuse combinations whose timing/routing would change on a shared grid. */
export function mergeRackIssue(patch:Patch,sceneId:string,ids:string[]):'count'|'timing'|'routing'|null {
  const tracks=patch.tracks.filter(t=>ids.includes(t.id)),scene=patch.scenes.find(s=>s.id===sceneId);
  if(!scene||tracks.length<2||tracks.length>32||tracks.some(t=>t.device?.kind==='rack'))return 'count';
  const signature=(t:typeof tracks[number])=>{const p=patternInScene(t,scene);return JSON.stringify([p.length,p.rate??t.rate,t.phase,t.scale,t.scaleOctDown??0,t.scaleOctUp??0,p.fadeIn??.005,p.fadeOut??.05]);};
  if(tracks.some(t=>signature(t)!==signature(tracks[0])))return 'timing';
  if(scene.soloTrackId||tracks.some(t=>t.arp||t.sidechain||t.chokeGroup||(t.portamentoSec??0)>0||(t.spaceSend??0)>0||t.volume*(patternInScene(t,scene).volume??1)>1||patternInScene(t,scene).automation?.length)||patch.tracks.some(t=>t.sidechain&&ids.includes(t.sidechain.sourceId)))return 'routing';
  return null;
}
export function mergeSceneIntoRack(patch:Patch,sceneId:string,ids:string[],name:string):Patch {
  if(mergeRackIssue(patch,sceneId,ids))return patch;
  const scene=patch.scenes.find(s=>s.id===sceneId)!,sources=patch.tracks.filter(t=>ids.includes(t.id));
  const created=addRack(patch,name),rack=created.tracks[0],first=sources[0],pattern=patternInScene(first,scene);
  const pads=sources.map(t=>{const part=patternInScene(t,scene);return {id:uid('pad'),name:t.name,instrumentId:t.instrumentId,freq:t.freq,volume:t.volume*(part.volume??1),pan:part.pan??t.pan,effects:structuredClone(t.effects??[]),mods:structuredClone(part.mods??t.mods),mono:t.mono,muted:t.enabled===false||!!scene.slots[t.id]?.muted};});
  const combined={...rack,volume:1,pan:.5,rate:first.rate,phase:first.phase,scale:[...first.scale],scaleOctDown:first.scaleOctDown,scaleOctUp:first.scaleOctUp,
    device:{kind:'rack' as const,pads},patterns:[{...structuredClone(pattern),id:rack.patterns[0].id,volume:1,pan:undefined,mods:undefined,
      steps:pattern.steps.map((_,step)=>({notes:sources.flatMap((t,i)=>patternInScene(t,scene).steps[step].notes.map(n=>({...structuredClone(n),padId:pads[i].id})))}))}]};
  return {...created,tracks:created.tracks.map(t=>t.id===rack.id?combined:t),scenes:created.scenes.map(s=>({...s,slots:{...s.slots,
    ...Object.fromEntries(s.id===sceneId?ids.map(id=>[id,{...s.slots[id],patternId:patternInScene(sources.find(t=>t.id===id)!,scene).id,muted:true}]):[]),
    [rack.id]:{patternId:combined.patterns[0].id,muted:s.id!==sceneId}}}))};
}
