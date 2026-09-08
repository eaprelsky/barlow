import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5182;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/slices-contract.html','<!doctype html><title>Slices and choke contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/slices-contract.html`);
 const result=await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {normalizePatch,isPatch}=await import('/src/types.ts');
  const {triggerVoice,duckVoice,ensureScratchModule}=await import('/src/audio/voices.ts');
  const {MonoVoices}=await import('/src/audio/monoVoices.ts');
  const {selectChokeEvents}=await import('/src/audio/chokeEvents.ts');
  const {planRender}=await import('/src/audio/renderPlan.ts');
  const {planStepEvents}=await import('/src/audio/eventPlan.ts');
  const {AudioEngine}=await import('/src/audio/engine.ts');
  const {sampleAssets}=await import('/src/music/sampleZones.ts');
  const {putSample}=await import('/src/audio/library.ts');
  const {audioBufferToWav}=await import('/src/audio/wav.ts');
  const {exportProject,importProject}=await import('/src/audio/project.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  let patch=defaultPatch();patch.bpm=120;patch.performanceSeed=7;patch.masterNoise='off';patch.followChain=false;
  patch.tracks=[patch.tracks[0]];const track=patch.tracks[0];track.scale=[1,1.5];track.scaleOctUp=0;track.scaleOctDown=0;track.freq=220;track.arp=undefined;track.mono=false;track.effects=[];track.mods=[];
  track.patterns=[{id:'p',name:'cuts',rate:1,length:8,steps:Array.from({length:8},(_,i)=>({notes:i===0?[{n:0,vel:.7,prob:1,len:2}]:[]}))}];
  patch.instruments=[{...patch.instruments.find(i=>i.id===track.instrumentId),waveform:'sample',sampleMode:'plain',sampleZones:undefined,sampleSlices:undefined,attack:.005,decay:.2,sustain:0,filterEnvAmount:0,unisonVoices:1,formants:[],vibratoDepth:0,keyTracking:false}];
  patch.scenes=[{id:'s',name:'cuts',slots:{[track.id]:{patternId:'p'}}}];patch.chain=[];patch=normalizePatch(patch);
  const sampleContext=new OfflineAudioContext(1,44100,44100),a=sampleContext.createBuffer(1,44100,44100),b=sampleContext.createBuffer(1,44100,44100);
  for(let i=0;i<44100;i++){a.getChannelData(0)[i]=.3*Math.sin(2*Math.PI*(i<22050?220:660)*i/44100);b.getChannelData(0)[i]=.3*Math.sin(2*Math.PI*330*i/44100);}
  const ma=await putSample(audioBufferToWav(a),'Slice source A'),mb=await putSample(audioBufferToWav(b),'Slice source B');
  const slices=[{id:'cut-a',name:'bright half',sampleId:ma.id,start:.5,end:.9},{id:'cut-b',name:'other file',sampleId:mb.id,start:.1,end:.4}];
  patch.instruments[0].sampleId=ma.id;patch.instruments[0].sampleName=ma.name;
  const st={...patch.tracks[0],...patch.instruments[0],sampleSlices:slices};const note={n:0,vel:.7,prob:1,len:2};
  const render=async(sound,n)=>{const ctx=new OfflineAudioContext(1,44100,44100);if(sound.sampleMode==='scratch')await ensureScratchModule(ctx);const hp=ctx.createGain();hp.connect(ctx.destination);
   triggerVoice(ctx,{hp},a,a,sound,[n],.05,.125,undefined,id=>id===ma.id?a:id===mb.id?b:null,()=>.5);return (await ctx.startRendering()).getChannelData(0);};
  for(const mode of ['plain','grain','scratch']){
   const selected=await render({...st,sampleMode:mode}, {...note,sliceId:'cut-b'});
   const explicit=await render({...st,sampleMode:mode,sampleSlices:undefined,sampleZones:[{id:'zone',sampleId:mb.id,rootHz:220,lowHz:1,highHz:24000,lowVelocity:0,highVelocity:1}],sampleStart:.1,sampleEnd:.4},note);
   const drift=selected.reduce((max,v,i)=>Math.max(max,Math.abs(v-explicit[i])),0);check(`slice resolves asset and exact region in ${mode}`,drift<1e-6,drift);
  }
  const locked=await render(st,{...note,sliceId:'cut-a',locks:{sampleStart:.6,sampleEnd:.75}}),manual=await render({...st,sampleStart:.6,sampleEnd:.75},note);
  {const ctx=new OfflineAudioContext(1,44100,44100),isolated=ctx.createBuffer(1,44100,44100);isolated.getChannelData(0).fill(.7,882);const hp=ctx.createGain();hp.connect(ctx.destination);
   triggerVoice(ctx,{hp},isolated,isolated,{...st,sampleMode:'grain',sampleStart:0,sampleEnd:.02,grainSizeMs:120,pitchDrop:4,pitchTime:.1,vibratoDepth:50},[note],.05,.125,undefined,undefined,()=>.5);
   const d=(await ctx.startRendering()).getChannelData(0);check('fast grains cannot read audible PCM outside a short silent cut',d.every(v=>Math.abs(v)<1e-6),Math.max(...d.map(Math.abs)));}
  check('note locks refine a selected slice after its boundaries are resolved',locked.every((v,i)=>Math.abs(v-manual[i])<1e-6));
  const missing=await render(st,{...note,sliceId:'gone'});check('missing slice stays silent instead of playing the full file',missing.every(v=>v===0)&&planStepEvents({notes:[{...note,sliceId:'gone'}]},st,.125).length===0);
  const portable=structuredClone(patch);portable.instruments[0].sampleSlices=slices;portable.instruments[0].sampleId=undefined;portable.tracks[0].patterns[0].steps[0].notes[0].sliceId='cut-b';
  const roundtrip=await importProject(new File([await exportProject(portable)],'slices.zip'));
  check('slice-only assets and note references roundtrip in portable project',sampleAssets(roundtrip.instruments[0]).length===2&&roundtrip.tracks[0].patterns[0].steps[0].notes[0].sliceId==='cut-b');
  const load=new AudioEngine();await load.ensureSamples(portable);check('slice-only instrument preloads both referenced recordings',load.diagnostics.decodedAssets===2);await load.ctx.close();
  for(const [name,change] of [['duplicate IDs',p=>p.instruments[0].sampleSlices.push({...slices[0]})],['invalid interval',p=>p.instruments[0].sampleSlices[0].end=.1],['unsafe hash',p=>p.instruments[0].sampleSlices[0].sampleId='../x'],['too many cuts',p=>p.instruments[0].sampleSlices=Array.from({length:65},(_,i)=>({...slices[0],id:`c${i}`}))],['invalid group',p=>p.tracks[0].chokeGroup=17]]){
   const bad=structuredClone(portable);change(bad);check(`input rejects ${name}`,!isPatch(bad));
  }
  const events=[{at:0,id:'a',group:1,priority:0,order:0},{at:0,id:'b',group:1,priority:2,order:1},{at:0,id:'b',group:1,priority:2,order:1},{at:0,id:'c',order:2},{at:.1,id:'a',group:1,order:0}];
  const winners=selectChokeEvents(events,e=>({...e,trackId:e.id}));check('simultaneous choke priority preserves winning chord and ungrouped voice',winners.map(e=>e.id).join()==='b,b,c,a');
  check('equal priority uses lower track independent of event insertion order',selectChokeEvents([events[1],{...events[0],priority:2}],e=>({...e,trackId:e.id}))[0].id==='b');
  const chokePCM=async()=>{const ctx=new OfflineAudioContext(1,44100,44100),osc=ctx.createOscillator(),amp=ctx.createGain();osc.connect(amp);amp.connect(ctx.destination);osc.start(.05);osc.stop(.9);const voice={amp,sources:[osc],stopAt:.9};
   const groups=new MonoVoices();groups.register('1',voice,.05);groups.register('1',{amp:ctx.createGain(),sources:[],stopAt:.8},.3);const d=(await ctx.startRendering()).getChannelData(0);return d;};
  const chopped=await chokePCM();check('later grouped attack actually removes previous PCM tail',chopped.slice(4410,8820).some(v=>Math.abs(v)>.1)&&chopped.slice(18000).every(v=>Math.abs(v)<1e-6));
  {const ctx=new OfflineAudioContext(1,44100,44100),osc=ctx.createOscillator(),amp=ctx.createGain();osc.connect(amp);amp.connect(ctx.destination);osc.start(.05);osc.stop(.18);duckVoice({amp,sources:[osc],stopAt:.18},.5);const d=(await ctx.startRendering()).getChannelData(0);check('late duck never extends a source beyond its earlier stop',d.slice(10000,19000).every(v=>v===0));}
  const grouped=structuredClone(patch);grouped.tracks=[{...grouped.tracks[0],id:'open',chokeGroup:1,chokePriority:0},{...structuredClone(grouped.tracks[0]),id:'closed',chokeGroup:1,chokePriority:1}];grouped.scenes[0].slots={open:{patternId:'p'},closed:{patternId:'p'}};
  const plan=planRender(grouped,'s',1,{tail:'trim'});check('WAV plan suppresses losing simultaneous track before allocating its graph',plan.events.length>0&&plan.events.every(e=>e.part.track.id==='closed')&&plan.parts.length===1);
  const engine=new AudioEngine(),played=[];engine.noteSink=id=>played.push(id);
  try{await engine.ensureSamples(grouped);engine.play(grouped,'s');await new Promise(r=>setTimeout(r,220));check('live selects the same simultaneous winner as WAV',played.length>0&&played.every(id=>id==='closed'));}
  finally{engine.stop();await new Promise(r=>setTimeout(r,160));await engine.ctx.close();}
  localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-inst"]').first().click();await page.locator('.sample-slices > summary').click();
 await page.getByRole('button',{name:'нарезать весь сэмпл',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].sampleSlices?.length===8);
 const name=page.getByRole('textbox',{name:'Имя фрагмента 1',exact:true});await name.fill('kick slice');await name.press('Enter');await page.keyboard.press('Control+z');assert.equal(await name.inputValue(),'фрагмент 1');await page.keyboard.press('Control+Shift+z');assert.equal(await name.inputValue(),'kick slice');
 await page.getByRole('button',{name:'новый эскиз: фрагменты по порядку',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns.length===2);
 const created=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('barlow.patch.v12'));return {ids:p.tracks[0].patterns[1].steps.map(s=>s.notes[0].sliceId),slices:p.instruments[0].sampleSlices.map(s=>s.id),slot:p.scenes[0].slots[p.tracks[0].id].patternId,newId:p.tracks[0].patterns[1].id};});
 assert.deepEqual(created.ids,created.slices);assert.equal(created.slot,created.newId);await page.keyboard.press('Control+z');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns.length===1);
 await page.screenshot({path:root+'/tmp/sample-slices.png',fullPage:true});
 await page.locator('[data-ob="mode-sketch"]').first().click();const cell=page.locator('.cell[data-col="0"][data-row="0"]').first();await cell.focus();await cell.press('F2');
 const selector=page.getByRole('combobox',{name:'Фрагмент ноты 1',exact:true});const id=await selector.locator('option').nth(1).getAttribute('value');await selector.selectOption(id);
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].steps[0].notes[0].sliceId===id,id);await page.keyboard.press('Control+z');assert.equal(await selector.inputValue(),'');await page.keyboard.press('Control+Shift+z');assert.equal(await selector.inputValue(),id);
 await page.locator('[data-ob="mode-inst"]').first().click();await page.locator('.sample-slices > summary').click();await page.getByRole('button',{name:'Удалить фрагмент 1',exact:true}).click();
 await page.locator('[data-ob="mode-sketch"]').first().click();await cell.focus();await cell.press('F2');assert.match(await selector.locator('option:checked').innerText(),/удалён/);
 await page.locator('[data-ob="mode-track"]').first().click();await page.getByRole('combobox',{name:'Группа глушения',exact:true}).selectOption('1');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].chokeGroup===1);await page.keyboard.press('Control+z');assert.equal(await page.getByRole('combobox',{name:'Группа глушения',exact:true}).inputValue(),'0');
 await page.getByRole('checkbox',{name:'новая нота глушит предыдущую'}).check();await page.keyboard.press('Control+z');assert.equal(await page.getByRole('checkbox',{name:'новая нота глушит предыдущую'}).isChecked(),false);
 await page.getByRole('combobox',{name:'Группа глушения',exact:true}).selectOption('1');const priority=page.getByRole('spinbutton',{name:'приоритет',exact:true});await priority.fill('3');await priority.press('Enter');await page.keyboard.press('Control+z');assert.equal(Number(await priority.inputValue()),0);await page.keyboard.press('Control+Shift+z');assert.equal(Number(await priority.inputValue()),3);
 await page.screenshot({path:root+'/tmp/choke-controls.png'});assert.deepEqual(errors,[]);console.log('PASS slice create/name/sequence/undo/select/delete-orphan and choke/mono/priority commands');
}finally{await browser?.close();vite.kill();}
