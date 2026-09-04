// MCP-сервер barlow: дебаг звука «снаружи» — из ИИ-агента (ZCode).
// Stdio-транспорт, без внешних зависимостей (кроме ws для моста).
//
// Тулзы по файлам:
//   analyze_patch(path)      — сводка сетапа патча: треки, инструменты,
//                               эскизы, ноты, арп, модуляции, эффекты.
//   probe_sound(path, bars)  — оффлайн-рендер патча (тот же triggerVoice,
//                               что и live) + таблица «время → доминирующие
//                               частоты + RMS»: видно, где тон съезжает.
// Тулзы живого приложения (нужен запущенный MCP + открытое приложение,
//   подключается к мосту ws://127.0.0.1:22756):
//   live_status              — подключено ли, транспорт, версия патча.
//   live_patch(mode)         — текущий патч: сводка или полный JSON.
//   live_set_patch(patch)    — заменить патч целиком (в приложении —
//                               шаг undo, сцена сбрасывается на первую).
//   live_set_param(p, v)     — точечная правка JSON-указателем, например
//                               /tracks/0/instrumentId → instruments/…
//                               (правка идёт через setPatch: история живёт).
//   live_transport(action)   — play | stop | scene | bpm.
//   live_notes(seconds)      — события нот за последние N секунд (Гц, vel).
//
// Подключение (workspace): .zcode/config.json → mcp.servers.barlow.
// Протокол MCP: newline-delimited JSON поверх stdin/stdout; stdout занят
// протоколом, служебные сообщения — только в stderr.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBridgeHost } from './lib/bridge-host.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const log = (...a) => process.stderr.write(`[barlow-mcp] ${a.join(' ')}\n`);

const resolvePath = (p) => (isAbsolute(p) ? p : resolve(ROOT, p));

/** Человекочитаемая сводка патча: что включено и где ноты. */
function summarizePatch(patch) {
  if (!patch) return 'патча нет — приложение ещё не присылало';
  const lines = [];
  lines.push(`bpm ${patch.bpm} · сцен ${patch.scenes?.length ?? 0} · цепочка ${(patch.chain ?? [])
    .map((it) => `${patch.scenes?.find((s) => s.id === it.sceneId)?.name ?? it.sceneId}:${it.bars}т${it.bpm ? `@${it.bpm}` : ''}`)
    .join(' → ')}`);
  const insts = new Map((patch.instruments ?? []).map((i) => [i.id, i]));
  for (const t of patch.tracks ?? []) {
    const inst = insts.get(t.instrumentId);
    const sound = inst ?? t; // до-v34: звуковые поля на треке
    lines.push(
      `[${t.name}] (${t.id}) wave=${sound.waveform ?? '?'} rate=${t.rate} phase=${t.phase} ` +
        `тоника=${t.freq}Гц шкала=[${(t.scale ?? []).join(',')}] октавы +${t.scaleOctUp ?? 0}/-${t.scaleOctDown ?? 0}`,
    );
    const env = `attack=${sound.attack} decay=${sound.decay} sustain=${sound.sustain ?? 0}`;
    lines.push(
      `  ${env} нота=${t.noteSteps ? `${t.noteSteps} шаг.` : 'по огибающей'} ` +
        `pitchDrop=${sound.pitchDrop}/${sound.pitchTime}s vibrato=${sound.vibratoDepth ?? 0}c ` +
        `filter=${sound.filterFreq}Гц Q=${sound.filterQ ?? 0.8}`,
    );
    if (t.arp) lines.push(`  АРП: ${t.arp.mode} div=${t.arp.div} октавы=${t.arp.octaves}`);
    if (t.mono) lines.push('  моно: новая нота глушит хвост');
    if (t.enabled === false) lines.push('  ВЫКЛ (мастер-выключатель)');
    for (const m of t.mods ?? []) lines.push(`  мод: ${m.target} ← ${m.source ?? 'lfo'}(${m.shape}) ${m.rate}Гц ×${m.depth}`);
    for (const e of t.effects ?? []) {
      lines.push(`  эффект: ${JSON.stringify(e)}`);
    }
    for (const p of t.patterns ?? []) {
      const notes = [];
      (p.steps ?? []).forEach((s, i) => {
        if (s.notes?.length) notes.push(`${i}:${s.notes.map((n) => `n${n.n}${(n.gate ?? 1) !== 1 ? `×${n.gate}` : ''}`).join('+')}`);
      });
      lines.push(
        `  эскиз ${p.name} (${p.id})${p.muted ? ' [мьют]' : ''} len=${p.length} rate=${p.rate ?? t.rate}: ${notes.join(' ') || '—'}`,
      );
      for (const c of p.automation ?? []) {
        lines.push(`    кривая ${c.target}: ${c.points.map((pt) => `(${pt.t},${pt.v})`).join(' ')}`);
      }
    }
  }
  return lines.join('\n');
}

