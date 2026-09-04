// Дебаг-мост: приложение — WebSocket-клиент хоста из ИИ-агента (MCP-сервер
// scripts/mcp-barlow.mjs поднимает ws://127.0.0.1:22756). Подключается тихо
// и переподключается само: нет хоста — нет моста, приложение не замечает.
// ws://127.0.0.1 разрешён и из https-страниц (potentially trustworthy).
//
// Поток: приложение шлёт hello/patch/transport/notes и ack на команды;
// хост.commands: set_patch (замена патча), set_param (JSON-указатель),
// transport (play/stop/scene/bpm), ping. Правки применяет App через
// перехваченный setPatch — undo-история живёт как у ручных правок.

import type { Patch } from './types';

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
  /** Транспорт: play | stop | scene (sceneId) | bpm (value). */
  onTransport: (cmd: { action: string; sceneId?: string; value?: number }) => void;
  /** Снимки для представления хосту и переподключений. */
  getPatch: () => Patch;
  getTransport: () => BridgeTransportState;
  /** Где работает приложение — веб или десктоп (для статуса агента). */
  appKind: 'web' | 'desktop';
}

interface Bridge {
  pushPatch: (patch: Patch) => void;
  pushTransport: (state: BridgeTransportState) => void;
  pushNotes: (events: BridgeNoteEvent[]) => void;
  dispose: () => void;
}

export function createBridge(handlers: BridgeHandlers): Bridge {
  const port = (window as unknown as { __BARLOW_BRIDGE_PORT?: number }).__BARLOW_BRIDGE_PORT ?? 22756;
  const url = `ws://127.0.0.1:${port}`;
  let ws: WebSocket | null = null;
  let disposed = false;
  let reconnectTimer = 0;

  let pendingPatch: Patch | null = null;
  let patchTimer = 0;
  let lastSentPatch: string | null = null;

  let noteBuf: BridgeNoteEvent[] = [];
  let noteTimer = 0;

  const send = (msg: Record<string, unknown>) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const ack = (reqId: unknown, ok: boolean, error?: string) =>
    send({ type: 'ack', reqId, ok, error });

  const flushPatch = () => {
    patchTimer = 0;
    if (!pendingPatch) return;
    const json = JSON.stringify(pendingPatch);
    if (json !== lastSentPatch) {
      lastSentPatch = json;
      send({ type: 'patch', patch: pendingPatch });
    }
    pendingPatch = null;
  };

  const flushNotes = () => {
    noteTimer = 0;
    if (noteBuf.length === 0) return;
    send({ type: 'notes', events: noteBuf });
    noteBuf = [];
  };

  const onMessage = (data: string) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const reqId = msg.reqId;
    try {
      switch (msg.type) {
        case 'get_state':
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
      ack(reqId, false, e instanceof Error ? e.message : String(e));
    }
  };

  const connect = () => {
    if (disposed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      // Представляемся и несём свежий снимок: хост мог перезапуститься.
      const patch = handlers.getPatch();
      lastSentPatch = JSON.stringify(patch);
      send({ type: 'hello', app: handlers.appKind, patch, transport: handlers.getTransport() });
    };
    ws.onmessage = (ev) => onMessage(String(ev.data));
    ws.onclose = () => {
      ws = null;
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

  return {
    pushPatch(patch) {
      pendingPatch = patch;
      if (!patchTimer) patchTimer = window.setTimeout(flushPatch, PATCH_FLUSH_MS);
    },
    pushTransport(state) {
      send({ type: 'transport', transport: state });
    },
    pushNotes(events) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      noteBuf.push(...events);
      if (!noteTimer) noteTimer = window.setTimeout(flushNotes, NOTES_FLUSH_MS);
    },
    dispose() {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (patchTimer) window.clearTimeout(patchTimer);
      if (noteTimer) window.clearTimeout(noteTimer);
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
  if (!pointer.startsWith('/')) throw new Error('указатель должен начинаться с «/»');
  const tokens = pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (tokens.length === 0) throw new Error('пустой указатель');
  const clone = structuredClone(root);
  let node: unknown = clone;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (node === null || typeof node !== 'object') {
      throw new Error(`путь обрывается на «/${tokens.slice(0, i + 1).join('/')}»`);
    }
    node = (node as Record<string, unknown>)[tokens[i]];
  }
  if (node === null || typeof node !== 'object') {
    throw new Error(`родитель «/${tokens.slice(0, -1).join('/')}» — не объект`);
  }
  const key = tokens[tokens.length - 1];
  const holder = node as Record<string, unknown>;
  if (!(key in holder)) throw new Error(`поля «${key}» нет по этому пути`);
  holder[key] = value;
  return clone;
}
