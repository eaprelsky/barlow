import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5175;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/help-v53-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/help-v53-contract.html`);


 const registry=await page.evaluate(async()=>{
 const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {CARDS}=await import('/src/onboarding/cards.ts');const {GUIDES}=await import('/src/onboarding/guides.ts');
 const broken=Object.entries(CARDS).filter(([,c])=>c.guide&&!GUIDES.some(g=>g.id===c.guide.id&&g.steps[c.guide.step??0]));
 localStorage.setItem('barlow.patch.v12',JSON.stringify(defaultPatch()));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
 return {cards:Object.keys(CARDS).length,guides:GUIDES.length,broken,steps:GUIDES.find(g=>g.id==='sound-design').steps};
 });assert.deepEqual(registry.broken,[]);
 await page.goto(`http://127.0.0.1:${port}`);const id=await page.locator('[data-track-id]').first().getAttribute('data-track-id');const scope=`[data-track-id="${id}"]`;
 await page.evaluate(async scope=>(await import('/src/onboarding/guides.ts')).launchGuide('sound-design',{scope}),scope);
 for(const step of registry.steps){await page.locator('.ob-say').filter({hasText:step.say}).waitFor();const target=page.locator(scope+' '+step.target).first();await target.waitFor({state:'visible'});if(step.expect==='click')await target.click();else await page.locator('.ob-next').click();}
 await page.waitForFunction(()=>!document.querySelector('.ob-say'));console.log('PASS complete sound-design guide has visible scoped targets and advances through every step');
 await page.locator(scope+' [data-ob="tab-snd"]').click();await page.getByLabel('Способ синтеза',{exact:true}).selectOption('table');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments.some(i=>i.wave?.wavetable));
 const draw=page.getByLabel('Рисование кадра wavetable',{exact:true}),box=await draw.boundingBox();const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments);
 await page.mouse.move(box.x+30,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width-30,box.y+box.height-20,{steps:8});await page.mouse.up();await page.keyboard.press('Control+z');
 await page.waitForFunction(before=>JSON.stringify(JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments)===JSON.stringify(before),before);console.log('PASS continuous wavetable drawing is one undo gesture');
 await page.getByRole('button',{name:'инструменты',exact:true}).click();await page.setViewportSize({width:1024,height:1000});await draw.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/tmp/synthesis-library-1024.png'});console.log('PASS synthesis plus left library fits 1024 px');
 writeFileSync(root+'/tmp/help-registry-v53.json',JSON.stringify({cards:registry.cards,guides:registry.guides,broken:registry.broken,guideSteps:registry.steps.length},null,2));assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
