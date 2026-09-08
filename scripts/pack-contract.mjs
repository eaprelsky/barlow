import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5195;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/pack-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/pack-contract.html`);


 const result=await page.evaluate(async()=>{
 const {exportPack,preparePack,installPack}=await import('/src/audio/instrumentPack.ts');const {INSTRUMENT_PRESETS,loadUserPresets}=await import('/src/music/instrumentPresets.ts');const {putSample}=await import('/src/audio/library.ts');const {audioBufferToWav}=await import('/src/audio/wav.ts');const {unzipSync,strFromU8}=await import('/node_modules/fflate/esm/browser.js');
 const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});const p=structuredClone(INSTRUMENT_PRESETS.find(p=>p.track.waveform==='wave'));
 const c=new OfflineAudioContext(1,64,44100),b=c.createBuffer(1,64,44100);b.getChannelData(0).fill(.1);const sample=await putSample(audioBufferToWav(b),'общая запись');p.track.waveform='sample';p.track.sampleId=sample.id;
 const stages=[],blob=await exportPack('Набор','Описание',[{...p,name:'один'},{...p,name:'два'}],{progress:v=>stages.push(v)});
 const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));check('shared sample stored once',Object.keys(files).length===2);check('two instruments in manifest',JSON.parse(strFromU8(files['pack.json'])).instruments.length===2);
 const ready=await preparePack(blob);check('prepare does not publish',loadUserPresets().length===0);const names=await installPack(ready,[0]);check('selection publishes one',names.length===1&&loadUserPresets().length===1);const again=await installPack(ready,[0,1]);check('collision creates a copy',again[0]==='один (2)'&&loadUserPresets().length===3);check('pack metadata survives reload',loadUserPresets().every(p=>p.packName==='Набор'));check('progress reaches completion',stages[0]===0&&stages.at(-1)===100);
 const abort=new AbortController();abort.abort();let cancelled=false;try{await installPack(ready,[1],{signal:abort.signal});}catch{cancelled=true;}check('cancel leaves presets unchanged',cancelled&&loadUserPresets().length===3);
 localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('menuitem',{name:'Файл',exact:true}).click();await page.getByRole('menuitem',{name:'Паки инструментов…',exact:true}).click();await page.getByRole('dialog',{name:'Паки инструментов'}).waitFor();
 await page.getByLabel('Найти в паке').fill('один');await page.getByText('выбрать найденные',{exact:true}).click();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/packs-${width}.png`});}
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Паки инструментов'}).count(),0);assert.deepEqual(errors,[]);console.log('PASS pack dialog selection and keyboard close');
}finally{await browser?.close();vite.kill();}
