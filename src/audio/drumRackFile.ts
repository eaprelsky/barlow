import type { Patch, Track } from '../types';
import { makePattern, PATCH_VERSION, uid } from '../types';
import { rackPads } from '../music/drumRack';
import { exportProject, importProject } from './project';
import { t as msg } from '../i18n/runtime';

/** A kit is a versioned project archive with one rack, empty music and all
 * referenced instruments/assets. Old readers reject v59 instead of dropping pads. */
export async function exportDrumRack(patch:Patch,track:Track):Promise<Blob> {
  if(track.device?.kind!=='rack')throw Error(msg('rack.invalidFile'));
  const ids=new Set([track.instrumentId,...rackPads(track).map(p=>p.instrumentId)]);
  const pattern=makePattern('A',16),scene={id:'kit',name:track.name,slots:{[track.id]:{patternId:pattern.id}}};
  return exportProject({...patch,version:PATCH_VERSION,title:track.name,tracks:[{...track,patterns:[pattern],sidechain:undefined}],
    instruments:patch.instruments.filter(i=>ids.has(i.id)),scenes:[scene],chain:[{sceneId:scene.id,bars:1}],followChain:false});
}
export async function readDrumRack(file:File):Promise<{track:Track;instruments:Patch['instruments']}> {
  const patch=await importProject(file);
  if(!patch||patch.tracks.length!==1||patch.tracks[0].device?.kind!=='rack')throw Error(msg('rack.invalidFile'));
  const mapping=new Map(patch.instruments.map(i=>[i.id,uid('i')]));
  const source=patch.tracks[0],pattern=makePattern('A',16);
  const track:Track={...source,id:uid('t'),instrumentId:mapping.get(source.instrumentId)!,patterns:[pattern],
    sidechain:undefined,device:{kind:'rack',pads:rackPads(source).map(p=>({...p,id:uid('pad'),instrumentId:mapping.get(p.instrumentId)!}))}};
  return {track,instruments:patch.instruments.map(i=>({...i,id:mapping.get(i.id)!}))};
}
