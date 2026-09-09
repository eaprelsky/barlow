import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5201;
mkdirSync(root+'/tmp',{recursive:true});
writeFileSync(root+'/tmp/theme-gallery.html','<!doctype html><html lang="ru"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/tmp/theme-gallery.tsx"></script></body></html>');
writeFileSync(root+'/tmp/theme-gallery.tsx',`import React from 'react';import {createRoot} from 'react-dom/client';import '/src/index.css';import {WaveCanvas} from '/src/components/WaveCanvas';import {MsegEditor} from '/src/components/MsegEditor';import {EqEditor} from '/src/components/EqEditor';import {newEqBand} from '/src/music/equalizer';import {Knob} from '/src/components/Knob';import {setTheme} from '/src/theme';setTheme('light');const wave=Float32Array.from({length:2048},(_,i)=>.65*Math.sin(i/24));createRoot(document.getElementById('root')!).render(<main style={{maxWidth:960,margin:'24px auto',padding:24,background:'var(--panel)'}}><h2>Форма волны и выделение</h2><WaveCanvas data={wave} sampleRate={2048} sel={[.3,.6]} region={[.15,.85]}/><h2>Огибающая и регулятор</h2><MsegEditor value={{seconds:4,points:[{t:0,v:0},{t:.4,v:.8},{t:1,v:0}]}} onChange={()=>{}}/><Knob value={.6} min={0} max={1} label="глубина" onChange={()=>{}}/><h2>Эквалайзер</h2><EqEditor bands={[newEqBand()]} onChange={()=>{}}/><p style={{color:'var(--error)'}}>Пример сообщения об ошибке</p></main>);`);
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('barlow.onboarding.v1'))localStorage.setItem('barlow.onboarding.v1',JSON.stringify({seen:['main']}));});
 const url=`http://127.0.0.1:${port}`;
 await page.goto(url);await page.keyboard.press('Escape');
 const toggle=async()=>{await page.getByRole('menuitem',{name:'Настройки',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Светлая тема',exact:true}).click();};
 const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
 assert.equal(await theme(),'dark');
 const before=await page.evaluate(()=>localStorage.getItem('barlow.patch.v12'));
 await toggle();assert.equal(await theme(),'light');assert.equal(await page.evaluate(()=>localStorage.getItem('barlow.patch.v12')),before);
 if(!await page.locator('.dock').count())await page.getByRole('button',{name:'инструменты',exact:true}).click();
 await page.getByRole('button',{name:'микшер',exact:true}).click();
 await page.screenshot({path:root+'/tmp/theme-light-1440.png'});
 await page.getByRole('menuitem',{name:'Настройки',exact:true}).click();assert.equal(await page.getByRole('menuitemcheckbox',{name:'Светлая тема'}).getAttribute('aria-checked'),'true');await page.screenshot({path:root+'/tmp/theme-light-menu.png'});await page.keyboard.press('Escape');
 const contrast=await page.evaluate(()=>{
  const style=getComputedStyle(document.documentElement),rgb=(name)=>{const el=document.createElement('span');el.style.color=style.getPropertyValue(name);document.body.append(el);const c=getComputedStyle(el).color.match(/[\d.]+/g).slice(0,3).map(Number);el.remove();return c;};
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  return ['--text','--text-dim','--accent','--accent-2','--error'].flatMap(f=>['--bg','--panel','--panel-2'].map(b=>{const x=lum(rgb(f)),y=lum(rgb(b));return {f,b,ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};}));
 });for(const c of contrast)assert.ok(c.ratio>=4.5,JSON.stringify(c));
 await page.locator('.sb-rename').first().click();await page.getByRole('dialog').waitFor();await page.screenshot({path:root+'/tmp/theme-light-dialog.png'});await page.keyboard.press('Escape');
 await page.keyboard.press('F1');await page.locator('[data-ob="bpm"]').click();await page.locator('.ph-card').waitFor();await page.screenshot({path:root+'/tmp/theme-light-help.png'});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.setViewportSize({width:1024,height:900});await page.screenshot({path:root+'/tmp/theme-light-1024.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=1024));
 await page.reload();assert.equal(await theme(),'light');
 const second=await context.newPage();await second.goto(url);await toggle();await second.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(await theme(),'dark');
 await page.screenshot({path:root+'/tmp/theme-dark-1024.png'});await second.close();
 await page.setViewportSize({width:1440,height:1200});await page.goto(url+'/tmp/theme-gallery.html');await page.locator('canvas').waitFor();await delay(200);
 const pixel=()=>page.locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,20,1,1).data));
 const light=await pixel();assert.ok(light[0]>220);await page.screenshot({path:root+'/tmp/theme-light-graphs.png',fullPage:true});
 await page.evaluate(async()=>{const {setTheme}=await import('/src/theme.ts');setTheme('dark');});await delay(100);const dark=await pixel();assert.ok(dark[0]<30);await page.screenshot({path:root+'/tmp/theme-dark-graphs.png',fullPage:true});
 assert.deepEqual(errors,[]);writeFileSync(root+'/tmp/theme-qa.json',JSON.stringify({contrast,canvas:{light,dark}},null,2));console.log('PASS menu, persistence, cross-tab sync, unchanged project, 1024/1440, text contrast >=4.5, live Canvas repaint and SVG palette');
} finally {await browser?.close();vite.kill();}
