import assert from 'node:assert/strict';import{spawn}from'node:child_process';import{fileURLToPath}from'node:url';import{setTimeout as delay}from'node:timers/promises';import{chromium}from'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5207,vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('barlow.locale.v1','en');localStorage.setItem('barlow.onboarding.v1',JSON.stringify({invited:true,seen:{main:true}}));});await page.goto(`http://127.0.0.1:${port}`);
 const capture=async(name)=>{for(const theme of ['dark','light']){await page.evaluate(async theme=>(await import('/src/theme.ts')).setTheme(theme),theme);for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:root+`/tmp/locale-${name}-${theme}-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name);assert.ok(!/\{p\d+\}/.test(await page.locator('body').innerText()),'unresolved placeholder: '+name);}}};
 await page.getByRole('button',{name:'mixer',exact:true}).click();await capture('mixer');await page.getByRole('button',{name:'mixer',exact:true}).click();
 await page.locator('[data-ob="mode-inst"]').first().click();await page.locator('.macro-editor > summary').click();
 await page.locator('[data-help="macro-defaults"]').click();assert.deepEqual(await page.locator('.macro-head .sub-cap').allTextContents(),['1 assignment','1 assignment','2 assignments']);await capture('source');
 await page.keyboard.press('Escape');await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Sound workshop…',exact:true}).click();await capture('workshop');await page.keyboard.press('Escape');
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Audio and connections',exact:true}).click();await capture('settings');
 assert.deepEqual(errors,[]);console.log('PASS English layouts: mixer, source/macros, workshop, settings; dark/light; 1024/1440; no unresolved placeholders');
}finally{await browser?.close();vite.kill();}
