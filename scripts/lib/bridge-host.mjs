// Дебаг-мост barlow: WebSocket-хост на localhost, к которому подключается
// приложение (веб/десктоп) как клиент. Пара к src/bridge.ts.
//
// От приложения: hello/patch/transport/notes/ack. К приложению:
// get_state/set_patch/set_param/transport/ping. Запросы с reqId —
// приложение отвечает ack; хост резолвит промисы с таймаутом.
//
// Используется MCP-сервером (scripts/mcp-barlow.mjs) и смоук-тестом
// (scripts/smoke-bridge.mjs). Порт 22756 («barlow» на телефоне),
// переопределяется BARLOW_BRIDGE_PORT.

import { WebSocketServer } from 'ws';

export const BRIDGE_PORT = Number(process.env.BARLOW_BRIDGE_PORT ?? 22756);
const ACK_TIMEOUT_MS = 5000;
// Кольцевой буфер событий нот: ~30 с плотной полиритмии.
const NOTES_MAX = 4000;

export function makeBridgeHost(port = BRIDGE_PORT) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const pending = new Map(); // reqId → {resolve, timer}
  const state = {
    connected: false,
    app: null, // 'web' | 'desktop'
    patch: null, // последний патч от приложения
    patchAt: 0, // wall-clock получения
    transport: { playing: false, sceneId: '', sceneName: '', bpm: 120 },
    notes: [], // {t (wall clock), trackId, at (audio clock), notes:[{n, oct, vel, hz}]}
  };
  let client = null;

  const send = (msg) => {
    if (client && client.readyState === 1) client.send(JSON.stringify(msg));
  };

  /** Команда приложению с подтверждением: ack {reqId, ok, error?}. */
  const request = (msg) =>
    new Promise((resolve) => {
      const reqId = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        pending.delete(reqId);
        resolve({ ok: false, error: 'приложение не ответило за 5 с' });
      }, ACK_TIMEOUT_MS);
      pending.set(reqId, { resolve, timer });
      send({ ...msg, reqId });
    });

  // Частоты строк стана по последнему патчу — чтобы события нот приходили
  // уже в герцах, агенту не надо пересчитывать.
  let freqCache = { patch: null, map: null };
  const trackFreqs = (trackId) => {
    if (!state.patch) return null;
    if (freqCache.patch !== state.patch) {
      const map = new Map();
      for (const t of state.patch.tracks ?? []) {
        const rows = [...(t.scale ?? [])];
        const up = t.scaleOctUp ?? 0;
        const down = t.scaleOctDown ?? 0;
        const seen = new Set();
        const all = [];
        for (let o = -down; o <= up; o++)
          for (const r of rows) {
            const v = +(r * 2 ** o).toFixed(9);
            if (!seen.has(v)) {
              seen.add(v);
              all.push(v);
            }
          }
        all.sort((a, b) => a - b);
        map.set(t.id, { freq: t.freq ?? 220, rows: all, name: t.name });
      }
      freqCache = { patch: state.patch, map };
    }
    return freqCache.map.get(trackId);
  };

  wss.on('connection', (ws) => {
    // Один клиент — приложение. Новое подключение (перезагрузка страницы,
    // вторая вкладка) заменяет старое.
    if (client && client !== ws && client.readyState <= 1) {
      try {
        client.close();
      } catch {
        /* уже закрыт */
      }
    }
    client = ws;
    state.connected = true;
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      switch (msg.type) {
        case 'hello':
          state.app = msg.app ?? null;
          state.patch = msg.patch ?? null;
          state.patchAt = Date.now();
          state.transport = { ...state.transport, ...msg.transport };
          break;
        case 'patch':
          state.patch = msg.patch;
          state.patchAt = Date.now();
          break;
        case 'transport':
          state.transport = { ...state.transport, ...msg.transport };
          break;
        case 'notes': {
          for (const ev of msg.events ?? []) {
            const tf = trackFreqs(ev.trackId);
            state.notes.push({
              t: Date.now(),
              trackId: ev.trackId,
              track: tf?.name ?? ev.trackId,
              at: ev.at,
              hz: (ev.notes ?? []).map(
                (nt) => (tf ? tf.freq * (tf.rows[Math.min(Math.max(nt.n, 0), tf.rows.length - 1)] ?? 1) * 2 ** (nt.oct ?? 0) : nt.n),
              ),
              vel: (ev.notes ?? []).map((nt) => nt.vel),
            });
          }
          if (state.notes.length > NOTES_MAX) state.notes.splice(0, state.notes.length - NOTES_MAX);
          break;
        }
        case 'ack': {
          const p = pending.get(msg.reqId);
          if (p) {
            clearTimeout(p.timer);
            pending.delete(msg.reqId);
            p.resolve({ ok: !!msg.ok, error: msg.error });
          }
          break;
        }
        default:
          break;
      }
    });
    ws.on('close', () => {
      if (client === ws) {
        client = null;
        state.connected = false;
        state.transport = { ...state.transport, playing: false };
      }
    });
  });

  return {
    port,
    state,
    request,
    /** Мягко остановить хост (смоук-тесты). */
    close: () =>
      new Promise((res) => {
        for (const [, p] of pending) {
          clearTimeout(p.timer);
          p.resolve({ ok: false, error: 'хост остановлен' });
        }
        pending.clear();
        wss.close(() => res());
      }),
  };
}
