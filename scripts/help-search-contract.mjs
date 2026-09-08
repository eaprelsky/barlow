import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5189;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/help-search-contract.html','<!doctype html><title>Portamento contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/tmp/help-search-contract.html`);


 const indexChecks=await page.evaluate(async()=>{
   const {searchHelp,HELP_INDEX}=await import('/src/onboarding/helpSearchIndex.ts');
   const queries=['портаменто','поратменте','постаменто','portamento','скольжение','как найти портаменто'];
   const results=queries.map(q=>({q,id:searchHelp(q)[0]?.id}));
   const {defaultPatch}=await import('/src/music/defaultPatch.ts');const {normalizePatch}=await import('/src/types.ts');
   const p=defaultPatch();p.tracks=p.tracks.slice(0,2);p.tracks.forEach((t,i)=>{t.mono=false;t.name=i?'лид для поиска':'бас для поиска';});
   p.instruments.forEach(i=>{i.waveform='wave';i.wave={partials:[{type:'sine',ratio:1,amp:1}]};});
   localStorage.setItem('barlow.patch.v12',JSON.stringify(normalizePatch(p)));localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));
   return {results,total:HELP_INDEX.length,unknown:searchHelp('zzzzzzzzzzzz').length,guides:searchHelp('собери').some(e=>e.guideId)};
 });assert.ok(indexChecks.results.every(r=>r.id==='portamento'),JSON.stringify(indexChecks));assert.ok(indexChecks.total>200);assert.equal(indexChecks.unknown,0);assert.equal(indexChecks.guides,true);
 await page.goto(`http://127.0.0.1:${port}`);
 const saved=()=>page.evaluate(async()=>{(await import('/src/storage.ts')).flushAutosave();return JSON.parse(localStorage.getItem('barlow.patch.v12'));});
 const before=await saved(),id=before.tracks[1].id;
 await page.getByRole('button',{name:'найти в справке',exact:true}).click();const query=page.getByLabel('Искать в справке',{exact:true});await query.fill('поратменте');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await query.press('Enter');
 assert.match(await page.locator('.help-search-article h3').innerText(),/Портаменто/);assert.ok(await page.locator('.help-search-article').innerText().then(t=>t.includes('скольжение, мс')));
 await page.getByLabel('Дорожка для перехода').selectOption(id);
 for(const width of [1024,1440]){await page.setViewportSize({width,height:900});await page.screenshot({path:root+`/tmp/help-search-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.getByRole('dialog',{name:'Поиск по справке'}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=900);}
 await page.getByRole('button',{name:'Показать в интерфейсе',exact:true}).click();const track=page.locator(`[data-track-id="${id}"]`);await track.locator('[data-help="mono"].help-found-target').waitFor();assert.deepEqual(await saved(),before);assert.equal(await track.locator('[data-ob="portamento"]').count(),0);
 await page.getByLabel('Закрыть подсказку перехода').click();await track.getByRole('checkbox',{name:'новая нота глушит предыдущую'}).check();const withMono=await saved();
 await page.keyboard.press('Control+/');await query.fill('portamento');await page.getByLabel('Дорожка для перехода').selectOption(id);await page.getByRole('button',{name:'Показать в интерфейсе',exact:true}).click();await track.locator('[data-help="portamento"].help-found-target,[data-ob="portamento"].help-found-target').first().waitFor();assert.deepEqual(await saved(),withMono);
 await page.getByLabel('Закрыть подсказку перехода').click();await page.keyboard.press('F1');await page.keyboard.press('Control+/');await query.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('point-help-active')),false);
 await query.fill('zzzzzzzzzzzz');await page.getByText('Ничего не найдено.',{exact:false}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Поиск по справке'}).count(),0);
 await track.locator('[data-ob="mode-inst"]').click();const ratio=track.locator('.we-partials [data-help="operator-ratio"] input').first();await ratio.fill('1.5');await ratio.press('Enter');await page.keyboard.press('Control+/');await query.fill('портаменто');await page.getByRole('button',{name:'Показать в интерфейсе',exact:true}).click();await page.getByText('Сначала примени или отбрось черновик',{exact:false}).waitFor();assert.equal(await track.locator('[data-help-navigation-blocked="true"]').count(),1);
 assert.deepEqual((await page.evaluate(async()=>(await import('/src/onboarding/helpResolver.ts')).helpCoverage())).missing,[]);
 await page.keyboard.press('F1');await query.click();await page.locator('.ph-card').filter({hasText:'Что искать'}).waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
 console.log('PASS help index '+indexChecks.total+', typo/aliases/guides, keyboard, target track, hidden mono prerequisite, no patch mutation, draft protection, native help and 1024/1440 layout');
}finally{await browser?.close();vite.kill();}
