import { strFromU8, strToU8, unzip, zipSync } from 'fflate';
import { INSTRUMENT_FIELDS, PATCH_VERSION, instrumentOfFields, isPatch, makeTrackWithInstrument } from '../types';
import type { InstrumentFile, Patch } from '../types';
import { getSampleBlob, listSamples, putSamples } from './library';
import { sampleAssets } from '../music/sampleZones';
import { presetFields, SAVE_FIELDS, loadUserPresets, saveUserPreset } from '../music/instrumentPresets';
import type { InstrumentPreset } from '../music/instrumentPresets';

const MiB = 1024 * 1024;
const pathPattern = /^samples\/([a-f0-9]{64})$/;
const allowed = new Set<string>(SAVE_FIELDS);
const hash = async (bytes: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function checkedSound(value: unknown, name: string): InstrumentPreset['track'] {
  check(value && typeof value === 'object' && !Array.isArray(value), 'Нет настроек инструмента');
  const raw = value as InstrumentPreset['track'];
  check(Object.keys(raw).every(key=>allowed.has(key)), 'Файл использует неизвестные настройки звука. Обнови barlow.');
  const {track} = makeTrackWithInstrument({id:'portable-track',name});
  const instrument = { ...instrumentOfFields(raw,'portable-instrument',name),
    ...Object.fromEntries(INSTRUMENT_FIELDS.filter(k=>(raw as Record<string,unknown>)[k]!==undefined).map(k=>[k,(raw as Record<string,unknown>)[k]])), id:'portable-instrument',name };
  const soundingTrack = {...track, ...raw, id:track.id, name, instrumentId:instrument.id,
    effects:raw.effects??[], mods:raw.mods??[], patterns:track.patterns};
  const patch: Patch = {version:PATCH_VERSION,bpm:120,masterVolume:1,followChain:false,
    instruments:[instrument],tracks:[soundingTrack],scenes:[{id:'portable-scene',name:'сцена 1',slots:{[track.id]:{patternId:track.patterns[0].id}}}],chain:[]};
  check(isPatch(patch), 'Некорректные параметры, эффекты или ссылки инструмента');
  return presetFields({...soundingTrack,...instrument});
}

export interface PreparedInstrument {
  preset: InstrumentPreset;
  samples: {blob:Blob;name:string}[];
}

export async function exportInstrument(preset: InstrumentPreset): Promise<Blob> {
  check(preset.name.trim().length>0 && preset.name.length<=160,'Имя должно содержать от 1 до 160 символов');
  check(!preset.hint || preset.hint.length<=600,'Пояснение длиннее 600 символов');
  check(!preset.tags || preset.tags.length<=16 && preset.tags.every(t=>t.length<=100),'Слишком много или слишком длинные теги');
  const sound=checkedSound(presetFields(preset.track),preset.name);
  const manifest: InstrumentFile = {format:'barlow-instrument',version:1,patchVersion:PATCH_VERSION,
    name:preset.name,sourceId:preset.id,hint:preset.hint,tags:preset.tags,sound,samples:[]};
  const files: Record<string,Uint8Array>={};
  const metadata=new Map((await listSamples()).map(s=>[s.id,s]));
  const ids=new Set(sampleAssets(instrumentOfFields(sound,'export',preset.name)).map(s=>s.sampleId).filter((id):id is string=>!!id));
  check(ids.size<=511,'Слишком много записей в инструменте');
  let total=0;
  for(const id of ids) {
    const blob=await getSampleBlob(id);
    check(blob,`Не найдена запись ${id}: инструмент не сохранён`);
    check(blob.size<=64*MiB,'Запись больше 64 МиБ');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    check(await hash(bytes)===id,'Запись повреждена: SHA-256 не совпадает');
    files[`samples/${id}`]=bytes;total+=bytes.byteLength;
    check(total<=256*MiB,'Инструмент больше 256 МиБ после распаковки');
    manifest.samples.push({id,name:metadata.get(id)?.name??id,mime:blob.type||'application/octet-stream'});
  }
  const json=strToU8(JSON.stringify(manifest));check(json.length<=8*MiB,'Настройки инструмента больше 8 МиБ');
  check(total+json.length<=256*MiB,'Инструмент больше 256 МиБ');files['instrument.json']=json;
  const data=zipSync(files,{level:0});check(data.length<=128*MiB,'Файл инструмента больше 128 МиБ');
  return new Blob([new Uint8Array(data)],{type:'application/zip'});
}

/** Validate everything before any library or preset writes. */
export async function prepareInstrument(file: Blob): Promise<PreparedInstrument> {
  check(file.size<=128*MiB,'Архив больше 128 МиБ');
  let total=0;const paths=new Set<string>();
  const entries=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>{
    void file.arrayBuffer().then(buffer=>unzip(new Uint8Array(buffer),{filter:entry=>{
      const limit=entry.name==='instrument.json'?8*MiB:pathPattern.test(entry.name)?64*MiB:0;
      total+=entry.originalSize;
      check(limit && !paths.has(entry.name) && paths.size<512 && (entry.compression!==0 || entry.size===entry.originalSize) && entry.originalSize<=limit && entry.size<=limit+MiB && total<=256*MiB,
        'Недопустимый путь, повтор или размер файла в архиве');
      paths.add(entry.name);return true;
    }},(error,files)=>error?reject(error):resolve(files))).catch(reject);
  });
  check(entries['instrument.json'],'Это не файл инструмента barlow');
  let manifest: InstrumentFile;
  try { manifest=JSON.parse(strFromU8(entries['instrument.json'])) as InstrumentFile; }
  catch { throw new Error('Настройки в файле инструмента повреждены'); }
  check(manifest?.format==='barlow-instrument' && manifest.version===1 && manifest.patchVersion===PATCH_VERSION,
    'Неподдерживаемая версия инструмента. Обнови barlow.');
  check(typeof manifest.name==='string' && manifest.name.trim().length>0 && manifest.name.length<=160,'Некорректное имя инструмента');
  check(manifest.hint===undefined || typeof manifest.hint==='string' && manifest.hint.length<=600,'Некорректное пояснение');
  check(manifest.tags===undefined || Array.isArray(manifest.tags) && manifest.tags.length<=16 && manifest.tags.every(t=>typeof t==='string'&&t.length<=100),'Некорректные теги');
  const sound=checkedSound(manifest.sound,manifest.name);
  check(Array.isArray(manifest.samples) && manifest.samples.length<=511,'Некорректный список записей');
  const required=new Set(sampleAssets(instrumentOfFields(sound,'import',manifest.name)).map(s=>s.sampleId).filter(Boolean));
  const seen=new Set<string>(),samples:PreparedInstrument['samples']=[];
  for(const item of manifest.samples) {
    check(item && typeof item.id==='string' && /^[a-f0-9]{64}$/.test(item.id) && !seen.has(item.id) && required.has(item.id), 'Повтор или лишняя ссылка записи');
    check(typeof item.name==='string'&&item.name.length<=1024&&typeof item.mime==='string'&&item.mime.length<=100,'Некорректные метаданные записи');
    const bytes=entries[`samples/${item.id}`];check(bytes,'В архиве отсутствует нужная запись');
    check(await hash(new Uint8Array(bytes))===item.id,'SHA-256 записи не совпадает');
    seen.add(item.id);samples.push({blob:new Blob([new Uint8Array(bytes)],{type:item.mime}),name:item.name});
  }
  check(seen.size===required.size && Object.keys(entries).length===seen.size+1,'Архив содержит не все нужные записи или лишние файлы');
  return {preset:{name:manifest.name,hint:manifest.hint,tags:manifest.tags,category:'мои',track:sound},samples};
}

/** Publish only after every referenced asset is available; collisions create a copy. */
export async function installInstrument(prepared: PreparedInstrument, requestedName=prepared.preset.name): Promise<string> {
  const base=requestedName.trim();check(base.length>0&&base.length<=160,'Имя должно содержать от 1 до 160 символов');
  await putSamples(prepared.samples);
  const names=new Set(loadUserPresets().map(p=>p.name));let name=base;
  for(let i=2;names.has(name);i++) name=`${base} (${i})`;
  try { saveUserPreset(name,prepared.preset.track,{hint:prepared.preset.hint,tags:prepared.preset.tags}); }
  catch(error) { throw new Error(`Не удалось сохранить инструмент в «Мои». ${prepared.samples.length?'Записи уже доступны в библиотеке; повторный импорт переиспользует их. ':''}${String(error)}`); }
  return name;
}
