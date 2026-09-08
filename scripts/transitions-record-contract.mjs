import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5196;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/transitions-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/transitions-contract.html`);


 const result=await page.evaluate(async()=>{
 const {makeChain}=await import('/src/audio/fx.ts');const {makeSceneSpace,sendToSpace}=await import('/src/audio/sceneSpace.ts');const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch,isPatch}=await import('/src/types.ts');
 const patch=defaultPatch();patch.sceneSpace={sizeSec:1,level:.5};patch.tracks[0].spaceSend=.8;const t=patch.tracks[0],inst=patch.instruments.find(i=>i.id===t.instrumentId);
 const c=new OfflineAudioContext(1,48000,48000),space=makeSceneSpace(c,c.destination,1,.5,3),chain=makeChain(c,{...t,...inst,effects:[],mods:[]},c.destination);sendToSpace(chain,space.input,.8);chain.sceneGain.gain.setValueAtTime(0,.2);
 const src=c.createOscillator();src.connect(chain.hp);src.start(.05);src.stop(.18);const data=(await c.startRendering()).getChannelData(0),tail=data.slice(14400,20000).reduce((sum,v)=>sum+v*v,0);
 localStorage.setItem('barlow.patch.v12',JSON.stringify(patch));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return {tail,roundtrip:normalizePatch(patch).sceneSpace.sizeSec===1&&normalizePatch(patch).tracks[0].spaceSend===.8,valid:isPatch(patch)};
 });assert.ok(result.tail>1e-6&&result.roundtrip&&result.valid);console.log('PASS shared reverb survives scene cutoff and patch roundtrip',result);
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="auto-toggle"]').first().click();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].automation??[]);
 await page.locator('[data-ob="play"]').click();await page.getByRole('button',{name:'● записать движение',exact:true}).click();
 const knob=page.getByRole('slider',{name:'значение, %',exact:true});await knob.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await delay(250);await page.getByRole('button',{name:'■ закончить',exact:true}).click();
 await page.locator('[data-ob="play"]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].automation?.some(c=>c.points.some(p=>p.v<.5)));
 await page.keyboard.press('Control+z');await page.waitForFunction(before=>JSON.stringify(JSON.parse(localStorage.getItem('barlow.patch.v12')).tracks[0].patterns[0].automation??[])===JSON.stringify(before),before);console.log('PASS gesture recording writes normalized curve and undo restores take');
 await page.locator('[data-ob="mixer-btn"]').click();for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+`/tmp/space-mixer-${width}.png`});}
 assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
