import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5181;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/portamento-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/portamento-contract.html`);
 const result=await page.evaluate(async()=>{
  const {PitchMemory,monophonicAttacks}=await import('/src/audio/pitchMemory.ts');
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {normalizePatch,isPatch,PATCH_VERSION}=await import('/src/types.ts');
  const {triggerVoice,duckVoice,ensureScratchModule}=await import('/src/audio/voices.ts');
  const {AudioEngine}=await import('/src/audio/engine.ts');
  const {saveUserPreset,loadUserPresets,instrumentNameOf,INSTRUMENT_PRESETS}=await import('/src/music/instrumentPresets.ts');
  const {exportProject,importProject}=await import('/src/audio/project.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  const m=new PitchMemory();check('first note has no artificial starting pitch',m.next('a',200,0,1)===undefined);
  check('arbitrary Hz interval',m.next('a',450,.5,1)?.fromHz===200);
  const interrupted=m.next('a',310,1,1);check('interrupted glide continues from current exponential Hz',Math.abs(interrupted.fromHz-300)<1e-8,interrupted);
  check('owners with a shared instrument remain independent',m.next('b',500,1,1)===undefined);
  m.clear();check('transport reset forgets preceding pitch',m.next('a',310,2,1)===undefined);
  check('same-time attacks do not imply ordered melody',m.next('a',620,2,1)===undefined);
  const split=[{owner:'a',at:0,noteCount:1},{owner:'b',at:0,noteCount:1},{owner:'a',at:0,noteCount:1},{owner:'a',at:.1,noteCount:1}];
  const solos=monophonicAttacks(split,e=>e);check('simultaneous split notes are excluded without blocking another track',!solos.has(split[0])&&!solos.has(split[2])&&solos.has(split[1])&&solos.has(split[3]));
  let patch=defaultPatch();const original=patch.tracks[0];patch.bpm=240;patch.performanceSeed=17;patch.masterNoise='off';patch.followChain=false;
  patch.tracks=[{...original,enabled:true,mono:true,portamentoSec:.8,volume:.03,scale:[1,1.5,2],scaleOctUp:0,scaleOctDown:0,freq:220,arp:undefined,effects:[],mods:[],noteSteps:undefined,
    patterns:[{id:'p',name:'glide',length:4,rate:1,steps:[{notes:[{n:0,vel:.7,prob:1,len:2}]},{notes:[{n:2,vel:.7,prob:1,len:2}]},{notes:[{n:1,vel:.7,prob:1,len:2}]},{notes:[]}]}]}];
  patch.instruments=[{...patch.instruments.find(i=>i.id===original.instrumentId),waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.005,decay:.1,sustain:1,pitchDrop:1,filterEnvAmount:0,unisonVoices:1,vibratoDepth:0,formants:[]}];
  patch.scenes=[{id:'s',name:'glide',slots:{[original.id]:{patternId:'p'}}}];patch.chain=[];patch=normalizePatch(patch);
  check('JSON version and normalization preserve glide seconds',patch.version===PATCH_VERSION&&patch.tracks[0].portamentoSec===.8&&isPatch(patch));
  for(const bad of [-1,4.1,'0.2',Infinity]){const p=structuredClone(patch);p.tracks[0].portamentoSec=bad;check('invalid glide rejected '+bad,!isPatch(p));}
  const old=structuredClone(patch);old.version=48;delete old.tracks[0].portamentoSec;check('old patch remains glide-off',normalizePatch(old).tracks[0].portamentoSec===0);
  const restored=await importProject(await exportProject(patch));check('ZIP roundtrip preserves performance parameter',restored.tracks[0].portamentoSec===.8);
  check('changed glide no longer matches an unchanged factory preset',instrumentNameOf({...INSTRUMENT_PRESETS.find(p=>p.track.mono).track,portamentoSec:.37})==='своя настройка');
  const st={...patch.tracks[0],...patch.instruments[0]};saveUserPreset('Glide test',st);check('user preset preserves glide',loadUserPresets().find(p=>p.name==='Glide test')?.track.portamentoSec===.8);
  const render=async(mode,changes={},extra={})=>{
    const ctx=new OfflineAudioContext(1,Math.ceil(1.6*44100),44100),hp=ctx.createGain();hp.connect(ctx.destination);
    const sample=ctx.createBuffer(1,44100,44100);for(let i=0;i<44100;i++)sample.getChannelData(0)[i]=Math.sin(2*Math.PI*220*i/44100)*.4;
    if(mode==='scratch')await ensureScratchModule(ctx);
    const sound={...st,...(mode==='wave'?{}:{waveform:'sample',sampleMode:mode,rootHz:220,keyTracking:true,sampleLoop:true}),...changes};
    const memory=new PitchMemory(),played=[];let last;
    for(const [n,at] of [[0,.05],[2,.35],[1,.65]]){
      const nts=extra.chord?[{n,vel:.7,prob:1,len:6},{n:1,vel:.6,prob:1,len:6}]:[{n,vel:.7,prob:1,len:6}];
      if(last)duckVoice(last,at);
      last=triggerVoice(ctx,{hp},sample,sample,sound,nts,at,.125,undefined,undefined,()=>.5,undefined,'track',{pitchMemory:memory});
      played.push(last.sources.filter(s=>s instanceof ConstantSourceNode).length);
    }
    const data=(await ctx.startRendering()).getChannelData(0);return {data,played};
  };
  const frequency=(data,at)=>{const zero=[];for(let i=Math.floor((at-.025)*44100);i<Math.floor((at+.025)*44100);i++)if(data[i]<=0&&data[i+1]>0)zero.push(i-data[i]/(data[i+1]-data[i]));return (zero.length-1)*44100/(zero.at(-1)-zero[0]);};
  for(const mode of ['wave','plain']){
    const {data,played}=await render(mode);const from=220*2**(.3/.8);
    for(const t of [.47,.8,1.4]){const expected=t<.65?220*2**((t-.35)/.8):from*(330/from)**((t-.65)/.8),actual=frequency(data,t);check(mode+' real PCM follows continuous pitch at '+t,Math.abs(actual/expected-1)<.025,{actual,expected});}
    check(mode+' one shared control source per gliding voice',played.join(',')==='0,1,1',played);
  }
  const noGlide=await render('wave',{portamentoSec:0});check('zero glide keeps immediate note pitch',noGlide.played.every(n=>n===0)&&Math.abs(frequency(noGlide.data,.47)-440)<2);
  for(const [label,changes,extra] of [['poly',{mono:false},{}],['chord',{}, {chord:true}]]){const r=await render('wave',changes,extra);check(label+' has no glide sources',r.played.every(n=>n===0));}
  const scratch=await render('scratch');check('scratch gesture is unaffected',scratch.played.every(n=>n===0));
  for(const changes of [{wave:{partials:[{type:'saw',ratio:1,amp:1}]}},{wave:{partials:[{type:'sine',ratio:1,amp:1,decay:.4},{type:'sine',ratio:1.7,amp:2,mod:0}]},unisonVoices:3,vibratoDepth:10}]){
    const r=await render('wave',changes);check('operator/unison path is finite and shares glide bus',r.data.every(Number.isFinite)&&r.played.join(',')==='0,1,1');
  }
  const grain=await render('grain',{grainCount:6,grainSizeMs:50,grainScatter:0});check('granular voice shares continuous detune source',grain.data.every(Number.isFinite)&&grain.played.join(',')==='0,1,1');
  // Silence inside the crop and loud PCM immediately afterwards exposes out-of-region reads.
  const cropCtx=new OfflineAudioContext(1,44100,44100),crop=cropCtx.createBuffer(1,44100,44100),hp=cropCtx.createGain();hp.connect(cropCtx.destination);crop.getChannelData(0).fill(.8,882);
  const memory=new PitchMemory();memory.next('crop',1760,0,.8);
  triggerVoice(cropCtx,{hp},crop,crop,{...st,waveform:'sample',sampleMode:'grain',rootHz:220,keyTracking:true,sampleStart:0,sampleEnd:.02,grainCount:8,grainSizeMs:120,pitchDrop:4,pitchTime:.1,vibratoDepth:50},[{n:0,vel:1,prob:1,len:2}],.05,.125,undefined,undefined,()=>.5,undefined,'crop',{pitchMemory:memory});
  const cropped=(await cropCtx.startRendering()).getChannelData(0);check('descending glide plus pitch drop cannot leak outside a short grain crop',cropped.every(v=>v===0));
  // Observe the common state machine through the actual live scheduler and WAV entry point.
  const calls=[],next=PitchMemory.prototype.next;PitchMemory.prototype.next=function(...args){const r=next.apply(this,args);calls.push({owner:args[0],hz:args[1],at:args[2],from:r?.fromHz});return r;};
  const engine=new AudioEngine();
  try{
    engine.play(patch,'s');await new Promise(r=>setTimeout(r,700));engine.stop();const live=calls.splice(0);
    await engine.renderToWav(patch,'s',1,{tail:'trim'});const offline=calls.splice(0);
    check('live and WAV use identical pitch trajectories for the melody',live.length>=3&&offline.length>=3&&live.slice(0,3).every((c,i)=>c.owner===offline[i].owner&&Math.abs((c.from??c.hz)-(offline[i].from??offline[i].hz))<1e-5),{live:live.slice(0,3),offline:offline.slice(0,3)});
    engine.play(patch,'s');await new Promise(r=>setTimeout(r,120));engine.stop();check('quick restart begins without a previous-note glide',calls.length>0&&calls[0].from===undefined);
    calls.length=0;const splitPatch=structuredClone(patch);splitPatch.tracks[0].patterns[0].steps[1].notes=[{n:1,vel:.7,prob:1,len:1,ratchet:2},{n:2,vel:.7,prob:1,len:1,ratchet:2}];
    await engine.renderToWav(splitPatch,'s',1,{tail:'trim'});check('WAV split chord clears melody memory before following solo',calls.filter(c=>c.hz===330).length>0&&calls.filter(c=>c.hz===330).every(c=>c.from===undefined),calls);

  }finally{PitchMemory.prototype.next=next;engine.stop();await new Promise(r=>setTimeout(r,160));await engine.ctx.close();}
  patch.tracks[0].portamentoSec=0;
  localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-track"]').first().click();
 const field=page.getByRole('spinbutton',{name:'portamento, мс',exact:true});await field.fill('350');await field.press('Enter');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].portamentoSec===.35);
 await page.keyboard.press('Control+z');assert.equal(Number(await field.inputValue()),0);await page.keyboard.press('Control+Shift+z');assert.equal(Number(await field.inputValue()),350);
 await field.fill('800');await field.press('Escape');assert.equal(Number(await field.inputValue()),350);
 await page.getByRole('checkbox',{name:'новая нота глушит предыдущую'}).uncheck();assert.equal(await field.count(),0);await page.keyboard.press('Control+z');assert.equal(Number(await field.inputValue()),350);
 await page.screenshot({path:root+'/tmp/portamento-controls.png'});assert.deepEqual(errors,[]);console.log('PASS portamento input, persistence, undo/redo, Escape and mono visibility');
}finally{await browser?.close();vite.kill();}
