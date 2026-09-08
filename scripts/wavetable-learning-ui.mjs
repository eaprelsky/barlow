import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5197;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/wavetable-ui.html','<!doctype html><div id="root"></div><script type="module" src="/tmp/wavetable-harness.tsx"></script>');
writeFileSync(root+'/tmp/wavetable-harness.tsx', `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {WavetableEditor} from '../src/components/WavetableEditor';import {tableRecipe} from '../src/music/wavetable';import '../src/index.css';function App(){const [value,setValue]=useState(tableRecipe());return <WavetableEditor value={value} onChange={(v,command)=>{window.importCommand=command;window.importResult=v;setValue(v);}}/>;}createRoot(document.getElementById('root')).render(<App/>);`);
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1024,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`http://127.0.0.1:${port}/tmp/wavetable-ui.html`);
 const bytes=await page.evaluate(async()=>{
  const b=new AudioBuffer({length:8192,sampleRate:44100,numberOfChannels:1});for(let n=0;n<b.length;n++)b.getChannelData(0)[n]=.8*Math.sin(2*Math.PI*n/2048);const {audioBufferToWav}=await import('/src/audio/wav.ts');return Array.from(new Uint8Array(await audioBufferToWav(b).arrayBuffer()));
 });
 await page.getByRole('button',{name:'Импорт WAV…',exact:true}).click();await page.locator('dialog input[type=file]').setInputFiles({name:'table.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes)});await page.getByRole('button',{name:'Подготовить',exact:true}).click();await page.getByText('4 × 2048 → 8 × 128',{exact:true}).waitFor();await page.screenshot({path:root+'/tmp/wavetable-import-1024.png'});await page.getByRole('button',{name:'Применить',exact:true}).click();assert.equal(await page.evaluate(()=>window.importCommand),true);assert.equal(await page.evaluate(()=>window.importResult.frames.length),8);
 // A short musical scene, not a stress profile: verifies actual course sound and export.
 const render=await page.evaluate(async()=>{
  const {learningProject}=await import('/src/music/learning.ts'),{AudioEngine}=await import('/src/audio/engine.ts');const p=learningProject();p.followChain=false;const e=new AudioEngine();
  const blob=await e.renderToWav(p,p.scenes[2].id,2,{tail:'natural'}),bytes=await blob.arrayBuffer();e.stop();
  const ctx=new OfflineAudioContext(2,1,44100),b=await ctx.decodeAudioData(bytes.slice(0));const x=b.getChannelData(0);let peak=0,energy=0;for(const v of x){peak=Math.max(peak,Math.abs(v));energy+=v*v;}
  return {bytes:Array.from(new Uint8Array(bytes)),peak,rms:Math.sqrt(energy/x.length),duration:b.duration};
 });
 assert.ok(render.peak> .01&&render.peak<1&&render.rms>.001,JSON.stringify({peak:render.peak,rms:render.rms}));writeFileSync(root+'/tmp/learning-dialogue.wav',Buffer.from(render.bytes));console.log('Learning musical render', {peak:render.peak,rms:render.rms,duration:render.duration});
 let cancelled=false;await page.route('https://queue.fal.run/**',async route=>{if(route.request().method()==='PUT'){cancelled=true;await route.fulfill({json:{status:'CANCELLATION_REQUESTED'}});return;}await route.fulfill({json:{status_url:'https://queue.fal.run/test/status',response_url:'https://queue.fal.run/test/response',cancel_url:'https://queue.fal.run/test/cancel',status:'IN_QUEUE'}});});
 assert.equal(await page.evaluate(async()=>{const {falRun}=await import('/src/ai/providers.ts');const a=new AbortController();setTimeout(()=>a.abort(),100);try{await falRun('test','test',{},5000,a.signal);return false;}catch{return a.signal.aborted;}}),true);await delay(150);assert.ok(cancelled,'remote cancellation requested');
 assert.deepEqual(errors,[]);console.log('Wavetable UI, musical render and queue cancel PASS');
}finally{await browser?.close();vite.kill();}
