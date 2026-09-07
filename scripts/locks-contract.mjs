import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5184;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/locks-contract.html','<!doctype html><title>Note locks contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/locks-contract.html`);
 const result=await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {normalizePatch,isPatch}=await import('/src/types.ts');
  const {triggerVoice,ensureScratchModule}=await import('/src/audio/voices.ts');
  const {withNoteLocks,normalizeNoteLocks,NOTE_LOCK_FIELDS}=await import('/src/music/noteLocks.ts');
  const {estimateVoiceNodes,VoiceBudget}=await import('/src/audio/voiceBudget.ts');
  const {voiceLifetimeBound}=await import('/src/audio/renderTail.ts');
  const {planStepEvents}=await import('/src/audio/eventPlan.ts');
  const {AudioEngine}=await import('/src/audio/engine.ts');
  const {SampleRoundRobin}=await import('/src/music/sampleRoundRobin.ts');
  const {putSample}=await import('/src/audio/library.ts');
  const {audioBufferToWav}=await import('/src/audio/wav.ts');
  const {exportProject,importProject}=await import('/src/audio/project.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  let patch=defaultPatch();patch.bpm=120;patch.performanceSeed=7;patch.masterNoise='off';patch.followChain=false;
  patch.tracks=[patch.tracks[0]];const track=patch.tracks[0];track.scale=[1,1.5];track.scaleOctUp=0;track.scaleOctDown=0;track.freq=220;track.arp=undefined;track.mono=false;track.effects=[];track.mods=[];
  track.patterns=[{id:'p',name:'locks',rate:1,length:8,steps:Array.from({length:8},(_,i)=>({notes:i===0?[{n:0,vel:.7,prob:1,len:.5,ratchet:4,microTimingMs:-15}]:[]}))}];
  patch.instruments=[{...patch.instruments.find(i=>i.id===track.instrumentId),waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.005,decay:.2,sustain:0,filterEnvAmount:0,unisonVoices:1,formants:[],vibratoDepth:0}];
  patch.scenes=[{id:'s',name:'locks',slots:{[track.id]:{patternId:'p'}}}];patch.chain=[];patch=normalizePatch(patch);
  const st={...patch.tracks[0],...patch.instruments[0],scale:[1,1.5],scaleOctUp:0,scaleOctDown:0};
  const notes=[{n:0,vel:.7,prob:1,len:1,locks:{decay:.6,unisonVoices:3}},{n:1,vel:.5,prob:1,len:1,locks:{decay:.06,pitchDrop:2,pitchTime:.1}}];
  const sampleContext=new OfflineAudioContext(1,44100,44100),sample=sampleContext.createBuffer(1,44100,44100),d=sample.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=.3*Math.sin(2*Math.PI*(i<22050?220:660)*i/44100);
  const metaA=await putSample(audioBufferToWav(sample),'Lock sample A');
  const sampleB=sampleContext.createBuffer(1,44100,44100);for(let i=0;i<44100;i++)sampleB.getChannelData(0)[i]=.3*Math.sin(2*Math.PI*330*i/44100);
  const metaB=await putSample(audioBufferToWav(sampleB),'Lock sample B');
  const render=async(sound,ns,manual)=>{
   const ctx=new OfflineAudioContext(2,88200,44100);if(sound.sampleMode==='scratch')await ensureScratchModule(ctx);
   const hp=ctx.createGain();hp.connect(ctx.destination);const voices=[];
   if(manual){hp.gain.value=1/ns.length;for(const note of ns)voices.push(triggerVoice(ctx,{hp},sample,sample,withNoteLocks(sound,note.locks),[{...note,locks:undefined}],.05,.125,undefined,undefined,()=>.5));}
   else voices.push(triggerVoice(ctx,{hp},sample,sample,sound,ns,.05,.125,undefined,undefined,()=>.5));
   const buffer=await ctx.startRendering();return {data:buffer.getChannelData(0),stop:Math.max(...voices.map(v=>v.stopAt))};
  };
  for(const [name,sound,ns] of [
   ['independent chord envelopes and unison',st,notes],
   ['direct sample region and pitch',{...st,waveform:'sample',sampleMode:'plain'},[{...notes[0],locks:{sampleStart:.5,sampleEnd:.9,pitchDrop:3,pitchTime:.1}}]],
   ['granular position/count/size',{...st,waveform:'sample',sampleMode:'grain'},[{...notes[0],locks:{grainPos:1,grainScatter:0,grainSizeMs:60,grainCount:16}}]],
   ['scratch region and envelope',{...st,waveform:'sample',sampleMode:'scratch'},[{...notes[0],locks:{sampleStart:.4,sampleEnd:.8,decay:.4,sustain:.5}}]],
  ]){
   const actual=await render(sound,ns,false),manual=await render(sound,ns,true);
   const drift=actual.data.reduce((m,v,i)=>Math.max(m,Math.abs(v-manual.data[i])),0);
   check(`locked PCM equals explicitly configured voices: ${name}`,drift<1e-6,drift);
   check(`WAV lifetime bound includes locked voice: ${name}`,voiceLifetimeBound(sound,ns,.125)>=actual.stop-.05);
  }
  const plain=await render(st,notes.map(n=>({...n,locks:undefined})),false),locked=await render(st,notes,false);
  check('locks audibly change PCM while preserving the base instrument',locked.data.some((v,i)=>Math.abs(v-plain.data[i])>.001)&&st.decay===.2&&st.unisonVoices===1);
  const heavy={...st,wave:{partials:Array.from({length:64},(_,i)=>({type:'sine',ratio:i+1,amp:.01}))}};
  const many=notes.map(n=>({...n,locks:{unisonVoices:8}}));
  check('voice budget accounts for each locked unison instead of base settings',estimateVoiceNodes(heavy,many)>8192&&!new VoiceBudget().allows(heavy,many)&&new VoiceBudget().allows(heavy,2));
  const n={...notes[0],ratchet:3,microTimingMs:-20};
  const ev=planStepEvents({notes:[n]},st,.125,()=>.5);
  check('ratchets retain locks on every retrigger',ev.length===3&&ev.every(e=>e.notes[0].locks.decay===.6));
  const arp=planStepEvents({notes:[n]},{...st,arp:{mode:'up',div:2,octaves:2}},.125,()=>.5);
  check('arpeggiator retains locks on expanded notes',arp.length>0&&arp.every(e=>e.notes[0].locks.decay===.6));
  const normalized=normalizeNoteLocks({decay:99,unisonVoices:2.7,grainPos:-1});
  check('lock values use shared ranges and integer rules',normalized.decay===4&&normalized.unisonVoices===3&&normalized.grainPos===0);
  const portable=structuredClone(patch);portable.tracks[0].patterns[0].steps[0].notes[0].locks={decay:.65,unisonVoices:3};
  const imported=await importProject(new File([await exportProject(portable)],'locks.zip'));
  check('JSON normalization and portable project retain note locks',imported.tracks[0].patterns[0].steps[0].notes[0].locks.decay===.65);
  const bad=structuredClone(portable);bad.tracks[0].patterns[0].steps[0].notes[0].locks={volume:1};check('shared-chain fields cannot be smuggled in as note locks',!isPatch(bad));
  bad.tracks[0].patterns[0].steps[0].notes[0].locks=Object.fromEntries(NOTE_LOCK_FIELDS.slice(0,9).map(k=>[k,1]));check('more than eight note locks rejected',!isPatch(bad));
  const shared=structuredClone(patch);shared.tracks=[{...shared.tracks[0],id:'track-a'},{...structuredClone(shared.tracks[0]),id:'track-b'}];
  shared.instruments[0]={...shared.instruments[0],waveform:'sample',sampleId:metaA.id,sampleZones:[{id:'z',sampleId:metaA.id,rootHz:220,lowHz:1,highHz:24000,lowVelocity:0,highVelocity:1,alternates:[{sampleId:metaB.id,rootHz:220}]}]};
  for(const t of shared.tracks)t.patterns[0].steps[0].notes=[{n:0,vel:.8,prob:1,len:1}];shared.scenes[0].slots={'track-a':{patternId:'p'},'track-b':{patternId:'p'}};
  const select=SampleRoundRobin.prototype.select,first=new Map();SampleRoundRobin.prototype.select=function(owner,zone){const v=select.call(this,owner,zone);if(!first.has(owner))first.set(owner,v.sampleId);return v;};
  const engine=new AudioEngine();
  try{
   await engine.renderToWav(shared,'s',1,{tail:'trim'});
   check('WAV round robin is independent for tracks sharing one instrument',first.get('track-a')===metaA.id&&first.get('track-b')===metaA.id);
   first.clear();await engine.ensureSamples(shared);engine.play(shared,'s');await new Promise(r=>setTimeout(r,200));engine.stop();
   check('live round robin is independent for tracks sharing one instrument',first.get('track-a')===metaA.id&&first.get('track-b')===metaA.id);
  }finally{SampleRoundRobin.prototype.select=select;engine.stop();await new Promise(r=>setTimeout(r,200));if(engine.ctx)await engine.ctx.close();}
  localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
  return {checks};
 });
 for(const c of result.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.checks.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);
 const cell=c=>page.locator(`.cell[data-col="${c}"][data-row="0"]`).first();await cell(0).focus();await cell(0).press('F2');
 const editor=page.locator('[data-note-locks="0"]');await editor.locator('summary').click();
 await editor.getByRole('combobox').selectOption('decay');const decay=editor.getByRole('spinbutton');await decay.fill('.65');await decay.press('Enter');
 await page.keyboard.press('Control+z');assert.equal(Number(await decay.inputValue()),.2);await page.keyboard.press('Control+Shift+z');assert.equal(Number(await decay.inputValue()),.65);
 await cell(0).focus();await cell(0).press('Shift+Space');await page.keyboard.press('Control+d');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].steps[1].notes[0]?.locks?.decay===.65);
 await page.keyboard.press('Control+c');await cell(3).focus();await cell(3).press('F2');await page.keyboard.press('Control+v');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].steps[3].notes[0]?.locks?.decay===.65);
 const copied=await page.evaluate(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].steps[3].notes[0]);
 assert.equal(copied.ratchet,4);assert.equal(copied.microTimingMs,-15);assert.equal(copied.len,.5);
 await page.keyboard.press('Control+z');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].steps[3].notes.length===0);
 await cell(0).focus();await cell(0).press('F2');await editor.locator('summary').click();await page.screenshot({path:root+'/tmp/note-locks.png'});
 console.log('PASS note lock add/edit/undo/redo and complete note duplication/copy/paste/undo');
 await editor.getByRole('button',{name:'Снять фиксацию: спад'}).click();assert.equal(await editor.locator('.note-lock').count(),0);await page.keyboard.press('Control+z');assert.equal(await editor.locator('.note-lock').count(),1);
 console.log('PASS remove note lock and undo');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
