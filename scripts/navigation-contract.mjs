import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5173;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/navigation-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/navigation-contract.html`);



 await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const p=defaultPatch();p.tracks=p.tracks.slice(0,3);
  p.tracks.forEach((t,i)=>{t.name=['Бас тёмный','Ударные','Бас верхний'][i];});
  p.chain=[];p.scenes=[{id:'s-one',name:'сцена 1',slots:Object.fromEntries(p.tracks.map((t,i)=>[t.id,{patternId:t.patterns[0].id,muted:i===0}]))}];
  localStorage.setItem('barlow.patch.v12',JSON.stringify(p));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
 });
 await page.goto(`http://127.0.0.1:${port}`);
 const rows=page.locator('main [data-track-id]');await rows.first().waitFor();
 assert.equal(await rows.count(),3);
 await page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();});
 const saved=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 const search=page.getByRole('searchbox',{name:'Фильтр по названию трека'});
 await search.fill('ТЕМНЫЙ');assert.equal(await rows.count(),1);
 await page.getByRole('checkbox',{name:'Скрыть мьют в этой сцене'}).check();assert.equal(await rows.count(),0);
 await search.fill('бас');assert.equal(await rows.count(),1);
 await page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();});
 assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),saved);
 for(const width of [1024,1440]) {
   await page.setViewportSize({width,height:1000});await page.locator('.track-filters').scrollIntoViewIfNeeded();
   await page.screenshot({path:root+`/tmp/navigation-${width}.png`});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.locator('[data-ob="scene-add"]').click();
 assert.equal(await page.locator('.scene-btn.on').textContent(),'сцена 2');
 assert.equal(await rows.count(),2); // copied scene clears scene mute, filter still applies
 await page.locator('[data-ob="scene-add"]').click();
 assert.equal(await page.locator('.scene-btn.on').textContent(),'сцена 3');
 await page.getByRole('button',{name:'Сбросить',exact:true}).click();assert.equal(await rows.count(),3);
 const help=page.locator('[data-ob="help"]');
 await help.click();assert.equal(await help.getAttribute('aria-pressed'),'true');
 await page.locator('[data-help="track-filter-name"]').click();
 await page.getByRole('dialog',{name:'Найти дорожку по имени',exact:true}).waitFor();
 await help.click();assert.equal(await page.locator('.ph-overlay').count(),0);assert.equal(await help.getAttribute('aria-pressed'),'false');
 await help.focus();await page.keyboard.press('Enter');assert.equal(await help.getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Space');assert.equal(await help.getAttribute('aria-pressed'),'false');
 const hint=page.locator('.ob-hint').first();await hint.click();assert.equal(await hint.getAttribute('aria-pressed'),'true');
 await hint.click();assert.equal(await hint.getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>{ void import('/src/components/dialogs.ts').then(m=>m.alertDialog('Проверяем выключение справки внутри диалога','Проверка переключателя')); });
 const modal=page.getByRole('dialog',{name:'Проверка переключателя',exact:true});await modal.waitFor();
 const modalHelp=modal.locator('[data-help-toggle]');await modalHelp.click();assert.equal(await modalHelp.getAttribute('aria-pressed'),'true');
 await modalHelp.click();assert.equal(await modalHelp.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.ph-overlay').count(),0);
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
 await search.fill('нет такого трека');await page.locator('[data-ob="add-track"]').click();
 assert.equal(await search.inputValue(),'');assert.equal(await rows.count(),4);
 assert.deepEqual(errors,[]);
 console.log('PASS scene numbering, scene-local/name filters, unchanged patch, add-track visibility, help mouse/keyboard toggle, desktop layout');
} finally { await browser?.close(); vite.kill(); }
