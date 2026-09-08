import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5178;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/layers-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/layers-contract.html`);


 const result=await page.evaluate(async()=>{
 const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch,isPatch}=await import('/src/types.ts');
 const {triggerVoice,duckVoice}=await import('/src/audio/voices.ts');const {voiceSnapshot,soundingSampleAssets}=await import('/src/music/layers.ts');
 const {estimateVoiceNodes,VoiceBudget}=await import('/src/audio/voiceBudget.ts');const {exportProject,importProject}=await import('/src/audio/project.ts');
 const {AudioEngine}=await import('/src/audio/engine.ts');const {putSample}=await import('/src/audio/library.ts');const {audioBufferToWav}=await import('/src/audio/wav.ts');
 const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
 let patch=defaultPatch();patch.tracks=[patch.tracks[0]];const t=patch.tracks[0];patch.instruments=patch.instruments.filter(i=>i.id===t.instrumentId);t.freq=220;t.scale=[1];t.scaleOctUp=0;t.scaleOctDown=0;t.enabled=true;t.volume=.8;t.noteSteps=undefined;
 t.patterns=[{id:'p',name:'test',length:4,rate:1,steps:[{notes:[{n:0,vel:1,prob:1,len:4}]},{notes:[]},{notes:[]},{notes:[]}]}];patch.scenes=[{id:'s',name:'test',slots:{[t.id]:{patternId:'p'}}}];patch.chain=[];patch.followChain=false;
 Object.assign(patch.instruments[0],{waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.001,decay:.7,sustain:.8,pitchDrop:1,vibratoDepth:0,unisonVoices:1,formants:[],filterEnvAmount:0});
 const base=voiceSnapshot(patch.instruments[0]);patch.instruments[0].layers=[{id:'fraction',name:'дробный тон',gain:.5,ratio:1.37,sound:base}];patch=normalizePatch(patch);const st={...patch.tracks[0],...patch.instruments[0]};
 const render=async(sound,duck=false)=>{const ctx=new OfflineAudioContext(1,44100,44100),noise=ctx.createBuffer(1,44100,44100),hp=ctx.createGain();hp.connect(ctx.destination);const voice=triggerVoice(ctx,{hp},noise,null,sound,[{n:0,vel:1,prob:1,len:4}],.05,.125);if(duck)duckVoice(voice,.2);return {a:(await ctx.startRendering()).getChannelData(0),voice};};
 const both=await render(st),a=await render({...st,layers:undefined}),b=await render({...st,layers:undefined,freq:220*1.37});
 let diff=0;for(let i=0;i<a.a.length;i++)diff=Math.max(diff,Math.abs(both.a[i]-(a.a[i]+.5*b.a[i])/1.5));check('fractional layer mix equals independently rendered voices',diff<1e-6,diff);
 const silent=await render({...st,baseVoiceGain:0,layers:st.layers.map(l=>({...l,gain:0}))});check('zero levels allocate no sources and are silent',silent.voice.sources.length===0&&silent.a.every(v=>v===0));
 const ducked=await render(st,true);check('one choke stops every layer',ducked.a.slice(15000).every(v=>v===0));
 const budget=new VoiceBudget();budget.add(both.voice,st,1);budget.endScene(.2);check('scene boundary releases inaudible long-voice admission',budget.notes===0&&both.voice.stopAt<=.2);
 const {stopSource}=await import('/src/audio/sourceLifecycle.ts');const stops=[];const source={stop:at=>stops.push(at)};stopSource(source,.1);stopSource(source,1);stopSource(source,.05);check('scene/mono cancellation never extends a shorter source',stops.join(',')==='0.1,0.1,0.05');
 const locked=[{n:0,vel:1,prob:1,locks:{unisonVoices:8}}];check('budget counts locks inside each layer',estimateVoiceNodes(st,locked)>estimateVoiceNodes(st,1)*2);
 check('JSON preserves snapshots and IDs',JSON.stringify(normalizePatch(JSON.parse(JSON.stringify(patch))).instruments[0].layers)===JSON.stringify(patch.instruments[0].layers));
 for(const layers of [[...st.layers,...st.layers],Array.from({length:4},(_,n)=>({...st.layers[0],id:'l'+n})),[{...st.layers[0],sound:{...base,layers:[]}}],[{...st.layers[0],ratio:9}]]){const bad=structuredClone(patch);bad.instruments[0].layers=layers;check('invalid layer data rejected',!isPatch(bad));}
 const ctx=new OfflineAudioContext(1,44100,44100),buf=ctx.createBuffer(1,22050,44100);buf.getChannelData(0).fill(.3);const asset=await putSample(audioBufferToWav(buf),'layer-only');
 patch.instruments[0].layers.push({id:'sample',name:'сэмпл',gain:.3,ratio:1,sound:{...base,waveform:'sample',sampleId:asset.id,sampleName:asset.name,sampleMode:'plain',rootHz:220,keyTracking:true}});
 const opened=await importProject(await exportProject(patch));check('layer-only sample travels in ZIP',opened.instruments[0].layers[1].sound.sampleId===asset.id);
 check('dormant sample slots do not trigger live preparation',soundingSampleAssets({...st,sampleId:'f'.repeat(64),layers:[{...st.layers[0],gain:0,sound:{...base,waveform:'sample',sampleId:'e'.repeat(64)}}]}).length===0);
 const engine=new AudioEngine();try{engine.play(patch,'s');await new Promise(r=>setTimeout(r,250));engine.stop();const wav=await engine.renderToWav(patch,'s',1,{tail:'trim'});check('live preparation and WAV support wave plus sample layers',wav.size>10000);}finally{engine.stop();await new Promise(r=>setTimeout(r,150));await engine.ctx.close();}
 localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-inst"]').first().click();
 const field=page.getByRole('spinbutton',{name:'Отношение частоты слоя дробный тон',exact:true});await field.fill('1.7');await field.press('Enter');await page.keyboard.press('Control+z');assert.equal(+await field.inputValue(),1.37);await page.keyboard.press('Control+Shift+z');assert.equal(+await field.inputValue(),1.7);
 await page.getByRole('button',{name:'▸ дробный тон',exact:true}).click();await page.getByLabel('Огибающая слоя',{exact:true}).selectOption('points');
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.locator('[data-ob="instrument-layers"]').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/layers-${width}.png`});console.log('PASS layers desktop layout '+width);}
 await page.getByRole('button',{name:'Удалить слой сэмпл',exact:true}).click();await page.keyboard.press('Control+z');await page.getByRole('button',{name:'Удалить слой сэмпл',exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('PASS layer undo, ratio, envelope selection and removal');
}finally{await browser?.close();vite.kill();}
