import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5176;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/synthesis-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/synthesis-contract.html`);


 const result=await page.evaluate(async()=>{
 const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch,isPatch}=await import('/src/types.ts');const {triggerVoice,duckVoice}=await import('/src/audio/voices.ts');
 const {tableFrame,tableRecipe}=await import('/src/music/wavetable.ts');const {estimateVoiceNodes}=await import('/src/audio/voiceBudget.ts');const {voiceLifetimeBound}=await import('/src/audio/renderTail.ts');
 const {exportProject,importProject}=await import('/src/audio/project.ts');const {AudioEngine}=await import('/src/audio/engine.ts');
 const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
 let patch=defaultPatch();patch.tracks=[patch.tracks[0]];const t=patch.tracks[0];patch.instruments=patch.instruments.filter(i=>i.id===t.instrumentId);Object.assign(t,{freq:440,scale:[1],scaleOctUp:0,scaleOctDown:0,enabled:true,volume:.8,noteSteps:undefined,effects:[],mods:[]});
 t.patterns=[{id:'p',name:'test',length:4,rate:1,steps:[{notes:[{n:0,vel:1,prob:1,len:4}]},{notes:[]},{notes:[]},{notes:[]}]}];patch.scenes=[{id:'s',name:'test',slots:{[t.id]:{patternId:'p'}}}];patch.chain=[];patch.followChain=false;
 Object.assign(patch.instruments[0],{waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.001,decay:1,sustain:.9,pitchDrop:1,filterEnvAmount:0,unisonVoices:1,vibratoDepth:0,formants:[]});patch=normalizePatch(patch);const st={...patch.tracks[0],...patch.instruments[0]};
 const tone=(a,hz,from=.2,to=.4)=>{let re=0,im=0;const start=Math.round(from*44100),end=Math.round(to*44100);for(let n=start;n<end;n++){const w=.5-.5*Math.cos(2*Math.PI*(n-start)/(end-start-1));re+=a[n]*w*Math.cos(2*Math.PI*hz*n/44100);im+=a[n]*w*Math.sin(2*Math.PI*hz*n/44100);}return Math.hypot(re,im)*4/(end-start);};
 const render=async(sound,duck=false)=>{const start=performance.now(),ctx=new OfflineAudioContext(1,Math.round(2.5*44100),44100),hp=ctx.createGain(),noise=ctx.createBuffer(1,88200,44100);hp.connect(ctx.destination);noise.getChannelData(0).fill(.2);
 const voice=triggerVoice(ctx,{hp},noise,null,sound,[{n:0,vel:.8,prob:1,len:4}],.05,.25,undefined,undefined,()=>.5);if(duck)duckVoice(voice,.2);const a=(await ctx.startRendering()).getChannelData(0);return {a,stop:voice.stopAt,ms:performance.now()-start,nodes:voice.sources.length};};
 const variants=[{wave:{...st.wave,wavetable:tableRecipe()}},{wave:{...st.wave,va:{shape:'pulse',pulseWidth:.17}}},{ringMix:1,ringRatio:1.37},{foldDrive:4,synthQuality:'4x'},{combMix:.8,combHz:98,combFeedback:.8},{wave:{...st.wave,wavetable:tableRecipe()},unisonVoices:3,ringMix:.2,foldDrive:1,combMix:.3,combHz:110}];
 for(const v of variants){const s={...st,...v},r=await render(s);check('new synthesis finite and audible',r.a.every(Number.isFinite)&&r.a.some(x=>Math.abs(x)>.001),{ms:r.ms,sources:r.nodes});check('voice lifetime bound covers resonator',r.stop<=.05+voiceLifetimeBound(s,[{n:0,vel:.8,prob:1,len:4}],.25)+1e-6,{stop:r.stop});const d=await render(s,true);check('Stop/choke closes new synthesis',d.a.slice(16000).every(x=>Math.abs(x)<1e-6));}
 const ring=await render({...st,ringMix:1,ringRatio:1.37});check('ring creates sum and difference sidebands',tone(ring.a,440*2.37)>.05&&tone(ring.a,440*.37)>.05&&tone(ring.a,440)<.001);
 const scan=await render({...st,wave:{...st.wave,wavetable:{frames:[tableFrame('sine'),tableFrame('pulse')],position:0,sweep:1}}});check('wavetable scan increases third harmonic within a note',tone(scan.a,1320,.75,.9)>tone(scan.a,1320,.1,.25)*2);
 const va=await render({...st,freq:7000,wave:{...st.wave,va:{shape:'saw',pulseWidth:.5}}});check('VA high register suppresses folded fourth harmonic',tone(va.a,16100)<tone(va.a,7000)*.015,{alias:tone(va.a,16100),fundamental:tone(va.a,7000)});
 const table=await render({...st,freq:7000,wave:{...st.wave,wavetable:{frames:[tableFrame('saw'),tableFrame('pulse')],position:0,sweep:0}}});check('wavetable high register suppresses folded fourth harmonic',tone(table.a,16100)<tone(table.a,7000)*.015);
 const q2=await render({...st,freq:7000,foldDrive:7,synthQuality:'2x'}),q4=await render({...st,freq:7000,foldDrive:7,synthQuality:'4x'});const alias=a=>[11200,2800,16800,1400,9800,19600].reduce((s,f)=>s+tone(a,f)**2,0);check('4x wavefold reduces measured alias bands versus 2x',alias(q4.a)<alias(q2.a),{two:alias(q2.a),four:alias(q4.a)});
 const expensive={...st,...variants[5]};check('budget includes all wavetable oscillators and color',estimateVoiceNodes(expensive,1)>estimateVoiceNodes(st,1)*2);
 patch.instruments[0]={...patch.instruments[0],...variants[0],ringMix:.2,foldDrive:1,combMix:.3,combHz:110};check('new fields survive ZIP',JSON.stringify((await importProject(await exportProject(patch))).instruments[0])===JSON.stringify(normalizePatch(patch).instruments[0]));
 for(const wave of [{...st.wave,wavetable:{frames:[[]],position:0,sweep:0}},{...st.wave,va:{shape:'pulse',pulseWidth:2}}]){const bad=structuredClone(patch);bad.instruments[0].wave=wave;check('malformed source rejected before I/O',!isPatch(bad));}
 const engine=new AudioEngine();try{const wav=await engine.renderToWav(patch,'s',1,{tail:'natural'});check('natural WAV accounts for comb decay',wav.size>10000);}finally{engine.stop();if(engine.ctx)await engine.ctx.close();}
 localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-inst"]').first().click();
 const position=page.getByRole('spinbutton',{name:'Позиция wavetable, %',exact:true});await position.fill('40');await position.press('Enter');await page.keyboard.press('Control+z');assert.equal(+await position.inputValue(),0);await page.keyboard.press('Control+Shift+z');assert.equal(+await position.inputValue(),40);
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.locator('[data-ob="wavetable"]').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/synthesis-${width}.png`});}
 await page.getByLabel('Способ синтеза',{exact:true}).selectOption('va');await page.getByLabel('Форма VA',{exact:true}).selectOption('pulse');await page.getByRole('spinbutton',{name:'Ширина импульса VA, %',exact:true}).fill('17');await page.keyboard.press('Enter');await page.locator('[data-ob="tab-timbre"]').click();await page.getByRole('spinbutton',{name:'Доля ring, %',exact:true}).fill('35');await page.keyboard.press('Enter');await page.screenshot({path:root+'/tmp/synthesis-color.png'});assert.deepEqual(errors,[]);console.log('PASS synthesis controls, undo and desktop layout');
}finally{await browser?.close();vite.kill();}
