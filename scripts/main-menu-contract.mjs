import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5192;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/main-menu.html','<!doctype html><title>Guide placement</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/main-menu.html`);
 const collectionAudit=await page.evaluate(async()=>{
   const {INSTRUMENT_PRESETS}=await import('/src/music/instrumentPresets.ts');const {SOUND_COLLECTIONS,presetInCollection}=await import('/src/music/soundSearch.ts');const {defaultPatch}=await import('/src/music/defaultPatch.ts');
   localStorage.setItem('barlow.patch.v12',JSON.stringify(defaultPatch()));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
   return {unassigned:INSTRUMENT_PRESETS.filter(p=>!SOUND_COLLECTIONS.some(c=>presetInCollection(p,c.id))).map(p=>p.name),groups:SOUND_COLLECTIONS.map(c=>({id:c.id,n:INSTRUMENT_PRESETS.filter(p=>presetInCollection(p,c.id)).length})),ids:INSTRUMENT_PRESETS.map(p=>p.id)};
 });assert.deepEqual(collectionAudit.unassigned,[]);assert.ok(collectionAudit.groups.filter(c=>c.id!=='user').every(c=>c.n>0));
 await page.goto(`http://127.0.0.1:${port}`);
 await page.locator('[data-ob="library-btn"]').waitFor();await delay(800);
 const before=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 const file=page.getByRole('menuitem',{name:'Файл',exact:true});
 await file.focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Новый проект');
 await page.keyboard.press('End');assert.match(await page.evaluate(()=>document.activeElement.textContent),/Экспортировать патч/);
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.getByRole('menu',{name:'Вид',exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Вид');
 await file.click();await page.keyboard.press('Tab');assert.equal(await page.locator('.main-menu [role="menu"]').count(),0);
 await file.click();await page.locator('[data-ob="title"]').click();assert.equal(await page.locator('.main-menu [role="menu"]').count(),0);
 await file.click();const chooser=page.waitForEvent('filechooser');await page.getByRole('menuitem',{name:'Импортировать инструмент…',exact:true}).click();await (await chooser).setFiles(root+'/tmp/ui-export.barlow-instrument.zip');
 const importDialog=page.getByRole('dialog',{name:'добавить инструмент из файла'});await importDialog.waitFor();await importDialog.getByRole('button',{name:'отмена',exact:true}).click();
 // File import opens the library; reset its visibility for the shared layout checks.
 await page.locator('[data-ob="library-btn"]').click();
 await page.getByRole('menuitem',{name:'Справка',exact:true}).click();await page.getByRole('menuitem',{name:'Пошаговые гиды…',exact:true}).click();await page.locator('.help-menu').waitFor();await page.keyboard.press('Escape');
 const headerBefore=await page.locator('.global-header').boundingBox();
 const library=page.locator('[data-ob="library-btn"]'),mix=page.locator('[data-ob="mixer-btn"]');
 await library.click();assert.equal(await library.getAttribute('aria-pressed'),'true');await mix.click();assert.equal(await mix.getAttribute('aria-pressed'),'true');await mix.click();
 const select=page.getByRole('combobox',{name:'Подборка звуков'});assert.ok(!(await select.textContent()).includes('IDM 01'));
 for(const c of collectionAudit.groups){await select.selectOption(c.id);assert.equal(await page.locator('.inst-card').count(),c.n);}
 assert.deepEqual(await page.locator('.global-header').boundingBox(),headerBefore);
 await select.selectOption('heavy');
 await page.getByRole('textbox',{name:'поиск звука'}).fill('жёсткая электроника');
 assert.equal(await page.locator('.inst-card').count(),collectionAudit.groups.find(c=>c.id==='heavy').n);
 await page.getByRole('textbox',{name:'поиск звука'}).fill('');
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/main-menu-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const aligned=await page.evaluate(()=>{const h=document.querySelector('.sb-head').getBoundingClientRect(),b=document.querySelector('[aria-label="Импорт инструмента"]').getBoundingClientRect();return b.top>=h.top&&b.bottom<=h.bottom&&b.right<=h.right;});assert.ok(aligned);}
 await page.getByRole('menuitem',{name:'Файл',exact:true}).click();await page.getByRole('menuitem',{name:'Открыть проект…',exact:true}).waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),before);
 await page.keyboard.press('F1');await select.click();await page.getByText('Подборки инструментов',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 writeFileSync(root+'/tmp/menu-collection-audit.json',JSON.stringify(collectionAudit,null,2));assert.deepEqual(errors,[]);
 console.log('PASS all factory instruments covered by musical collections, filters, panel toggle state, file menu, import alignment, 1024/1440, help, unchanged patch');
}finally{await browser?.close();vite.kill();}
