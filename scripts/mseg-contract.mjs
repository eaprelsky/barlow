import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5179;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/mseg-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/mseg-contract.html`);

 const result=await page.evaluate(async()=>{
 const {defaultPatch}=await import('/src/music/defaultPatch.ts');
 const {normalizePatch,isPatch}=await import('/src/types.ts');
 const {triggerVoice,ensureScratchModule}=await import('/src/audio/voices.ts');
 const {MSEG_SHAPES}=await import('/src/music/mseg.ts');
 const {exportProject,importProject}=await import('/src/audio/project.ts');
 const {saveUserPreset,loadUserPresets}=await import('/src/music/instrumentPresets.ts');
 const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});
 let patch=defaultPatch();patch.tracks=[patch.tracks[0]];const t=patch.tracks[0];patch.instruments=patch.instruments.filter(i=>i.id===t.instrumentId);
 t.patterns=[{id:'p',name:'test',length:4,rate:1,steps:[{notes:[{n:0,vel:1,prob:1,len:4}]},{notes:[]},{notes:[]},{notes:[]}]}];t.freq=220;t.scale=[1];t.scaleOctDown=0;t.scaleOctUp=0;t.noteSteps=undefined;t.enabled=true;t.volume=.8;
 patch.scenes=[{id:'s',name:'test',slots:{[t.id]:{patternId:'p'}}}];patch.chain=[];patch.followChain=false;
 Object.assign(patch.instruments[0],{ampMseg:{seconds:.8,points:MSEG_SHAPES['две атаки']},waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.001,decay:.1,sustain:0,pitchDrop:1,vibratoDepth:0,unisonVoices:1,formants:[],filterEnvAmount:0});patch=normalizePatch(patch);
 const inst=patch.instruments[0],st={...patch.tracks[0],...inst};
 const {msegSegments,msegCurve,msegDuration,scheduleMseg,validMseg}=await import('/src/music/mseg.ts');
 const advanced={seconds:.8,points:[{t:0,v:0},{t:.25,v:1,curve:-3},{t:.5,v:.5,curve:2},{t:1,v:0,curve:-2}],sustainPoint:2,loop:{startPoint:1,repeats:2}};
 const segments=msegSegments(advanced,.8);check('held envelope has gate plus release',Math.abs(segments.reduce((s,x)=>s+x.duration,0)-1.2)<1e-9&&Math.abs(msegDuration(advanced,.8)-1.2)<1e-9);
 check('loop and release have continuous endpoints',segments.every((s,i)=>i===0||Math.abs(s.from-segments[i-1].to)<1e-9));
 const short=msegSegments(advanced,.08);check('short gate releases from current curved attack',short[1].from===short[0].to&&short[0].to>0&&short[0].to<1);
 check('curve directions and linear fallback',msegCurve(.5,0)===.5&&msegCurve(.5,-3)>.5&&msegCurve(.5,3)<.5);
 for(const bad of [{...advanced,sustainPoint:0},{...advanced,sustainPoint:3},{...advanced,loop:{startPoint:2,repeats:2}},{...advanced,loop:{startPoint:1,repeats:33}},{...advanced,sustainPoint:undefined},{...advanced,points:advanced.points.map((p,i)=>i===1?{...p,curve:5}:p)}])check('reject malformed advanced MSEG',!validMseg(bad));
 const max={seconds:16,points:Array.from({length:32},(_,i)=>({t:i/31,v:i===0||i===31?0:.5,curve:4})),sustainPoint:30,loop:{startPoint:0,repeats:32}};
 check('schedule size bounded independently of note duration',msegSegments(max,10000).length<=2015);
 const advancedPatch=structuredClone(patch);advancedPatch.instruments[0].ampMseg=advanced;
 check('advanced JSON preserves fields',JSON.stringify(normalizePatch(advancedPatch).instruments[0].ampMseg)===JSON.stringify(advanced));
 const {exportInstrument,prepareInstrument}=await import('/src/audio/instrumentFile.ts');
 // Construct a genuine flat snapshot (ids must not leak into layer sound).
 const {voiceSnapshot}=await import('/src/music/layers.ts');
 const portable=await prepareInstrument(await exportInstrument({name:'held envelope',category:'мои',track:{...st,ampMseg:advanced,layers:[{id:'held-layer',name:'held layer',gain:.5,ratio:1.5,sound:voiceSnapshot({...inst,ampMseg:advanced})}]}}));
 check('advanced instrument file preserves main and layer envelope',JSON.stringify(portable.preset.track.ampMseg)===JSON.stringify(advanced)&&JSON.stringify(portable.preset.track.layers[0].sound.ampMseg)===JSON.stringify(advanced));
 for(const gate of [.08,.8]){
  const c=new OfflineAudioContext(1,44100*2,44100),src=c.createConstantSource(),gain=c.createGain();src.connect(gain);gain.connect(c.destination);scheduleMseg(gain.gain,advanced,.05,gate);src.start();src.stop(1.8);const pcm=(await c.startRendering()).getChannelData(0);
  check('curved sustain/loop renders finite PCM',pcm.every(Number.isFinite));check('release reaches silence',pcm.slice(Math.ceil((.05+msegDuration(advanced,gate)+.002)*44100)).every(v=>Math.abs(v)<1e-7));
  const edge=Math.round((.05+gate)*44100);check('note end has no amplitude jump',Math.abs(pcm[edge]-pcm[edge-1])<.01);
 }
 const scratchContext=new OfflineAudioContext(1,4410,44100);await ensureScratchModule(scratchContext);
 const scratchSample=scratchContext.createBuffer(1,4410,44100);scratchSample.getChannelData(0).fill(.6);
 const scratchNode=(await import('/src/audio/voices.ts')).makeScratchNode(scratchContext,scratchSample);scratchNode.connect(scratchContext.destination);
 const firstQuantum=(await scratchContext.startRendering()).getChannelData(0).slice(0,128);
 check('scratch sample is ready for the first offline quantum',firstQuantum.every(v=>Math.abs(v-.6)<1e-6));
 const bound=(await import('/src/audio/renderTail.ts')).voiceLifetimeBound({...st,ampMseg:advanced},[{n:0,vel:1,prob:1}],.125,.8);check('WAV allocation covers held release',bound>=msegDuration(advanced,.8));

 check('JSON retains MSEG',JSON.stringify(normalizePatch(JSON.parse(JSON.stringify(patch))).instruments[0].ampMseg)===JSON.stringify(inst.ampMseg));
 const zip=await exportProject(patch),opened=await importProject(zip);check('ZIP retains MSEG',JSON.stringify(opened.instruments[0].ampMseg)===JSON.stringify(inst.ampMseg));
 saveUserPreset('two attacks',st);check('preset retains MSEG',loadUserPresets().some(p=>p.track.ampMseg?.points.length===6));
 for(const bad of [{seconds:20,points:MSEG_SHAPES['удар']},{seconds:.5,points:[{t:0,v:0},{t:.5,v:1},{t:.4,v:.5},{t:1,v:0}]},{seconds:.5,points:[{t:0,v:1},{t:1,v:0}]}]){const p=structuredClone(patch);p.instruments[0].ampMseg=bad;check('reject malformed MSEG',!isPatch(p));}
 const rms=(a,from,to)=>Math.sqrt(a.slice(Math.floor(from*44100),Math.floor(to*44100)).reduce((s,v)=>s+v*v,0)/Math.max(1,Math.floor((to-from)*44100)));
 for(const mode of ['wave','tail','plain','grain','scratch']){
 const ctx=new OfflineAudioContext(1,44100*2,44100);if(mode==='scratch')await ensureScratchModule(ctx);
 const sample=ctx.createBuffer(1,44100*2,44100);sample.getChannelData(0).fill(.6);
 const hp=ctx.createGain();hp.connect(ctx.destination);
 const s={...st,waveform:['plain','grain','scratch'].includes(mode)?'sample':'wave',sampleMode:mode,sampleLoop:true,grainCount:32,grainSizeMs:100,grainScatter:0,scratchPoints:[{t:0,pos:0},{t:1,pos:.5}],wave:mode==='tail'?{partials:[{type:'sine',ratio:1,amp:1,decay:2}]}:st.wave};
 triggerVoice(ctx,{hp},sample,sample,s,[{n:0,vel:1,prob:1}],.05,.125,undefined,undefined,()=>.5);
 const a=(await ctx.startRendering()).getChannelData(0);
 check(mode+' second attack survives short classic decay',rms(a,.49,.55)>.003);
 check(mode+' internal pause is silent',rms(a,.34,.43)<1e-7);
 check(mode+' envelope closes ringing/grain tail',rms(a,.87,1.2)<1e-7);
 check(mode+' finite PCM',a.every(Number.isFinite));
 }
 for(const mode of ['wave','grain','scratch','tail']) {
  const c=new OfflineAudioContext(1,44100*2,44100);if(mode==='scratch')await ensureScratchModule(c);
  const sample=c.createBuffer(1,44100*2,44100);sample.getChannelData(0).fill(.6);const hp=c.createGain();hp.connect(c.destination);
  const sound={...st,ampMseg:advanced,waveform:['grain','scratch'].includes(mode)?'sample':'wave',sampleMode:mode,sampleLoop:true,grainCount:32,grainSizeMs:150,grainScatter:0,scratchPoints:[{t:0,pos:0},{t:1,pos:.5}],wave:mode==='tail'?{partials:[{type:'sine',ratio:1,amp:1,decay:2}]}:st.wave};
  const voice=triggerVoice(c,{hp},sample,sample,sound,[{n:0,vel:1,prob:1}],.05,.125,.8,undefined,()=>.5);
  const pcm=(await c.startRendering()).getChannelData(0);check(mode+' sustain release survives note end',rms(pcm,.87,.94)>.001);check(mode+' held release reaches silence',rms(pcm,1.3,1.6)<1e-7);check(mode+' lifetime includes release',voice.stopAt>=1.25);
 }
 localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-inst"]').first().click();await page.locator('[data-ob="tab-env"]').click();
 const level=page.getByRole('spinbutton',{name:'Уровень точки, %',exact:true});await level.fill('60');await level.press('Enter');await page.keyboard.press('Control+z');assert.equal(+await level.inputValue(),100);await page.keyboard.press('Control+Shift+z');assert.equal(+await level.inputValue(),60);
 await page.getByRole('button',{name:'+ точка',exact:true}).click();await page.getByRole('button',{name:'удалить',exact:true}).click();
 const readEnvelope=()=>page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();return JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].ampMseg;});
 await page.getByLabel('Точка удержания MSEG',{exact:true}).selectOption('2');await page.getByLabel('Цикл MSEG туда-обратно',{exact:true}).check();
 await page.getByLabel('Точка огибающей',{exact:true}).selectOption({value:'1'});
 const curve=page.locator('[data-help="mseg-curve"] [role="slider"], [data-help="mseg-curve"][role="slider"]').first();await curve.dblclick();const curveInput=page.locator('[data-help="mseg-curve"] input').first();await curveInput.fill('-75');await curveInput.press('Enter');assert.equal((await readEnvelope()).points[1].curve,-3);await page.keyboard.press('Control+z');assert.ok(!(await readEnvelope()).points[1].curve);await page.keyboard.press('Control+Shift+z');
 const graph=page.locator('.mseg-graph');const box=await graph.boundingBox();await graph.dblclick({position:{x:box.width*.2,y:60}});assert.equal((await readEnvelope()).sustainPoint,3);await page.getByRole('button',{name:'удалить',exact:true}).click();assert.equal((await readEnvelope()).sustainPoint,2);
 await page.getByLabel('Повторы MSEG',{exact:true}).fill('4');await page.getByLabel('Повторы MSEG',{exact:true}).press('Enter');assert.equal((await readEnvelope()).loop.repeats,4);
 const coverage=await page.evaluate(async()=>(await import('/src/onboarding/helpResolver.ts')).helpCoverage());assert.deepEqual(coverage.missing,[]);
 await page.locator('[data-ob="library-btn"]').click();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:900});await page.locator('[data-ob="mseg"]').scrollIntoViewIfNeeded();const bounds=await page.locator('[data-ob="mseg"]').boundingBox();assert.ok(bounds.height<360&&bounds.x+bounds.width<=width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/mseg-${width}.png`});console.log('PASS MSEG compact layout '+width);}
 const withHold=await readEnvelope();await page.getByLabel('Точка огибающей',{exact:true}).selectOption({value:'2'});await page.getByRole('button',{name:'удалить',exact:true}).click();assert.equal((await readEnvelope()).sustainPoint,undefined);assert.equal((await readEnvelope()).loop,undefined);await page.keyboard.press('Control+z');assert.deepEqual(await readEnvelope(),withHold);
 await page.keyboard.press('F1');await page.locator('[data-ob="mseg"]').click();await page.locator('.ph-card').filter({hasText:'огибающая по точкам'}).waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.deepEqual(errors,[]);console.log('PASS UI fields undo and help');
}finally{await browser?.close();vite.kill();}
