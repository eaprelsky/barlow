import { t as localeText } from './i18n/runtime.ts';
// Дебаг-мост: приложение — WebSocket-клиент хоста из ИИ-агента (MCP-сервер
// scripts/mcp-barlow.mjs поднимает ws://127.0.0.1:22756). Подключение
// включается кодом из настроек; до взаимного proof патч не передаётся.
// Браузер может отдельно запросить разрешение на локальную сеть.
//
// Поток: приложение шлёт hello/patch/transport/notes и ack на команды;
// хост.commands: set_patch (замена патча), set_param (JSON-указатель),
// transport (play/stop/scene/bpm), ping. Правки применяет App через
// перехваченный setPatch — undo-история живёт как у ручных правок.

import type { Patch } from './types';
import type { BridgeSession, BridgeStatus } from './bridgeSession';
import { authProof, verifyProof, randomNonce, capabilities, BRIDGE_PROTOCOL, BRIDGE_MAX_BYTES } from './bridgeProtocol';

const RECONNECT_MS = 2000;
// Патч летит не чаще раза в 150 мс: слайдеры дают до сотни правок в секунду.
const PATCH_FLUSH_MS = 150;
// Ноты копим в батч: при плотной полиритмии — сотни нот в секунду.
const NOTES_FLUSH_MS = 120;

export interface BridgeTransportState {
  playing: boolean;
  sceneId: string;
  sceneName: string;
  bpm: number;
}

export interface BridgeNoteEvent {
  trackId: string;
  at: number;
  notes: { n: number; oct?: number; vel: number }[];
}

export interface BridgeHandlers {
  /** Замена патча целиком (валидированный JSON из моста). */
  onSetPatch: (patch: unknown) => void;
  /** Точечная правка JSON-указателем (RFC 6901). */
  onSetParam: (pointer: string, value: unknown) => void;
  /** Транспорт: play | stop | scene (sceneId) | bpm (value) | solo (trackId). */
  onTransport: (cmd: { action: string; sceneId?: string; value?: number; trackId?: string }) => void;
  /** Снимки для представления хосту и переподключений. */
  getPatch: () => Patch;
  getTransport: () => BridgeTransportState;
  /** Где работает приложение — веб или десктоп (для статуса агента). */
  appKind: 'web' | 'desktop';
  onStatus?: (status: BridgeStatus) => void;
}

interface Bridge {
  pushPatch: (patch: Patch) => void;
  pushTransport: (state: BridgeTransportState) => void;
  pushNotes: (events: BridgeNoteEvent[]) => void;
  dispose: () => void;
}

