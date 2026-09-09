import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5205;
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('barlow.locale.v1','en');localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));});
 await page.goto(`http://127.0.0.1:${port}`);
 const result=await page.evaluate(async()=>{
  const {setLocale}=await import('/src/i18n/index.ts'),{messages}=await import('/src/i18n/messages.ts');
  const {searchHelp,getHelpIndex}=await import('/src/onboarding/helpSearchIndex.ts');
  const {compositionLessons,soundLessons,learningProject}=await import('/src/music/learning.ts');
  const {EXPLANATIONS}=await import('/src/onboarding/explanations.ts');
  const untranslated=Object.entries(messages).filter(([,v])=>/[А-Яа-яЁё]/.test(v.en.replaceAll('Русский','').replaceAll('е/ё',''))).map(([k])=>k);
  const placeholderErrors=Object.entries(messages).filter(([,v])=>!v.en||!v.ru||JSON.stringify((v.ru.match(/\{\w+\}/g)||[]).sort())!==JSON.stringify((v.en.match(/\{\w+\}/g)||[]).sort())).map(([k])=>k);
  const queries=['portamento','портаменто','поратменте'].map(q=>searchHelp(q)[0]?.id);
  const enIndex=getHelpIndex(),enCards=Object.values(EXPLANATIONS).map(c=>c.title+' '+c.text+' '+(c.how??''));
  const project=learningProject(),name=project.title;project.tracks.forEach(t=>t.name='日本語 user track');const snapshot=JSON.stringify(project);
  const checks=compositionLessons.slice(0,2).map(l=>l.check(project));setLocale('ru');
  const russianIndex=getHelpIndex();const russianTitles=compositionLessons.map(l=>l.title);const checksRu=compositionLessons.slice(0,2).map(l=>l.check(project));
  const bilingualRu=searchHelp('portamento')[0]?.id;setLocale('en');
  return {count:Object.keys(messages).length,untranslated,placeholderErrors,queries,checks,checksRu,bilingualRu,name,unchanged:snapshot===JSON.stringify(project),differentIndex:enIndex[0].card.title!==russianIndex[0].card.title,englishCards:enCards.every(s=>!/[А-Яа-яЁё]/.test(s.replaceAll('Русский','').replaceAll('е/ё',''))),russianTitles,englishTitles:[...compositionLessons,...soundLessons].map(l=>l.title)};
 });
 assert.deepEqual(result.untranslated,[]);assert.deepEqual(result.placeholderErrors,[]);assert.deepEqual(result.queries,['portamento','portamento','portamento']);assert.equal(result.bilingualRu,'portamento');assert.deepEqual(result.checks,[true,true]);assert.deepEqual(result.checksRu,result.checks);assert.equal(result.unchanged,true);assert.equal(result.englishCards,true);assert.equal(result.differentIndex,true);assert.match(result.name,/Orbital/);assert.ok(result.englishTitles.every(t=>!/[А-Яа-яЁё]/.test(t)));
 await page.keyboard.press('Control+/');await page.locator('.help-search input[type="search"]').fill('портаменто');
 await page.locator('.help-search-article h3').filter({hasText:/Portamento/i}).waitFor();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/locale-help-en-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.keyboard.press('Escape');await page.getByRole('menuitem',{name:'Help',exact:true}).click();await page.getByRole('menuitem',{name:'Learning studio…',exact:true}).click();
 await page.getByRole('button',{name:'Sound design',exact:true}).click();await page.getByRole('heading',{name:'Sources and overtones',exact:true}).waitFor();
 for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/locale-learning-en-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 const coverage=await page.evaluate(async()=>(await import('/src/onboarding/helpResolver.ts')).helpCoverage());assert.deepEqual(coverage.missing,[]);
 assert.deepEqual(errors,[]);console.log('PASS localization help and learning',result,coverage.total);
}finally{await browser?.close();vite.kill();}
