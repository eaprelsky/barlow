import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5196;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/layer-source-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/layer-source-contract.html`);




 await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {voiceSnapshot}=await import('/src/music/layers.ts');
  const p=defaultPatch();const i=p.instruments.find(i=>i.id===p.tracks[0].instrumentId);
  i.waveform='wave';i.wave={partials:[{ratio:1,amp:1,type:'sine'}]};i.macros=undefined;
  i.layers=[{id:'source-a',name:'Рычащая середина',gain:.5,ratio:2,sound:voiceSnapshot(i)},
    {id:'source-b',name:'Вторая копия',gain:.25,ratio:.5,sound:voiceSnapshot(i)}];
  p.tracks[1].instrumentId=i.id;
  localStorage.setItem('barlow.patch.v12',JSON.stringify(p));
  localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
 });
 await page.goto(`http://127.0.0.1:${port}`);
 await page.evaluate(async()=>{const {AudioEngine}=await import('/src/audio/engine.ts');window.previews=[];AudioEngine.prototype.previewNote=function(sound){window.previews.push(structuredClone(sound));};});
 const track=page.locator('main .track').first();
 const saved=()=>page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();const p=JSON.parse(localStorage.getItem('barlow.patch.v12'));return {patch:p,inst:p.instruments.find(i=>i.id===p.tracks[0].instrumentId)};});
 const before=await saved();
 const open=async()=>{await track.locator('.layer-name').first().click();await track.locator('[data-help="layer-source-editor"]').click();await track.locator('.layer-source-heading').waitFor();};
 await track.locator('[data-ob="mode-inst"]').click();await open();
 const input=()=>track.locator('.we-partials [data-help="operator-ratio"] input').first();
 await input().fill('2.25');await input().press('Enter');
 assert.deepEqual((await saved()).inst,before.inst,'wave draft must not alter Patch');
 await track.locator('[data-ob="preview-in-track"]').click();await track.locator('[data-help="layer-audition-solo"]').click();
 const previews=await page.evaluate(()=>window.previews);
 assert.equal(previews[0].layers[0].sound.wave.partials[0].ratio,2.25);
 assert.equal(previews[0].wave.partials[0].ratio,1);
 assert.equal(previews[0].layers.length,2);assert.equal(previews[1].layers.length,1);assert.equal(previews[1].baseVoiceGain,0);assert.equal(previews[1].layers[0].ratio,2);
 await track.getByRole('button',{name:'Вернуться к инструменту'}).click();
 await page.getByRole('dialog',{name:'волна не применена'}).getByRole('button',{name:'отбросить',exact:true}).click();
 assert.deepEqual((await saved()).inst,before.inst);await open();
 await input().fill('2.25');await input().press('Enter');await track.locator('.we-apply').click();
 let state=await saved();assert.equal(state.inst.layers[0].sound.wave.partials[0].ratio,2.25);
 assert.deepEqual(state.inst.wave,before.inst.wave);assert.deepEqual(state.inst.layers[1],before.inst.layers[1]);
 assert.notEqual(state.patch.tracks[0].instrumentId,state.patch.tracks[1].instrumentId,'copy on write');
 assert.deepEqual(state.patch.instruments.find(i=>i.id===state.patch.tracks[1].instrumentId),before.inst);
 await page.keyboard.press('Control+z');assert.deepEqual((await saved()).inst,before.inst);
 await page.keyboard.press('Control+Shift+z');assert.equal((await saved()).inst.layers[0].sound.wave.partials[0].ratio,2.25);
 const inventory=[];
 const inspect=async name=>{const c=await page.evaluate(async()=>(await import('/src/onboarding/helpResolver.ts')).helpCoverage());assert.deepEqual(c.missing,[],name);inventory.push({name,...c});};
 await inspect('layer-wave');
 await page.locator('[data-ob="library-btn"]').click();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await track.locator('.layer-source-heading').scrollIntoViewIfNeeded();await page.screenshot({path:root+`/tmp/layer-source-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await track.locator('[data-ob="tab-env"]').click();await inspect('layer-envelope');
 const attack=track.locator('[data-help="instrument.attack"][role="slider"], [data-help="instrument.attack"] [role="slider"]').first();await attack.dblclick();
 const attackInput=track.locator('[data-help="instrument.attack"] input').first();await attackInput.fill('127');await attackInput.press('Enter');
 assert.equal((await saved()).inst.layers[0].sound.attack,.127);
 await track.locator('[data-ob="tab-timbre"]').click();await inspect('layer-color');assert.equal(await track.locator('[data-ob="arp-group"]').count(),0);assert.equal(await track.locator('[data-help="instrument.filterLow"]').count(),0);
 await track.locator('[data-ob="tab-snd"]').click();await track.getByLabel('Способ синтеза',{exact:true}).selectOption('table');assert.ok((await saved()).inst.layers[0].sound.wave.wavetable);await inspect('layer-wavetable');
 await track.locator('.src-seg').getByRole('button',{name:'сэмпл',exact:true}).click();
 const wav=Buffer.alloc(44+8192);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(8192,40);for(let i=0;i<4096;i++)wav.writeInt16LE(Math.round(Math.sin(i*.06)*5000),44+i*2);
 await track.locator('input[type="file"]').setInputFiles({name:'layer-tone.wav',mimeType:'audio/wav',buffer:wav});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments.some(i=>i.layers?.[0].sound.sampleName==='layer-tone.wav'));
 await track.locator('[data-ob="sample-mode"] select').selectOption('grain');await inspect('layer-sample');
 state=await saved();assert.equal(state.inst.layers[0].sound.sampleMode,'grain');assert.equal(state.inst.sampleId,before.inst.sampleId);assert.deepEqual(state.inst.layers[1],before.inst.layers[1]);
 assert.equal(await track.locator('[data-ob="gen-bar"]').count(),0);
 await track.locator('[data-ob="sample-mode"] select').selectOption('scratch');
 assert.equal(await track.locator('[data-ob="scratch-rec"]').count(),0);assert.equal(await track.locator('[data-ob="scratch-save"]').count(),0);
 const pad=track.locator('[data-ob="scratch-pad"]');await pad.scrollIntoViewIfNeeded();await pad.click({position:{x:40,y:40}});await pad.click({position:{x:140,y:90}});
 assert.equal((await saved()).inst.layers[0].sound.scratchPoints.length,2);await inspect('layer-scratch');
 await track.locator('[data-ob="scratch-play"]').click();assert.equal(await page.evaluate(()=>window.previews.at(-1).layers[0].sound.scratchPoints.length),2);

 await page.evaluate(async()=>{const {flushAutosave}=await import('/src/storage.ts');flushAutosave();const p=JSON.parse(localStorage.getItem('barlow.patch.v12')),i=p.instruments.find(i=>i.id===p.tracks[0].instrumentId);const {exportInstrument,prepareInstrument}=await import('/src/audio/instrumentFile.ts');const file=await exportInstrument({name:i.name,category:'мои',track:{...p.tracks[0],...i}});const prepared=await prepareInstrument(file);if(JSON.stringify(prepared.preset.track.layers)!==JSON.stringify(i.layers))throw Error('Portable layer mismatch');});
 await track.getByRole('button',{name:'Вернуться к инструменту'}).click();assert.equal(await track.locator('[data-help="instrument-export"]').count(),1);

 await open();
 const beforePending=await saved();
 await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);window.digestStarted=false;window.lateStored=false;window.addEventListener('barlow:library-changed',()=>window.lateStored=true,{once:true});const gate=new Promise(r=>window.releaseDigest=r);crypto.subtle.digest=async(...args)=>{window.digestStarted=true;await gate;const result=await digest(...args);window.digestFinished=true;return result;};});
 const lateWav=Buffer.from(wav);lateWav.writeInt16LE(1234,44);
 await track.locator('input[type="file"]').setInputFiles({name:'late-tone.wav',mimeType:'audio/wav',buffer:lateWav});
 await page.waitForFunction(()=>window.digestStarted);await track.getByRole('button',{name:'Вернуться к инструменту'}).click();
 await page.evaluate(()=>window.releaseDigest());await page.waitForFunction(()=>window.lateStored);
 assert.deepEqual((await saved()).inst,beforePending.inst,'late sample upload must not apply after leaving layer');
 assert.deepEqual(errors,[]);writeFileSync(root+'/tmp/layer-source-qa.json',JSON.stringify(inventory,null,2));
 console.log('PASS direct layer edit, draft discard/apply, full/solo preview routing, copy-on-write, undo/redo, envelopes, tables, samples, portable roundtrip, help and 1024/1440 layouts');
} finally {await browser?.close();vite.kill();}
