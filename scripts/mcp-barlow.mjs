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

/** Значение set_param: аргумент без типа в схеме клиент может прислать
 *  строкой — тогда "false" останется truthy, а объект-эскиз строкой и
 *  уронит рендерер. Вернём таким строкам их тип; обычный текст не трогаем. */
function coerceValue(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (s === 'true' || s === 'false') return s === 'true';
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s);
    } catch {
      /* не JSON — остаётся строкой */
    }
  }
  return v;
}

/** Компактная строка эффекта (трекового или на голосе) — вместо сырого JSON. */
function fmtEffect(e) {
  const id = e.id ? `(id:${e.id}) ` : '';
  const byType = {
    delay: `delay ${e.timeSec}с fb=${e.feedback} mix=${e.mix}`,
    reverb: `reverb ${e.sizeSec}с mix=${e.mix}`,
    dist: `дист drive=${e.drive} mix=${e.mix}`,
    chorus: `chorus ${e.rate}Гц mix=${e.mix}`,
    lofi: `lofi ${e.bits}бит mix=${e.mix}`,
    eq:
      `eq [${(e.bands ?? [])
        .map((b) => `${b.type} ${b.frequency}Гц ${b.gain > 0 ? '+' : ''}${b.gain}дБ Q${b.q}${b.enabled === false ? ' выкл' : ''}`)
        .join(', ')}] mix=${e.mix}${e.bypass ? ' байпас' : ''}`,
  };
  return id + (byType[e.type] ?? JSON.stringify(e));
}

/** Строка-оператор своей волны (v39): тип@множитель×амплитуда + хвост/FM. */
function fmtPartial(p) {
  return `${p.type}@${p.ratio}×${p.amp}${p.decay ? `~${p.decay}s` : ''}${p.mod != null ? `→FM#${p.mod}` : ''}`;
}

function fmtMseg(label, m) {
  if (!m) return '';
  return (
    `${label} ${m.points?.length ?? 0}т ${m.seconds}с` +
    `${m.sustainPoint != null ? ` sustain=${m.sustainPoint}` : ''}` +
    `${m.loop ? ` цикл(${m.loop.startPoint})×${m.loop.repeats}` : ''}`
  );
}

/** Человекочитаемая сводка патча: что включено и где ноты. Печатаем только
 *  не-дефолтное — типичный патч не превращается в простыню. */
