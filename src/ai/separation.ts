import { falRun, toDataUri } from './providers';
export const STEMS = ['vocals','drums','bass','other'] as const;
export type Stem = typeof STEMS[number];
export const STEM_LABELS: Record<Stem,string> = {vocals:'Вокал',drums:'Ударные',bass:'Бас',other:'Остальное'};
export async function separateFragment(blob: Blob, key: string, signal: AbortSignal, progress: (stage:string)=>void): Promise<Partial<Record<Stem,Blob>>> {
  if(!key)throw Error('Добавь свой ключ fal.ai в «Настройки → Звук и подключения».');
  if(blob.size>12*1024*1024)throw Error('Фрагмент больше 12 МиБ.');
  progress('Передача фрагмента и разделение · fal.ai');
  const data=await toDataUri(blob);signal.throwIfAborted();
  const result=await falRun(key,'fal-ai/demucs',{audio_url:data,model:'htdemucs',stems:[...STEMS],output_format:'wav'},300000,signal);
  const out:Partial<Record<Stem,Blob>>={};
  for(const stem of STEMS){
    const url=(result[stem] as {url?:string}|undefined)?.url;if(!url)continue;
    if(new URL(url).protocol!=='https:')throw Error('Некорректный адрес результата.');
    progress(`Загрузка: ${STEM_LABELS[stem]}`);
    const res=await fetch(url,{signal});if(!res.ok)throw Error('Не удалось загрузить результат разделения.');
    const reader=res.body?.getReader();if(!reader)throw Error('Пустой ответ сервиса.');
    const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16*1024*1024){await reader.cancel();throw Error('Дорожка результата больше 16 МиБ.');}chunks.push(new Uint8Array(value));}
    out[stem]=new Blob(chunks,{type:'audio/wav'});
  }
  if(!Object.keys(out).length)throw Error('Сервис не вернул дорожки.');return out;
}
