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
 localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-inst"]').first().click();await page.locator('[data-ob="tab-env"]').click();
 const level=page.getByRole('spinbutton',{name:'Уровень точки, %',exact:true});await level.fill('60');await level.press('Enter');await page.keyboard.press('Control+z');assert.equal(+await level.inputValue(),100);await page.keyboard.press('Control+Shift+z');assert.equal(+await level.inputValue(),60);
 await page.getByRole('button',{name:'+ точка',exact:true}).click();await page.getByRole('button',{name:'удалить',exact:true}).click();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:900});await page.locator('[data-ob="mseg"]').scrollIntoViewIfNeeded();const bounds=await page.locator('[data-ob="mseg"]').boundingBox();assert.ok(bounds.height<260&&bounds.x+bounds.width<=width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/mseg-${width}.png`});console.log('PASS MSEG compact layout '+width);}
 await page.keyboard.press('F1');await page.locator('[data-ob="mseg"]').click();await page.locator('.ph-card').filter({hasText:'огибающая по точкам'}).waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.deepEqual(errors,[]);console.log('PASS UI fields undo and help');
}finally{await browser?.close();vite.kill();}
