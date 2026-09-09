import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5190;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/guide-placement.html','<!doctype html><title>Guide placement</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/guide-placement.html`);
 if(process.env.BARLOW_TEST_LOCALE==='en')await page.evaluate(()=>{document.documentElement.lang='en';localStorage.setItem('barlow.locale.v1','en');});
 const guides=await page.evaluate(async()=>{const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {GUIDES}=await import('/src/onboarding/guides.ts');localStorage.setItem('barlow.patch.v12',JSON.stringify(defaultPatch()));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));return GUIDES;});
 const files=readdirSync(root+'/src',{recursive:true}).filter(f=>/\.tsx$/.test(f));const source=files.map(f=>readFileSync(root+'/src/'+f,'utf8')).join('\n');
 const absent=[...new Set(guides.flatMap(g=>g.steps.flatMap(s=>[...(s.target??'').matchAll(/data-ob="([^"]+)"/g)].map(m=>m[1]))))].filter(key=>!source.includes('data-ob="'+key+'"') && !source.includes("'"+key+"'"));
 assert.deepEqual(absent,[], 'guide anchors must exist in JSX');
 await page.goto(`http://127.0.0.1:${port}`);
 const tracks=await page.locator('[data-track-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-track-id'))),scope=`[data-track-id="${tracks[0]}"]`;
 const launch=async(id,step=0,selectedScope=scope)=>page.evaluate(async a=>(await import('/src/onboarding/guides.ts')).launchGuide(a.id,{step:a.step,scope:a.scope}),{id,step,scope:selectedScope});
 // Every guide step: either a real visible hole below the sticky header, or no hole.
 const audit=[];
 for(const g of guides)for(let step=0;step<g.steps.length;step++){
   await launch(g.id,step);await delay(110);
   const result=await page.evaluate(()=>{const h=document.querySelector('.ob-hole')?.getBoundingClientRect(),head=document.querySelector('.topbar').getBoundingClientRect();return {hole:!!h,top:h?.top,bottom:h?.bottom,header:head.bottom,missing:!!document.querySelector('.ob-missing'),say:document.querySelector('.ob-say')?.textContent};});
   assert.ok(!result.hole||!result.missing,`${g.id}/${step}: missing target highlighted`);
   if(result.hole)assert.ok(result.bottom>0&&result.top<900,`${g.id}/${step}: offscreen hole`);
   audit.push({guide:g.id,step,...result});
 }
 await page.keyboard.press('Escape');
 // Reproduce an open editor, deep scroll, then start the guide at step zero.
 await page.locator(scope+' [data-ob="mode-inst"]').click();
 await page.locator(scope+' [data-ob="tab-env"]').click();
 await page.evaluate(()=>window.scrollTo(0,500));await launch('sound-design');await delay(500);
 assert.equal(await page.locator('.ob-say').textContent(),guides.find(g=>g.id==='sound-design').steps[1].say);
 assert.ok(await page.locator(scope+' [data-ob="mode-inst"]').evaluate(e=>e.classList.contains('on')));
 for(const width of [1024,1440]){
   await page.setViewportSize({width,height:900});await launch('sound-design',2);await delay(500);
   const geom=await page.evaluate(scope=>{const t=document.querySelector(scope+' [data-ob="tab-snd"]').getBoundingClientRect(),h=document.querySelector('.ob-hole').getBoundingClientRect(),bar=document.querySelector('.topbar').getBoundingClientRect();return {t:t.top,h:h.top,bar:bar.bottom};},scope);
   assert.ok(geom.t>=geom.bar,JSON.stringify(geom));assert.ok(Math.abs(geom.h-(geom.t-4))<1);
   await page.screenshot({path:root+`/tmp/guide-placement-${process.env.BARLOW_TEST_LOCALE??'ru'}-${width}.png`});
 }
 await page.keyboard.press('Escape');
 // A missing scoped target cannot jump to another track, including after removal.
 await launch('sound-design',2,'[data-track-id="does-not-exist"]');await delay(500);
 assert.equal(await page.locator('.ob-hole').count(),0);assert.equal(await page.locator('.ob-missing').count(),1);
 writeFileSync(root+'/tmp/guide-placement-audit.json',JSON.stringify(audit,null,2));assert.deepEqual(errors,[]);
 console.log(`PASS ${guides.length} guides / ${audit.length} steps, static anchors, existing editor, sticky header, scoped missing target, 1024/1440 placement`);
}finally{await browser?.close();vite.kill();}
