import { t as msg } from '../i18n/runtime.ts';
import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { PATCH_VERSION, instrumentOfFields, type InstrumentPackFile } from '../types';
import { checkedSound } from './instrumentFile';
import { getSampleBlob, listSamples, putSamples } from './library';
import { sampleAssets } from '../music/sampleZones';
import { appendUserPack, presetFields, type InstrumentPreset } from '../music/instrumentPresets';
const MiB=1024*1024;
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const hash=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const assetIds=(p:InstrumentPreset)=>new Set(sampleAssets(instrumentOfFields(p.track,'pack',p.name)).map(a=>a.sampleId).filter((id):id is string=>!!id));
export interface PackJob { signal?:AbortSignal; progress?:(percent:number)=>void }
const tick=(job:PackJob,n:number)=>{job.signal?.throwIfAborted();job.progress?.(Math.round(n));};
const validName=(v:unknown,max=160)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
function checkedPreset(p:InstrumentPackFile['instruments'][number]):InstrumentPreset {
 check(p&&validName(p.id,128)&&validName(p.name),msg("instrumentPack.invalidInstrumentNameOrID"));
 check(p.hint===undefined||typeof p.hint==='string'&&p.hint.length<=600,msg("instrumentPack.invalidInstrumentDescription"));
 check(p.tags===undefined||Array.isArray(p.tags)&&p.tags.length<=16&&p.tags.every(t=>typeof t==='string'&&t.length<=100),msg("instrumentPack.invalidTags"));
 return {id:p.id,name:p.name,hint:p.hint,tags:p.tags,category:'мои',track:checkedSound(p.sound,p.name)};
}
export async function exportPack(name:string,description:string,presets:InstrumentPreset[],job:PackJob={}):Promise<Blob> {
 check(validName(name)&&description.length<=2000,msg("instrumentPack.checkThePackNameAndDescription"));check(presets.length>0&&presets.length<=64,msg("instrumentPack.select1To64Instruments"));tick(job,0);
 const instruments=presets.map((p,i)=>{const row={id:`instrument-${i+1}`,name:p.name,hint:p.hint,tags:p.tags,sound:presetFields(p.track)};checkedPreset(row);return row;});
 const manifest:InstrumentPackFile={format:'barlow-pack',version:1,patchVersion:PATCH_VERSION,name,description,instruments,samples:[]};
 const ids=[...new Set(presets.flatMap(p=>[...assetIds(p)]))];check(ids.length<=511,msg("instrumentPack.thePackContainsMoreThan511Samples"));
 const metadata=new Map((await listSamples()).map(p=>[p.id,p]));const files:Record<string,Uint8Array>={};let total=0;
 for(const [i,id] of ids.entries()) {tick(job,5+75*i/Math.max(1,ids.length));const blob=await getSampleBlob(id);check(blob,msg("instrumentPack.sampleIsMissing", {p0: id}));check(blob!.size<=64*MiB,msg("instrumentPack.theSampleExceeds64MiB"));const bytes=new Uint8Array(await blob!.arrayBuffer());check(await hash(bytes)===id,msg("instrumentPack.theSampleIsDamaged"));files[`samples/${id}`]=bytes;total+=bytes.length;check(total<=120*MiB,msg("instrumentPack.thePackExceeds120MiB"));manifest.samples.push({id,name:metadata.get(id)?.name??id,mime:blob!.type});}
 const json=strToU8(JSON.stringify(manifest));check(json.length<=8*MiB,msg("instrumentPack.packSettingsExceed8MiB"));files['pack.json']=json;tick(job,85);
 const bytes=await new Promise<Uint8Array<ArrayBuffer>>((resolve,reject)=>{
   const abort=()=>{terminate();reject(new DOMException(msg("instrumentPack.cancelled"),'AbortError'));};
   const terminate=zip(files,{level:0},(error,data)=>{job.signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(new Uint8Array(data));});
   job.signal?.addEventListener('abort',abort,{once:true});if(job.signal?.aborted)abort();
 });check(bytes.length<=128*MiB,msg("instrumentPack.theArchiveExceeds128MiB"));tick(job,100);return new Blob([bytes],{type:'application/zip'});
}
export interface PreparedPack { name:string;description:string;presets:InstrumentPreset[];samples:Map<string,{blob:Blob;name:string}> }
export async function preparePack(file:Blob,job:PackJob={}):Promise<PreparedPack> {
 check(file.size<=128*MiB,msg("instrumentPack.theArchiveExceeds128MiB"));tick(job,0);const bytes=new Uint8Array(await file.arrayBuffer());tick(job,5);
 const files=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>{
   let total=0,invalid=false;const paths=new Set<string>();
   const abort=()=>{terminate();reject(new DOMException(msg("instrumentPack.cancelled"),'AbortError'));};
   const terminate=unzip(bytes,{filter:entry=>{
     const limit=entry.name==='pack.json'?8*MiB:/^samples\/[a-f0-9]{64}$/.test(entry.name)?64*MiB:0;
     total+=entry.originalSize;
     if(!limit||paths.has(entry.name)||paths.size>=512||entry.originalSize>limit||entry.size>limit+MiB||total>256*MiB){invalid=true;return false;}paths.add(entry.name);return true;
   }},(error,data)=>{job.signal?.removeEventListener('abort',abort);if(error||invalid)reject(error??Error(msg("instrumentPack.invalidArchiveContentsOrSize")));else resolve(data);});
   job.signal?.addEventListener('abort',abort,{once:true});if(job.signal?.aborted)abort();
 });tick(job,35);check(files['pack.json'],msg("instrumentPack.thisIsNotABarlowPack"));
 const m=JSON.parse(strFromU8(files['pack.json'])) as InstrumentPackFile;
 check(m?.format==='barlow-pack'&&m.version===1&&[57,58].includes(m.patchVersion),msg("instrumentPack.unsupportedPackVersion"));
 check(validName(m.name)&&typeof m.description==='string'&&m.description.length<=2000,msg("instrumentPack.invalidNameOrDescription"));
 check(Array.isArray(m.instruments)&&m.instruments.length>0&&m.instruments.length<=64,msg("instrumentPack.aPackMustContain1To64"));
 const presets=m.instruments.map(checkedPreset);check(new Set(presets.map(p=>p.id)).size===presets.length,msg("instrumentPack.duplicateInstrumentID"));
 const required=new Set(presets.flatMap(p=>[...assetIds(p)])),samples:PreparedPack['samples']=new Map();
 check(Array.isArray(m.samples)&&m.samples.length===required.size,msg("instrumentPack.invalidSampleList"));
 for(const [i,item] of m.samples.entries()) {
   tick(job,40+60*i/Math.max(1,m.samples.length));check(item&&required.has(item.id)&&!samples.has(item.id)&&typeof item.name==='string'&&item.name.length<=1024&&typeof item.mime==='string'&&item.mime.length<=100,msg("instrumentPack.invalidSample"));
   const data=files[`samples/${item.id}`];check(data&&await hash(new Uint8Array(data))===item.id,msg("instrumentPack.aSampleIsMissingOrDamaged"));samples.set(item.id,{blob:new Blob([new Uint8Array(data)],{type:item.mime}),name:item.name});
 }check(Object.keys(files).length===samples.size+1,msg("instrumentPack.unexpectedFilesInThePack"));tick(job,100);return {name:m.name,description:m.description,presets,samples};
}
export async function installPack(pack:PreparedPack,indices:number[],job:PackJob={}):Promise<string[]> {
 const presets=[...new Set(indices)].map(i=>pack.presets[i]);check(presets.length>0&&presets.every(Boolean),msg("instrumentPack.selectInstruments"));tick(job,0);
 const ids=new Set(presets.flatMap(p=>[...assetIds(p)]));await putSamples([...ids].map(id=>pack.samples.get(id)!));tick(job,90);
 const names=appendUserPack(presets,pack.name,pack.description);job.progress?.(100);return names;
}
