// Смоук дебаг-моста: bridge-host (WS) + vite + headless-браузер с barlow.
// Проверяет круг «приложение ↔ мост»: подключение, hello с патчем,
// точечную правку (set_param → patch в localStorage), транспорт (bpm),
// события нот (play → noteSink). Порт моста свой, чтобы не мешать
// запущенному MCP: приложение берёт его через window.__BARLOW_BRIDGE_PORT.
//
//   node scripts/smoke-bridge.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { makeBridgeHost } from './lib/bridge-host.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BROWSER =
  process.env.BARLOW_BROWSER ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5192;
const BRIDGE_PORT = 22856;

const fail = (msg) => {
  console.error('smoke-bridge: FAIL —', msg);
  process.exitCode = 1;
};

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* ещё не поднялся */
    }
    await delay(500);
  }
  throw new Error('vite dev-сервер не поднялся на ' + url);
}

const bridge = makeBridgeHost(BRIDGE_PORT);
const vite = spawn(process.execPath, [ROOT + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
});
let browser = null;

try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const page = await browser.newPage();
  // Порт моста для страницы — до загрузки скриптов.
  await page.addInitScript((p) => {
    window.__BARLOW_BRIDGE_PORT = p;
  }, BRIDGE_PORT);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });

  // 1. Приложение подключилось и прислало hello с патчем.
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    await delay(250);
    ok = bridge.state.connected && !!bridge.state.patch;
  }
  if (!ok) fail('приложение не подключилось к мосту за 5 с');
  else console.log('1. подключение и hello: ок, дорожек в патче:', bridge.state.patch.tracks.length);

  // 2. Точечная правка: агент двигает bpm — приложение применяет через setPatch.
  const before = bridge.state.patch.bpm;
  const target = before === 140 ? 141 : 140;
  const r = await bridge.request({ type: 'set_param', pointer: '/bpm', value: target });
  if (!r.ok) fail('set_param не подтверждён: ' + r.error);
  // Autosave is deliberately debounced by 400 ms; wait for observable
  // persistence, not an equal-duration timer racing the React effect.
  await page.waitForFunction((bpm) => {
    try { return JSON.parse(localStorage.getItem('barlow.patch.v12') ?? '{}').bpm === bpm; }
    catch { return false; }
  }, target, { timeout: 3000 });
  const stored = await page.evaluate(() => {
    for (let i = 0; i < 30; i++) {
      const raw = localStorage.getItem('barlow.patch.v12');
      if (raw) return JSON.parse(raw);
    }
    return null;
  });
  if (stored?.bpm !== target) fail(`bpm в приложении не поменялся: ${stored?.bpm} ≠ ${target}`);
  else console.log(`2. set_param /bpm ${before} → ${target}: ок`);

  // 3. Ошибочный путь — приложение отвечает ошибкой, патч не ломается.
  const bad = await bridge.request({ type: 'set_param', pointer: '/nope/xxx', value: 1 });
  if (bad.ok) fail('set_param по битому пути почему-то успешен');
  else console.log('3. set_param по битому пути отклонён: ок');

  // 4. Транспорт: play — поедут события нот (noteSink).
  const rPlay = await bridge.request({ type: 'transport', action: 'play' });
  if (!rPlay.ok) fail('play не подтверждён: ' + rPlay.error);
  await delay(1500);
  if (!bridge.state.transport.playing) fail('транспорт после play не играет (мост не получил состояние)');
  const noteCount = bridge.state.notes.length;
  if (noteCount === 0) fail('ноты после play не пришли');
  else console.log(`4. play: ок, событий нот за 1.5 с — ${noteCount} (пример:`, JSON.stringify(bridge.state.notes.at(-1)), ')');

  const rStop = await bridge.request({ type: 'transport', action: 'stop' });
  if (!rStop.ok) fail('stop не подтверждён: ' + rStop.error);
  await delay(300);
  if (bridge.state.transport.playing) fail('транспорт после stop играет');
  else console.log('5. stop: ок');

  if (process.exitCode !== 1) console.log('smoke-bridge: PASS');
} catch (e) {
  fail(e?.message ?? String(e));
} finally {
  if (browser) await browser.close();
  vite.kill();
  await bridge.close();
}
