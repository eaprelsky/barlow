import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5180;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/audition-contract.html','<!doctype html><title>Audition contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/audition-contract.html`);
 const result=await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {normalizePatch,isPatch,PATCH_VERSION}=await import('/src/types.ts');
  const {recommendedHz,soundForAudition}=await import('/src/music/audition.ts');
  const {INSTRUMENT_PRESETS,saveUserPreset,loadUserPresets,instrumentNameOf}=await import('/src/music/instrumentPresets.ts');
  const {triggerVoice}=await import('/src/audio/voices.ts');
  const {exportProject,importProject}=await import('/src/audio/project.ts');
  const {CARDS}=await import('/src/onboarding/cards.ts');
  const {GUIDES}=await import('/src/onboarding/guides.ts');
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
  let patch=defaultPatch();patch.tracks=[patch.tracks[0]];const t=patch.tracks[0];t.freq=789;t.scale=[1.37,1.7];t.scaleOctDown=3;t.scaleOctUp=1;t.noteSteps=64;t.volume=0;t.pan=1;t.enabled=false;t.rate=32;
  t.patterns=[{id:'p',name:'written',length:4,rate:32,steps:[{notes:[{n:0,vel:.7,prob:1,len:3}]},{notes:[]},{notes:[]},{notes:[]}]}];
  patch.scenes=[{id:'s',name:'test',slots:{[t.id]:{patternId:'p'}}}];patch.chain=[];patch.followChain=false;patch.instruments=patch.instruments.filter(i=>i.id===t.instrumentId);patch=normalizePatch(patch);
  const before=JSON.stringify(patch),target=patch.tracks[0],preset=INSTRUMENT_PRESETS.find(p=>p.id==='idm-01-kick-soft-sub')??INSTRUMENT_PRESETS.find(p=>p.name==='мягкое ядро');
  if(!preset)throw Error('fixture preset missing');const st=soundForAudition(target,preset);
  check('all factory presets have an explicit valid register',INSTRUMENT_PRESETS.every(p=>p.track.recommendedHz>=20&&p.track.recommendedHz<=9000));
  check('a written track register does not rename the selected preset',instrumentNameOf({...preset.track,freq:789})===preset.name);
  check('low instrument remains at its authored 45 Hz',st.freq===45&&st.scale.length===1&&st.scale[0]===1&&st.scaleOctDown===0&&st.scaleOctUp===0);
  check('audition does not inherit target silence, pan, gate, pattern or rate',st.volume===.8&&st.pan===.5&&st.enabled&&st.noteSteps===undefined&&st.patterns.length===0&&st.rate===1);
  check('library audition bypasses a target rack bus',soundForAudition({...target,rackParentId:'rack',rackPadId:'pad'},preset).rackParentId===undefined);
  check('preview preparation leaves the entire patch untouched',JSON.stringify(patch)===before);
  check('recommended frequency overrides a legacy base frequency',recommendedHz({recommendedHz:73,freq:440})===73);
  check('old presets retain their register and sample metadata fallback',recommendedHz({freq:55})===55&&recommendedHz({waveform:'sample',rootHz:330})===330);
  const simple={name:'sine',category:'test',track:{waveform:'wave',wave:{partials:[{type:'sine',ratio:1,amp:1}]},freq:83,attack:.005,decay:.1,sustain:1}};
  const render=async(track)=>{const ctx=new OfflineAudioContext(1,22050,44100),hp=ctx.createGain();hp.connect(ctx.destination);const sound=soundForAudition(track,simple);triggerVoice(ctx,{hp},ctx.createBuffer(1,44100,44100),null,sound,[{n:0,vel:.9,prob:1,len:2}],.05,.125);return (await ctx.startRendering()).getChannelData(0);};
  const a=await render(target),b=await render({...target,freq:32,scale:[.2,4.5],scaleOctDown:0,volume:1,pan:0,noteSteps:1});
  check('real PCM is independent of target tuning and note length',a.some(v=>Math.abs(v)>.01)&&a.every((v,i)=>v===b[i]));
  patch.instruments[0].recommendedHz=73.4;const round=await importProject(await exportProject(patch));check('JSON and ZIP preserve recommendation',round.version===PATCH_VERSION&&round.instruments[0].recommendedHz===73.4);
  for(const bad of [0,9001,'55',NaN]){const p=structuredClone(patch);p.instruments[0].recommendedHz=bad;check('invalid recommendation rejected '+bad,!isPatch(p));}
  saveUserPreset('saved register',{...target,...patch.instruments[0]});check('saved preset retains recommendation independently of track Hz',loadUserPresets().find(p=>p.name==='saved register')?.track.recommendedHz===73.4);
  for(const key of ['preset-audition','recommended-hz','preview-in-track','preview-timbre','portamento','track-voicing','sample-slices','note-locks'])check('help card exists: '+key,!!CARDS[key]?.text);
  check('audition guide has no missing step references',GUIDES.some(g=>g.id==='audition')&&Object.values(CARDS).filter(c=>c.guide).every(c=>{const g=GUIDES.find(g=>g.id===c.guide.id);return g&&(!c.guide.step||c.guide.step<g.steps.length);}));
  patch.tracks[0].enabled=true;
  localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return checks;
 });
 for(const c of result)console.log(`${c.pass?'PASS':'FAIL'} ${c.name} ${JSON.stringify(c.details??'')}`);assert.ok(result.every(c=>c.pass));
 await page.goto(`http://127.0.0.1:${port}`);await page.evaluate(async()=>{const {AudioEngine}=await import('/src/audio/engine.ts');window.auditions=[];const original=AudioEngine.prototype.previewSounding;AudioEngine.prototype.previewSounding=function(st,...args){window.auditions.push(structuredClone(st));return original.call(this,st,...args);};});
 await page.locator('[data-ob="library-btn"]').click();const search=page.locator('[data-ob="inst-search"]');await search.fill('мягкое ядро');await delay(500);
 const before=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 await page.getByRole('button',{name:'прослушать мягкое ядро',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.auditions.at(-1).freq),45);assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),before);
 await page.locator('.sb-apply').filter({hasText:'мягкое ядро'}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].recommendedHz===45);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].freq),789);
 await page.locator('[data-ob="mode-inst"]').first().click();const hz=page.getByRole('spinbutton',{name:'Частота прослушивания, Гц',exact:true});await hz.fill('67');await hz.press('Enter');await page.keyboard.press('Control+z');assert.equal(Number(await hz.inputValue()),45);await page.keyboard.press('Control+Shift+z');assert.equal(Number(await hz.inputValue()),67);
 await page.locator('[data-ob="preview-timbre"]').click();assert.equal(await page.evaluate(()=>window.auditions.at(-1).freq),67);assert.equal(await page.evaluate(()=>window.auditions.at(-1).volume),.8);
 await page.locator('[data-ob="preview-in-track"]').click();assert.equal(await page.evaluate(()=>window.auditions.at(-1).freq),789);
 const ratio=page.locator('[data-ob="we-partials"] input').first();await ratio.fill('1.37');await ratio.press('Enter');
 await page.getByRole('button',{name:'сохранить инструмент',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox').fill('Мой бас 67');await dialog.getByRole('button',{name:'сохранить',exact:true}).click();
 const savedDraft=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem('barlow.instruments.v1')).find(p=>p.name==='Мой бас 67').track.wave.partials[0].ratio,applied:JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].wave.partials[0].ratio}));assert.equal(savedDraft.saved,1.37);assert.equal(savedDraft.applied,1);
 await search.fill('Мой бас 67');await page.getByRole('button',{name:'прослушать Мой бас 67',exact:true}).click();assert.equal(await page.evaluate(()=>window.auditions.at(-1).freq),67);
 await page.keyboard.press('F1');await page.locator('[data-ob="recommended-hz"]').click();await page.locator('.ph-card').filter({hasText:'Это не настройка тоники партии'}).waitFor();await page.getByRole('button',{name:'показать в гиде ▸'}).click();assert.equal(await page.locator('.ph-overlay').count(),0);await page.locator('.ob-say').filter({hasText:'Задай частоту'}).waitFor();await page.getByRole('button',{name:'далее →'}).click();await page.locator('[data-ob="preview-timbre"]').click();await page.locator('.ob-say').filter({hasText:'сравнить со строем'}).waitFor();await page.keyboard.press('Escape');
 await search.fill('');
 for(const width of [1024,1440]){
   await page.setViewportSize({width,height:900});await page.locator('.instrument-audition').scrollIntoViewIfNeeded();
   const layout=await page.evaluate(()=>{const bar=document.querySelector('.instrument-audition').getBoundingClientRect(),rows=[...document.querySelectorAll('.inst-card')];const xs=rows.map(r=>r.querySelector('.sb-audition').getBoundingClientRect().left);return {right:bar.right,height:bar.height,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,packWidth:document.querySelector('.sb-pack select').getBoundingClientRect().width,alignment:Math.max(...xs)-Math.min(...xs)};});
   assert.ok(layout.right<=width+1&&layout.height<=85,JSON.stringify(layout));assert.ok(layout.alignment<1&&layout.packWidth>150&&layout.scrollWidth<=width,JSON.stringify(layout));
   await page.screenshot({path:root+`/tmp/audition-${width}.png`});console.log('PASS compact audition layout and aligned library buttons '+JSON.stringify(layout));
 }
 await page.locator('.track-dup').first().click();const names=page.locator('[data-ob="track-name"]');await names.last().scrollIntoViewIfNeeded();
 await page.keyboard.press('F1');await names.last().hover();await names.last().click();await delay(550);
 const focus=await page.locator('.ph-hole').boundingBox(),nameBox=await names.last().boundingBox();assert.ok(focus&&nameBox&&Math.abs(focus.y-(nameBox.y-3))<2,'help highlight must stay with the selected track');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');console.log('PASS repeated help controls retain the selected DOM target after layout refresh');
 await page.keyboard.press('F1');await page.locator('[data-ob="mode-track"]').last().click();await page.getByRole('button',{name:'показать в гиде ▸'}).click();
 const scoped=await page.locator('[data-ob="mode-track"]').last().evaluate(el=>{const r=el.closest('[data-ob="mode"]').getBoundingClientRect();return {x:r.x,y:r.y};});
 const guideHole=await page.locator('.ob-hole').boundingBox();assert.ok(guideHole&&Math.abs(guideHole.y-(scoped.y-4))<2&&Math.abs(guideHole.x-(scoped.x-4))<2,'guide must retain clicked track scope');
 await page.keyboard.press('Escape');console.log('PASS nested anchor finds parent help and guide retains the selected track');

 assert.deepEqual(errors,[]);console.log('PASS library/editor audition, unchanged written notes, recommendation undo, save and novice help');
}finally{await browser?.close();vite.kill();}
