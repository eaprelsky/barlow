import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { shell: true, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { const r = await fetch('http://localhost:5199/'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
const fixture = JSON.parse(readFileSync('fixtures/fixture-patch.json', 'utf8'));
const out = await page.evaluate(async (fixture) => {
  const { AudioEngine } = await import('/src/audio/engine.ts');
  const { PATCH_VERSION } = await import('/src/types.ts');
  const t1 = JSON.parse(JSON.stringify(fixture.tracks[0]));
  const patch = { ...fixture, version: PATCH_VERSION, tracks: [t1] };
  const eng = new AudioEngine();
  const blob = await eng.renderToWav(patch, 's1', 2);
  const ab = await blob.arrayBuffer();
  const view = new DataView(ab);
  const numCh = view.getUint16(22, true);
  const dataLen = view.getUint32(40, true) / 2;
  const d = new Float32Array(dataLen / numCh);
  let off = 44;
  for (let i = 0; i < dataLen / numCh; i++) { d[i] = view.getInt16(off, true) / 0x8000; off += 2 * numCh; }
  return [...d.slice(2205, 2205 + 800)].map((v) => +v.toFixed(5));
}, fixture);
writeFileSync('fixtures/tmp-web-start.json', JSON.stringify(out));
console.log('saved', out.length, 'first nonzero i =', out.findIndex((v) => Math.abs(v) > 0.0005));
await browser.close();
vite.kill();
