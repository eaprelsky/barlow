import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5183;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/restart-contract.html','<!doctype html><title>Transport restart contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/restart-contract.html`);
 const result=await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {normalizePatch}=await import('/src/types.ts');
  const {AudioEngine}=await import('/src/audio/engine.ts');
  const {chainBudgetOf}=await import('/src/audio/chainBudget.ts');
  const {ensureScratchModule}=await import('/src/audio/voices.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  let patch=defaultPatch();const original=patch.tracks[0];
  patch.tracks=[{...original,enabled:true,mono:false,volume:.02,effects:[],mods:[{target:'pan',shape:'sine',rate:2,depth:.2}],patterns:[{id:'p',name:'restart',length:4,rate:1,steps:Array.from({length:4},()=>({notes:[{n:0,vel:.3,prob:1,len:1}]}))}]}];
  patch.instruments=[{...patch.instruments.find(i=>i.id===original.instrumentId),waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.005,decay:.2,sustain:0,unisonVoices:1}];
  patch.scenes=[{id:'s',name:'restart',slots:{[original.id]:{patternId:'p'}}}];patch.chain=[];patch.followChain=false;patch.performanceSeed=5;patch.masterNoise='off';patch=normalizePatch(patch);
  const engine=new AudioEngine();engine.setPatch(patch);const ctx=engine.ensureCtx(),starts=new WeakMap();
  const create=ctx.createOscillator.bind(ctx);ctx.createOscillator=()=>{const node=create(),start=node.start.bind(node);node.start=(at=0)=>{starts.set(node,at);start(at);};return node;};
  try{
   engine.play(patch,'s');await new Promise(r=>setTimeout(r,210));const first=engine.chains.get(original.id);
   engine.stop();check('Stop detaches the old generation immediately',engine.chains.size===0);
   engine.play(patch,'s');const second=engine.chains.get(original.id),anchor=engine.startAt;
   check('quick Play creates new modulator sources at the new transport anchor',second!==first&&second.mods.length>0&&second.mods.every(m=>starts.get(m.src)===anchor));
   await new Promise(r=>setTimeout(r,160));
   check('old Stop timer preserves the new graph and releases the old lease',engine.chains.get(original.id)===second&&chainBudgetOf(ctx).usage.chains===1);
   for(let i=0;i<8;i++){engine.stop();engine.play(patch,'s');}
   const newest=engine.chains.get(original.id);await new Promise(r=>setTimeout(r,180));
   check('repeated quick starts retain only the latest graph',engine.chains.get(original.id)===newest&&chainBudgetOf(ctx).usage.chains===1);
   engine.stop();await new Promise(r=>setTimeout(r,150));check('final Stop releases every generation',chainBudgetOf(ctx).usage.chains===0);
   const budget=chainBudgetOf(ctx),limit=budget.limits.chains;budget.limits.chains=1;
   engine.play(patch,'s');engine.stop();engine.play(patch,'s');
   check('overlapping stop tail remains accounted under a strict graph budget',budget.usage.chains===1&&engine.diagnostics.blockedTracks.length===1);
   await new Promise(r=>setTimeout(r,240));
   check('restart recovers after old tail releases capacity',budget.usage.chains===1&&engine.diagnostics.blockedTracks.length===0&&engine.chains.size===1);
   budget.limits.chains=limit;engine.stop();await new Promise(r=>setTimeout(r,150));
   const load=engine.loadMainSample;let finish;engine.loadMainSample=()=>new Promise(r=>finish=r);
   engine.previewSampleRegion(patch.tracks[0],0,.5);engine.stop();finish(ctx.createBuffer(1,44100,44100));await new Promise(r=>setTimeout(r,20));
   check('Stop cancels pending region preview before a source is created',engine.regionCleanup===null);
   engine.scratchBegin(patch.tracks[0]);engine.stop();finish(ctx.createBuffer(1,44100,44100));await new Promise(r=>setTimeout(r,20));
   check('Stop cancels pending scratch before a worklet is created',engine.scratchNode===null);
   const pending=engine.previewScratch(patch.tracks[0]);engine.stop();finish(ctx.createBuffer(1,44100,44100));await pending;
   check('Stop cancels pending recorded scratch preview',engine.previewCleanup===null);
   engine.loadMainSample=async()=>ctx.createBuffer(1,44100,44100);engine.previewSampleRegion(patch.tracks[0],0,.5);await new Promise(r=>setTimeout(r,20));
   check('region preview is owned while it plays',typeof engine.regionCleanup==='function');engine.stop();check('Stop releases active region preview',engine.regionCleanup===null);engine.loadMainSample=load;
   await ensureScratchModule(ctx);engine.loadMainSample=async()=>ctx.createBuffer(1,44100,44100);
   const scratchError=await engine.previewScratch(patch.tracks[0]);
   check('recorded scratch preview registers cleanup',scratchError===null&&typeof engine.previewCleanup==='function');
   engine.stop();check('Stop releases active recorded scratch preview',engine.previewCleanup===null);engine.loadMainSample=load;
   return checks;
  }finally{engine.stop();await new Promise(r=>setTimeout(r,160));await ctx.close();}
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
