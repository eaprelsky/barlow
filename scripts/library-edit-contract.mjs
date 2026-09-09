import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5200;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/library-edit.html','<!doctype html><title>Library edit QA</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/library-edit.html`);
 const result=await page.evaluate(async()=>{
  const m=await import('/src/music/instrumentPresets.ts'),f=await import('/src/music/soundSearch.ts');
  const base=m.INSTRUMENT_PRESETS.find(p=>p.id==='transitions-01-air-up');
  m.appendUserPack([base],'QA пак','описание');const user=m.loadUserPresets()[0];
  f.saveSoundFavorites(new Set([f.presetFavoriteId(user),f.presetFavoriteId(base)]));
  m.renamePreset(user.id,'Мой подъём');const renamed=m.loadUserPresets()[0];
  const preserved=JSON.stringify({...renamed,name:user.name})===JSON.stringify(user);
  let rejected=0;for(const name of ['',base.name,'x'.repeat(161)]){try{m.renamePreset(user.id,name);}catch{rejected++;}}
  m.renamePreset(base.id,'Воздух перед дропом');const alias=m.loadFactoryPresets().find(p=>p.id===base.id);
  const {exportPack,preparePack}=await import('/src/audio/instrumentPack.ts');
  const job={signal:new AbortController().signal,progress:()=>{}},blob=await exportPack('QA','',[renamed,alias],job);
  const restored=await preparePack(new File([blob],'qa.barlow-pack.zip'),job);
  localStorage.setItem('barlow.onboarding.v1',JSON.stringify({seen:['main']}));
  return {preserved,rejected,names:restored.presets.map(p=>p.name),original:m.INSTRUMENT_PRESETS.find(p=>p.id===base.id).name,search:f.presetMatches(alias,base.name),favorites:f.loadSoundFavorites().size};
 });
 assert.ok(result.preserved);assert.equal(result.rejected,3);assert.equal(result.favorites,2);assert.ok(result.search);assert.deepEqual(result.names,['Мой подъём','Воздух перед дропом']);assert.notEqual(result.original,'Воздух перед дропом');
 await page.goto(`http://127.0.0.1:${port}`);await page.keyboard.press('Escape');
 const collection=page.getByLabel('Подборка звуков',{exact:true});if(!await collection.count())await page.getByRole('button',{name:'инструменты',exact:true}).click();
 await collection.selectOption('transitions');
 const card=page.getByRole('group',{name:'Воздух перед дропом',exact:true});await card.getByRole('button',{name:'Переименовать Воздух перед дропом',exact:true}).click();
 await page.getByRole('textbox',{name:'переименовать инструмент',exact:true}).fill('Отмена');await page.keyboard.press('Escape');assert.equal(await card.count(),1);
 await card.getByRole('button',{name:'Переименовать Воздух перед дропом',exact:true}).click();await page.getByRole('textbox',{name:'переименовать инструмент',exact:true}).fill('Перед кульминацией');await page.getByRole('button',{name:'сохранить',exact:true}).click();
 assert.equal(await page.getByRole('group',{name:'Перед кульминацией',exact:true}).count(),1);
 const sep=page.getByRole('separator',{name:'Ширина панели инструментов'}),width=()=>page.locator('.library-dock').evaluate(e=>e.getBoundingClientRect().width);
 assert.equal(await width(),272);await sep.focus();await page.keyboard.press('ArrowRight');assert.equal(await width(),288);
 let box=await sep.boundingBox();await page.mouse.move(box.x+6,box.y+30);await page.mouse.down();await page.mouse.move(box.x+118,box.y+30);await page.mouse.up();assert.equal(await width(),400);
 box=await sep.boundingBox();await page.mouse.move(box.x+6,box.y+30);await page.mouse.down();await page.mouse.move(box.x+46,box.y+30);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await width(),400);
 await page.reload();await page.keyboard.press('Escape');if(!await collection.count())await page.getByRole('button',{name:'инструменты',exact:true}).click();assert.equal(await width(),400);await collection.selectOption('transitions');assert.equal(await page.getByRole('group',{name:'Перед кульминацией',exact:true}).count(),1);
 await page.screenshot({path:root+'/tmp/library-edit-1440.png'});
 await page.setViewportSize({width:1024,height:900});await delay(100);assert.equal(await width(),304);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=1024));await page.screenshot({path:root+'/tmp/library-edit-1024.png'});
 await page.setViewportSize({width:1440,height:1000});await delay(100);assert.equal(await width(),400);await sep.dblclick();assert.equal(await width(),272);
 await page.getByRole('button',{name:'Вернуть исходное название: Перед кульминацией',exact:true}).click();assert.equal(await page.getByRole('group',{name:result.original,exact:true}).count(),1);
 assert.deepEqual(errors,[]);console.log('PASS rename: stable ID, metadata, favorites, duplicate/empty/length guard, cancel, restore, export, original-name search; resize: pointer, keyboard, cancel, reload, viewport clamp, reset, 1024/1440');
} finally {await browser?.close();vite.kill();}
