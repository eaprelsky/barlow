// Regression tests assert musical invariants against actual offline PCM.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 5198;
mkdirSync(root + '/tmp', { recursive: true });
writeFileSync(root + '/tmp/audio-contract.html', '<!doctype html><meta charset="utf-8"><title>Audio contract fixture</title>');
const vite = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (vite.exitCode !== null) throw new Error('Vite exited before readiness');
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ready) throw new Error('Vite readiness timeout');
  browser = await chromium.launch({ executablePath: process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/tmp/audio-contract.html`);
  const result = await page.evaluate(async () => {
    const { INSTRUMENT_PRESETS } = await import('/src/music/instrumentPresets.ts');
    const { instrumentOfFields } = await import('/src/types.ts');
    const { makeChain } = await import('/src/audio/fx.ts');
    const { triggerVoice } = await import('/src/audio/voices.ts');
    const ids=new Set(), rows=[];
    for (const p of INSTRUMENT_PRESETS) {
      if(p.track.waveform==='sample' && !p.track.sampleId) continue;
      const ctx=new OfflineAudioContext(2,220500,44100);
      const noise=ctx.createBuffer(1,88200,44100);
      let seed=77; const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
      const data=noise.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=random()*2-1;
      const st={id:'qa',name:p.name,volume:.8,pan:.5,scale:[1,1.5],scaleOctUp:0,scaleOctDown:0,rate:1,patterns:[],effects:[],mods:[],freq:p.track.freq??220,...p.track,...instrumentOfFields(p.track,'qa-i',p.name)};
      const chain=makeChain(ctx,st,ctx.destination,120);
      const old=Math.random; Math.random=random;
      try { triggerVoice(ctx,chain,noise,null,st,[{n:0,vel:.9,prob:1}],.02,.125); } finally { Math.random=old; }
      const rendered=await ctx.startRendering(); let sum=0,peak=0,finite=true;
      for(let ch=0;ch<2;ch++) for(const x of rendered.getChannelData(ch)) {sum+=x*x;peak=Math.max(peak,Math.abs(x));finite&&=Number.isFinite(x);}
      const rms=Math.sqrt(sum/(rendered.length*2));
      rows.push({id:p.id,name:p.name,rms,peak,pass:!!p.id&&!ids.has(p.id)&&finite&&peak>1e-4&&peak<1.01});
      ids.add(p.id);
    }
    return rows;
  });

  writeFileSync(root + '/tmp/bank-qa.json', JSON.stringify(result, null, 2));
  for (const r of result) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name} RMS=${r.rms.toFixed(5)} peak=${r.peak.toFixed(4)}`);
  console.log(`bank: ${result.filter(r=>r.pass).length}/${result.length}`);
  if (result.length !== 120 || result.some(r=>!r.pass)) process.exitCode=1;
} finally { await browser?.close(); vite.kill(); }
