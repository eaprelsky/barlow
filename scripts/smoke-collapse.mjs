// Регрессия залипания свёрнутой дорожки: после «очистить всё» + «+ трек»
// карточка должна быть развёрнута, а клик «развернуть» обязан пробивать
// форс-свёрнутость режима редактора волны.
//
//   npm run smoke   (сам поднимает vite на :5193 и гасит его)
//
// Сценарий бага: режим редактора форсит свёрнутость чужих дорожек; висячий
// id редактора (после очистки/удаления/undo) держал все новые треки
// свёрнутыми, а клик разворота крутил ui.collapsed, который игнорировался.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BROWSER =
  process.env.BARLOW_BROWSER ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5193;

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

const vite = spawn(process.execPath, [ROOT + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  // Онбординг помечаем пройденным: тесты кликают по интерфейсу свободно,
  // гиды и их блокировщики кликов им не соперники.
  await page.addInitScript(() => {
    localStorage.setItem(
      'barlow.onboarding.v1',
      JSON.stringify({ invited: true, seen: { main: true } }),
    );
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const results = [];
  let ok = true;
  const check = (name, pass, info = '') => {
    ok = ok && pass;
    results.push(`${pass ? 'ok' : 'FAIL'} — ${name}${info ? ` (${info})` : ''}`);
  };
  const state = () =>
    page.evaluate(() => ({
      collapsed: document.querySelectorAll('.track.collapsed').length,
      expanded: document.querySelectorAll('.track:not(.collapsed)').length,
      editor: document.querySelectorAll('.wave-editor').length,
    }));
  const clearAll = async () => {
    await page.locator('.main-menu-group button', { hasText: 'файл' }).click();
    await page.waitForTimeout(150);
    await page.locator('[role="menu"] button', { hasText: 'новый' }).click();
    await page.waitForTimeout(300);
  };
  const addTrack = async () => {
    // «+ трек» добавляет дорожку сразу, без браузера инструментов
    await page.locator('.add-track').click();
    await page.waitForTimeout(400);
  };

  // A: редактор инструмента (открывается из «трек» → «инструмент») → очистить всё
  // → + трек: новый трек развёрнут.
  await page.locator('[data-ob="mode-inst"]').first().click();
  await page.waitForTimeout(300);
  await clearAll();
  await addTrack();
  let st = await state();
  check('A: после очистки+добавления трек развёрнут', st.collapsed === 0 && st.expanded === 1, JSON.stringify(st));

  // B: чистый сценарий без редактора.
  await clearAll();
  await addTrack();
  st = await state();
  check('B: чистый сценарий — трек развёрнут', st.collapsed === 0 && st.expanded === 1, JSON.stringify(st));

  // C: пробой кликом — редактор открыт, клик «развернуть» по чужой
  // свёрнутой дорожке закрывает редактор и разворачивает её.
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await addTrack(); // нужна вторая дорожка — будет форс-свёрнута
  await page.locator('[data-ob="mode-inst"]').first().click();
  await page.waitForTimeout(300);
  st = await state();
  const others = st.collapsed;
  check('C: подготовка — чужие дорожки свернулись', others >= 1 && st.editor === 1, JSON.stringify(st));
  await page.getByTitle('Развернуть дорожку').first().click();
  await page.waitForTimeout(300);
  st = await state();
  check('C: клик пробивает режим — редактор закрыт, дорожка развёрнута', st.editor === 0 && st.collapsed === 0, JSON.stringify(st));

  // Обычное сворачивание/разворачивание не сломалось.
  await page.getByTitle('Свернуть дорожку').first().click();
  await page.waitForTimeout(200);
  st = await state();
  check('D: обычное сворачивание работает', st.collapsed === 1, JSON.stringify(st));
  await page.getByTitle('Развернуть дорожку').first().click();
  await page.waitForTimeout(200);
  st = await state();
  check('D: обычное разворачивание работает', st.expanded >= 1 && st.collapsed === 0, JSON.stringify(st));

  await browser.close();
  console.log(results.join('\n'));
  if (errors.length) {
    console.log('JS errors:\n' + errors.slice(0, 5).join('\n'));
    process.exitCode = 1;
  }
  if (process.exitCode !== 1) process.exitCode = ok ? 0 : 1;
} finally {
  await browser?.close();
  vite.kill();
}