function analyzePatchFile(path) {
  return summarizePatch(JSON.parse(readFileSync(resolvePath(path), 'utf8')));
}

/** Рендер + спектрограмма: вызывает scripts/sound-probe.mjs (поднимает
 *  vite и headless-браузер, ~15 с). */
function probeSound(path, bars) {
  return new Promise((res) => {
    const child = spawn(
      process.execPath,
      [resolve(ROOT, 'scripts/sound-probe.mjs'), resolvePath(path), String(bars)],
      { cwd: ROOT, shell: false },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code === 0) res(out.trim());
      else res(`sound-probe упал (код ${code}):\n${err.trim() || out.trim()}`);
    });
    setTimeout(() => {
      child.kill();
      res('sound-probe не уложился в 120 с — убит');
    }, 120_000).unref();
  });
}

// ---- Живой мост ----

const bridge = makeBridgeHost();
const liveGuard = () => {
  if (bridge.state.connected) return null;
  return (
    'приложение не подключено к мосту. Открой barlow (веб или десктоп) при ' +
    'запущенном MCP — приложение коннектится к ws://127.0.0.1:' +
    `${bridge.port} автоматически.`
  );
};

const needConnected = (fn) => async (args) => {
  const guard = liveGuard();
  if (guard) return guard;
  return fn(args);
};

const liveTools = [
  {
    name: 'live_status',
    description:
      'Живое приложение barlow: подключено ли к мосту, транспорт (играет/сцена/темп), ' +
      'сколько нот пришло, возраст патча. Начинай диагностику отсюда.',
    inputSchema: { type: 'object', properties: {} },
    handler: needConnected(() => {
      const s = bridge.state;
      const age = s.patchAt ? `${((Date.now() - s.patchAt) / 1000).toFixed(1)} с назад` : '—';
      return (
        `подключено (${s.app ?? '?'}) · транспорт: ${s.transport.playing ? 'играет' : 'стоп'}` +
        `, сцена «${s.transport.sceneName || s.transport.sceneId}», bpm ${s.transport.bpm}` +
        ` · патч получен ${age} · событий нот в буфере: ${s.notes.length}`
      );
    }),
  },
  {
    name: 'live_patch',
    description:
      'Текущий живой патч barlow. mode=summary (по умолчанию) — читаемая сводка сетапа; ' +
      'mode=full — полный JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['summary', 'full'], description: 'сводка или полный JSON' },
      },
    },
    handler: needConnected(({ mode }) =>
      mode === 'full'
        ? JSON.stringify(bridge.state.patch, null, 1)
        : summarizePatch(bridge.state.patch),
    ),
  },
  {
    name: 'live_set_param',
    description:
      'Точечная правка живого патча: JSON-указатель (RFC 6901) и значение. Например ' +
      '"/tracks/0/volume" 0.5 или "/bpm" 140. Правка идёт через setPatch приложения — ' +
      'попадает в undo-историю, играющий звук обновляется на лету. Серийные правки ' +
      'ручки коалесцируются в один шаг undo.',
    inputSchema: {
      type: 'object',
      properties: {
        pointer: { type: 'string', description: 'JSON-указатель, например /tracks/0/volume' },
        value: { description: 'значение (число/строка/объект)' },
      },
      required: ['pointer', 'value'],
    },
    handler: needConnected(async ({ pointer, value }) => {
      const r = await bridge.request({ type: 'set_param', pointer, value });
      return r.ok ? `ок: ${pointer} = ${JSON.stringify(value)}` : `не вышло: ${r.error}`;
    }),
  },
  {
    name: 'live_set_patch',
    description:
      'Заменить живой патч целиком (JSON). Эквивалент импорта файла: отдельный шаг ' +
      'undo, сцена сбрасывается на первую. Для точечных правок лучше live_set_param.',
    inputSchema: {
      type: 'object',
      properties: {
        patch: { type: 'object', description: 'полный патч barlow' },
      },
      required: ['patch'],
    },
    handler: needConnected(async ({ patch }) => {
      const r = await bridge.request({ type: 'set_patch', patch });
      return r.ok ? 'патч применён' : `не вышло: ${r.error}`;
    }),
  },
  {
    name: 'live_transport',
    description:
      'Управление транспортом живого приложения: action=play|stop, или action=scene с ' +
      'sceneId, или action=bpm со значением 30–300.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['play', 'stop', 'scene', 'bpm'] },
        sceneId: { type: 'string' },
        value: { type: 'number', description: 'темп для action=bpm' },
      },
      required: ['action'],
    },
    handler: needConnected(async (args) => {
      const msg = { type: 'transport', action: args.action };
      if (args.action === 'scene') msg.sceneId = String(args.sceneId ?? '');
      if (args.action === 'bpm') msg.value = Number(args.value);
      const r = await bridge.request(msg);
      return r.ok ? 'ок' : `не вышло: ${r.error}`;
    }),
  },
  {
    name: 'live_notes',
    description:
      'События нот живого приложения за последние N секунд (по умолчанию 3): дорожка, ' +
      'частоты в Гц, громкости. Видно, что реально триггерится (включая доли арпеджиатора ' +
      'и ретриггеры) — живой аналог спектрограммы.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'глубина окна в секундах (1–30)' },
      },
    },
    handler: needConnected(({ seconds }) => {
      const win = Math.max(1, Math.min(30, Number(seconds) || 3)) * 1000;
      const since = Date.now() - win;
      const evs = bridge.state.notes.filter((n) => n.t >= since);
      if (evs.length === 0) return `за последние ${win / 1000} с нот нет (транспорт играет?)`;
      return evs
        .map(
          (n) =>
            `${((n.t - since) / 1000).toFixed(2)}s [${n.track}] ${n.hz
              .map((h, i) => `${h.toFixed(1)}Гц×${n.vel[i].toFixed(2)}`)
              .join(' + ')}`,
        )
        .join('\n');
    }),
  },
];

