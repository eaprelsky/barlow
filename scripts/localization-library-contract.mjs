import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {mkdirSync,writeFileSync} from 'node:fs';import {setTimeout as delay} from 'node:timers/promises';import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5204;mkdirSync(root+'/tmp',{recursive:true});
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});let browser;
try {for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('barlow.onboarding.v1',JSON.stringify({seen:['main']})));
 const url=`http://127.0.0.1:${port}`;await page.goto(url);await page.keyboard.press('Escape');
 await page.locator('.track-name').first().fill('Мой трек 日本語');await page.locator('.track-name').first().press('Tab');await delay(600);
 const before=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 await page.getByRole('menuitem',{name:'Настройки',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'English',exact:true}).click();
 assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.getByRole('menuitem',{name:'File',exact:true}).count(),1);assert.equal(await page.locator('.track-name').first().inputValue(),'Мой трек 日本語');
 assert.equal(await page.getByRole('button',{name:'clip',exact:true}).count(),4);assert.equal(await page.getByRole('button',{name:'+ track',exact:true}).count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),before);
 const contract=await page.evaluate(async()=>{const {messages}=await import('/src/i18n/messages.ts'),{PARAMETERS}=await import('/src/parameters.ts'),{SCALE_PRESETS}=await import('/src/music/scales.ts');return {count:Object.keys(messages).length,bad:Object.entries(messages).filter(([,v])=>!v.ru||!v.en||JSON.stringify((v.ru.match(/\{\w+\}/g)||[]).sort())!==JSON.stringify((v.en.match(/\{\w+\}/g)||[]).sort())).map(([k])=>k),hold:PARAMETERS['instrument.sustain'].label,scale:SCALE_PRESETS.find(p=>p.sourceName==='12 равных полутонов')?.ratios.length};});assert.deepEqual(contract.bad,[]);assert.equal(contract.hold,'hold');assert.equal(contract.scale,13);

 const library = await page.evaluate(async()=>{
   const p=await import('/src/music/instrumentPresets.ts'),{setLocale}=await import('/src/i18n/index.ts'),{presetMatches}=await import('/src/music/soundSearch.ts');
   const canonical=JSON.stringify(p.INSTRUMENT_PRESETS),english=p.loadFactoryPresets(),preset=english.find(p=>p.id==='factory-v39-012');
   const snapshot=JSON.stringify(preset.track),results={count:english.length,kick:preset.name,bilingual:presetMatches(preset,'бочка')&&presetMatches(preset,'kick'),untranslated:english.filter(p=>/[А-Яа-яЁё]/.test(p.name+' '+p.hint)).map(p=>p.id)};
   p.renamePreset(preset.id,'Моя бочка 日本語');setLocale('ru');
   results.overrideRu=p.loadFactoryPresets().find(p=>p.id===preset.id).name;
   setLocale('en');results.overrideEn=p.loadFactoryPresets().find(p=>p.id===preset.id).name;
   p.resetFactoryName(preset.id);results.reset=p.loadFactoryPresets().find(p=>p.id===preset.id).name;
   results.canonicalUnchanged=JSON.stringify(p.INSTRUMENT_PRESETS)===canonical;
   results.soundUnchanged=JSON.stringify(p.loadFactoryPresets().find(p=>p.id===preset.id).track)===snapshot;
   return results;
 });
 assert.equal(library.count,209);assert.equal(library.kick,'kick');assert.equal(library.bilingual,true);assert.deepEqual(library.untranslated,[]);assert.equal(library.overrideRu,'Моя бочка 日本語');assert.equal(library.overrideEn,library.overrideRu);assert.equal(library.reset,'kick');assert.equal(library.canonicalUnchanged,true);assert.equal(library.soundUnchanged,true);
 await page.getByRole('button',{name:'instruments',exact:true}).click();
 await page.screenshot({path:root+'/tmp/locale-library-en-1440.png'});
 console.log('Factory library contract',library);
 await page.screenshot({path:root+'/tmp/locale-core-en-1440.png'});await page.setViewportSize({width:1024,height:900});await page.screenshot({path:root+'/tmp/locale-core-en-1024.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=1024));
 await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.getByRole('menuitem',{name:'Settings',exact:true}).count(),1);
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Русский',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'Файл',exact:true}).count(),1);assert.equal(await page.locator('.track-name').first().inputValue(),'Мой трек 日本語');
 assert.deepEqual(errors,[]);console.log('PASS localization library: live switch, reload, unchanged project/user names, memoized track rows, parameter getters, default tuning, placeholders, 1024/1440',contract);
}finally{await browser?.close();vite.kill();}