export function createBridge(handlers: BridgeHandlers, session: BridgeSession | null = null): Bridge {
  const port = (window as unknown as { __BARLOW_BRIDGE_PORT?: number }).__BARLOW_BRIDGE_PORT ?? 22756;
  const url = `ws://127.0.0.1:${port}`;
  let ws: WebSocket | null = null;
  let disposed = false;
  let reconnectTimer = 0;
  let authenticated = false;
  let challenge = '', nonce = '';
  let authFailed = false;
  let handshakeTimer = 0;

  let pendingPatch: Patch | null = null;
  let patchTimer = 0;
  let lastSentPatch: string | null = null;

  let noteBuf: BridgeNoteEvent[] = [];
  let noteTimer = 0;

  const send = (msg: Record<string, unknown>) => {
    if (!authenticated || !ws || ws.readyState !== WebSocket.OPEN) return false;
    const data = JSON.stringify(msg);
    if (new TextEncoder().encode(data).byteLength > BRIDGE_MAX_BYTES) {
      handlers.onStatus?.({ phase: 'error', message: localeText("bridge.theProjectSnapshotExceedsTheBridgeS") });
      return false;
    }
    ws.send(data);
    return true;
  };
  const ack = (reqId: unknown, ok: boolean, error?: string) =>
    send({ type: 'ack', reqId, ok, error });

  const flushPatch = () => {
    patchTimer = 0;
    if (!pendingPatch) return;
    const json = JSON.stringify(pendingPatch);
    if (json !== lastSentPatch) {
      if (send({ type: 'patch', patch: pendingPatch })) lastSentPatch = json;
    }
    pendingPatch = null;
  };

  const flushNotes = () => {
    noteTimer = 0;
    if (noteBuf.length === 0) return;
    send({ type: 'notes', events: noteBuf });
    noteBuf = [];
  };

  const onMessage = async (data: string, socket: WebSocket) => {
    if (disposed || socket !== ws || !session) return;
    if (new TextEncoder().encode(data).byteLength > BRIDGE_MAX_BYTES) { socket.close(4003, 'message too large'); return; }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      socket.close(4003, 'invalid JSON');
      return;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) { socket.close(4003, 'invalid message'); return; }
    const reqId = msg.reqId;
    try {
      if (!authenticated) {
        if (msg.type === 'challenge' && !challenge && msg.protocol === BRIDGE_PROTOCOL && typeof msg.challenge === 'string') {
          challenge = msg.challenge; nonce = randomNonce();
          const proof = await authProof(session.secret, 'client', challenge, nonce, session.capabilities);
          if (disposed || socket !== ws || socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ type: 'authenticate', protocol: BRIDGE_PROTOCOL, nonce, proof, capabilities: session.capabilities }));
          return;
        }
        if (msg.type !== 'authenticated' || msg.protocol !== BRIDGE_PROTOCOL || !challenge
          || JSON.stringify(capabilities(msg.capabilities)) !== JSON.stringify(capabilities(session.capabilities))
          || !await verifyProof(session.secret, msg.proof, 'server', challenge, nonce, session.capabilities)) throw new Error(localeText("bridge.couldNotVerifyTheLocalHostCheck"));
        if (disposed || socket !== ws || socket.readyState !== WebSocket.OPEN) return;
        authenticated = true;
        window.clearTimeout(handshakeTimer); handshakeTimer = 0;
        const patch = handlers.getPatch(); lastSentPatch = JSON.stringify(patch);
        if (send({ type: 'hello', app: handlers.appKind, patch, transport: handlers.getTransport() }))
          handlers.onStatus?.({ phase: 'connected', message: localeText("bridge.localAgentConnected") });
        return;
      }
      const required = ({ get_state: 'read', ping: 'read', set_patch: 'write', set_param: 'write', transport: 'transport' } as Record<string, string>)[String(msg.type)];
      if (!required || !session.capabilities.some(c => c === required)) throw new Error(localeText("bridge.permissionRequired", {p0: required ?? localeText('bridge.unknownCommand')}));
      switch (msg.type) {
        case 'get_state':
          if (!send({ type: 'patch', patch: handlers.getPatch() })) throw new Error(localeText("bridge.couldNotSendTheProjectSnapshot"));
          send({ type: 'transport', transport: handlers.getTransport() });
          // Статус по запросу: хост сам держит последнее, но свежий снапшот
          // полезен сразу после переподключения.
          ack(reqId, true);
          break;
        case 'set_patch':
          handlers.onSetPatch(msg.patch);
          ack(reqId, true);
          break;
        case 'set_param':
          handlers.onSetParam(String(msg.pointer ?? ''), msg.value);
          ack(reqId, true);
          break;
        case 'transport':
          handlers.onTransport({
            action: String(msg.action ?? ''),
            sceneId: msg.sceneId === undefined ? undefined : String(msg.sceneId),
            value: msg.value === undefined ? undefined : Number(msg.value),
            trackId: msg.trackId === undefined ? undefined : String(msg.trackId),
          });
          ack(reqId, true);
          break;
        case 'ping':
          ack(reqId, true);
          break;
        default:
          break;
      }
    } catch (e) {
      if (!authenticated) {
        authFailed = true;
        handlers.onStatus?.({ phase: 'error', message: e instanceof Error ? e.message : localeText("bridge.hostVerificationFailed") });
        socket.close(4003, 'authentication failed'); return;
      }
      ack(reqId, false, e instanceof Error ? e.message : String(e));
    }
  };

  const connect = () => {
    if (disposed || !session || authFailed) return;
    authenticated = false; challenge = ''; nonce = '';
    handlers.onStatus?.({ phase: 'connecting', message: localeText("bridge.connectingToTheLocalAgent") });
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    const socket = ws;
    handshakeTimer = window.setTimeout(() => {
      if (!disposed && ws === socket && !authenticated) socket.close(4003, 'authentication timeout');
    }, 6000);
    ws.onmessage = (ev) => { void onMessage(String(ev.data), socket); };
    ws.onclose = (ev) => {
      if (ws !== socket) return;
      window.clearTimeout(handshakeTimer); handshakeTimer = 0;
      ws = null;
      authenticated = false;
      if (ev.code === 4001 || ev.code === 4003) {
        authFailed = true;
        handlers.onStatus?.({ phase: 'error', message: ev.code === 4001 ? localeText("bridge.theAgentIsConnectedToAnotherTab") : localeText("bridge.thePairingCodeWasRejectedOrHas") });
        return;
      }
      handlers.onStatus?.({ phase: 'waiting', message: localeText("bridge.waitingForTheLocalAgent") });
      scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose следом — реконнект там */
    };
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, RECONNECT_MS);
  };

  connect();
  if (!session) handlers.onStatus?.({ phase: 'off', message: localeText("bridge.localAgentDisconnected") });

  return {
    pushPatch(patch) {
      if (!session) return;
      pendingPatch = patch;
      if (!patchTimer) patchTimer = window.setTimeout(flushPatch, PATCH_FLUSH_MS);
    },
    pushTransport(state) {
      send({ type: 'transport', transport: state });
    },
    pushNotes(events) {
      if (!authenticated || !ws || ws.readyState !== WebSocket.OPEN) return;
      noteBuf.push(...events.slice(0, Math.max(0, 512 - noteBuf.length)));
      if (!noteTimer) noteTimer = window.setTimeout(flushNotes, NOTES_FLUSH_MS);
    },
    dispose() {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (patchTimer) window.clearTimeout(patchTimer);
      if (noteTimer) window.clearTimeout(noteTimer);
      if (handshakeTimer) window.clearTimeout(handshakeTimer);
      if (ws) {
        ws.onclose = null; // не планируем реконнект после dispose
        try {
          ws.close();
        } catch {
          /* уже закрыт */
        }
      }
    },
  };
}

