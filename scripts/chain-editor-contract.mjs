import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5187;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/chain-editor-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/chain-editor-contract.html`);


 await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch}=await import('/src/types.ts');
  const p=defaultPatch();p.bpm=118;p.followChain=true;p.tracks=[p.tracks[0]];p.scenes=[{...p.scenes[0],id:'a',name:'сцена 1'},{...p.scenes[0],id:'b',name:'сцена 2'},{...p.scenes[0],id:'c',name:'Кульминация и возвращение главной темы'}];
  p.chain=[{sceneId:'a',bars:2},{sceneId:'b',bars:3},{sceneId:'a',bars:4},{sceneId:'c',bars:1},{sceneId:'b',bars:2}];
  localStorage.setItem('barlow.patch.v12',JSON.stringify(normalizePatch(p)));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
 });
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-ob="chain-btn"]').click();
 const read=()=>page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();return JSON.parse(localStorage.getItem('barlow.patch.v12'));});
 const mode=page.getByLabel('Режим темпа позиции 1',{exact:true}),bpm=page.getByLabel('BPM позиции 1',{exact:true});
 assert.equal(await bpm.isDisabled(),true);assert.equal(+await bpm.inputValue(),118);
 await mode.selectOption('custom');assert.equal(+await bpm.inputValue(),118);
 await bpm.fill('');await bpm.pressSequentially('137');await bpm.press('Enter');assert.equal((await read()).chain[0].bpm,137);
 await page.keyboard.press('Control+z');assert.equal(+await bpm.inputValue(),118);await page.keyboard.press('Control+Shift+z');assert.equal(+await bpm.inputValue(),137);
 await bpm.fill('99');await mode.focus();assert.equal((await read()).chain[0].bpm,99);
 await bpm.fill('240');await bpm.press('Escape');assert.equal(+await bpm.inputValue(),99);
 await bpm.fill('1');await bpm.press('Enter');assert.equal((await read()).chain[0].bpm,30);
 await bpm.focus();await bpm.press('ArrowUp');await bpm.press('Enter');assert.equal((await read()).chain[0].bpm,31);
 await bpm.fill('350');await bpm.press('Enter');assert.equal((await read()).chain[0].bpm,300);
 await bpm.fill('');await bpm.press('Enter');assert.equal((await read()).chain[0].bpm,300);
 await bpm.fill('137');await bpm.press('Enter');await page.reload();if(!await mode.count())await page.locator('[data-ob="chain-btn"]').click();assert.equal(+await bpm.inputValue(),137);
 await mode.selectOption('global');assert.equal((await read()).chain[0].bpm,undefined);assert.equal(+await bpm.inputValue(),118);assert.equal(await bpm.isDisabled(),true);
 await page.keyboard.press('Control+z');assert.equal(+await bpm.inputValue(),137);assert.equal(await bpm.isDisabled(),false);await page.keyboard.press('Control+Shift+z');
 await mode.selectOption('custom');await bpm.fill('150');await bpm.press('Enter');
 const before=(await read()).chain;await page.locator('.chain-grip').first().focus();await page.keyboard.press('ArrowRight');assert.deepEqual((await read()).chain,[before[1],before[0],...before.slice(2)]);await page.keyboard.press('Control+z');assert.deepEqual((await read()).chain,before);
 await page.locator('.chain-grip').first().dragTo(page.locator('.chain-item').nth(2),{targetPosition:{x:200,y:20}});assert.deepEqual((await read()).chain,[before[1],before[2],before[0],...before.slice(3)]);await page.keyboard.press('Control+z');
 await page.getByLabel('Сцена в позиции 1',{exact:true}).selectOption('c');assert.equal((await read()).chain[0].sceneId,'c');await page.keyboard.press('Control+z');assert.equal((await read()).chain[0].sceneId,'a');
 await page.getByLabel('Такты позиции 1',{exact:true}).fill('7');await page.getByLabel('Такты позиции 1',{exact:true}).press('Enter');assert.equal((await read()).chain[0].bars,7);await page.keyboard.press('Control+z');
 await page.getByLabel('Убрать позицию 2',{exact:true}).click();assert.equal((await read()).chain.length,4);await page.keyboard.press('Control+z');assert.equal((await read()).chain.length,5);
 await page.getByLabel('Добавить позицию в цепочку').click();assert.equal((await read()).chain.length,6);await page.keyboard.press('Control+z');
 const persistence=await page.evaluate(async()=>{
   (await import('/src/storage.ts')).flushAutosave();const p=JSON.parse(localStorage.getItem('barlow.patch.v12'));
   const {exportProject,importProject}=await import('/src/audio/project.ts');const reopened=await importProject(await exportProject(p));
   const {planRender}=await import('/src/audio/renderPlan.ts');const parts=planRender(reopened,'a',1,{tail:'trim'}).parts;
   return {same:JSON.stringify(reopened.chain)===JSON.stringify(p.chain),tempos:[...new Map(parts.map(x=>[x.itemIndex,x.bpm])).values()]};
 });assert.equal(persistence.same,true);assert.deepEqual(persistence.tempos,[150,118,118,118,118]);
 await page.locator('[data-ob="library-btn"]').click();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:900});await page.locator('.chain-panel').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const boxes=await page.locator('.chain-item').evaluateAll(items=>items.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));assert.ok(boxes.every(b=>b.w<=220&&b.h<130&&b.x+b.w<=width));assert.ok(boxes[0].y===boxes[2].y);await page.screenshot({path:root+`/tmp/chain-tiles-${width}.png`});}
 assert.deepEqual((await page.evaluate(async()=>(await import('/src/onboarding/helpResolver.ts')).helpCoverage())).missing,[]);
 await page.keyboard.press('F1');await mode.click();await page.locator('.ph-card').filter({hasText:'Темп вхождения сцены'}).waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
 console.log('PASS chain tempo typing/blur/Enter/Escape/arrows/bounds, undo/redo, reload/ZIP, render plan, keyboard/drag order, commands, layout and help');
}finally{await browser?.close();vite.kill();}
