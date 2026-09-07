import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('..', import.meta.url)), port = 5189;
mkdirSync(root + '/tmp', { recursive: true });
writeFileSync(root + '/tmp/export-contract.html', '<!doctype html><title>Export contract</title>');
const vite = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) { if (vite.exitCode !== null) throw new Error('Vite exited'); try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await delay(250); }
  browser = await chromium.launch({ executablePath: process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}/tmp/export-contract.html`);
  const result = await page.evaluate(async () => {
    const { defaultPatch } = await import('/src/music/defaultPatch.ts');
    const { normalizePatch } = await import('/src/types.ts');
    const { AudioEngine } = await import('/src/audio/engine.ts');
    const { planRender } = await import('/src/audio/renderPlan.ts');
    const { triggerVoice } = await import('/src/audio/voices.ts');
    const { voiceLifetimeBound, effectTailBound } = await import('/src/audio/renderTail.ts');
    const checks = [];
    const check = (name, pass, details) => checks.push({ name, pass: !!pass, details });
    let patch = defaultPatch(); patch.performanceSeed = 771; patch.bpm = 120; patch.followChain = false;
    patch.masterNoise = 'off'; patch.masterComp = 0; patch.masterVolume = .6;
    patch.tracks = [patch.tracks[0]];
    const t = patch.tracks[0]; t.rate = 1; t.phase = 0; t.arp = undefined; t.mono = false; t.mods = []; t.effects = []; t.volume = 1;
    t.patterns = [{ id: 'p', name: 'tail', length: 16, rate: 1, fadeIn: .005, fadeOut: .05,
      steps: Array.from({ length: 16 }, (_, i) => ({ notes: i === 15 ? [{ n: 0, vel: .8, prob: 1, len: 1 }] : [] })) }];
    patch.scenes = [{ id: 's', name: 'tail', slots: { [t.id]: { patternId: 'p' } } }]; patch.chain = [];
    patch.instruments = [{ ...patch.instruments.find(i => i.id === t.instrumentId), waveform: 'wave',
      wave: { partials: [{ type: 'sine', ratio: 1, amp: 1, decay: 4 }] }, freq: 220, attack: .005, decay: .2, sustain: 0, unisonVoices: 1, formants: [], vibratoDepth: 0 }];
    patch = normalizePatch(patch);
    const render = async (p, tail) => {
      const blob = await new AudioEngine().renderToWav(p, 's', 1, tail ? { tail } : undefined);
      const data = new DataView(await blob.arrayBuffer());
      const samples = (blob.size - 44) / 4;
      const rms = (a, b) => { let sum = 0, n = 0; for (let i = Math.round(a * 44100); i < Math.min(samples, Math.round(b * 44100)); i++) { const v = data.getInt16(44 + i * 4, true) / 32768; sum += v*v; n++; } return Math.sqrt(sum / Math.max(1, n)); };
      return { duration: samples / 44100, samples, rms, end: data.getInt16(blob.size - 4, true) };
    };
    const natural = await render(patch, 'natural'), trim = await render(patch, 'trim'), legacy = await render(patch);
    check('late bell keeps its independent decay beyond the old one-second padding', natural.duration > 5 && natural.rms(3.5, 4) > .0001, { duration: natural.duration, tailRms: natural.rms(3.5,4) });
    check('trim is exactly one bar with no preroll/padding and a zero final frame', trim.duration === 2 && trim.end === 0, trim.duration);
    check('omitted options preserve historical duration', legacy.duration === 3, legacy.duration);
    check('natural encoder removes only tail silence, retaining the whole musical body', natural.duration >= 2 && natural.duration < planRender(patch, 's', 1, { tail: 'natural' }).duration - .05 && natural.end === 0);
    const reverb = structuredClone(patch); reverb.instruments[0].wave.partials[0].decay = undefined;
    reverb.tracks[0].effects = [{ id: 'rv', type: 'reverb', mix: 1, sizeSec: 3 }];
    const rv = await render(reverb, 'natural');
    check('late reverb remains audible after the arrangement', rv.duration > 4 && rv.rms(2.5,3) > .00005, rv.duration);
    const echo = structuredClone(reverb); echo.tracks[0].effects = [{ id: 'echo', type: 'delay', mix: .8, timeSec: .35, feedback: .45 }];
    echo.tracks[0].patterns[0].mods = [{ target: 'fxFeedback', fxId: 'echo', shape: 'sine', rate: .6, depth: .2 }];
    const de = await render(echo, 'natural');
    check('modulated delay tail is retained', de.duration > 4 && de.rms(2.5,3) > .0001, de.duration);
    const st = { ...echo.tracks[0], ...echo.instruments[0] };
    const bare = effectTailBound(st, { ...echo.tracks[0].patterns[0], mods: [] });
    check('tail estimate includes summed feedback modulation', effectTailBound(st, echo.tracks[0].patterns[0]) > bare);
    const excessive = structuredClone(echo); excessive.tracks[0].effects = [{ id: 'echo', type: 'delay', mix: 1, timeSec: 2, feedback: .9 }];
    let loaded = false, rejected = false; const bounded = new AudioEngine(); bounded.ensureSamples = async () => { loaded = true; };
    try { await bounded.renderToWav(excessive, 's', 1, { tail: 'natural' }); } catch (e) { rejected = e.message.includes('120 секунд'); }
    check('excessive tail rejected before asset loading and context allocation', rejected && !loaded);
    const silent = structuredClone(patch); silent.tracks[0].patterns[0].steps.forEach(s => s.notes = []); silent.masterNoise = 'pink'; silent.masterNoiseLevel = .1;
    const ns = await render(silent, 'natural');
    check('master noise stops at musical end and does not create an endless tail', ns.duration === 2 && ns.rms(.1, .5) > .0001, ns.duration);
    const transition = structuredClone(patch); transition.followChain = true;
    transition.tracks[0].patterns[0].mods = [{ target: 'volume', shape: 'sine', rate: 1, depth: 1 }];
    transition.tracks[0].patterns.push({ ...structuredClone(transition.tracks[0].patterns[0]), id: 'silent', mods: [], steps: Array.from({length:16},()=>({notes:[]})) });
    transition.scenes.push({id:'silent',name:'silent',slots:{[t.id]:{patternId:'silent'}}});
    transition.chain = [{sceneId:'s',bars:1},{sceneId:'silent',bars:1}];
    const tr = await render(transition, 'natural');
    check('outgoing scene is gated independently of its volume LFO', tr.duration === 4 && tr.rms(2.2,3.8) === 0, {duration:tr.duration,rms:tr.rms(2.2,3.8)});
    for (const [name, extra, note, dur] of [
      ['long sustain', {sustain:1,noteSteps:undefined}, {n:0,vel:1,prob:1}, undefined],
      ['slow step', {}, {n:0,vel:1,prob:1,len:64}, undefined],
      ['ratchet with ringing partials', {}, {n:0,vel:1,prob:1,len:64}, .03],
      ['grain', {waveform:'sample',sampleMode:'grain',grainSizeMs:1000,grainCount:32}, {n:0,vel:1,prob:1,len:8}, undefined],
    ]) {
      const ctx = new OfflineAudioContext(1, 44100, 44100), hp = ctx.createGain(); hp.connect(ctx.destination);
      const track = {...patch.tracks[0],...patch.instruments[0],...extra};
      const sample = ctx.createBuffer(1,44100,44100), voice = triggerVoice(ctx,{hp},sample,sample,track,[note],.05,.5,dur);
      check(`allocation estimate contains actual voice stop: ${name}`, voiceLifetimeBound(track,[note],.5,dur) >= voice.stopAt-.05, { bound:voiceLifetimeBound(track,[note],.5,dur),actual:voice.stopAt-.05 });
      for (const source of voice.sources) { if (typeof source.stop === 'function') try {source.stop();} catch {} }
    }
    return { checks, patch };
  });
  for (const c of result.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name} ${JSON.stringify(c.details ?? '')}`);
  assert.ok(result.checks.every(c => c.pass), 'audio export contract failed');
  const ui = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = []; ui.on('pageerror', e => errors.push(e.message));
  await ui.addInitScript(p => { localStorage.setItem('barlow.patch.v12', JSON.stringify(p)); localStorage.setItem('barlow.onboarding.v1', JSON.stringify({invited:true,seen:{main:true}})); }, result.patch);
  await ui.goto(`http://127.0.0.1:${port}`);
  await ui.getByRole('button', { name: /файл/ }).click();
  await ui.getByRole('button', { name: 'записать wav', exact: true }).click();
  const dialog = ui.getByRole('dialog', {name:'Запись WAV'}), bars = dialog.getByRole('spinbutton');
  await bars.fill(''); assert.ok(await dialog.getByRole('button', {name:'записать WAV',exact:true}).isDisabled());
  await bars.fill('1'); await dialog.getByRole('radio', {name:'Точная граница композиции'}).check();
  assert.match(await dialog.innerText(), /Длина файла: 2\.00 с/);
  const downloadPromise = ui.waitForEvent('download');
  await dialog.getByRole('button', {name:'записать WAV',exact:true}).click();
  const download = await downloadPromise, file = readFileSync(await download.path());
  assert.equal(file.length, 44 + 2 * 44100 * 4);
  await dialog.getByText(/WAV готов: 2\.00 с/).waitFor();
  await ui.screenshot({path:root+'/tmp/wav-export.png'});
  await dialog.getByRole('button',{name:'закрыть',exact:true}).click();
  assert.equal(await dialog.count(), 0); assert.deepEqual(errors, []);
  console.log('PASS WAV dialog validates draft, estimates duration, downloads exact PCM, reports result and closes');
} finally { await browser?.close(); vite.kill(); }
