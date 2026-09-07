// Authenticated loopback MCP host. Pairing secrets never cross the socket.
import { WebSocketServer } from 'ws';
import { authProof, verifyProof, pairingSecret, randomNonce, capabilities, BRIDGE_PROTOCOL, BRIDGE_MAX_BYTES } from '../../src/bridgeProtocol.ts';
import { validPatchInput } from '../../src/patchValidation.ts';
export const BRIDGE_PORT = Number(process.env.BARLOW_BRIDGE_PORT ?? 22756);
export function allowedOrigin(origin) {
  if (['https://barlow.eaprelsky.ru', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'].includes(origin)) return true;
  try { const u = new URL(origin); return u.origin === origin && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname); }
  catch { return false; }
}
export function makeBridgeHost(port = BRIDGE_PORT, options = {}) {
  const secret = options.secret ?? pairingSecret();
  const wss = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: BRIDGE_MAX_BYTES, verifyClient: info => allowedOrigin(info.origin) });
  const pending = new Map(), unauthenticated = new Set();
  const stopped = () => ({ playing: false, sceneId: '', sceneName: '', bpm: 120 });
  const state = { connected: false, app: null, patch: null, patchAt: 0, transport: stopped(), notes: [], capabilities: [] };
  let client = null;
  const clearPending = error => { for (const p of pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, error }); } pending.clear(); };
  const clearState = () => { state.connected = false; state.app = null; state.patch = null; state.patchAt = 0; state.transport = stopped(); state.notes = []; state.capabilities = []; };
  const request = msg => {
    if (!client || client.readyState !== 1 || !state.connected) return Promise.resolve({ ok: false, error: 'приложение не подключено' });
    const required = ({ ping: 'read', get_state: 'read', set_patch: 'write', set_param: 'write', transport: 'transport' })[msg.type];
    if (!required || !state.capabilities.includes(required)) return Promise.resolve({ ok: false, error: `нет разрешения: ${required ?? 'неизвестная команда'}` });
    if (pending.size >= 128) return Promise.resolve({ ok: false, error: 'слишком много ожидающих команд' });
    const reqId = randomNonce(), wire = JSON.stringify({ ...msg, reqId });
    if (Buffer.byteLength(wire) > BRIDGE_MAX_BYTES) return Promise.resolve({ ok: false, error: 'команда превышает 8 МиБ' });
    return new Promise(resolve => {
      const timer = setTimeout(() => { pending.delete(reqId); resolve({ ok: false, error: 'приложение не ответило за 5 с' }); }, 5000);
      pending.set(reqId, { resolve, timer }); client.send(wire);
    });
  };
  let freqCache = { patch: null, map: new Map() };
  const trackFreqs = trackId => {
    if (!state.patch) return null;
    if (freqCache.patch !== state.patch) {
      const map = new Map();
      for (const t of state.patch.tracks) {
        const rows = (t.scale ?? []).slice(0, 256).filter(v => Number.isFinite(v) && v > 0);
        const up = Math.min(4, Math.max(0, Math.floor(t.scaleOctUp ?? 0))), down = Math.min(4, Math.max(0, Math.floor(t.scaleOctDown ?? 0)));
        const seen = new Set();
        for (let o = -down; o <= up; o++) for (const r of rows) seen.add(+(r * 2 ** o).toFixed(9));
        map.set(t.id, { freq: t.freq ?? 220, rows: [...seen].sort((a, b) => a - b), name: t.name });
      }
      freqCache = { patch: state.patch, map };
    }
    return freqCache.map.get(trackId);
  };
  const patchSnapshot = patch => {
    // Host reads snapshots without migration. Bound their structure/references.
    if (!validPatchInput(patch, Number.MAX_SAFE_INTEGER)) throw new Error('неверный снимок патча');
    state.patch = patch; state.patchAt = Date.now();
  };
  const transportSnapshot = raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.playing !== 'boolean' || !Number.isFinite(raw.bpm)) throw new Error('неверный транспорт');
    return { playing: raw.playing, bpm: raw.bpm, sceneId: String(raw.sceneId ?? '').slice(0, 128), sceneName: String(raw.sceneName ?? '').slice(0, 256) };
  };
  wss.on('connection', ws => {
    ws.on('error', () => {});
    if (unauthenticated.size >= 8) { ws.close(1013, 'busy'); return; }
    unauthenticated.add(ws);
    const challenge = randomNonce(); let authenticated = false, checking = false;
    const deadline = setTimeout(() => ws.close(4003, 'authentication timeout'), 5000);
    ws.send(JSON.stringify({ type: 'challenge', protocol: BRIDGE_PROTOCOL, challenge }));
    ws.on('message', async data => {
      try {
        if (!authenticated && data.length > 4096) throw new Error('handshake too large');
        const msg = JSON.parse(String(data));
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('invalid message');
        if (!authenticated) {
          if (checking || msg.type !== 'authenticate' || msg.protocol !== BRIDGE_PROTOCOL) throw new Error('authentication required');
          checking = true; const caps = capabilities(msg.capabilities);
          if (!caps.includes('read') || !await verifyProof(secret, msg.proof, 'client', challenge, msg.nonce, caps)) throw new Error('authentication failed');
          const proof = await authProof(secret, 'server', challenge, msg.nonce, caps);
          if (ws.readyState !== 1) return;
          clearTimeout(deadline); unauthenticated.delete(ws); authenticated = true;
          const previous = client; clearPending('приложение переподключилось'); clearState();
          client = ws; state.capabilities = caps; previous?.close(4001, 'replaced by paired client');
          ws.send(JSON.stringify({ type: 'authenticated', protocol: BRIDGE_PROTOCOL, proof, capabilities: caps })); return;
        }
        if (client !== ws) return;
        switch (msg.type) {
          case 'hello': patchSnapshot(msg.patch); state.transport = transportSnapshot(msg.transport); state.app = msg.app === 'desktop' ? 'desktop' : 'web'; state.connected = true; break;
          case 'patch': patchSnapshot(msg.patch); break;
          case 'transport': state.transport = transportSnapshot(msg.transport); break;
          case 'notes':
            if (!Array.isArray(msg.events) || msg.events.length > 512) throw new Error('too many notes');
            for (const ev of msg.events) {
              if (!ev || typeof ev.trackId !== 'string' || !Number.isFinite(ev.at) || !Array.isArray(ev.notes) || ev.notes.length > 128) throw new Error('invalid note event');
              if (ev.notes.some(n => !n || !Number.isFinite(n.n) || !Number.isFinite(n.vel) || !Number.isFinite(n.oct ?? 0))) throw new Error('invalid note');
              const tf = trackFreqs(ev.trackId);
              state.notes.push({ t: Date.now(), trackId: ev.trackId, track: tf?.name ?? ev.trackId, at: ev.at,
                hz: ev.notes.map(n => tf ? tf.freq * (tf.rows[Math.min(Math.max(Math.round(n.n), 0), tf.rows.length - 1)] ?? 1) * 2 ** Math.min(8, Math.max(-8, n.oct ?? 0)) : n.n), vel: ev.notes.map(n => n.vel) });
            }
            if (state.notes.length > 4000) state.notes.splice(0, state.notes.length - 4000); break;
          case 'ack': {
            const p = pending.get(msg.reqId);
            if (p) { clearTimeout(p.timer); pending.delete(msg.reqId); p.resolve({ ok: msg.ok === true, error: typeof msg.error === 'string' ? msg.error.slice(0, 2048) : undefined }); } break;
          }
          default: throw new Error('unknown message');
        }
      } catch { ws.close(4003, 'invalid or unauthorized message'); }
    });
    ws.on('close', () => {
      clearTimeout(deadline); unauthenticated.delete(ws);
      if (client === ws) { client = null; clearState(); clearPending('соединение закрыто'); }
    });
  });
  return { port, state, request, pairingCode: secret,
    close: () => new Promise(resolve => { clearPending('хост остановлен'); for (const ws of wss.clients) ws.terminate(); wss.close(() => resolve()); }),
  };
}
