import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { WebSocketServer } from 'ws';
import { makeBridgeHost } from './lib/bridge-host.mjs';
import { authProof, randomNonce } from '../src/bridgeProtocol.ts';

const root = fileURLToPath(new URL('..', import.meta.url)), port = 5191;
const host = makeBridgeHost(22858), fake = new WebSocketServer({ host: '127.0.0.1', port: 22859 });
const vite = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
const until = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(25); } throw new Error('state timeout'); };
let browser, fakeMode = 'spoof';
const messages = [];
fake.on('connection', ws => {
  const challenge = randomNonce();
  ws.send(JSON.stringify({ type: 'challenge', protocol: 1, challenge }));
  ws.on('message', async raw => {
    const msg = JSON.parse(String(raw)); messages.push(msg);
    if (msg.type === 'authenticate') ws.send(JSON.stringify({ type: 'authenticated', protocol: 1, capabilities: msg.capabilities,
      proof: fakeMode === 'spoof' ? '0'.repeat(64) : await authProof(host.pairingCode, 'server', challenge, msg.nonce, msg.capabilities) }));
    if (msg.type === 'hello') ws.send(JSON.stringify({ type: 'set_param', reqId: 'forbidden', pointer: '/bpm', value: 299 }));
  });
});
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await delay(250); }
  browser = await chromium.launch({ executablePath: process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__BARLOW_BRIDGE_PORT = 22858;
    localStorage.setItem('barlow.onboarding.v1', JSON.stringify({ invited: true, seen: { main: true } }));
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button', { name: 'настройки', exact: true }).click();
  await page.locator('.bridge-settings summary').click();
  assert.equal(host.state.connected, false);
  await page.getByLabel('Код подключения', { exact: true }).fill(host.pairingCode);
  await page.getByRole('button', { name: 'подключить', exact: true }).click();
  await until(() => host.state.connected);
  assert.deepEqual(host.state.capabilities, ['read']);
  assert.equal((await host.request({ type: 'set_param', pointer: '/bpm', value: 150 })).ok, false);
  console.log('PASS explicit pairing defaults to read only');
  await page.getByLabel('редактировать проект', { exact: true }).check();
  await page.getByRole('button', { name: 'подключить', exact: true }).click();
  await until(() => host.state.connected && host.state.capabilities.includes('write'));
  for (const command of [
    { pointer: '/bpm', value: 'invalid' },
    { pointer: '/tracks/0/instrumentId', value: 'missing' },
    { pointer: '/__proto__/polluted', value: true },
    { pointer: '/constructor/prototype/polluted', value: true },
  ]) assert.equal((await host.request({ type: 'set_param', ...command })).ok, false);
  assert.equal(await page.evaluate(() => Object.prototype.polluted), undefined);
  assert.equal((await host.request({ type: 'set_param', pointer: '/bpm', value: 150 })).ok, true);
  await until(() => host.state.patch.bpm === 150);
  console.log('PASS validated parameter writes reject malformed project, dangling references and prototype paths');
  await page.screenshot({ path: root + '/tmp/bridge-settings.png' });
  await page.getByRole('button', { name: 'отключить и забыть код', exact: true }).click();
  await until(() => !host.state.connected);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('barlow.bridge.session.v1')), null);
  assert.deepEqual(errors, []);
  console.log('PASS explicit disconnect forgets session code');
  await page.close();

  const spoofPage = await browser.newPage();
  await spoofPage.addInitScript(code => {
    window.__BARLOW_BRIDGE_PORT = 22859;
    sessionStorage.setItem('barlow.bridge.session.v1', JSON.stringify({ secret: code, capabilities: ['read'] }));
    localStorage.setItem('barlow.onboarding.v1', JSON.stringify({ invited: true, seen: { main: true } }));
  }, host.pairingCode);
  await spoofPage.goto(`http://127.0.0.1:${port}`);
  await until(() => messages.some(m => m.type === 'authenticate'));
  await delay(200);
  assert.deepEqual(messages.map(m => m.type), ['authenticate']);
  assert.equal(JSON.stringify(messages).includes(host.pairingCode), false);
  console.log('PASS unverified host receives neither pairing secret nor project snapshot');
  fakeMode = 'valid'; messages.length = 0;
  await spoofPage.reload();
  await until(() => messages.some(m => m.type === 'ack'));
  assert.equal(messages.find(m => m.type === 'ack').ok, false);
  assert.equal(await spoofPage.locator('[data-ob="bpm"] input').inputValue(), String(messages.find(m => m.type === 'hello').patch.bpm));
  console.log('PASS browser independently rejects unauthorized command from authenticated host');
  console.log('bridge-ui: PASS');
} finally {
  await browser?.close(); vite.kill(); await host.close();
  for (const ws of fake.clients) ws.terminate();
  await new Promise(resolve => fake.close(resolve));
}
