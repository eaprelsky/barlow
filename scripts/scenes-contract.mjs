import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5177;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/scenes-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/scenes-contract.html`);


 const result=await page.evaluate(async()=>{
 const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch}=await import('/src/types.ts');const {AudioEngine}=await import('/src/audio/engine.ts');const {sceneEnvelopePoints}=await import('/src/audio/sceneEnvelope.ts');
 const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
 const overlap=sceneEnvelopePoints({start:0,end:1,fadeIn:2,fadeOut:3});check('overlapping fades shrink into ordered continuous triangle',overlap.every((p,i)=>!i||p.at>=overlap[i-1].at)&&Math.abs(overlap[1].at-.4)<1e-9);
 let patch=defaultPatch();patch.bpm=240;patch.performanceSeed=733;patch.masterVolume=.8;patch.masterComp=0;patch.masterNoise='off';patch.masterPan=.5;patch.tracks=[patch.tracks[0]];const t=patch.tracks[0];patch.instruments=patch.instruments.filter(i=>i.id===t.instrumentId);t.freq=220;t.scale=[1,1.37];t.scaleOctUp=0;t.scaleOctDown=0;t.enabled=true;t.volume=.6;t.pan=.5;t.mods=[];
 Object.assign(patch.instruments[0],{waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},attack:.002,decay:.3,sustain:.6,pitchDrop:1,filterEnvAmount:0,unisonVoices:1,vibratoDepth:0,formants:[]});
 const make=(id,n)=>({id,name:id,length:4,rate:2,fadeIn:.12,fadeOut:.17,volume:.7,steps:Array.from({length:4},(_,i)=>({notes:i%2===0?[{n,vel:.8,prob:1,len:2}]:[]})),automation:[{target:'volume',points:[{t:0,v:.3},{t:.5,v:.9},{t:1,v:.4}]}]});
 t.patterns=[make('a',0),make('b',1)];patch.scenes=[{id:'a',name:'a',slots:{[t.id]:{patternId:'a'}}},{id:'b',name:'b',slots:{[t.id]:{patternId:'b'}}}];patch.chain=[{sceneId:'a',bars:1},{sceneId:'b',bars:1,bpm:300},{sceneId:'a',bars:1}];patch.followChain=true;
 patch=normalizePatch(patch);
 for(const fx of [[],[{id:'echo',type:'delay',timeSec:.13,feedback:.45,mix:.6}],[{id:'chorus',type:'chorus',rate:2,mix:.4}],[{id:'room',type:'reverb',sizeSec:.2,mix:.5}]]){
 patch.tracks[0].effects=fx;
 const engine=new AudioEngine();const wav=await engine.renderToWav(patch,'a',1,{tail:'trim'});const data=new DataView(await wav.arrayBuffer()),frames=(data.byteLength-44)/4;
 const ctx=new OfflineAudioContext(2,Math.ceil(3.2*44100),44100);const origin = 0; let now=origin;Object.defineProperty(ctx,'currentTime',{get:()=>now});Object.defineProperty(ctx,'state',{get:()=> 'running'});
 engine.ctx=ctx;const {connectMaster}=await import('/src/audio/fx.ts');engine.master=connectMaster(ctx,.8,0);
 const noteTimes=[];engine.noteSink=(_id,at,notes)=>noteTimes.push({at,notes});engine.play(patch,'a');clearInterval(engine.timer);const seen=new Set();
 for(now=origin;now<origin+2.8-.125;now+=.025){for(const r of engine.retiring)r.dieAt=Infinity;engine.scheduler();for(const c of engine.chains.values())seen.add(c);}
 // End render matches a finite export, rather than beginning another live loop.
 for(const r of engine.retiring)r.dieAt=Infinity;
 const played=await ctx.startRendering(),a=played.getChannelData(0);let max=0,sum=0,count=0;
 for(let i=1000;i<frames-500;i++){const expected=data.getInt16(44+i*4,true)/32768,actual=a[i+Math.round(engine.startTime*44100)];const delta=Math.abs(actual-expected);max=Math.max(max,delta);sum+=delta*delta;count++;}
 check('actual live scheduler and WAV PCM agree across A/B/A, BPM and automation '+fx.length,max<3/32768,{max,rms:Math.sqrt(sum/count),graphs:seen.size, noteCount:noteTimes.length});check('each scene occurrence owns fresh FX graph '+fx.length,seen.size===3,seen.size);
 }
 return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}

