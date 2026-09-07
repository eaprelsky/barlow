import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5186;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/assets-contract.html','<!doctype html><title>Asset contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/assets-contract.html`);
 const result=await page.evaluate(async()=>{
  const {AudioEngine}=await import('/src/audio/engine.ts');
  const {DecodedAssets}=await import('/src/audio/decodedAssets.ts');
  const {audioBufferToWav}=await import('/src/audio/wav.ts');
  const {putSample,deleteSample}=await import('/src/audio/library.ts');
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {normalizePatch}=await import('/src/types.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  const ctx=new OfflineAudioContext(2,44100,44100), blobs=[];
  for(let k=0;k<2;k++){
   const b=ctx.createBuffer(2,44100,44100);
   for(let c=0;c<2;c++)for(let i=0;i<44100;i++)b.getChannelData(c)[i]=Math.sin(2*Math.PI*(220+k*110+c*55)*i/44100)*(.2+c*.1);
   blobs.push(audioBufferToWav(b));
  }
  const metas=[];for(let i=0;i<2;i++)metas.push(await putSample(blobs[i],`PCM ${i}`));
  const patch=defaultPatch();patch.tracks=patch.tracks.slice(0,2);patch.instruments=patch.tracks.map((t,i)=>({...patch.instruments.find(x=>x.id===t.instrumentId),waveform:'sample',sampleId:metas[i].id,sampleName:metas[i].name,sampleZones:undefined}));
  patch.masterNoise='off';patch.followChain=false;patch.performanceSeed=3;
  const engine=new AudioEngine();let decodeCalls=0;
  const decode=AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData=function(...args){decodeCalls++;return decode.apply(this,args);};
  try{
   const one={...patch,instruments:patch.instruments.map((i,n)=>n?{...i,sampleId:'f'.repeat(64)}:i)};engine.setPatch(normalizePatch(one));
   const [pcm,peaks,pcm2]=await Promise.all([engine.getSamplePCM(metas[0].id),engine.getSamplePeaks(metas[0].id),engine.getSamplePCM(metas[0].id)]);
   check('one PCM/peaks lookup does not load unrelated missing patch assets',pcm.length>0&&peaks.peaks.length===64&&decodeCalls===1,decodeCalls);
   check('portable planar PCM survives structured clone',structuredClone(pcm).channels[1] instanceof Float32Array&&pcm.channels.length===2&&!('getChannelData' in pcm)&&pcm.duration===pcm.length/pcm.sampleRate);
   const original=engine.sampleCache.get(metas[0].id).getChannelData(0)[100];pcm.channels[0][100]=123;
   check('each editor gets independent channels and cannot mutate the engine',pcm2.channels[0][100]===original&&engine.sampleCache.get(metas[0].id).getChannelData(0)[100]===original);
   await Promise.all([engine.ensureSamples(patch),engine.ensureSamples(patch)]);
   check('concurrent full preloads decode each asset once',decodeCalls===2&&engine.diagnostics.pendingDecodes===0&&engine.diagnostics.decodedAssets===2,{decodeCalls,bytes:engine.diagnostics.decodedBytes});
   const main=engine.loadMainSample;let finishLoad;
   engine.loadMainSample=()=>new Promise(r=>finishLoad=r);
   engine.scratchBegin(patch.tracks[0]);engine.scratchEnd();finishLoad(engine.sampleCache.get(metas[0].id));
   await new Promise(r=>setTimeout(r,30));engine.loadMainSample=main;
   check('releasing scratch before loading finishes prevents a late needle',engine.scratchNode===null);
   let bad=false;try{await engine.getSamplePCM('../bad');}catch{bad=true;}check('PCM API rejects malformed asset ID',bad);
   const bytes=engine.sampleCache.get(metas[0].id).length*2*4;
   const bounded=new AudioEngine();bounded.sampleCache=new DecodedAssets({bytes:bytes+16,assetBytes:bytes+16,entries:8,pending:8});bounded.setPatch(patch);
   let refusal='';try{await bounded.ensureSamples(patch);}catch(e){refusal=String(e);}
   check('real decoded PCM obeys aggregate budget and reports failure',refusal.includes('бюджет')&&bounded.diagnostics.decodedAssets===1&&bounded.diagnostics.decodedBytes===bytes,refusal);
   bounded.setPatch({...patch,tracks:[patch.tracks[1]]});await bounded.ensureSamples({...patch,tracks:[patch.tracks[1]]});
   check('replacing the patch releases old asset lease and permits eviction',bounded.sampleCache.has(metas[1].id)&&!bounded.sampleCache.has(metas[0].id)&&bounded.diagnostics.decodedBytes===bytes);
   if(bounded.ctx)await bounded.ctx.close();
   const silent=normalizePatch({...one,tracks:one.tracks.map(t=>({...t,enabled:false}))});
   const callsBefore=decodeCalls;const wav=await engine.renderToWav(silent,silent.scenes[0].id,1,{tail:'trim'});
   check('WAV ignores missing assets in parts with no audible events',wav.size>44&&decodeCalls===callsBefore);
   const retryEngine=new AudioEngine();const id=metas[1].id;await deleteSample(id);let absent=false;
   try{await retryEngine.getSamplePCM(id);}catch{absent=true;}await putSample(blobs[1],metas[1].name);
   check('failed single load can be retried after the asset appears',absent&&(await retryEngine.getSamplePCM(id)).length>0);if(retryEngine.ctx)await retryEngine.ctx.close();
   const uiPatch=normalizePatch({...patch,tracks:[patch.tracks[1]],instruments:[patch.instruments[1]]});
   // Keep scene references valid after reducing tracks.
   for(const scene of uiPatch.scenes){scene.slots={[uiPatch.tracks[0].id]:{patternId:uiPatch.tracks[0].patterns[0].id}};scene.soloTrackId=undefined;}
   await deleteSample(metas[1].id);window.retryBlob=blobs[1];
   localStorage.setItem('barlow.patch.v12',JSON.stringify(uiPatch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
   return {checks,blobBytes:Array.from(new Uint8Array(await blobs[1].arrayBuffer()))};
  }finally{AudioContext.prototype.decodeAudioData=decode;if(engine.ctx)await engine.ctx.close();}
 });
 for(const c of result.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.checks.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-inst"]').first().click();
 await page.getByRole('button',{name:'повторить загрузку',exact:true}).waitFor();
 assert.match(await page.locator('.sample-load-error').innerText(),/Нет записи/);
 await page.evaluate(async bytes=>{const {putSample}=await import('/src/audio/library.ts');await putSample(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}),'Restored PCM');},result.blobBytes);
 await page.getByRole('button',{name:'повторить загрузку',exact:true}).click();await page.locator('[data-ob="we-canvas"] canvas').waitFor();
 assert.equal(await page.locator('.sample-load-error').count(),0);await page.screenshot({path:root+'/tmp/pcm-editor.png'});
 console.log('PASS editor shows missing sample error, retries and displays restored PCM');assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
