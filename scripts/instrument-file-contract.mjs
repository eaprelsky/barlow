// Regression tests assert musical invariants against actual offline PCM.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 5196;
mkdirSync(root + '/tmp', { recursive: true });
writeFileSync(root + '/tmp/audio-contract.html', '<!doctype html><meta charset="utf-8"><title>Audio contract fixture</title>');
const vite = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (vite.exitCode !== null) throw new Error('Vite exited before readiness');
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ready) throw new Error('Vite readiness timeout');
  browser = await chromium.launch({ executablePath: process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/tmp/audio-contract.html`);
  const result = await page.evaluate(async (compatibilityFixture) => {
    const {exportInstrument,prepareInstrument,installInstrument}=await import('/src/audio/instrumentFile.ts');
    const {INSTRUMENT_PRESETS,loadUserPresets,presetFields}=await import('/src/music/instrumentPresets.ts');
    const {soundForAudition}=await import('/src/music/audition.ts');
    const {defaultPatch}=await import('/src/music/defaultPatch.ts');
    const {instrumentOfFields}=await import('/src/types.ts');
    const {voiceSnapshot}=await import('/src/music/layers.ts');
    const {makeChain}=await import('/src/audio/fx.ts');
    const {triggerVoice}=await import('/src/audio/voices.ts');
    const {putSample,listSamples,deleteSample,getSampleBlob}=await import('/src/audio/library.ts');
    const {audioBufferToWav}=await import('/src/audio/wav.ts');
    const {unzipSync,zipSync,strFromU8,strToU8}=await import('/node_modules/fflate/esm/browser.js');
    const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
    const compatible=await prepareInstrument(new Blob([zipSync({'instrument.json':strToU8(JSON.stringify(compatibilityFixture))})]));
    check('read released v1 schema 53 fixture',compatible.preset.track.recommendedHz===55);
    const target=defaultPatch().tracks[0];
    async function render(preset,buffer=null) {
      const ctx=new OfflineAudioContext(1,88200,44100),st=soundForAudition(target,preset);
      let seed=77;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
      const noise=ctx.createBuffer(1,44100,44100);for(let i=0;i<44100;i++)noise.getChannelData(0)[i]=random()*2-1;
      const old=Math.random;Math.random=random;
      try { const chain=makeChain(ctx,st,ctx.destination,120,77);triggerVoice(ctx,chain,noise,buffer,st,[{n:0,vel:.8,prob:1}],.02,.125); }
      finally{Math.random=old;}
      return (await ctx.startRendering()).getChannelData(0);
    }
    for(const name of ['саб без атаки','воббл-бас','флейта','космос: дрейфующая орбита','нейро: короткий рык','перегруженная струна: квинта']) {
      const original=INSTRUMENT_PRESETS.find(p=>p.name===name),blob=await exportInstrument(original),ready=await prepareInstrument(blob);
      const a=await render(original),b=await render(ready.preset);
      const again=await render(original);let drift=0,repeatDrift=0;for(let i=0;i<a.length;i++){drift=Math.max(drift,Math.abs(a[i]-b[i]));repeatDrift=Math.max(repeatDrift,Math.abs(a[i]-again[i]));}
      const x=soundForAudition(target,original),y=soundForAudition(target,ready.preset);
      // Chromium's repeated unison/filter renders differ by about 5e-5 even without export.
      // Bound numerical output error to 1e-4 full scale and compare sound settings exactly.
      check('sound settings '+name,Object.keys({...x,...y}).filter(k=>k!=='rate').every(k=>JSON.stringify(x[k])===JSON.stringify(y[k])));
      check('PCM roundtrip '+name,drift<1e-4,{drift,repeatDrift,differences:Object.keys({...x,...y}).filter(k=>JSON.stringify(x[k])!==JSON.stringify(y[k])).map(k=>[k,x[k],y[k]])});
      check('frequency and effects '+name,ready.preset.track.recommendedHz===original.track.recommendedHz&&JSON.stringify(ready.preset.track.effects??[])===JSON.stringify(original.track.effects??[]));
    }
    const ctx=new OfflineAudioContext(1,4410,44100),buffer=ctx.createBuffer(1,4410,44100);
    for(let i=0;i<4410;i++)buffer.getChannelData(0)[i]=Math.sin(i*2*Math.PI*220/44100)*.2;
    const meta=await putSample(new Blob([audioBufferToWav(buffer)],{type:'audio/wav'}),'переносимая запись');
    const sample={name:'архивный сэмплер',category:'мои',track:{waveform:'sample',sampleId:meta.id,rootHz:220,keyTracking:true,freq:220,recommendedHz:220,attack:.01,decay:.2}};
    const originalBuffer=await ctx.decodeAudioData(await (await getSampleBlob(meta.id)).arrayBuffer());
    const sampled=await exportInstrument(sample);await deleteSample(meta.id);
    const staged=await prepareInstrument(sampled);check('prepare has no writes',!(await getSampleBlob(meta.id)));
    const installed=await installInstrument(staged);const duplicate=await installInstrument(staged);
    check('assets restored and deduplicated',!!await getSampleBlob(meta.id)&&(await listSamples()).filter(s=>s.id===meta.id).length===1);
    check('collision preserves both presets',installed!==duplicate&&loadUserPresets().filter(p=>[installed,duplicate].includes(p.name)).length===2);
    const restoredBuffer=await ctx.decodeAudioData(await (await getSampleBlob(meta.id)).arrayBuffer());
    const before=await render(sample,originalBuffer),after=await render(loadUserPresets().find(p=>p.name===installed),restoredBuffer);
    check('sample PCM roundtrip',before.every((v,i)=>Math.abs(v-after[i])<1e-6));
    const composite={name:'слои и зоны',category:'мои',track:{...sample.track,
      sampleZones:[{id:'zone',sampleId:meta.id,rootHz:220,lowHz:20,highHz:24000,lowVelocity:0,highVelocity:1,alternates:[{sampleId:meta.id,rootHz:220}]}],
      layers:[{id:'layer',name:'слой',gain:.5,ratio:1.5,sound:voiceSnapshot(instrumentOfFields(sample.track,'layer-source','слой'))}]}};
    const compositeFile=await exportInstrument(composite),compositeReady=await prepareInstrument(compositeFile);
    check('zones alternates layers share one asset',compositeReady.samples.length===1&&compositeReady.preset.track.layers?.length===1&&compositeReady.preset.track.sampleZones?.[0].alternates?.length===1);
    const unpacked=unzipSync(new Uint8Array(await sampled.arrayBuffer()));
    const manifest=JSON.parse(strFromU8(unpacked['instrument.json']));
    for(const [label,mutate] of [
      ['future version',m=>m.version=999],['unknown sound field',m=>m.sound.unimplementedOscillator=true],
      ['invalid frequency',m=>m.sound.recommendedHz=-1],['missing asset',m=>m.samples=[]],
    ]) {
      const changed=structuredClone(manifest);mutate(changed);
      let rejected=false;try{await prepareInstrument(new Blob([zipSync({...unpacked,'instrument.json':strToU8(JSON.stringify(changed))})]));}catch{rejected=true;}
      check('reject '+label,rejected);
    }
    const corrupt={...unpacked,[`samples/${meta.id}`]:new Uint8Array([1,2,3])};
    let rejected=false;try{await prepareInstrument(new Blob([zipSync(corrupt)]));}catch{rejected=true;}check('reject hash mismatch',rejected);
    const standalone=INSTRUMENT_PRESETS.find(p=>p.name==='саб без атаки');const ready=await prepareInstrument(await exportInstrument(standalone));
    const current=localStorage.getItem('barlow.instruments.v1'),oldSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='barlow.instruments.v1')throw new DOMException('quota','QuotaExceededError');return oldSet.call(this,key,value);};
    let failed=false;try{await installInstrument(ready);}catch{failed=true;}finally{Storage.prototype.setItem=oldSet;}
    check('storage failure does not publish a preset',failed&&localStorage.getItem('barlow.instruments.v1')===current);
    return checks;
  }, JSON.parse(readFileSync(root+'/fixtures/instrument-v1.json','utf8')));
  writeFileSync(root+'/tmp/instrument-file-qa.json',JSON.stringify(result,null,2));
  for(const r of result)console.log(`${r.pass?'PASS':'FAIL'} ${r.name} ${JSON.stringify(r.details??'')}`);
  if(result.some(r=>!r.pass))process.exitCode=1;
} finally {await browser?.close();vite.kill();}
