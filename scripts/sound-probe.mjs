// Дебаг-зонд звука: JSON-патч → оффлайн-рендер (renderToWav) → таблица
// «время → доминирующие частоты + RMS». Видно, где тон съезжает, глушится
// или перетриггеривается. По образцу golden.mjs: поднимает vite, рендерит
// в headless-браузере тем же triggerVoice, что и live.
//
//   node scripts/sound-probe.mjs patch.json [bars]
//   node scripts/sound-probe.mjs - '{"bpm":120, ...}'   — патч из строки
//
// Браузер: Edge, переопределяется BARLOW_BROWSER.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BROWSER =
  process.env.BARLOW_BROWSER ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5199;

const arg = process.argv[2] ?? '';
if (!arg) {
  console.error('использование: node scripts/sound-probe.mjs patch.json [bars]');
  process.exit(1);
}
const PATCH = arg === '-' ? JSON.parse(process.argv[3] ?? '{}') : JSON.parse(readFileSync(arg, 'utf8'));
const BARS = Number(process.argv[3] ?? 2) || 2;

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

  const result = await page.evaluate(
    async ({ patchTemplate, bars }) => {
      const { AudioEngine } = await import('/src/audio/engine.ts');
      const { PATCH_VERSION, normalizePatch } = await import('/src/types.ts');
      const { fft } = await import('/src/music/fft.ts');
      const patch = normalizePatch({ ...patchTemplate, version: PATCH_VERSION });
      const eng = new AudioEngine();
      const blob = await eng.renderToWav(patch, patch.scenes[0]?.id ?? 's1', bars);
      const ab = await blob.arrayBuffer();
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
      const d = chans[0];
      const rate = 44100;
      // Окно Ханна 8192 (~186 мс), hop 2048 (~46 мс): топ-3 пика + RMS.
      const N = 8192;
      const win = new Float64Array(N);
      for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      const rows = [];
      for (let s = 0; s + N <= d.length; s += 2048) {
        const re = new Float64Array(N);
        const im = new Float64Array(N);
        let sum = 0;
        for (let i = 0; i < N; i++) {
          re[i] = d[s + i] * win[i];
          sum += d[s + i] * d[s + i];
        }
        fft(re, im);
        const mag = new Float64Array(N / 2);
        for (let i = 1; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
        const idx = [...mag.keys()].sort((a, b) => mag[b] - mag[a]).slice(0, 3);
        rows.push({
          t: s / rate,
          rms: Math.sqrt(sum / N),
          peaks: idx.map((i) => ({
            hz: (i * rate) / N,
            db: 20 * Math.log10(mag[i] / (N / 4) || 1e-9),
          })),
        });
      }
      return { rows, seconds: d.length / rate };
    },
    { patchTemplate: PATCH, bars: BARS },
  );

  await browser.close();

  console.log(`рендер: ${result.seconds.toFixed(2)} с`);
  console.log('   t, с     RMS     пик1, Гц (дБ)      пик2              пик3');
  for (const r of result.rows) {
    const p = r.peaks
      .map((p) => `${p.hz.toFixed(1).padStart(7)} (${p.db.toFixed(0)})`)
      .join('  ');
    console.log(
      `${r.t.toFixed(3).padStart(7)}  ${r.rms.toFixed(4).padEnd(8)} ${p}`,
    );
  }
} catch (e) {
  console.error('sound-probe: ошибка —', e && e.message);
  process.exit(1);
} finally {
  vite.kill();
}
