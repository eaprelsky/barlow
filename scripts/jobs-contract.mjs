import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('..', import.meta.url));
const port = 5199;
const vite = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ready) throw new Error('Vite timeout');
  browser = await chromium.launch({ executablePath: process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => localStorage.setItem('barlow.onboarding.v1', JSON.stringify({ invited: true, seen: { main: true } })));
  await page.addInitScript(() => localStorage.setItem('barlow.ai.v1',JSON.stringify({providerId:'fal',keys:{fal:'mock-only'}})));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.evaluate(async()=>{
    const {PROVIDERS}=await import('/src/ai/providers.ts');
    window.jobCalls=0;
    PROVIDERS[0].generate=({signal})=>{window.jobCalls++;window.jobSignal=signal;return new Promise(resolve=>window.finishJob=resolve);};
  });
  await page.locator('[data-ob="mode-inst"]').first().click();
  await page.locator('.src-seg').getByRole('button',{name:'сэмпл',exact:true}).click();
  const prompt=page.locator('.gen-bar input.gen-prompt');
  await prompt.fill('test job');await prompt.press('Enter');await prompt.press('Enter');
  assert.equal(await page.evaluate(()=>window.jobCalls),1);
  await page.getByRole('button',{name:'прекратить ожидание',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.jobSignal.aborted),true);
  await page.evaluate(()=>window.finishJob(new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'})));
  await prompt.press('Enter');assert.equal(await page.evaluate(()=>window.jobCalls),2);
  // Change the instrument while generation is in flight, then resolve locally.
  await page.locator('.src-seg').getByRole('button',{name:'волна',exact:true}).click();
  await page.evaluate(()=>window.finishJob(new Blob([new Uint8Array([4,5,6])],{type:'audio/wav'})));
  const changed=page.getByRole('dialog',{name:'инструмент изменился'});
  await changed.waitFor({state:'visible'});
  await changed.getByRole('button',{name:'оставить в библиотеке',exact:true}).click();
  assert.ok((await page.locator('.src-seg').getByRole('button',{name:'волна',exact:true}).getAttribute('class')).includes('on'));
  console.log('PASS duplicate Enter guarded, cancellation aborts, late result requires explicit application');
  const gate=await page.evaluate(async()=>{
    const {SampleJobs,abortableDelay}=await import('/src/ai/jobs.ts');
    const jobs=new SampleJobs(),a=jobs.begin('track');const duplicate=jobs.begin('track');jobs.cancel('track');const b=jobs.begin('track');
    const oldCanFinish=jobs.finish('track',a);const current=jobs.current('track',b);
    let aborted=false;const wait=abortableDelay(10000,b.signal).catch(()=>{aborted=true;});jobs.cancelAll();await wait;
    return{duplicate,oldCanFinish,current,aborted};
  });
  assert.deepEqual(gate,{duplicate:null,oldCanFinish:false,current:true,aborted:true});
  await page.locator('.src-seg').getByRole('button',{name:'сэмпл',exact:true}).click();
  await page.locator('.sample-zones > summary').click();
  await page.getByRole('button',{name:'+ зона из библиотеки',exact:true}).click();
  assert.equal(await page.locator('.sample-zones fieldset').count(),1);
  await page.screenshot({path:root+'/tmp/sampler-v43.png',fullPage:false});
  await page.evaluate(async()=>{
    const {AudioEngine}=await import('/src/audio/engine.ts');window.playCalls=0;
    AudioEngine.prototype.ensureSamples=()=>new Promise(resolve=>window.finishPreparing=resolve);
    AudioEngine.prototype.play=()=>{window.playCalls++;};
  });
  await page.locator('[data-ob="play"]').click();
  assert.equal(await page.locator('[data-ob="play"]').getAttribute('aria-label'),'Отменить подготовку');
  await page.locator('[data-ob="play"]').click();
  await page.evaluate(async()=>{window.finishPreparing();await Promise.resolve();});
  assert.equal(await page.evaluate(()=>window.playCalls),0);
  await page.locator('[data-ob="play"]').click();
  const bpm=page.locator('[data-ob="bpm"] input');await bpm.fill('132');await bpm.press('Tab');
  await page.evaluate(async()=>{window.finishPreparing();await Promise.resolve();});
  assert.equal(await page.evaluate(()=>window.playCalls),0);
  console.log('PASS zone editor and pending playback cancel/revision guard');
  assert.deepEqual(errors,[]);console.log('jobs-contract: PASS');
} finally {await browser?.close();vite.kill();}
