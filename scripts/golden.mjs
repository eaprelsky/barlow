// Golden-рендеры: фикс-патч → WAV (renderToWav) → отпечаток (RMS по блокам
// + пик). Отпечаток устойчив к платформенным различиям float-DSP, но ловит
// любое смысловое изменение синтеза. Это контракт для рефакторингов и
// будущей сверки с Rust-движком.
//
//   npm run golden          — сверка с fixtures/golden.json
//   npm run golden -- --update — перезаписать эталон (осознанно!)
//
// Браузер: Edge (chromium). Путь можно переопределить BARLOW_BROWSER=...

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/golden.json', import.meta.url));
const FIXTURE_PATCH_FILE = fileURLToPath(new URL('../fixtures/fixture-patch.json', import.meta.url));
const UPDATE = process.argv.includes('--update');
const BROWSER =
  process.env.BARLOW_BROWSER ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5199;

// Фикс-патч: только детерминированные узлы (осцилляторы, фильтры, delay,
// LFO-модуляции, мастер-компрессия). Шум, реверб (случайный IR),
// вероятность < 1, сэмплы и скрэтч — недетерминированы, в эталон не входят.
// Живёт в fixtures/fixture-patch.json: его же читает Rust-golden
// (cargo run --bin golden) — один патч, две реализации, один эталон.
const FIXTURE_PATCH = JSON.parse(readFileSync(FIXTURE_PATCH_FILE, 'utf8'));

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite dev-сервер не поднялся на ' + url);
}

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

try {
  await waitForServer(`http://localhost:${PORT}/`);
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

  const fp = await page.evaluate(async (patchTemplate) => {
    const { AudioEngine } = await import('/src/audio/engine.ts');
    const { PATCH_VERSION } = await import('/src/types.ts');
    const patch = { ...patchTemplate, version: PATCH_VERSION };
    const eng = new AudioEngine();
    const blob = await eng.renderToWav(patch, 's1', 2);
    const ab = await blob.arrayBuffer();
    // WAV: 16-bit PCM stereo, заголовок 44 байта.
    const view = new DataView(ab);
    const numCh = view.getUint16(22, true);
    const dataLen = view.getUint32(40, true) / 2;
    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(new Float32Array(dataLen / numCh));
    let off = 44;
    for (let i = 0; i < dataLen / numCh; i++) {
      for (let c = 0; c < numCh; c++) {
        chans[c][i] = view.getInt16(off, true) / 0x8000;
        off += 2;
      }
    }
    // Отпечаток: RMS по 200 блокам первого канала + пик обоих.
    const d = chans[0];
    const BLOCKS = 200;
    const size = Math.floor(d.length / BLOCKS);
    const blocks = [];
    for (let b = 0; b < BLOCKS; b++) {
      let sum = 0;
      for (let i = b * size; i < (b + 1) * size; i++) sum += d[i] * d[i];
      blocks.push(Number((Math.sqrt(sum / size) || 0).toFixed(6)));
    }
    let peak = 0;
    for (const ch of chans) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    return { blocks, peak: Number(peak.toFixed(6)), samples: d.length, rate: 44100 };
  }, FIXTURE_PATCH);

  await browser.close();

  let ref = null;
  try {
    ref = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  } catch {
    /* эталона ещё нет */
  }
  if (UPDATE || !ref) {
    writeFileSync(FIXTURE, JSON.stringify(fp, null, 1) + '\n');
    console.log('эталон записан:', FIXTURE, `peak=${fp.peak} samples=${fp.samples}`);
    process.exit(0);
  }
  let worst = 0;
  for (let i = 0; i < ref.blocks.length; i++) {
    worst = Math.max(worst, Math.abs(ref.blocks[i] - fp.blocks[i]));
  }
  const peakDrift = Math.abs(ref.peak - fp.peak);
  const ok = worst <= 0.002 && peakDrift <= 0.01 && ref.samples === fp.samples;
  console.log(`golden: ${ok ? 'PASS' : 'FAIL'} — макс. дрейф RMS-блока ${worst.toExponential(2)}, пик ${peakDrift.toExponential(2)}, сэмплов ${fp.samples}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error('golden: ошибка —', e && e.message);
  process.exit(1);
} finally {
  vite.kill();
}
