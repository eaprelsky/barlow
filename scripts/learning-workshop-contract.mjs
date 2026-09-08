import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5196;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/learning-contract.html','<!doctype html><title>Learning workshop contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/learning-contract.html`);
 const result=await page.evaluate(async()=>{
  const {learningProject,beginLearning,returnFromLearning,finishLearningReturn,resumeLearning}=await import('/src/music/learning.ts');
  const {isPatch,normalizePatch}=await import('/src/types.ts');
  const {analyzeTimbre,estimateRoot}=await import('/src/audio/timbreAnalysis.ts');
  const {readTableWav,importTable}=await import('/src/music/wavetableImport.ts');
  const {audioBufferToWav}=await import('/src/audio/wav.ts');
  const {checkedSound,exportInstrument,prepareInstrument}=await import('/src/audio/instrumentFile.ts');
  const {validVA}=await import('/src/music/wavetable.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  const p=learningProject(),lab=learningProject(true);check('learning patches valid',isPatch(p)&&isPatch(lab));check('normalization retains VA and wavetable without FM operators',!!lab.instruments[0].wave.va&&!!p.instruments[4].wave.wavetable);
  check('IDM miniature is 128 seconds with eight distinct scenes',p.chain.reduce((s,c)=>s+c.bars*4*60/(c.bpm??p.bpm),0)===128&&p.scenes.length===8);
  const original=structuredClone(lab);original.title='USER WORK';beginLearning(original,false);const again=beginLearning(p,true);check('second lesson cannot overwrite original',returnFromLearning(again).title==='USER WORK');finishLearningReturn();check('resume preserves latest learning work',resumeLearning(original).title===again.title);
  check('invalid VA rejected',!validVA({shape:'pulse',pulseWidth:.5,pwmDepth:1}));
  const b=new AudioBuffer({length:2048*4,sampleRate:44100,numberOfChannels:1}),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=.6*Math.sin(2*Math.PI*i/2048)+.1*Math.sin(2*Math.PI*100*i/2048);
  const bytes=await audioBufferToWav(b).arrayBuffer(),samples=readTableWav(bytes),frames=importTable(samples,2048,4);
  check('WAV cycle boundaries preserved at original sample rate',samples.length===8192);
  check('out of band harmonics removed during table import',Math.max(...frames[0].map((v,n)=>Math.abs(v-Math.sin(2*Math.PI*n/128))))<.001);
  let bad=false;try{importTable(samples,4096,9);}catch{bad=true;}check('unsupported table dimensions rejected',bad);
  const rate=24000,sine=Float32Array.from({length:rate},(_,n)=>(.5*Math.sin(2*Math.PI*220*n/rate)+.2*Math.sin(2*Math.PI*440*n/rate))*Math.sin(Math.PI*n/rate));
  const pitch=estimateRoot(sine,rate),sound=analyzeTimbre(sine,rate,220);check('pitch estimate close to 220 Hz',Math.abs(pitch.hz-220)<3,pitch);
  checkedSound(sound,'model');const preset={name:'model',category:'test',track:sound},prepared=await prepareInstrument(new File([await exportInstrument(preset)],'model.zip'));check('model portable roundtrip',prepared.preset.track.wave.wavetable.frames.length===8);
  const {triggerVoice}=await import('/src/audio/voices.ts');
  const render=async(va)=>{const c=new OfflineAudioContext(1,24000,24000),hp=c.createGain();hp.gain.value=.2;hp.connect(c.destination);const st={...lab.tracks[0],...lab.instruments[0],freq:220,wave:{partials:[],va},sustain:.7,decay:.2};triggerVoice(c,{hp},c.createBuffer(1,24000,24000),null,st,[{n:0,vel:.8,prob:1,len:4}],0,.125);return (await c.startRendering()).getChannelData(0);};
  const a=await render({shape:'pulse',pulseWidth:.5}),v=await render({shape:'pulse',pulseWidth:.5,pwmDepth:.25,pwmRateHz:3,driftCents:2});check('PWM drift real PCM finite and changed',v.every(Number.isFinite)&&v.some((x,i)=>Math.abs(x-a[i])>.001),{maxA:Math.max(...a.map(Math.abs)),maxV:Math.max(...v.map(Math.abs)),delta:Math.max(...v.map((x,i)=>Math.abs(x-a[i]))),nan:v.filter(x=>!Number.isFinite(x)).length});
  check('v58 survives normalized JSON',isPatch(normalizePatch(JSON.parse(JSON.stringify(p)))));
  return {checks,wav:Array.from(new Uint8Array(bytes))};
 });
 for(const c of result.checks){console.log(c);assert.ok(c.pass,c.name);}
 // Mock the provider boundary; no paid request or personal recording.
 await page.route('https://queue.fal.run/**',async route=>{const url=route.request().url();await route.fulfill({json:url.endsWith('/status')?{status:'COMPLETED'}:url.endsWith('/response')?{bass:{url:'https://test.fal.media/bass.wav'}}:{status_url:'https://queue.fal.run/test/status',response_url:'https://queue.fal.run/test/response',cancel_url:'https://queue.fal.run/test/cancel'}});});
 await page.route('https://test.fal.media/**',route=>route.fulfill({contentType:'audio/wav',body:Buffer.from(result.wav)}));
 const separated=await page.evaluate(async bytes=>{const {separateFragment}=await import('/src/ai/separation.ts');const r=await separateFragment(new Blob([new Uint8Array(bytes)]),'test-key',new AbortController().signal,()=>{});return r.bass?.size;},result.wav);assert.equal(separated,result.wav.length);console.log('Mock Demucs queue and stem download PASS');
 await page.goto(`http://127.0.0.1:${port}`);await page.evaluate(()=>{localStorage.removeItem('barlow.onboarding');});
 await page.getByRole('menuitem',{name:'Справка',exact:true}).click();await page.getByRole('menuitem',{name:'Учебная студия…',exact:true}).click();
 await page.getByRole('button',{name:'Новая учебная копия',exact:true}).click();
 for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/learning-${width}.png`});assert.ok(await page.locator('.learning-studio').evaluate(e=>e.scrollWidth<=e.clientWidth+2));}
 await page.getByRole('button',{name:'К практике',exact:true}).click();
 await page.getByRole('menuitem',{name:'Файл',exact:true}).click();await page.getByRole('menuitem',{name:'Мастерская звука…',exact:true}).click();
 await page.locator('.sound-workshop input[type=file]').setInputFiles({name:'cycles.wav',mimeType:'audio/wav',buffer:Buffer.from(result.wav)});
 await page.getByRole('button',{name:'Сэмплер в библиотеку',exact:true}).waitFor();await page.getByRole('button',{name:'Сэмплер в библиотеку',exact:true}).click();await page.getByRole('status').filter({hasText:'В библиотеке:'}).waitFor();
 await page.getByText('Восстановить тембр · приближённо',{exact:true}).click();await page.getByRole('button',{name:'Построить модель',exact:true}).click();await page.getByRole('button',{name:'Модель в библиотеку',exact:true}).waitFor();
 await page.getByRole('status').filter({hasText:'Гармоническая модель готова'}).waitFor();
 for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/workshop-${width}.png`});assert.ok(await page.locator('.sound-workshop').evaluate(e=>e.scrollWidth<=e.clientWidth+2));}
 assert.deepEqual(errors,[]);console.log('Learning / workshop / synthesis PASS');
}finally{await browser?.close();vite.kill();}
