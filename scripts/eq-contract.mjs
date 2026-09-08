import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5194;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/eq-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/eq-contract.html`);


 const result=await page.evaluate(async()=>{
 const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch,isPatch}=await import('/src/types.ts');
 const {makeEq}=await import('/src/audio/equalizer.ts');const {makeChain}=await import('/src/audio/fx.ts');
 const {newEqBand}=await import('/src/music/equalizer.ts');const {exportInstrument,prepareInstrument}=await import('/src/audio/instrumentFile.ts');
 const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
 const patch=defaultPatch(),t=patch.tracks[0],inst=patch.instruments.find(i=>i.id===t.instrumentId);
 const band={...newEqBand(),gain:6};t.effects=[{id:'eq-test',type:'eq',bands:[band],mix:1}];
 const ctx=new OfflineAudioContext(1,48000,48000),nodes=makeEq(ctx,[band]),f=new Float32Array([1000]),mag=new Float32Array(1),phase=new Float32Array(1);nodes[0].getFrequencyResponse(f,mag,phase);check('bell has +6 dB at centre',Math.abs(20*Math.log10(mag[0])-6)<.001,mag[0]);
 const render=async(effect)=>{const c=new OfflineAudioContext(1,24000,48000),st={...t,...inst,effects:[effect],mods:[],volume:1,pan:.5,filterFreq:20000,filterHighpass:20},chain=makeChain(c,st,c.destination);const osc=c.createOscillator();osc.frequency.value=1000;osc.connect(chain.hp);osc.start();osc.stop(.5);return (await c.startRendering()).getChannelData(0);};
 const rms=a=>Math.sqrt(a.slice(12000,20000).reduce((sum,v)=>sum+v*v,0)/8000);
 const eq=t.effects[0],flat=await render({...eq,bands:[]}),boost=await render(eq),bypass=await render({...eq,bypass:true}),mix=await render({...eq,bands:[],mix:.5});
 check('real PCM EQ gain',Math.abs(rms(boost)/rms(flat)-10**(.3))<.01);check('bypass restores dry',Math.abs(rms(bypass)/rms(flat)-1)<.001);check('flat mixed EQ has unity gain',Math.abs(rms(mix)/rms(flat)-1)<.001);
 check('patch roundtrip retains EQ',JSON.stringify(normalizePatch(patch).tracks[0].effects)===JSON.stringify(normalizePatch(JSON.parse(JSON.stringify(patch))).tracks[0].effects));
 const bad=structuredClone(patch);bad.tracks[0].effects[0].bands=Array(7).fill(band);check('excess bands rejected',!isPatch(bad));

 const {triggerVoice}=await import('/src/audio/voices.ts');const {voiceSnapshot}=await import('/src/music/layers.ts');const {voiceLifetimeBound}=await import('/src/audio/renderTail.ts');
 const source={...t,...inst,waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},freq:1000,scale:[1],scaleOctUp:0,scaleOctDown:0,attack:.001,decay:.1,sustain:.8,pitchDrop:1,vibratoDepth:0,unisonVoices:1,formants:[],filterEnvAmount:0};
 const renderVoice=async(st,vel=1)=>{const c=new OfflineAudioContext(1,48000,48000),hp=c.createGain();hp.connect(c.destination);const voice=triggerVoice(c,{hp},c.createBuffer(1,48000,48000),null,st,[{n:0,vel,prob:1,len:1}],0,.1);return {a:(await c.startRendering()).getChannelData(0),voice};};
 const original=await renderVoice(source),local=await renderVoice({...source,voiceEffects:[eq]}),outside=await renderVoice({...source,voiceRange:{minHz:20,maxHz:500,minVelocity:0,maxVelocity:1}}),weak=await renderVoice({...source,voiceRange:{minHz:20,maxHz:20000,minVelocity:.7,maxVelocity:1}},.5);
 const energy=a=>a.reduce((sum,v)=>sum+v*v,0);
 check('voice-local EQ changes PCM',energy(local.a)>energy(original.a)*3);check('frequency and velocity splits silence excluded notes',outside.voice.sources.length===0&&weak.voice.sources.length===0);
 const delayFx={id:'local-delay',type:'delay',timeSec:.1,feedback:.2,mix:1};const echoed=await renderVoice({...source,voiceEffects:[delayFx]});check('local echo retains release tail',energy(echoed.a.slice(12000))>1e-6&&echoed.voice.stopAt>original.voice.stopAt+.1);
 check('WAV bound covers local FX',voiceLifetimeBound({...source,voiceEffects:[delayFx]},[{n:0,vel:1,prob:1,len:1}],.1)>=echoed.voice.stopAt);
 inst.voiceEffects=[eq];inst.voiceRange={minHz:20,maxHz:20000,minVelocity:0,maxVelocity:1};inst.layers=[{id:'filtered',name:'слой EQ',gain:.5,ratio:1,sound:voiceSnapshot({...inst,id:'local',voiceEffects:[delayFx]})}];
 const file=await exportInstrument({id:'eq',name:'EQ test',category:'мои',track:{...t,...inst}});const imported=await prepareInstrument(file);check('portable EQ bands preserved',imported.preset.track.effects[0].bands[0].gain===6);check('portable layer FX and ranges preserved',imported.preset.track.voiceRange.maxHz===20000&&imported.preset.track.layers[0].sound.voiceEffects[0].type==='delay');
 localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="mode-track"]').first().click();
 await page.getByRole('button',{name:'Добавить полосу EQ'}).click();await page.getByLabel('Форма полосы').selectOption('highpass');
 await page.keyboard.press('Control+z');assert.equal(await page.getByLabel('Форма полосы').inputValue(),'peaking');
 await page.getByLabel('Обход эквалайзера').click();assert.equal(await page.getByLabel('Обход эквалайзера').getAttribute('aria-pressed'),'true');
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.locator('.eq-editor').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/eq-${width}.png`});}
 await page.keyboard.press('F1');await page.getByLabel('Форма полосы').click();await page.getByText('Форма полосы',{exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('PASS EQ UI bands, undo, bypass, help and desktop layout');
}finally{await browser?.close();vite.kill();}
