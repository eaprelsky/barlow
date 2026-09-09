import { t as msg } from '../i18n/runtime.ts';
import { falRun, toDataUri } from './providers';
export const STEMS = ['vocals','drums','bass','other'] as const;
export type Stem = typeof STEMS[number];
export const STEM_LABELS: Record<Stem,string> = {get vocals() { return msg("separation.vocals"); },get drums() { return msg("separation.drums"); },get bass() { return msg("separation.bass"); },get other() { return msg("separation.other"); }};
export async function separateFragment(blob: Blob, key: string, signal: AbortSignal, progress: (stage:string)=>void): Promise<Partial<Record<Stem,Blob>>> {
  if(!key)throw Error(msg("separation.addYourFalAiKeyInSettings"));
  if(blob.size>12*1024*1024)throw Error(msg("separation.theExcerptExceeds12MiB"));
  progress(msg("separation.uploadingAndSeparatingTheExcerptFalAi"));
  const data=await toDataUri(blob);signal.throwIfAborted();
  const result=await falRun(key,'fal-ai/demucs',{audio_url:data,model:'htdemucs',stems:[...STEMS],output_format:'wav'},300000,signal);
  const out:Partial<Record<Stem,Blob>>={};
  for(const stem of STEMS){
    const url=(result[stem] as {url?:string}|undefined)?.url;if(!url)continue;
    if(new URL(url).protocol!=='https:')throw Error(msg("separation.invalidResultAddress"));
    progress(msg("separation.downloading", {p0: STEM_LABELS[stem]}));
    const res=await fetch(url,{signal});if(!res.ok)throw Error(msg("separation.couldNotDownloadTheSeparatedAudio"));
    const reader=res.body?.getReader();if(!reader)throw Error(msg("separation.theServiceReturnedAnEmptyResponse"));
    const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16*1024*1024){await reader.cancel();throw Error(msg("separation.theSeparatedStemExceeds16MiB"));}chunks.push(new Uint8Array(value));}
    out[stem]=new Blob(chunks,{type:'audio/wav'});
  }
  if(!Object.keys(out).length)throw Error(msg("separation.theServiceReturnedNoStems"));return out;
}