const fileTools = [
  {
    name: 'analyze_patch',
    description:
      'Сводка сетапа патча barlow из JSON-файла: треки, инструменты (волна/огибающая/фильтры), ' +
      'эскизы с нотами и гейтами, арпеджиатор, модуляции, эффекты, кривые. ' +
      'Путь — абсолютный или от корня репозитория barlow. Живой патч — тулзой live_patch.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'путь к JSON-патчу' },
      },
      required: ['path'],
    },
    handler: ({ path }) => analyzePatchFile(String(path)),
  },
  {
    name: 'probe_sound',
    description:
      'Оффлайн-рендер патча barlow (тот же синтез, что live) + таблица ' +
      '"время → доминирующие частоты + RMS" по окнам ~46 мс. Показывает, где тон ' +
      'съезжает, нота глушится или перетриггеривается. path — файл JSON; live=true — ' +
      'рендер текущего живого патча. Рендерит через vite + headless-браузер, ~15 с.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'путь к JSON-патчу' },
        bars: { type: 'number', description: 'сколько тактов рендерить (по умолчанию 2)' },
        live: { type: 'boolean', description: 'рендерить живой патч из моста' },
      },
    },
    handler: async (args) => {
      let dir = null;
      if (args.live) {
        const guard = liveGuard();
        if (guard) return guard;
        const { writeFileSync, unlink } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        dir = join(tmpdir(), `barlow-live-${Date.now()}.json`);
        writeFileSync(dir, JSON.stringify(bridge.state.patch));
        setTimeout(() => unlink(dir, () => {}), 60_000).unref();
      } else if (!args.path) {
        return 'нужен path или live=true';
      }
      const r = await probeSound(dir ?? String(args.path), Number(args.bars) || 2);
      if (dir) {
        const { unlink } = await import('node:fs');
        unlink(dir, () => {});
      }
      return r;
    },
  },
];

const TOOLS = [...fileTools, ...liveTools].map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

const handle = async (msg) => {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'barlow', version: '0.2.0' },
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || id === undefined) return; // уведомления
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const tool = [...fileTools, ...liveTools].find((t) => t.name === name);
    try {
      if (!tool) throw new Error(`неизвестная тулза: ${name}`);
      const text = await tool.handler(args);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(text) }] } });
    } catch (e) {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `ошибка: ${e?.message ?? e}` }], isError: true },
      });
    }
    return;
  }
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `метод не поддерживается: ${method}` } });
};

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log('битый JSON:', line.slice(0, 120));
      continue;
    }
    void handle(msg).catch((e) => log('handle:', e?.message ?? e));
  }
});
log('готов, тулзы:', TOOLS.map((t) => t.name).join(', '), '· мост:', `127.0.0.1:${bridge.port}`);
