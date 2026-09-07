import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('..', import.meta.url)), port = 5188;
mkdirSync(root + '/tmp', {recursive:true}); writeFileSync(root + '/tmp/stress-contract.html','<!doctype html><title>Stress contract</title><button>Start audio test</button>');
const vite = spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try {
  for(let i=0;i<60;i++){if(vite.exitCode!==null)throw new Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
  browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/tmp/stress-contract.html`);await page.getByRole('button').click();
  const result=await page.evaluate(async()=>{
    const {defaultPatch}=await import('/src/music/defaultPatch.ts');
    const {normalizePatch}=await import('/src/types.ts');
    const {AudioEngine}=await import('/src/audio/engine.ts');
    const {planRender}=await import('/src/audio/renderPlan.ts');
    const {chainBudgetOf,LIVE_CHAIN_LIMITS,resourcesFit,ChainBudgetError}=await import('/src/audio/chainBudget.ts');
    const {makeChain,disposeChain,startChain}=await import('/src/audio/fx.ts');
    const {triggerVoice}=await import('/src/audio/voices.ts');
    const checks=[];const check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
    let patch=defaultPatch();patch.bpm=120;patch.followChain=false;patch.performanceSeed=5;patch.masterNoise='off';
    const original=patch.tracks[0];patch.instruments=[{...patch.instruments.find(i=>i.id===original.instrumentId),waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.005,decay:.2,sustain:0,unisonVoices:1}];
    patch.tracks=Array.from({length:36},(_,i)=>({...structuredClone(original),id:`stress-${i}`,name:`stress-${i}`,enabled:i<12,volume:.02,arp:undefined,mods:[],phase:0,
      effects:[{id:'a',type:'reverb',sizeSec:4,mix:.3},{id:'b',type:'reverb',sizeSec:4,mix:.3}],
      patterns:[{id:`p-${i}`,name:'stress',length:4,rate:1,steps:Array.from({length:4},(_,j)=>({notes:j===0?[{n:0,vel:.3,prob:1,len:1}]:[]}))}]}));
    patch.scenes=[{id:'s',name:'stress',slots:Object.fromEntries(patch.tracks.map(t=>[t.id,{patternId:t.patterns[0].id}]))}];patch.chain=[];patch=normalizePatch(patch);
    const excessive=structuredClone(patch);excessive.tracks.forEach(t=>t.enabled=true);
    let loaded=false,rejected=false;const offline=new AudioEngine();offline.ensureSamples=async()=>{loaded=true;};
    try{await offline.renderToWav(excessive,'s',1,{tail:'trim'});}catch(e){rejected=e instanceof ChainBudgetError;}
    check('WAV rejects excessive FX graph before loading assets',rejected&&!loaded);
    const empty=structuredClone(excessive);empty.tracks.forEach(t=>t.patterns[0].steps.forEach(s=>s.notes=[]));
    const emptyPlan=planRender(empty,'s',1,{tail:'trim'});
    check('silent parts allocate no FX and preserve musical duration',emptyPlan.parts.length===0&&emptyPlan.chainResources.chains===0&&Math.abs(emptyPlan.musicalEnd-2.05)<1e-9);
    const phaseRender=async(deferred)=>{
      const ctx=new OfflineAudioContext(1,44100,44100);
      const st={...patch.tracks[0],...patch.instruments[0],effects:[{id:'d',type:'delay',timeSec:.07,feedback:.3,mix:.4}],mods:[{target:'fxMix',fxId:'d',shape:'sine',rate:2,depth:.2}]};
      const chain=makeChain(ctx,st,ctx.destination,120,7,deferred?null:.2);
      if(deferred){startChain(chain,.2);startChain(chain,.2);}
      triggerVoice(ctx,chain,ctx.createBuffer(1,44100,44100),null,st,[{n:0,vel:.4,prob:1,len:2}],.2,.125);
      try{return (await ctx.startRendering()).getChannelData(0);}finally{disposeChain(chain);}
    };
    const immediate=await phaseRender(false),deferred=await phaseRender(true);
    const phaseDrift=immediate.reduce((max,v,i)=>Math.max(max,Math.abs(v-deferred[i])),0);
    check('deferred startup preserves complete FX/control phase and is idempotent',phaseDrift<1e-6,phaseDrift);
    const engine=new AudioEngine();const notes=[];engine.noteSink=(id)=>notes.push(id);engine.play(patch,'s');
    try {
      await new Promise(r=>setTimeout(r,1000));const peak=engine.diagnostics;
      check('live admits bounded convolution graphs and reports omitted tracks',peak.blockedTracks.length>0&&peak.blockedTracks.length<12&&peak.chains<12&&peak.chainBufferBytes<=LIVE_CHAIN_LIMITS.bufferBytes,peak);
      check('muted tracks never allocate graphs or emit notes',peak.chains+peak.blockedTracks.length===12&&notes.every(id=>Number(id.split('-')[1])<12));
      check('scheduler reports measured JS duration and remains alive under budget pressure',Number.isFinite(peak.schedulerMaxMs)&&peak.schedulerMaxMs>0&&engine.playing&&notes.length>0,{maxMs:peak.schedulerMaxMs,slowCalls:peak.slowSchedulerCalls,notes:notes.length});
      const before=chainBudgetOf(engine.ctx).usage;
      const firstChain=engine.chains.values().next().value;
      let resizeRejected=false;
      try{firstChain.resourceLease.resize({effects:Array.from({length:16},()=>({type:'reverb',sizeSec:8,mix:1})),mods:[]});}catch(e){resizeRejected=e instanceof ChainBudgetError;}
      check('reverb resize fails atomically before replacing its impulse',resizeRejected&&JSON.stringify(chainBudgetOf(engine.ctx).usage)===JSON.stringify(before));
      let previewRejected=false;
      try{makeChain(engine.ctx,{...patch.tracks[0],...patch.instruments[0],effects:Array.from({length:16},()=>({type:'reverb',sizeSec:8,mix:1}))},engine.ctx.destination);}catch(e){previewRejected=e instanceof ChainBudgetError;}
      check('additional preview shares the same context budget',previewRejected&&JSON.stringify(chainBudgetOf(engine.ctx).usage)===JSON.stringify(before));
      const reduced=structuredClone(patch);reduced.tracks=reduced.tracks.slice(0,2);reduced.tracks.forEach(t=>t.effects=[]);engine.setPatch(reduced);
      await new Promise(r=>setTimeout(r,800));const recovered=engine.diagnostics;
      check('retired graphs release capacity and lighter edit recovers automatically',recovered.blockedTracks.length===0&&recovered.chains===2&&recovered.chainBufferBytes===0,recovered);
      const previewWarnings=[];engine.warnSink=message=>previewWarnings.push(message);
      engine.voiceBudget.add({amp:engine.ctx.createGain(),sources:[],stopAt:engine.ctx.currentTime+1},{...reduced.tracks[0],...patch.instruments[0]},128);
      engine.previewSounding({...reduced.tracks[0],...patch.instruments[0],effects:[]},0);
      await new Promise(r=>setTimeout(r,50));
      check('preview respects shared voice budget and releases failed graph',previewWarnings.some(m=>m.includes('бюджет голосов'))&&chainBudgetOf(engine.ctx).usage.chains===2);
      engine.voiceBudget.stop(engine.ctx.currentTime);
      const chain=engine.chains.values().next().value;disposeChain(chain);disposeChain(chain);
      check('disposal releases each reservation once',chainBudgetOf(engine.ctx).usage.chains===1);
      return {checks,peak,recovered,patch};
    } finally {
      engine.stop();await new Promise(r=>setTimeout(r,450));
      check('stop releases all active and retiring graph reservations',chainBudgetOf(engine.ctx).usage.chains===0);
      await engine.ctx.close();
    }
  });
  for(const c of result.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);
  writeFileSync(root+'/tmp/stress-qa.json',JSON.stringify({browser:'Edge',checks:result.checks,peak:result.peak,recovered:result.recovered},null,2));
  assert.ok(result.checks.every(c=>c.pass),'stress contract failed');assert.deepEqual(errors,[]);
  const ui=await browser.newPage({viewport:{width:1440,height:1000}});
  const overloaded=result.patch;overloaded.tracks=overloaded.tracks.slice(0,1);
  overloaded.tracks[0].effects=Array.from({length:16},(_,i)=>({id:`r-${i}`,type:'reverb',sizeSec:8,mix:.3}));
  overloaded.scenes=[{id:'s',name:'stress',slots:{[overloaded.tracks[0].id]:{patternId:overloaded.tracks[0].patterns[0].id}}}];
  await ui.addInitScript(p=>{localStorage.setItem('barlow.patch.v12',JSON.stringify(p));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));},overloaded);
  ui.on('pageerror',e=>errors.push(e.message));await ui.goto(`http://127.0.0.1:${port}`);
  await ui.getByRole('button',{name:'Играть',exact:true}).click();
  await ui.locator('.audio-status').filter({hasText:'бюджет FX: не звучат 1 тр.'}).waitFor();
  assert.match(await ui.locator('.audio-status').getAttribute('title'),/Не звучат: stress-0/);
  await ui.screenshot({path:root+'/tmp/resource-status.png'});
  await ui.getByRole('button',{name:'Стоп',exact:true}).click();
  await ui.waitForFunction(()=>!document.querySelector('.audio-status').textContent.includes('не звучат'));
  assert.deepEqual(errors,[]);console.log('PASS transport exposes FX budget failure with track name and clears it on Stop');
} finally {await browser?.close();vite.kill();}
