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
const UPDATE = process.argv.includes('--update');
const BROWSER =
  process.env.BARLOW_BROWSER ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5199;

// Фикс-патч: только детерминированные узлы (осцилляторы, фильтры, delay,
// LFO-модуляции, мастер-компрессия). Шум, реверб (случайный IR),
// вероятность < 1, сэмплы и скрэтч — недетерминированы, в эталон не входят.
const FIXTURE_PATCH = {
  version: 0, // подставляется из PATCH_VERSION на странице
  bpm: 120,
  masterVolume: 1,
  masterComp: 0.3,
  masterPan: 0.5,
  masterNoise: 'off',
  followChain: false,
  title: 'golden',
  scenes: [{ id: 's1', name: 'a', slots: { t1: 'p1', t2: 'p2', t3: 'p3' } }],
  chain: [{ sceneId: 's1', bars: 2 }],
  tracks: [
    {
      id: 't1', name: 'bass', rate: 4, phase: 0, waveform: 'sine',
      scale: [1], scaleOctUp: 0, scaleOctDown: 0, freq: 55,
      attack: 0.002, decay: 0.3, sustain: 0.2,
      pitchDrop: 2.5, pitchTime: 0.08, noteSteps: 1,
      filterLow: 30, filterFreq: 900, volume: 0.8, pan: 0.5,
      mods: [], effects: [], mono: true, vibratoRate: 5, vibratoDepth: 0,
      patterns: [{
        id: 'p1', name: 'A', length: 8,
        steps: Array.from({ length: 8 }, (_, i) =>
          i === 0 || i === 3 || i === 6 ? { notes: [{ n: 0, vel: 0.8, prob: 1 }] } : { notes: [] },
        ),
      }],
    },
    {
      id: 't2', name: 'lead', rate: 2, phase: 0, waveform: 'triangle',
      scale: [1, 1.25, 1.5], scaleOctUp: 0, scaleOctDown: 0, freq: 330,
      attack: 0.004, decay: 0.25, sustain: 0.3,
      pitchDrop: 1, pitchTime: 0.08, noteSteps: 1,
      filterLow: 40, filterFreq: 6000, volume: 0.6, pan: 0.5,
      mods: [{ target: 'pan', source: 'lfo', shape: 'sine', rate: 0.5, depth: 0.6 }],
      effects: [{ type: 'delay', timeSec: 0.25, feedback: 0.4, mix: 0.3 }],
      mono: false, vibratoRate: 5, vibratoDepth: 12,
      patterns: [{
        id: 'p2', name: 'A', length: 8,
        steps: [
          { notes: [{ n: 2, vel: 0.7, prob: 1 }] },
          { notes: [] },
          { notes: [{ n: 1, vel: 0.7, prob: 1 }] },
          { notes: [] },
          { notes: [{ n: 0, vel: 0.7, prob: 1 }, { n: 2, vel: 0.6, prob: 1 }] },
          { notes: [] },
          { notes: [{ n: 1, vel: 0.7, prob: 1 }] },
          { notes: [] },
        ],
      }],
    },
    {
      id: 't3', name: 'fm', rate: 1, phase: 0, waveform: 'fm',
      scale: [1, 1.5], scaleOctUp: 0, scaleOctDown: 0, freq: 174,
      fmRatio: 2, fmIndex: 3,
      attack: 0.001, decay: 0.5, sustain: 0,
      pitchDrop: 1, pitchTime: 0.08, noteSteps: 2,
      filterLow: 40, filterFreq: 9000, volume: 0.5, pan: 0.4,
      mods: [], effects: [], mono: false, vibratoRate: 5, vibratoDepth: 0,
      patterns: [{
        id: 'p3', name: 'A', length: 8,
        steps: [2, 5].flatMap((n) => [{ notes: [{ n, vel: 0.75, prob: 1 }] }, { notes: [] }]),
      }],
    },
  ],
};

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
