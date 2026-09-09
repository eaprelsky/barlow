import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5199;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/transitions-bank.html','<!doctype html><title>Transitions bank</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(`http://127.0.0.1:${port}/tmp/transitions-bank.html`);
 const result=await page.evaluate(async()=>{
  const {TRANSITION_BANK}=await import('/src/music/transitionBank.ts'),{INSTRUMENT_PRESETS}=await import('/src/music/instrumentPresets.ts');
  const {soundForAudition}=await import('/src/music/audition.ts'),{makeTrackWithInstrument}=await import('/src/types.ts');
  const {makeChain,disposeChain}=await import('/src/audio/fx.ts'),{triggerVoice}=await import('/src/audio/voices.ts');
  const {exportPack,preparePack}=await import('/src/audio/instrumentPack.ts');
  const {presetMatches,presetInCollection}=await import('/src/music/soundSearch.ts');
  const {audioBufferToWav}=await import('/src/audio/wav.ts');
  const {track}=makeTrackWithInstrument({id:'test',name:'test'}),rows=[],audio=[];
  for(const preset of TRANSITION_BANK){
   const seconds=preset.track.ampMseg.seconds,rate=24000,ctx=new OfflineAudioContext(2,Math.ceil((seconds+1.5)*rate),rate);
   const noise=ctx.createBuffer(1,rate*2,rate);let seed=77;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);for(let i=0;i<noise.length;i++)noise.getChannelData(0)[i]=random()*2-1;
   const st=soundForAudition(track,preset),chain=makeChain(ctx,st,ctx.destination,120,42),voice=triggerVoice(ctx,chain,noise,null,st,[{n:0,vel:.9,prob:1}],.02,.125,undefined,undefined,random);
   const b=await ctx.startRendering(),x=b.getChannelData(0);let peak=0,finite=true;for(let c=0;c<2;c++)for(const v of b.getChannelData(c)){peak=Math.max(peak,Math.abs(v));finite&&=Number.isFinite(v);}
   const rms=(a,z)=>{const s=Math.floor((.02+a*seconds)*rate),e=Math.floor((.02+z*seconds)*rate);let energy=0;for(let i=s;i<e;i++)energy+=x[i]**2;return Math.sqrt(energy/(e-s));};
   const early=rms(.08,.25),late=rms(.75,.92),reverse=preset.id.endsWith('-down');
   rows.push({name:preset.name,peak,early,late,pass:finite&&peak>.005&&peak<.95&&(reverse?early>late*2:late>early*2)&&voice.stopAt>=seconds&&presetInCollection(preset,'transitions')&&presetMatches(preset,'райзер')});
   audio.push({id:preset.id,bytes:Array.from(new Uint8Array(await audioBufferToWav(b).arrayBuffer()))});disposeChain(chain);
  }
  const job={signal:new AbortController().signal,progress:()=>{}},blob=await exportPack('Райзеры и обратные райзеры','12 синтетических переходов: шесть пар нарастания и спада.',TRANSITION_BANK,job),prepared=await preparePack(new File([blob],'transitions.barlow-pack.zip'),job);
  return {rows,audio,pack:Array.from(new Uint8Array(await blob.arrayBuffer())),unique:new Set(INSTRUMENT_PRESETS.map(p=>p.id)).size===INSTRUMENT_PRESETS.length,preparedCount:prepared.presets.length};
 });
 assert.equal(result.preparedCount,12,'portable pack preserves all presets');assert.ok(result.unique,'factory IDs unique');for(const r of result.rows){console.log(r);assert.ok(r.pass,r.name);}
 writeFileSync(root+'/tmp/transitions-bank-qa.json',JSON.stringify(result.rows,null,2));writeFileSync(root+'/tmp/risers.barlow-pack.zip',Buffer.from(result.pack));
 for(const a of result.audio)writeFileSync(root+`/tmp/${a.id}.wav`,Buffer.from(a.bytes));
 await page.addInitScript(()=>localStorage.setItem('barlow.onboarding.v1',JSON.stringify({seen:['main']})));await page.goto(`http://127.0.0.1:${port}`);await page.keyboard.press('Escape');const lib=page.getByRole('button',{name:'инструменты',exact:true});if(!await page.getByLabel('Подборка звуков',{exact:true}).count())await lib.click();await page.getByLabel('Подборка звуков',{exact:true}).selectOption('transitions');
 assert.equal(await page.locator('.sb-audition').count(),12);await page.screenshot({path:root+'/tmp/transitions-bank-1440.png'});
 await page.setViewportSize({width:1024,height:900});await page.screenshot({path:root+'/tmp/transitions-bank-1024.png'});
 console.log('PASS 12 full-length transitions: amplitude direction, finite PCM, peak, preview length, search, UI collection and portable archive');
}finally{await browser?.close();vite.kill();}