function summarizePatch(patch) {
  if (!patch) return 'патча нет — приложение ещё не присылало';
  const lines = [];
  const head = [
    patch.title ? `«${patch.title}»` : '',
    `bpm ${patch.bpm}`,
    `мастер ${patch.masterVolume ?? 1}${patch.masterPan != null && patch.masterPan !== 0.5 ? ` пан=${patch.masterPan}` : ''}`,
    `сцен ${patch.scenes?.length ?? 0}`,
  ].filter(Boolean);
  head.push(
    `цепочка ${(patch.chain ?? [])
      .map((it) => `${patch.scenes?.find((s) => s.id === it.sceneId)?.name ?? it.sceneId}:${it.bars}т${it.bpm ? `@${it.bpm}` : ''}`)
      .join(' → ')}`,
  );
  if (patch.performanceSeed != null) head.push(`детерминизм seed=${patch.performanceSeed}`);
  if (patch.sceneSpace) head.push(`общий хвост ${patch.sceneSpace.sizeSec}с×${patch.sceneSpace.level}`);
  lines.push(head.join(' · '));

  const insts = new Map((patch.instruments ?? []).map((i) => [i.id, i]));
  const patName = (trackId, patternId) => {
    const t = (patch.tracks ?? []).find((x) => x.id === trackId);
    return t?.patterns?.find((p) => p.id === patternId)?.name ?? patternId;
  };
  const trackName = (id) => (patch.tracks ?? []).find((x) => x.id === id)?.name ?? id;

  // Сцены: соло и слоты (мьют слота — тишина в этой сцене, v38; в старых
  // патчах слот — строка-patternId).
  for (const s of patch.scenes ?? []) {
    const slots = (patch.tracks ?? [])
      .filter((t) => s.slots?.[t.id])
      .map((t) => {
        const slot = s.slots[t.id];
        const pid = typeof slot === 'string' ? slot : slot?.patternId;
        const muted = typeof slot === 'object' && slot?.muted;
        return `${t.name}→${pid ? patName(t.id, pid) : '∅'}${muted ? ' [мьют]' : ''}`;
      });
    lines.push(
      `сцена «${s.name}» (${s.id})${s.soloTrackId ? ` СОЛО=${trackName(s.soloTrackId)}` : ''}: ${slots.join(', ') || 'пусто'}`,
    );
  }

  for (const t of patch.tracks ?? []) {
    const inst = insts.get(t.instrumentId);
    const sound = inst ?? t; // до-v34: звуковые поля на треке
    const src =
      sound.waveform === 'sample'
        ? `сэмпл${sound.sampleName ? ` «${sound.sampleName}»` : ''}${sound.sampleMode && sound.sampleMode !== 'plain' ? ` (${sound.sampleMode})` : ''}`
        : sound.wave?.partials?.length
          ? `волна: ${sound.wave.partials.slice(0, 8).map(fmtPartial).join(' + ')}${sound.wave.partials.length > 8 ? ` +${sound.wave.partials.length - 8}…` : ''}`
          : 'волна: ?';
    const wavetable = sound.wave?.wavetable
      ? ` · wavetable ${sound.wave.wavetable.frames?.length ?? 0} кадров поз.${sound.wave.wavetable.position} sweep=${sound.wave.wavetable.sweep}` +
        `${sound.wave.wavetable.scan ? ` скан×${sound.wave.wavetable.scan.cycles}` : ''}` +
        `${sound.wave.wavetable.positionLfo ? ` LFO${sound.wave.wavetable.positionLfo.rateHz}Гц` : ''}`
      : '';
    const va = sound.wave?.va ? ` · VA ${sound.wave.va.shape} pw=${sound.wave.va.pulseWidth}` : '';
    lines.push(
      `[${t.name}] (${t.id}) ${src}${wavetable}${va} rate=${t.rate} phase=${t.phase} ` +
        `тоника=${t.freq}Гц шкала=[${(t.scale ?? []).join(',')}] октавы +${t.scaleOctUp ?? 0}/-${t.scaleOctDown ?? 0}`,
    );
    const env = `a=${sound.attack} d=${sound.decay} sustain=${sound.sustain ?? 0}`;
    lines.push(
      `  ${env} нота=${t.noteSteps ? `${t.noteSteps} шаг.` : 'по огибающей'} ` +
        `pitchDrop=${sound.pitchDrop}/${sound.pitchTime}s vibrato=${(sound.vibratoRate ?? 0) && (sound.vibratoDepth ?? 0) ? `${sound.vibratoRate}Гц/${sound.vibratoDepth}c` : '—'} ` +
        `filter=${sound.filterFreq}Гц Q=${sound.filterQ ?? 0.8} HP=${sound.filterLow}`,
    );
    // Тембровые слои v36–v54 — только не-дефолтное.
    const timbre = [];
    if ((sound.unisonVoices ?? 1) > 1)
      timbre.push(`унисон ×${sound.unisonVoices} ${sound.unisonDetune}c спред=${sound.unisonSpread}`);
    if (sound.vibratoDelay) timbre.push(`вибрато-задержка ${sound.vibratoDelay}с`);
    if (sound.filterEnvAmount) timbre.push(`огиб.фильтра ${sound.filterEnvAmount > 0 ? '+' : ''}${sound.filterEnvAmount}пт/${sound.filterEnvTime}с`);
    if (sound.formants?.length)
      timbre.push(`форманты ${sound.formants.map((f) => `${f.freq}Гц×${f.gain}`).join(', ')}`);
    if (sound.synthQuality) timbre.push(`качество ${sound.synthQuality}`);
    if (sound.keyTracking) timbre.push('клавишный трекинг');
    if (sound.rootHz && sound.waveform === 'sample') timbre.push(`root=${sound.rootHz}Гц`);
    const msegs = [fmtMseg('амп-MSEG', sound.ampMseg), fmtMseg('тон-MSEG', sound.pitchMseg), fmtMseg('фил-MSEG', sound.filterMseg)].filter(Boolean);
    if (msegs.length) timbre.push(msegs.join(' · '));
    if (sound.layers?.length)
      timbre.push(`слои: ${sound.layers.map((l) => `${l.name}@${l.ratio}×${l.gain}`).join(', ')}`);
    if (sound.baseVoiceGain != null && sound.baseVoiceGain !== 1) timbre.push(`база голоса=${sound.baseVoiceGain}`);
    if (sound.sampleZones?.length)
      timbre.push(
        `зоны ${sound.sampleZones.length}: ${sound.sampleZones
          .map((z) => `${z.lowHz}-${z.highHz}Гц${z.alternates?.length ? `(+${z.alternates.length}альт)` : ''}`)
          .join(', ')}`,
      );
    if (sound.sampleSlices?.length)
      timbre.push(`слайсы: ${sound.sampleSlices.map((sl) => `${sl.name}(${sl.start}-${sl.end})`).join(', ')}`);
    if (sound.sampleReverse) timbre.push('реверс');
    if (sound.sampleLoop) timbre.push(`луп${sound.loopCrossfadeMs ? ` кросс=${sound.loopCrossfadeMs}мс` : ''}`);
    if (sound.macros?.length)
      for (const m of sound.macros)
        timbre.push(`макрос «${m.name}»=${m.value} → ${m.bindings.map((b) => `${b.target}×${b.depth}`).join(', ')}`);
    if (sound.voiceEffects?.length) timbre.push(`на голосе: ${sound.voiceEffects.map(fmtEffect).join(' | ')}`);
    if (sound.voiceRange) timbre.push(`диапазон ${sound.voiceRange.minHz}-${sound.voiceRange.maxHz}Гц`);
    if (timbre.length) lines.push(`  ${timbre.join(' · ')}`);
    // Трековые живые параметры.
    const trackBits = [];
    if (t.mono) trackBits.push('моно');
    if (t.portamentoSec) trackBits.push(`глисс ${t.portamentoSec}с`);
    if (t.chokeGroup) trackBits.push(`choke гр.${t.chokeGroup}${t.chokePriority ? ` приор ${t.chokePriority}` : ''}`);
    if (t.spaceSend) trackBits.push(`space=${t.spaceSend}`);
    if (t.sidechain) trackBits.push(`сайдчейн ← ${trackName(t.sidechain.sourceId)} ×${t.sidechain.amount} (${t.sidechain.releaseSec}с)`);
    if (t.enabled === false) trackBits.push('ВЫКЛ (мастер-выключатель)');
    if (trackBits.length) lines.push(`  ${trackBits.join(' · ')}`);
    if (t.arp) lines.push(`  АРП: ${t.arp.mode} div=${t.arp.div} октавы=${t.arp.octaves}`);
    const sliceName = (id) => sound.sampleSlices?.find((sl) => sl.id === id)?.name ?? id;
    for (const m of t.mods ?? [])
      lines.push(
        `  мод: ${m.target}${m.fxId ? `[${m.fxId}]` : ''} ← ${m.source ?? 'lfo'}(${m.shape}) ` +
          `${m.beatsPerCycle ? `${m.beatsPerCycle} доли` : `${m.rate}Гц`} ×${m.depth}`,
      );
    for (const e of t.effects ?? []) lines.push(`  эффект: ${fmtEffect(e)}`);
    for (const p of t.patterns ?? []) {
      const notes = [];
      (p.steps ?? []).forEach((s, i) => {
        if (!s.notes?.length) return;
        const cells = s.notes.map((n) => {
          const bits = [`n${n.n}`];
          if (n.len != null && n.len !== 1) bits.push(`len=${n.len}`);
          if ((n.ratchet ?? 1) > 1) bits.push(`ретч×${n.ratchet}`);
          if (n.microTimingMs) bits.push(`${n.microTimingMs > 0 ? '+' : ''}${n.microTimingMs}мс`);
          if (n.locks) bits.push(`◆(${Object.keys(n.locks).join(',')})`);
          if (n.sliceId) bits.push(`◈${sliceName(n.sliceId)}`);
          return bits.join(' ');
        });
        notes.push(`${i}:${cells.join('+')}`);
      });
      lines.push(
        `  эскиз ${p.name} (${p.id}) len=${p.length} rate=${p.rate ?? t.rate}` +
          `${p.volume != null && p.volume !== 1 ? ` громк=${p.volume}` : ''}${p.pan != null ? ` пан=${p.pan}` : ''}` +
          `${(p.mods?.length ?? 0) > 0 ? ` мод=${p.mods.length}` : ''}: ${notes.join(' ') || '—'}`,
      );
      for (const c of p.automation ?? []) {
        lines.push(`    кривая ${c.target}${c.fxId ? `[${c.fxId}]` : ''}: ${c.points.map((pt) => `(${pt.t},${pt.v})`).join(' ')}`);
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
    'Приложение не подключено. В barlow открой Настройки → Звук и подключения → Внешний помощник, ' +
    `вставь код ${bridge.pairingCode} и выбери разрешения. Код действует до перезапуска этого MCP. ` +
    `Порт: ${bridge.port}. Не добавляй код в файл проекта или публичный отчёт.`
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
    handler: () => {
      const guard = liveGuard();
      if (guard) return guard;
      const s = bridge.state;
      const age = s.patchAt ? `${((Date.now() - s.patchAt) / 1000).toFixed(1)} с назад` : '—';
      return (
        `подключено (${s.app ?? '?'}) · транспорт: ${s.transport.playing ? 'играет' : 'стоп'}` +
        `, сцена «${s.transport.sceneName || s.transport.sceneId}», bpm ${s.transport.bpm}` +
        ` · патч получен ${age} · событий нот в буфере: ${s.notes.length} · права: ${s.capabilities.join(', ')}`
      );
    },
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
      '"/tracks/0/volume" 0.5, "/bpm" 140 или "/tracks/0/patterns/0/muted" false. ' +
      'Правка идёт через setPatch приложения — попадает в undo-историю, играющий ' +
      'звук обновляется на лету. Каждая команда — отдельный шаг undo.',
    inputSchema: {
      type: 'object',
      properties: {
        pointer: { type: 'string', description: 'JSON-указатель, например /tracks/0/volume' },
        value: {
          type: ['number', 'string', 'boolean', 'object'],
          description: 'значение; строка "true"/"false" или JSON-текст распарсится в тип',
        },
      },
      required: ['pointer', 'value'],
    },
    handler: needConnected(async ({ pointer, value }) => {
      const v = coerceValue(value);
      const r = await bridge.request({ type: 'set_param', pointer, value: v });
      return r.ok ? `ок: ${pointer} = ${JSON.stringify(v)}` : `не вышло: ${r.error}`;
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
      'Управление транспортом живого приложения: action=play|stop, action=scene с ' +
      'sceneId, action=bpm со значением 30–300, или action=solo с trackId дорожки ' +
      '(соло только этой дорожки в текущей сцене; trackId пустой/без значения — снять соло).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['play', 'stop', 'scene', 'bpm', 'solo'] },
        sceneId: { type: 'string' },
        value: { type: 'number', description: 'темп для action=bpm' },
        trackId: { type: 'string', description: 'дорожка для action=solo; пусто — снять соло' },
      },
      required: ['action'],
    },
    handler: needConnected(async (args) => {
      const msg = { type: 'transport', action: args.action };
      if (args.action === 'scene') msg.sceneId = String(args.sceneId ?? '');
      if (args.action === 'bpm') msg.value = Number(args.value);
      if (args.action === 'solo') msg.trackId = String(args.trackId ?? '');
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
