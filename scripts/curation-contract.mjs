// Regression tests assert musical invariants against actual offline PCM.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 5197;
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
    const { soundForAudition } = await import('/src/music/audition.ts');
    const { defaultPatch } = await import('/src/music/defaultPatch.ts');
    const { makeChain } = await import('/src/audio/fx.ts');
    const { triggerVoice, duckVoice } = await import('/src/audio/voices.ts');
    const target = defaultPatch().tracks[0], rows = [];
    for (const name of ['саб без атаки', 'воббл-бас']) {
      const preset = INSTRUMENT_PRESETS.find(p => p.name === name);
      for (const hz of [35, 55, 110]) for (const retrigger of [false, true]) {
        const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
        const st = { ...soundForAudition(target, preset), freq: hz };
        const noise = ctx.createBuffer(1, 44100, 44100);
        const chain = makeChain(ctx, st, ctx.destination, 120);
        const voice = triggerVoice(ctx, chain, noise, null, st, [{n:0,vel:.9,prob:1,len:2}], .05, .125);
        if (retrigger) {
          duckVoice(voice, .18);
          triggerVoice(ctx, chain, noise, null, st, [{n:0,vel:.9,prob:1,len:2}], .18, .125);
        }
        const pcm = (await ctx.startRendering()).getChannelData(0);
        let peak = 0, jump = 0, tail = 0;
        for (let i=1;i<pcm.length;i++) {
          peak = Math.max(peak, Math.abs(pcm[i]));
          jump = Math.max(jump, Math.abs(pcm[i]-pcm[i-1]));
          if (i>44100) tail = Math.max(tail,Math.abs(pcm[i]));
        }
        // A sample discontinuity is distinct from a musical attack: a conservative
        // limit catches hard cuts while allowing harmonics in the distorted bass.
        rows.push({name,hz,retrigger,peak,jump,tail,pass:Number.isFinite(peak)&&peak>.001&&peak<1&&jump<.08&&tail<.001});
      }
    }
    return rows;
  });
  writeFileSync(root + '/tmp/curation-qa.json', JSON.stringify(result, null, 2));
  for (const row of result) console.log(JSON.stringify(row));
  if (result.some(r=>!r.pass)) process.exitCode=1;
} finally { await browser?.close(); vite.kill(); }
