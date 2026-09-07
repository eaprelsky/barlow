import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { makeBridgeHost, allowedOrigin } from './lib/bridge-host.mjs';
import { authProof, verifyProof, randomNonce } from '../src/bridgeProtocol.ts';

const port = 22857, host = makeBridgeHost(port), peers = [];
const until = async test => { for (let i = 0; i < 100; i++) { if (test()) return; await delay(10); } throw new Error('state timeout'); };
function peer(origin = 'http://127.0.0.1:5192') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin }); peers.push(ws);
  const inbox = [], waiters = [];
  ws.on('error', () => {});
  ws.on('message', raw => { const msg = JSON.parse(String(raw)); if (waiters.length) waiters.shift()(msg); else inbox.push(msg); });
  return { ws, inbox, next: () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message timeout')), 2000);
    waiters.push(msg => { clearTimeout(timer); resolve(msg); });
  }) };
}
async function authenticate(p, caps, secret = host.pairingCode) {
  const challenge = await p.next(), nonce = randomNonce();
  assert.equal(challenge.type, 'challenge');
  const proof = await authProof(secret, 'client', challenge.challenge, nonce, caps);
  p.ws.send(JSON.stringify({ type: 'authenticate', protocol: 1, nonce, proof, capabilities: caps }));
  const reply = await p.next();
  assert.equal(reply.type, 'authenticated');
  assert.ok(await verifyProof(secret, reply.proof, 'server', challenge.challenge, nonce, caps));
  assert.equal(await verifyProof(secret, proof, 'server', challenge.challenge, nonce, caps), false);
  return { challenge, nonce, proof };
}
function hello(p) {
  p.ws.send(JSON.stringify({ type: 'hello', app: 'web', patch: { version: 44, bpm: 120, tracks: [], instruments: [], scenes: [], chain: [] },
    transport: { playing: false, bpm: 120, sceneId: '', sceneName: '' } }));
}
try {
  assert.ok(allowedOrigin('https://barlow.eaprelsky.ru'));
  for (const origin of [undefined, 'null', 'https://evil.example', 'https://barlow.eaprelsky.ru.evil.example', 'http://127.0.0.1:5192/extra']) assert.equal(allowedOrigin(origin), false);
  const rejected = peer('https://evil.example');
  await until(() => rejected.ws.readyState === WebSocket.CLOSED);
  console.log('PASS origin allowlist rejects untrusted upgrade');

  const active = peer(), caps = ['read'];
  const auth = await authenticate(active, caps); hello(active);
  await until(() => host.state.connected);
  assert.deepEqual(host.state.capabilities, caps);
  assert.equal((await host.request({ type: 'set_param', pointer: '/bpm', value: 140 })).ok, false);
  assert.equal((await host.request({ type: 'transport', action: 'play' })).ok, false);
  console.log('PASS mutual proof and independent read/write/transport capabilities');

  const stranger = peer(); await stranger.next(); hello(stranger);
  await until(() => stranger.ws.readyState === WebSocket.CLOSED);
  assert.equal(host.state.connected, true); assert.equal(active.ws.readyState, WebSocket.OPEN);
  const replay = peer(); await replay.next();
  replay.ws.send(JSON.stringify({ type: 'authenticate', protocol: 1, nonce: auth.nonce, proof: auth.proof, capabilities: caps }));
  await until(() => replay.ws.readyState === WebSocket.CLOSED);
  assert.equal(active.ws.readyState, WebSocket.OPEN);
  console.log('PASS unauthenticated hello and replay cannot replace active application');

  const escalation = peer(), challenge = await escalation.next(), nonce = randomNonce();
  const proof = await authProof(host.pairingCode, 'client', challenge.challenge, nonce, ['read']);
  escalation.ws.send(JSON.stringify({ type: 'authenticate', protocol: 1, nonce, proof, capabilities: ['read', 'write'] }));
  await until(() => escalation.ws.readyState === WebSocket.CLOSED);
  assert.equal(host.state.connected, true);
  console.log('PASS capability tampering invalidates authentication');

  const oversized = peer(); await oversized.next(); oversized.ws.send(' '.repeat(5000));
  await until(() => oversized.ws.readyState === WebSocket.CLOSED);
  assert.equal(host.state.connected, true);
  console.log('PASS handshake payload bound preserves current connection');

  const waiting = host.request({ type: 'ping' });
  assert.equal((await active.next()).type, 'ping');
  const replacement = peer(); await authenticate(replacement, ['read', 'write']); hello(replacement);
  assert.equal((await waiting).ok, false);
  await until(() => active.ws.readyState === WebSocket.CLOSED && host.state.connected);
  assert.deepEqual(host.state.capabilities, ['read', 'write']);
  console.log('PASS paired replacement cancels pending commands from previous session');
  replacement.ws.close(); await until(() => !host.state.connected);
  assert.equal(host.state.patch, null); assert.equal(host.state.notes.length, 0);
  assert.equal((await host.request({ type: 'ping' })).ok, false);
  console.log('PASS disconnect clears project snapshot and fails requests immediately');
  const large = peer(); await authenticate(large, ['read']); hello(large);
  await until(() => host.state.connected);
  large.ws.send(' '.repeat(8 * 1024 * 1024 + 1));
  await until(() => large.ws.readyState === WebSocket.CLOSED && !host.state.connected);
  const healthy = peer(); await authenticate(healthy, ['read']); hello(healthy);
  await until(() => host.state.connected);
  console.log('PASS oversized authenticated frame closes socket while host remains usable');
  console.log('bridge-security: PASS');
} finally { for (const ws of peers) ws.terminate(); await host.close(); }
