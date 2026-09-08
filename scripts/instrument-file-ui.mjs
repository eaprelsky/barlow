import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5195;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/instrument-ui-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/instrument-ui-contract.html`);



 await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');localStorage.setItem('barlow.patch.v12',JSON.stringify(defaultPatch()));
  localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
 });
 await page.goto(`http://127.0.0.1:${port}`);
 const track=page.locator('main .track').first();await track.locator('[data-ob="mode-inst"]').click();
 const downloadPromise=page.waitForEvent('download');await track.locator('[data-help="instrument-export"]').click();
 const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith('.barlow-instrument.zip'));
 await download.saveAs(root+'/tmp/ui-export.barlow-instrument.zip');
 await page.locator('[data-ob="library-btn"]').click();
 await page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();});
 const saved=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 await page.locator('.sb-transfer input[type="file"]').setInputFiles(root+'/tmp/ui-export.barlow-instrument.zip');
 const modal=page.getByRole('dialog',{name:'добавить инструмент из файла'});await modal.waitFor();
 await modal.getByRole('textbox').fill('Мой переносимый тембр');await modal.getByRole('button',{name:'добавить',exact:true}).click();
 await page.getByRole('group',{name:'Мой переносимый тембр',exact:true}).waitFor();
 await page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();});
 assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),saved);
 for(const width of [1024,1440]) {await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/instrument-file-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.locator('.sb-transfer input[type="file"]').setInputFiles(root+'/tmp/ui-export.barlow-instrument.zip');await modal.waitFor();
 await modal.getByRole('button',{name:'отмена',exact:true}).click();
 assert.equal(await page.evaluate(async()=>(await import('/src/music/instrumentPresets.ts')).loadUserPresets().length),1);
 assert.deepEqual(errors,[]);console.log('PASS desktop layouts, exported download, imported own preset, unchanged project and cancel without writes');
} finally {await browser?.close();vite.kill();}
