// Одноразовый смоук-тест волны 1: ползунки⇄поля, огибающая сцены, октавы.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BROWSER =
  process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const APP_URL = 'http://localhost:5199/';
const SHOT = new URL('./smoke-shot.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
// Онбординг помечаем пройденным — тесты кликают свободно.
await page.addInitScript(() => {
  localStorage.setItem(
    'barlow.onboarding.v1',
    JSON.stringify({ invited: true, seen: { main: true } }),
  );
});
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const results = [];
const ok = (name, pass, info = '') =>
  results.push(`${pass ? 'ok' : 'FAIL'} — ${name}${info ? ` (${info})` : ''}`);

// 1. Приложение отрисовалось: шапка с play-кнопкой и треки.
ok('app renders', (await page.locator('.play-btn').count()) === 1);
ok('tracks rendered', (await page.locator('.track').count()) > 0 || (await page.locator('main .track-card').count()) > 0 || (await page.locator('main > div').count()) > 0);

// 2. Микшер: ползунки есть, двойной клик по подписи → число.
await page.getByTitle(/Микшер-рэк/).click();
await page.waitForTimeout(200);
const mixSliders = await page.locator('.mix-ctl input[type=range]').count();
ok('mixer sliders', mixSliders >= 4, `${mixSliders} sliders`);
const compCap = page.locator('.mix-ctl', { hasText: 'компрессия' }).first().locator('.mc-cap');
const mixNums0 = await page.locator('.mix-ctl input[type=number]').count();
await compCap.dblclick();
await page.waitForTimeout(150);
const mixNums = await page.locator('.mix-ctl input[type=number]').count();
ok('mixer dblclick → number field', mixNums === mixNums0 + 1, `${mixNums0}→${mixNums}`);
await compCap.dblclick();
ok(
  'mixer dblclick back → slider',
  (await page.locator('.mix-ctl input[type=number]').count()) === mixNums0,
);

// 3. Панель шага: поставим ноту кликом по клетке, откроем панель шага,
// у ноты громкость/вероятность — слайдеры, dblclick → число.
await page.locator('.cell').first().click();
await page.waitForTimeout(200);
const colNum = page.locator('.col-num').first();
await colNum.click();
await page.waitForTimeout(200);
const spSliders = await page.locator('.step-panel input[type=range]').count();
ok('step panel sliders', spSliders === 2, `${spSliders}`);
const spNums0 = await page.locator('.step-panel input[type=number]').count();
await page.locator('.step-panel label.sp-field').first().dblclick();
ok(
  'step panel dblclick → number',
  (await page.locator('.step-panel input[type=number]').count()) === spNums0 + 1,
  `${spNums0}→+1`,
);

// 4. Блок эскиза: ручки партии (длина, шаг, вход/выход в сцену) — внутри
// блока эскиза, а не на треке и не во вкладке «тембр». По блоку на трек.
const sbCount = await page.locator('.sketch-bar').count();
const lenCount = await page.locator('[data-ob="length"]').count();
const rateCount = await page.locator('[data-ob="rate"] select').count();
const fadeInField = await page.locator('[data-ob="fade-in"]').count();
const fadeOutField = await page.locator('[data-ob="fade-out"]').count();
ok(
  'sketch bar holds party controls',
  sbCount >= 1 &&
    sbCount === lenCount &&
    lenCount === rateCount &&
    rateCount === fadeInField &&
    fadeInField === fadeOutField,
  `bar=${sbCount} len=${lenCount} rate=${rateCount} in=${fadeInField} out=${fadeOutField}`,
);
// Панель «трек» открывается переключателем сущности, во вкладке
// «инструмент» есть вход в редактор волны.
await page.locator('[data-ob="mode-track"]').first().click();
await page.waitForTimeout(200);
ok('wave editor entry in track view', (await page.locator('[data-ob="we-open"]').count()) === 1);
await page.locator('[data-ob="mode-sketch"]').first().click(); // обратно к эскизу
await page.waitForTimeout(150);
// Модуляции — свёрнутый раздел внутри эскиза.
await page.locator('[data-ob="mods-toggle"]').first().click();
await page.waitForTimeout(150);
ok(
  'mods live in sketch view',
  (await page.locator('[data-ob="mods-list"]').count()) === 1 &&
    (await page.locator('[data-ob="mods-add"]').count()) === 1,
);

// 5. Октавы: добавление вниз не двигает ноты (частота ноты сохраняется).
const autosave = () => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith('barlow.patch.'));
  const raw = JSON.parse(localStorage[keys[0]]);
  const t = raw.tracks[0];
  // scaleOf: базовая шкала × октавы, дедуп, сортировка (как в types.ts).
  const rowsOf = (tr) => {
    const up = tr.scaleOctUp ?? 0;
    const down = tr.scaleOctDown ?? 0;
    const seen = new Set();
    const rows = [];
    for (let o = -down; o <= up; o++) {
      const k = 2 ** o;
      for (const r of tr.scale) {
        const v = +(r * k).toFixed(9);
        if (!seen.has(v)) { seen.add(v); rows.push(v); }
      }
    }
    return rows.sort((a, b) => a - b);
  };
  const pat = t.patterns[0];
  const notes = [];
  for (const s of pat.steps) for (const n of s.notes ?? []) {
    const rows = rowsOf(t);
    notes.push(rows[Math.min(Math.max(Math.round(n.n), 0), rows.length - 1)] * t.freq);
  }
  return { octDown: t.scaleOctDown ?? 0, freqs: notes.map((f) => f.toFixed(4)) };
};

const before = await page.evaluate(autosave);
// «+окт» вниз — вторая кнопка (нижняя) первой дорожки.
const addDown = page.getByTitle('Добавить октаву вниз').first();
await addDown.click();
await page.waitForTimeout(300);
const after = await page.evaluate(autosave);
ok(
  'add octave down keeps note pitches',
  after.octDown === before.octDown + 1 &&
    before.freqs.length > 0 &&
    before.freqs.join(',') === after.freqs.join(','),
  `oct ${before.octDown}→${after.octDown}, notes=${before.freqs.length}`,
);

// 6. Скриншот для визуальной проверки.
await page.screenshot({ path: SHOT, fullPage: false });

await browser.close();
console.log(results.join('\n'));
if (errors.length) {
  console.log('\nJS errors:\n' + errors.slice(0, 10).join('\n'));
}
console.log(`\nshot: ${SHOT}`);
