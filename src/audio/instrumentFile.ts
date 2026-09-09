import { t as msg } from '../i18n/runtime.ts';
import { strFromU8, strToU8, unzip, zipSync } from 'fflate';
import { INSTRUMENT_FIELDS, PATCH_VERSION, instrumentOfFields, isPatch, makeTrackWithInstrument } from '../types';
import type { InstrumentFile, Patch } from '../types';
import { getSampleBlob, listSamples, putSamples } from './library';
import { sampleAssets } from '../music/sampleZones';
import { presetFields, SAVE_FIELDS, loadUserPresets, saveUserPreset } from '../music/instrumentPresets';
import type { InstrumentPreset } from '../music/instrumentPresets';

const MiB = 1024 * 1024;
// Released schemas remain readable when PATCH_VERSION advances.
const readableSchemas = new Set([53, 54, 55, 56, 57, 58]);
const pathPattern = /^samples\/([a-f0-9]{64})$/;
const allowed = new Set<string>(SAVE_FIELDS);
const hash = async (bytes: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function checkedSound(value: unknown, name: string): InstrumentPreset['track'] {
  check(value && typeof value === 'object' && !Array.isArray(value), msg("instrumentFile.instrumentSettingsAreMissing"));
  const raw = value as InstrumentPreset['track'];
  check(Object.keys(raw).every(key=>allowed.has(key)), msg("instrumentFile.theFileUsesUnknownSoundSettingsUpdate"));
  const {track} = makeTrackWithInstrument({id:'portable-track',name});
  const instrument = { ...instrumentOfFields(raw,'portable-instrument',name),
    ...Object.fromEntries(INSTRUMENT_FIELDS.filter(k=>(raw as Record<string,unknown>)[k]!==undefined).map(k=>[k,(raw as Record<string,unknown>)[k]])), id:'portable-instrument',name };
  const soundingTrack = {...track, ...raw, id:track.id, name, instrumentId:instrument.id,
    effects:raw.effects??[], mods:raw.mods??[], patterns:track.patterns};
  const patch: Patch = {version:PATCH_VERSION,bpm:120,masterVolume:1,followChain:false,
    instruments:[instrument],tracks:[soundingTrack],scenes:[{id:'portable-scene',name:'сцена 1',slots:{[track.id]:{patternId:track.patterns[0].id}}}],chain:[]};
  check(isPatch(patch), msg("instrumentFile.invalidInstrumentParametersEffectsOrReferences"));
  return presetFields({...soundingTrack,...instrument});
}

export interface PreparedInstrument {
  preset: InstrumentPreset;
  samples: {blob:Blob;name:string}[];
}

export async function exportInstrument(preset: InstrumentPreset): Promise<Blob> {
  check(preset.name.trim().length>0 && preset.name.length<=160,msg("instrumentFile.theNameMustContain1To160"));
  check(!preset.hint || preset.hint.length<=600,msg("instrumentFile.theDescriptionExceeds600Characters"));
  check(!preset.tags || preset.tags.length<=16 && preset.tags.every(t=>t.length<=100),msg("instrumentFile.tooManyTagsOrTagsAreToo"));
  const sound=checkedSound(presetFields(preset.track),preset.name);
  const manifest: InstrumentFile = {format:'barlow-instrument',version:1,patchVersion:PATCH_VERSION,
    name:preset.name,sourceId:preset.id,hint:preset.hint,tags:preset.tags,sound,samples:[]};
  const files: Record<string,Uint8Array>={};
  const metadata=new Map((await listSamples()).map(s=>[s.id,s]));
  const ids=new Set(sampleAssets(instrumentOfFields(sound,'export',preset.name)).map(s=>s.sampleId).filter((id):id is string=>!!id));
  check(ids.size<=511,msg("instrumentFile.tooManySamplesInTheInstrument"));
  let total=0;
  for(const id of ids) {
    const blob=await getSampleBlob(id);
    check(blob,msg("instrumentFile.sampleWasNotFoundTheInstrumentWas", {p0: id}));
    check(blob.size<=64*MiB,msg("instrumentFile.theSampleExceeds64MiB"));
    const bytes=new Uint8Array(await blob.arrayBuffer());
    check(await hash(bytes)===id,msg("instrumentFile.theSampleIsDamagedSHA256Mismatch"));
    files[`samples/${id}`]=bytes;total+=bytes.byteLength;
    check(total<=256*MiB,msg("instrumentFile.theUnpackedInstrumentExceeds256MiB"));
    manifest.samples.push({id,name:metadata.get(id)?.name??id,mime:blob.type||'application/octet-stream'});
  }
  const json=strToU8(JSON.stringify(manifest));check(json.length<=8*MiB,msg("instrumentFile.instrumentSettingsExceed8MiB"));
  check(total+json.length<=256*MiB,msg("instrumentFile.theInstrumentExceeds256MiB"));files['instrument.json']=json;
  const data=zipSync(files,{level:0});check(data.length<=128*MiB,msg("instrumentFile.theInstrumentFileExceeds128MiB"));
  return new Blob([new Uint8Array(data)],{type:'application/zip'});
}

/** Validate everything before any library or preset writes. */
export async function prepareInstrument(file: Blob): Promise<PreparedInstrument> {
  check(file.size<=128*MiB,msg("instrumentFile.theArchiveExceeds128MiB"));
  let total=0;const paths=new Set<string>();
  const entries=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>{
    void file.arrayBuffer().then(buffer=>unzip(new Uint8Array(buffer),{filter:entry=>{
      const limit=entry.name==='instrument.json'?8*MiB:pathPattern.test(entry.name)?64*MiB:0;
      total+=entry.originalSize;
      check(limit && !paths.has(entry.name) && paths.size<512 && (entry.compression!==0 || entry.size===entry.originalSize) && entry.originalSize<=limit && entry.size<=limit+MiB && total<=256*MiB,
        msg("instrumentFile.invalidArchivePathDuplicateEntryOrFile"));
      paths.add(entry.name);return true;
    }},(error,files)=>error?reject(error):resolve(files))).catch(reject);
  });
  check(entries['instrument.json'],msg("instrumentFile.thisIsNotABarlowInstrumentFile"));
  let manifest: InstrumentFile;
  try { manifest=JSON.parse(strFromU8(entries['instrument.json'])) as InstrumentFile; }
  catch { throw new Error(msg("instrumentFile.theInstrumentSettingsInTheFileAre")); }
  check(manifest?.format==='barlow-instrument' && manifest.version===1 && readableSchemas.has(manifest.patchVersion),
    msg("instrumentFile.unsupportedInstrumentVersionUpdateBarlow"));
  check(typeof manifest.name==='string' && manifest.name.trim().length>0 && manifest.name.length<=160,msg("instrumentFile.invalidInstrumentName"));
  check(manifest.hint===undefined || typeof manifest.hint==='string' && manifest.hint.length<=600,msg("instrumentFile.invalidDescription"));
  check(manifest.tags===undefined || Array.isArray(manifest.tags) && manifest.tags.length<=16 && manifest.tags.every(t=>typeof t==='string'&&t.length<=100),msg("instrumentFile.invalidTags"));
  const sound=checkedSound(manifest.sound,manifest.name);
  check(Array.isArray(manifest.samples) && manifest.samples.length<=511,msg("instrumentFile.invalidSampleList"));
  const required=new Set(sampleAssets(instrumentOfFields(sound,'import',manifest.name)).map(s=>s.sampleId).filter(Boolean));
  const seen=new Set<string>(),samples:PreparedInstrument['samples']=[];
  for(const item of manifest.samples) {
    check(item && typeof item.id==='string' && /^[a-f0-9]{64}$/.test(item.id) && !seen.has(item.id) && required.has(item.id), msg("instrumentFile.duplicateOrUnexpectedSampleReference"));
    check(typeof item.name==='string'&&item.name.length<=1024&&typeof item.mime==='string'&&item.mime.length<=100,msg("instrumentFile.invalidSampleMetadata"));
    const bytes=entries[`samples/${item.id}`];check(bytes,msg("instrumentFile.aRequiredSampleIsMissingFromThe"));
    check(await hash(new Uint8Array(bytes))===item.id,msg("instrumentFile.sampleSHA256Mismatch"));
    seen.add(item.id);samples.push({blob:new Blob([new Uint8Array(bytes)],{type:item.mime}),name:item.name});
  }
  check(seen.size===required.size && Object.keys(entries).length===seen.size+1,msg("instrumentFile.theArchiveIsMissingRequiredSamplesOr"));
  return {preset:{name:manifest.name,hint:manifest.hint,tags:manifest.tags,category:'мои',track:sound},samples};
}

/** Publish only after every referenced asset is available; collisions create a copy. */
export async function installInstrument(prepared: PreparedInstrument, requestedName=prepared.preset.name): Promise<string> {
  const base=requestedName.trim();check(base.length>0&&base.length<=160,msg("instrumentFile.theNameMustContain1To160"));
  await putSamples(prepared.samples);
  const names=new Set(loadUserPresets().map(p=>p.name));let name=base;
  for(let i=2;names.has(name);i++) name=`${base} (${i})`;
  try { saveUserPreset(name,prepared.preset.track,{hint:prepared.preset.hint,tags:prepared.preset.tags}); }
  catch(error) { throw new Error(msg("instrumentFile.couldNotSaveTheInstrumentToMy", {p0: prepared.samples.length?msg("instrumentFile.theSamplesAreAlreadyInTheLibrary"):'', p1: String(error)})); }
  return name;
}