/** Применить JSON-указатель (RFC 6901) к объекту, вернув копию.
 *  Родитель пути должен существовать; выходит за патч — исключение. */
export function setByPointer<T>(root: T, pointer: string, value: unknown): T {
  if (!pointer.startsWith('/')) throw new Error(localeText("bridge.thePointerMustStartWith"));
  const tokens = pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (pointer.length > 4096 || tokens.length > 24 || tokens.some(t => ['__proto__', 'prototype', 'constructor'].includes(t)))
    throw new Error(localeText("bridge.invalidParameterPath"));
  if (tokens.length === 0) throw new Error(localeText("bridge.emptyPointer"));
  const clone = structuredClone(root);
  let node: unknown = clone;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (node === null || typeof node !== 'object') {
      throw new Error(localeText("bridge.thePathEndsAt", {p0: tokens.slice(0, i + 1).join('/')}));
    }
    if (!Object.hasOwn(node, tokens[i])) throw new Error(localeText("bridge.thePathMustContainOnlyThePatch"));
    node = (node as Record<string, unknown>)[tokens[i]];
  }
  if (node === null || typeof node !== 'object') {
    throw new Error(localeText("bridge.theParentIsNotAnObject", {p0: tokens.slice(0, -1).join('/')}));
  }
  const key = tokens[tokens.length - 1];
  const holder = node as Record<string, unknown>;
  if (!Object.hasOwn(holder, key)) throw new Error(localeText("bridge.propertyDoesNotExistAtThisPath", {p0: key}));
  holder[key] = value;
  return clone;
}
