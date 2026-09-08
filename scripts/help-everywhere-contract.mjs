import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5174;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/help-everywhere-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/help-everywhere-contract.html`);



 await page.evaluate(async()=>{
  const {defaultPatch}=await import('/src/music/defaultPatch.ts');
  const {DEFAULT_MACROS}=await import('/src/music/macros.ts');
  const p=defaultPatch();p.instruments[0].macros=structuredClone(DEFAULT_MACROS);
  const {voiceSnapshot}=await import('/src/music/layers.ts');p.instruments[0].layers=[{id:'test-layer',name:'Дополнительный голос',gain:.4,ratio:1.5,sound:voiceSnapshot(p.instruments[1])}];
  localStorage.setItem('barlow.patch.v12',JSON.stringify(p));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
 });
 await page.goto(`http://127.0.0.1:${port}`);
 const scope='[data-track-id]';const track=page.locator(scope).first();
 await track.locator('[data-ob="mode-inst"]').click();
 await track.locator('.macro-editor > summary').click();
 await track.locator('.macro-item details > summary').first().click();
 await track.locator('.layer-name').click();
 for(const width of [1440,1024]) { await page.setViewportSize({width,height:1000});await track.locator('.macro-editor').scrollIntoViewIfNeeded();await page.screenshot({path:root+`/tmp/help-tiles-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
 const inventory=[];
 const inspect=async name=>inventory.push({name,...await page.evaluate(async()=> (await import('/src/onboarding/helpResolver.ts')).helpCoverage())});
 await inspect('instrument-source');
 const before=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 await page.getByRole('button',{name:'Что это?',exact:true}).click();
 assert.equal(await track.locator('.layer-name').evaluate(el=>getComputedStyle(el).cursor),'help');
 await track.locator('.layer-name').click();await page.getByRole('dialog',{name:'Настройки дополнительного голоса',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await track.locator('.layer-envelope [role="slider"]').first().click();
 await page.getByRole('dialog',{name:'Атака',exact:true}).waitFor();
 await page.screenshot({path:root+'/tmp/help-attack-1024.png'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),before);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 assert.notEqual(await track.locator('.layer-name').evaluate(el=>getComputedStyle(el).cursor),'help');
 const knob=track.locator('.layer-envelope [role="slider"]').first();await knob.dblclick();
 const input=track.locator('.layer-envelope input').first();await input.fill('123');await input.press('Enter');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].layers[0].sound.attack===.123);
 await page.keyboard.press('Control+z');await page.waitForFunction(before=>JSON.stringify(JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments)===JSON.stringify(JSON.parse(before).instruments),before);
 console.log('PASS direct help, cursor, layer explanation, mutation protection and knob exact input/undo');

 // Macro depth supports the same exact input and undo, including percentage units.
 const depth=track.locator('.macro-binding [role="slider"]').first();await depth.dblclick();
 const depthInput=track.locator('.macro-binding input').first();await depthInput.fill('-1.5');await depthInput.press('Enter');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].macros[0].bindings[0].depth===-1.5);
 await page.keyboard.press('Control+z');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('barlow.patch.v12')).instruments[0].macros[0].bindings[0].depth===2);
 await track.locator('[data-ob="tab-snd"]').click();
 await track.locator('[data-ob="src-seg"] button').filter({hasText:'сэмпл'}).click();await inspect('sampler');
 await track.locator('[data-ob="src-seg"] button').filter({hasText:'волна'}).click();
 for(const tab of ['tab-env' ,'tab-timbre']){await track.locator(`[data-ob="${tab}"]`).click();await inspect(tab);}
 await track.locator('[data-ob="mode-track"]').click();await inspect('track');
 await track.locator('[data-ob="mode-sketch"]').click();await inspect('sketch');
 await page.getByRole('button',{name:'инструменты',exact:true}).click();await inspect('library');
 await track.locator('[data-ob="mode-inst"]').click();await track.locator('.macro-editor > summary').click();await track.locator('.macro-item details > summary').first().click();await track.locator('.macro-editor').scrollIntoViewIfNeeded();await page.screenshot({path:root+'/tmp/help-tiles-library-1024.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));


 await page.getByRole('button',{name:'настройки',exact:true}).click();await inspect('settings');
 await page.getByRole('button',{name:'настройки',exact:true}).click();
 await page.locator('[data-ob="mixer-btn"]').click();await inspect('mixer');await page.locator('[data-ob="mixer-btn"]').click();
 await page.locator('[data-ob="chain-btn"]').click();await inspect('chain');await page.locator('[data-ob="chain-btn"]').click();
 // The inspection card must live in the native dialog's top layer.
 await page.evaluate(async()=>{ void (await import('/src/components/dialogs.ts')).confirmDialog({title:'Проверка справки',text:'Контрольное действие',okLabel:'выполнить'}); });
 await page.locator('dialog[open] .modal-point-help').click();
 await page.locator('dialog[open] [data-help="dialog-confirm"]').click();
 await page.locator('dialog[open] .ph-card').waitFor();
 assert.ok(await page.locator('dialog[open]').isVisible());
 await page.keyboard.press('Tab');await page.keyboard.press('Tab');
 assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.ph-card')));
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 assert.ok(await page.locator('dialog[open]').isVisible());
 await page.locator('dialog[open] [data-help="dialog-cancel"]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 console.log('PASS help inside native dialog, keyboard navigation and no accidental confirmation');
 const files=[root+'/src/App.tsx',...readdirSync(root+'/src/components').filter(f=>f.endsWith('.tsx')).map(f=>root+'/src/components/'+f),root+'/src/onboarding/Onboarding.tsx'];
 const helpIds=[...new Set(files.flatMap(f=>[...readFileSync(f,'utf8').matchAll(/(?:data-help|\bhelp)="([^"{}]+)"/g)].map(m=>m[1])))];
 const broken=await page.evaluate(async ids=>{const {helpCard}=await import('/src/onboarding/helpResolver.ts');return ids.filter(id=>!helpCard(id));},helpIds);
 assert.deepEqual(broken,[]);for(const result of inventory)assert.deepEqual(result.missing,[]);
 console.log('PASS every explicit help ID resolves',helpIds.length);
 writeFileSync(root+'/tmp/help-coverage-live.json' ,JSON.stringify(inventory,null,2));
 console.log('COVERAGE',JSON.stringify(inventory.map(x=>({name:x.name,total:x.total,missing:x.missing,inherited:x.inherited.length}))));
 assert.deepEqual(errors,[]);
}finally{await browser?.close();vite.kill();}
