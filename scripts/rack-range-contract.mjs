import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
const port=5240;mkdirSync('tmp',{recursive:true});writeFileSync('tmp/rack-range-contract.html','<!doctype html><title>Rack/range</title>');
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
  for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
  browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/tmp/rack-range-contract.html`);
  const checks=await page.evaluate(async()=>{
    const {defaultPatch}=await import('/src/music/defaultPatch.ts');
    const {normalizePatch,isPatch}=await import('/src/types.ts');
    const {addRack,appendPad,rackPads,expandDrumRacks,updatePadInstrument,setRackHitHz,padTrack}=await import('/src/music/drumRack.ts');
    const {planRender}=await import('/src/audio/renderPlan.ts');
    const {AudioEngine}=await import('/src/audio/engine.ts');
    const {connectMaster}=await import('/src/audio/fx.ts');
    const {exportProject,importProject}=await import('/src/audio/project.ts');
    const {exportDrumRack,readDrumRack}=await import('/src/audio/drumRackFile.ts');
    const {mergeSceneIntoRack,mergeRackIssue}=await import('/src/music/mergeDrumRack.ts');
    const checks=[],check=(name,ok,details)=>checks.push({name,ok:!!ok,details});
    let p=defaultPatch();p.tracks=[];p.instruments=[];p.scenes=[{id:'scene',name:'scene',slots:{}}];p.chain=[{sceneId:'scene',bars:1}];p.followChain=false;p.bpm=240;p.masterVolume=.2;p.masterComp=0;p.masterNoise='off';p.performanceSeed=55;
    const preset={name:'kick',category:'',track:{waveform:'wave',freq:110,wave:{partials:[{type:'sine',ratio:1,amp:1}]},decay:.08,attack:.001,filterFreq:12000}};
    p=addRack(p,'kit',[preset,{...preset,name:'hat',track:{...preset.track,freq:440}}]);
    const t=p.tracks[0],pads=rackPads(t),pattern=t.patterns[0];pattern.rate=1;pattern.fadeIn=0;pattern.fadeOut=0;
    pattern.steps[0].notes=pads.map(p=>({padId:p.id,n:0,vel:.5,prob:1,len:1}));
    check('valid v59 rack',isPatch(p));
    const pitched=setRackHitHz(p,t.id,pattern.id,pads[0].id,0,165.5);
    const {stepFreqs}=await import('/src/types.ts');
    const pitchTrack=pitched.tracks[0];
    const frequencies=pads.map(pad=>{const leaf=padTrack(pitchTrack,pad);return stepFreqs(leaf,leaf.patterns[0].steps[0])[0];});
    check('single hit Hz changes pitch without retuning neighbouring pads',Math.abs(frequencies[0]-165.5)<.00001&&frequencies[1]===440,frequencies);
    check('hit pitch survives normalization',Math.abs(stepFreqs(padTrack(normalizePatch(pitched).tracks[0],pads[0]),normalizePatch(pitched).tracks[0].patterns[0].steps[0])[0]-165.5)<.00001);
    const normalized=normalizePatch(p);check('pad IDs and independent destinations survive normalize',normalized.tracks[0].patterns[0].steps[0].notes.map(n=>n.padId).join()===pads.map(p=>p.id).join());
    const expanded=expandDrumRacks(p),plan=planRender(p,'scene',1,{tail:'trim'});
    check('two leaf voices and one shared bus',expanded.tracks.length===3&&plan.parts.length===3&&plan.events.length===2,plan.parts.map(p=>p.track.name));
    check('simultaneous pads are not chord-normalized',plan.events.every(e=>e.notes.length===1&&(e.gain??1)===1));
    for(const mode of ['padMute','padSolo','rackMute','rackSolo']){
      let changed=structuredClone(p);
      if(mode==='padMute')changed.tracks[0].device.pads[0].muted=true;
      if(mode==='padSolo')changed.tracks[0].device.pads[1].solo=true;
      if(mode==='rackMute')changed.scenes[0].slots[t.id].muted=true;
      if(mode==='rackSolo')changed.scenes[0].soloTrackId=t.id;
      check(`${mode} render routing`,planRender(changed,'scene',1,{tail:'trim'}).events.length===(mode==='rackMute'?0:mode==='rackSolo'?2:1));
      const testCtx=new OfflineAudioContext(2,44100,44100);let clock=0;Object.defineProperty(testCtx,'currentTime',{get:()=>clock});Object.defineProperty(testCtx,'state',{get:()=> 'running'});
      const testEngine=new AudioEngine();testEngine.ctx=testCtx;testEngine.master=connectMaster(testCtx,.2,0);testEngine.play(p,'scene');clearInterval(testEngine.timer);
      clock=.2;testEngine.setPatch(changed);testEngine.scheduler();
      check(`${mode} live routing`,testEngine.chains.size===(mode==='rackMute'?0:mode==='rackSolo'?3:2),[...testEngine.chains.keys()]);testEngine.stop();
    }
    const reordered=structuredClone(p);reordered.tracks[0].device.pads.reverse();check('pad reorder does not retarget music',planRender(reordered,'scene',1,{tail:'trim'}).events.map(e=>e.notes[0].padId).sort().join()===pads.map(p=>p.id).sort().join());
    const choked=structuredClone(p);choked.tracks[0].device.pads.forEach((p,i)=>{p.chokeGroup=1;p.chokePriority=i;});
    check('same-time local choke selects winning pad',planRender(choked,'scene',1,{tail:'trim'}).events.length===1&&planRender(choked,'scene',1,{tail:'trim'}).events[0].notes[0].padId===pads[1].id);
    const missing=structuredClone(p);missing.tracks[0].device.pads.splice(0,1);check('removed pad goes silent without retargeting',planRender(missing,'scene',1,{tail:'trim'}).events.length===1);
    const shared=structuredClone(p);shared.tracks[0].device.pads[1].instrumentId=pads[0].instrumentId;
    const isolated=updatePadInstrument(shared,t.id,pads[0].id,{decay:1});check('editing a shared pad uses copy-on-write',isolated.tracks[0].device.pads[0].instrumentId!==isolated.tracks[0].device.pads[1].instrumentId&&isolated.instruments.find(i=>i.id===pads[0].instrumentId).decay===.08);
    const zip=await exportProject(p),loaded=await importProject(new File([zip],'project.zip'));check('project ZIP retains rack and music',isPatch(loaded)&&loaded.tracks[0].patterns[0].steps[0].notes.length===2);
    const kit=await readDrumRack(new File([await exportDrumRack(p,t)],'kit.barlow-rack.zip'));check('kit transfer gives fresh IDs and empty music',kit.track.id!==t.id&&kit.track.device.pads.length===2&&kit.track.patterns[0].steps.every(s=>!s.notes.length));
    const wavEngine=new AudioEngine();const wav=await wavEngine.renderToWav(p,'scene',1,{tail:'trim'});const data=new DataView(await wav.arrayBuffer());
    const roundtrip=new Uint8Array(await (await wavEngine.renderToWav(normalizePatch(p),'scene',1,{tail:'trim'})).arrayBuffer()),original=new Uint8Array(await wav.arrayBuffer());
    check('save/reload normalization preserves rack PCM',roundtrip.length===original.length&&roundtrip.every((v,i)=>v===original[i]));
    const ctx=new OfflineAudioContext(2,44100*2,44100);let now=0;Object.defineProperty(ctx,'currentTime',{get:()=>now});Object.defineProperty(ctx,'state',{get:()=> 'running'});
    const live=new AudioEngine();live.ctx=ctx;live.master=connectMaster(ctx,p.masterVolume,0);live.play(p,'scene');clearInterval(live.timer);
    for(now=0;now<.9;now+=.025)live.scheduler();
    const rendered=await ctx.startRendering(),pcm=rendered.getChannelData(0);let max=0,peak=0;
    for(let i=100;i<30000;i++){const actual=pcm[i+Math.round(live.startTime*44100)],expected=data.getInt16(44+i*4,true)/32768;max=Math.max(max,Math.abs(actual-expected));peak=Math.max(peak,Math.abs(actual));}
    check('rack live and WAV PCM match',max<4/32768&&peak>.001,{max,peak});
    const sources=structuredClone(expanded);sources.tracks=sources.tracks.filter(t=>t.rackParentId).map(t=>({...t,rackParentId:undefined,rackPadId:undefined,patterns:t.patterns.map(p=>({...p,steps:p.steps.map(s=>({notes:s.notes.map(({padId,...n})=>n)}))}))}));
    sources.scenes[0].slots=Object.fromEntries(sources.tracks.map(t=>[t.id,{patternId:t.patterns[0].id}]));
    sources.scenes.push({...structuredClone(sources.scenes[0]),id:'other'});const sourceIds=sources.tracks.map(t=>t.id);
    const merged=mergeSceneIntoRack(sources,'scene',sourceIds,'merged'),mergedRack=merged.tracks[0];
    check('compatible scene parts merge without deleting originals',!mergeRackIssue(sources,'scene',sourceIds)&&merged.tracks.length===3&&isPatch(merged)&&sourceIds.every(id=>merged.scenes[0].slots[id].muted)&&merged.scenes[1].slots[mergedRack.id].muted&&planRender(merged,'scene',1,{tail:'trim'}).events.length===2);
    const incompatible=structuredClone(sources);incompatible.tracks[1].phase=1;check('different phases refuse merge without mutation',mergeRackIssue(incompatible,'scene',sourceIds)==='timing'&&mergeSceneIntoRack(incompatible,'scene',sourceIds,'bad')===incompatible);
    // Test looping on independent 5/7-step tracks, with sub-step seek.
    let q=defaultPatch();q.followChain=false;q.bpm=240;q.performanceSeed=22;q.tracks=q.tracks.slice(0,2);
    q.scenes=[{id:'s',name:'s',slots:{}}];q.chain=[{sceneId:'s',bars:4}];
    q.tracks.forEach((t,i)=>{t.effects=[];t.mods=[];t.phase=i;t.patterns=[{id:`p${i}`,name:'p',length:i?7:5,rate:i?1.5:1,steps:Array.from({length:i?7:5},(_,n)=>({notes:[{n:0,vel:.5,prob:n===0?.5:1,len:1,ratchet:n===1?2:1,microTimingMs:n===2?-20:0}]}))}];q.scenes[0].slots[t.id]={patternId:`p${i}`};});
    q=normalizePatch(q);
    const clockCtx=new OfflineAudioContext(2,44100*3,44100);let time=0;Object.defineProperty(clockCtx,'currentTime',{get:()=>time});Object.defineProperty(clockCtx,'state',{get:()=> 'running'});
    const loop=new AudioEngine();loop.ctx=clockCtx;loop.master=connectMaster(clockCtx,.3,0);
    loop.setPlaybackRange({sceneId:'s',startBeat:.375,endBeat:1.375,enabled:true,variation:'fixed',seed:8});
    const events=[];loop.noteSink=(id,at,notes)=>events.push({id,at,notes});loop.play(q,'s');clearInterval(loop.timer);const start=loop.startTime;
    const positions=[];
    for(time=0;time<1;time+=.025){for(const r of loop.retiring)r.dieAt=Infinity;loop.scheduler();if(time>=start)positions.push(loop.currentBeat);}
    check('all loop playheads stay inside region despite lookahead',positions.every(p=>p>=.375-1e-6&&p<1.375+1e-6),positions);
    const first=events.filter(e=>e.at>=start&&e.at<start+.25-1e-7).map(e=>[e.id,+(e.at-start).toFixed(6)]);
    const second=events.filter(e=>e.at>=start+.25-1e-7&&e.at<start+.5-1e-7).map(e=>[e.id,+(e.at-start-.25).toFixed(6)]);
    check('loop repeats shifted independent clocks and early hits',JSON.stringify(first)===JSON.stringify(second)&&first.length>0,{first,second});
    loop.setBpm(180);check('BPM retains beat coordinates',loop.playbackRange.startBeat===.375&&loop.playbackRange.endBeat===1.375);
    loop.setPlaybackRange({...loop.playbackRange,enabled:false});check('disabling loop cancels repeat boundary',loop.rangeEnd===null);
    loop.stop();check('Stop clears pending events and clocks',loop.pendingNotes.size===0&&loop.clocks.size===0);
    const {putSample,deleteSample,getSampleBlob}=await import('/src/audio/library.ts');
    const {audioBufferToWav}=await import('/src/audio/wav.ts');
    const sample=new AudioBuffer({length:22050,numberOfChannels:1,sampleRate:44100});sample.getChannelData(0).forEach((_,i,a)=>a[i]=Math.sin(i*2*Math.PI*220/44100)*.3);
    const meta=await putSample(audioBufferToWav(sample),'rack-shared.wav');
    let mixed=structuredClone(p);
    for(const mode of ['plain','grain','scratch'])mixed=appendPad(mixed,t.id,mode,{name:mode,category:'',track:{waveform:'sample',sampleId:meta.id,sampleName:meta.name,sampleMode:mode,grainCount:4,scratchPoints:[{t:0,pos:0},{t:1,pos:.4}],decay:.1}});
    mixed.tracks[0].patterns[0].steps[0].notes=mixed.tracks[0].device.pads.map(p=>({padId:p.id,n:0,vel:.5,prob:1,len:1}));
    const modesPlan=planRender(mixed,'scene',1,{tail:'trim'});
    check('synthesis, sample, grain and scratch use independent pad voices',modesPlan.events.length===5&&new Set(modesPlan.events.map(e=>e.part.st.sampleMode)).size>=3);
    const mixedWav=await wavEngine.renderToWav(mixed,'scene',1,{tail:'trim'});check('mixed source rack renders actual audio',mixedWav.size>44100);
    for(const mode of ['plain','grain','scratch']){const isolated=structuredClone(mixed);isolated.tracks[0].device.pads.forEach(p=>p.solo=p.name===mode);const pcm=new DataView(await (await wavEngine.renderToWav(isolated,'scene',1,{tail:'trim'})).arrayBuffer());let peak=0;for(let i=44;i<pcm.byteLength;i+=2)peak=Math.max(peak,Math.abs(pcm.getInt16(i,true)));check(`${mode} pad alone produces PCM`,peak>30,peak);}
    const packed=await exportDrumRack(mixed,mixed.tracks[0]);await deleteSample(meta.id);check('fixture asset deleted before portable import',!await getSampleBlob(meta.id));
    const imported=await readDrumRack(new File([packed],'mixed-kit.zip'));check('kit restores shared PCM and all source modes',!!await getSampleBlob(meta.id)&&imported.track.device.pads.length===5&&imported.instruments.filter(i=>i.sampleId===meta.id).length===3);
    const shortCtx=new OfflineAudioContext(2,44100,44100);let shortTime=0;Object.defineProperty(shortCtx,'currentTime',{get:()=>shortTime});Object.defineProperty(shortCtx,'state',{get:()=> 'running'});
    const short=new AudioEngine();const stochastic=[];short.noteSink=(id,at)=>{if(id===q.tracks[0].id)stochastic.push(at);};short.ctx=shortCtx;short.master=connectMaster(shortCtx,.3,0);short.setPlaybackRange({sceneId:'s',startBeat:0,endBeat:.25,enabled:true,variation:'evolving',seed:8});short.play(q,'s');clearInterval(short.timer);
    let maxGraphs=0,maxQueue=0;
    for(shortTime=0;shortTime<5;shortTime+=.025){short.scheduler();maxGraphs=Math.max(maxGraphs,short.retiring.length+short.chains.size);maxQueue=Math.max(maxQueue,short.pendingNotes.size);}
    check('80 short loop passes keep graphs and event queues bounded',maxGraphs<20&&maxQueue<20&&short.droppedEvents===0,{maxGraphs,maxQueue,dropped:short.droppedEvents});
    check('evolving loop changes probabilistic attacks',stochastic.length>0&&stochastic.length<70,stochastic.length);
    short.stop();shortTime=0;short.setPlaybackRange({sceneId:'s',startBeat:0,endBeat:1/16,enabled:true,variation:'fixed',seed:8});short.play(q,'s');clearInterval(short.timer);maxGraphs=0;
    for(shortTime=0;shortTime<1.25;shortTime+=.005){short.scheduler();maxGraphs=Math.max(maxGraphs,short.retiring.length+short.chains.size);}
    check('fastest grid cell can loop with bounded graphs',short.playbackRange.endBeat===1/16&&maxGraphs<40&&short.droppedEvents===0,{maxGraphs,dropped:short.droppedEvents});
    short.setScene('s');check('manual scene selection disables looping',!short.playbackRange?.enabled&&short.rangeEnd===null);short.stop();live.stop();
    return checks;
  });
  for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'} ${c.name}`,JSON.stringify(c.details??''));
  assert.ok(checks.every(c=>c.ok));assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
