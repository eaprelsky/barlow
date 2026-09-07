// Regression tests assert musical invariants against actual offline PCM.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 5197;
mkdirSync(root + '/tmp', { recursive: true });
writeFileSync(root + '/tmp/audio-contract.html', '<!doctype html><meta charset="utf-8"><title>Audio contract fixture</title>');
const vite = spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (vite.exitCode !== null) throw new Error('Vite exited before readiness');
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ready) throw new Error('Vite readiness timeout');
  browser = await chromium.launch({ executablePath: process.env.BARLOW_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/tmp/audio-contract.html`);
  const result = await page.evaluate(async () => {
    const { triggerVoice, ensureScratchModule, duckVoice } = await import('/src/audio/voices.ts');
    const { normalizeWave, modRateHz, normalizePatch, isPatch, PATCH_VERSION } = await import('/src/types.ts');
    const { makeChain } = await import('/src/audio/fx.ts');
    const checks = [];
    const check = (name, condition, details = '') => { checks.push({ name, pass: !!condition, details }); };
    const base = { waveform: 'wave', wave: { partials: [{ ratio: 1, amp: 1, type: 'sine' }] }, freq: 220, scale: [1, 1.5], scaleOctUp: 0, scaleOctDown: 0, attack: 0.005, decay: 0.5, sustain: 0.5, pitchDrop: 1, pitchTime: 0, filterFreq: 12000, filterLow: 20, filterQ: 0.8, unisonVoices: 1, unisonDetune: 0, unisonSpread: 0, volume: 1, pan: 0.5, mods: [], effects: [], noteSteps: 4 };
    const nt = (n = 0, vel = 1, len = 4) => ({ n, vel, len, prob: 1 });
    async function render(over = {}, notes = [nt()], duckAt) {
      const ctx = new OfflineAudioContext(2, 132300, 44100);
      if (over.sampleMode === 'scratch') await ensureScratchModule(ctx);
      const hp = ctx.createGain(); hp.connect(ctx.destination);
      const sample = ctx.createBuffer(1, 88200, 44100);
      const data = sample.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = 0.2 * Math.sin(2 * Math.PI * 220 * i / 44100);
      const noise = ctx.createBuffer(1, 88200, 44100);
      const saved = Math.random; let seed = 9876;
      Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
      let v;
      try { v = triggerVoice(ctx, { hp }, noise, sample, { ...base, ...over }, notes, 0.05, 0.125); }
      finally { Math.random = saved; }
      if (duckAt !== undefined) duckVoice(v, duckAt);
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let sum = 0, peak = 0;
      for (const x of d) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
      return { d, rms: Math.sqrt(sum / d.length), peak, stopAt: v.stopAt };
    }
    const ratioNear = (a, b, want, tol = 0.01) => Math.abs(b.rms / a.rms - want) < tol;
    const { prepareSampleRegion } = await import('/src/audio/sampleRegion.ts');
    const regionCtx = new OfflineAudioContext(2, 100, 8000);
    const ramp = regionCtx.createBuffer(2, 20, 8000);
    ramp.getChannelData(0).set(Array.from({length:20}, (_,i)=>i/20));
    ramp.getChannelData(1).set(Array.from({length:20}, (_,i)=>-i/20));
    const reversed = prepareSampleRegion(regionCtx,ramp,0.0005,0.00175,true,0);
    check('reverse uses selected region and preserves stereo', Math.abs(reversed.buffer.getChannelData(0)[0]-.65)<1e-6 && Math.abs(reversed.buffer.getChannelData(1)[9]+.2)<1e-6);
    const loop = prepareSampleRegion(regionCtx,ramp,0,0.0025,false,0.5);
    check('loop keeps attack and joins after crossfade', loop.buffer.getChannelData(0)[0]===0 && loop.loopStart===.0005 && Math.abs(loop.buffer.getChannelData(0)[19]-.15)<1e-6);
    check('region cache reuses prepared PCM', reversed===prepareSampleRegion(regionCtx,ramp,.0005,.00175,true,0));
    const { resolveMacros, DEFAULT_MACROS } = await import('/src/music/macros.ts');
    const macroBase = {...base, filterFreq:1000, macros:structuredClone(DEFAULT_MACROS)};
    check('neutral macros preserve base parameters', resolveMacros(macroBase).filterFreq===1000 && macroBase.macros.length===3);
    macroBase.macros[0].value=1;
    const resolved = resolveMacros(macroBase);
    check('macro logarithmic depth is applied once', resolved.filterFreq===4000 && resolveMacros(resolved).filterFreq===4000 && macroBase.filterFreq===1000);
    const plainShort = await render({waveform:'sample',sampleEnd:.08});
    const loopedShort = await render({waveform:'sample',sampleEnd:.08,sampleLoop:true,loopCrossfadeMs:10});
    check('loop sustains beyond source region', loopedShort.d.slice(10000,15000).some(x=>Math.abs(x)>.01) && plainShort.d.slice(10000,15000).every(x=>Math.abs(x)<1e-6));
    const diff = (a, b) => a.d.reduce((m, x, i) => Math.max(m, Math.abs(x - b.d[i])), 0);
    for (const [name, over] of [
      ['wave', {}], ['tail', { wave: { partials: [{ type: 'sine', ratio: 1, amp: 1, decay: 1 }] } }],
      ['sample', { waveform: 'sample' }], ['grain', { waveform: 'sample', sampleMode: 'grain' }],
      ['scratch', { waveform: 'sample', sampleMode: 'scratch' }],
    ]) {
      const a = await render(over); const b = await render(over, [nt(0, 0.1)]);
      check(`${name}: velocity scales amplitude once`, ratioNear(a, b, 0.1), b.rms / a.rms);
      const c = await render(over, [nt(0), nt(1)]);
      const d = await render(over, [nt(0), nt(1, 0.1)]);
      check(`${name}: second chord velocity changes PCM`, diff(c, d) > 0.005);
      const silent = await render(over, [nt(0, 0)]);
      check(`${name}: zero velocity is silent`, silent.peak === 0);
    }
    const a = await render();
    const quiet = await render({ wave: { partials: [{ type: 'sine', ratio: 1, amp: 0.1 }] } });
    check('harmonic amp 0.1 retains absolute amplitude', ratioNear(a, quiet, 0.1));
    const tails = { wave: { partials: [{ type: 'sine', ratio: 1, amp: 1, decay: 1 }] } };
    const tail = await render(tails), uni = await render({ ...tails, unisonVoices: 8 });
    check('coherent tail unison gain invariant', ratioNear(tail, uni, 1));
    const wide = await render({ ...tails, unisonVoices: 8, unisonDetune: 30, unisonSpread: 1 });
    check('detuned tail stays bounded', wide.peak < 0.6 && wide.rms > 0);
    const duck = await render(tails, [nt()], 0.2);
    check('mono duck controls ringing tail', duck.d.slice(16000).every(x => Math.abs(x) < 0.0001));
    const short = await render({ waveform: 'sample', sampleMode: 'grain' }, [nt(0, 1, 1)]);
    const long = await render({ waveform: 'sample', sampleMode: 'grain' }, [nt(0, 1, 8)]);
    check('grain length follows absolute note len', long.stopAt > short.stopAt + 0.6);
    const legacyA = await render({ waveform: 'sample', freq: 220 });
    const legacyB = await render({ waveform: 'sample', freq: 440 });
    check('legacy sample mapping unchanged', diff(legacyA, legacyB) < 1e-6);
    for (const mode of ['plain', 'grain']) {
      const root = await render({ waveform: 'sample', sampleMode: mode, keyTracking: true, rootHz: 220, freq: 220 });
      const raised = await render({ waveform: 'sample', sampleMode: mode, keyTracking: true, rootHz: 220, freq: 440 });
      check(`${mode}: key tracking changes sample pitch`, diff(root, raised) > 0.01);
    }
    const wave = normalizeWave({ partials: [{ type: 'sine', ratio: 1, amp: 4, mod: 1 }, { type: 'sine', ratio: 2, amp: 1, mod: 0 }, { type: 'noise', ratio: 1, amp: 1 }, { type: 'sine', ratio: 1, amp: 1, mod: 2 }] });
    check('normalization breaks cycles and noise targets', wave.partials[0].mod === undefined && wave.partials[3].mod === undefined && wave.partials[0].amp <= 1);
    check('normalization is idempotent', JSON.stringify(normalizeWave(wave)) === JSON.stringify(wave));
    const m = { target: 'pan', shape: 'sine', rate: 0.2, depth: 0.5, beatsPerCycle: 0.25 };
    check('1/16 at 120 BPM is 8 Hz', modRateHz(m, 120) === 8);
    check('sync follows changed BPM', modRateHz(m, 90) === 6);
    check('dotted period is longer', modRateHz({ ...m, beatsPerCycle: 0.375 }, 120) < modRateHz(m, 120));
    for (const source of ['lfo', 'sah', 'perlin']) {
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const chain = makeChain(ctx, { ...base, mods: [{ ...m, source }] }, ctx.destination, 120);
      const src = chain.mods[0].src;
      check(`${source}: node starts tempo-synchronized`, (src.frequency ?? src.playbackRate).value === 8);
    }
    check('schema bumped for persisted fields', PATCH_VERSION >= 40);
    const normalized = normalizePatch({ version: 39, bpm: 120, tracks: [], instruments: [], scenes: [], chain: [] });
    check('previous version normalizes', normalized.version === PATCH_VERSION);
    const { defaultPatch } = await import('/src/music/defaultPatch.ts');
    const { effectiveParams } = await import('/src/audio/engine.ts');
    const old = defaultPatch(); old.version = 40;
    old.tracks[0].volume = 0.2;
    old.tracks[0].patterns[0].volume = 0.8;
    const migrated = normalizePatch(old);
    const migratedTrack = migrated.tracks[0];
    check('v40 absolute party gain migration retains audio level', Math.abs(effectiveParams(migratedTrack, migratedTrack.patterns[0]).volume - 0.8) < 1e-9);
    check('track fader always scales party', Math.abs(effectiveParams({ ...migratedTrack, volume: migratedTrack.volume / 2 }, migratedTrack.patterns[0]).volume - 0.4) < 1e-9);
    check('zero track gain mutes overridden party', effectiveParams({ ...migratedTrack, volume: 0 }, migratedTrack.patterns[0]).volume === 0);
    const { importProject, exportProject } = await import('/src/audio/project.ts');
    const { listSamples } = await import('/src/audio/library.ts');
    const { zipSync, strToU8 } = await import('/node_modules/fflate/esm/browser.js');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const { saveUserPreset, loadUserPresets } = await import('/src/music/instrumentPresets.ts');
    saveUserPreset('sampler roundtrip', {waveform:'sample',sampleId:id,sampleStart:.2,sampleEnd:.8,rootHz:220,keyTracking:true,sampleReverse:true,sampleLoop:true,loopCrossfadeMs:25,macros:structuredClone(DEFAULT_MACROS)});
    const savedPreset = loadUserPresets().find(p=>p.name==='sampler roundtrip');
    check('user preset retains sampler mapping region loop and macros', savedPreset.track.sampleId===id && savedPreset.track.sampleStart===.2 && savedPreset.track.rootHz===220 && savedPreset.track.sampleReverse && savedPreset.track.sampleLoop && savedPreset.track.macros.length===3);
    const stableId=savedPreset.id; saveUserPreset('sampler roundtrip',savedPreset.track);
    check('user preset overwrite retains stable ID',loadUserPresets().find(p=>p.name==='sampler roundtrip').id===stableId);
    const p = { ...normalized, instruments: [{ id: 'sample-test', name: 'test', waveform: 'sample', sampleId: id }] };
    const files = { 'patch.json': strToU8(JSON.stringify(p)), [`samples/${id}.bin`]: bytes,
      'manifest.json': strToU8(JSON.stringify({ barlow: 1, samples: [{ id, name: 'test', file: `${id}.bin` }] })) };
    const archive = entries => new File([zipSync(entries)], 'test.zip');
    const valid = await importProject(archive(files));
    check('validated project imports sample and patch', valid?.instruments[0].sampleId === id);
    const roundtrip = await importProject(new File([await exportProject(valid)], 'roundtrip.zip'));
    check('project roundtrip retains asset IDs', roundtrip?.instruments[0].sampleId === id);
    const before = JSON.stringify(await listSamples());
    for (const [name, bad] of [
      ['path escape', { ...files, '../outside.bin': bytes }],
      ['hash mismatch', { ...files, [`samples/${id}.bin`]: new Uint8Array([9]) }],
      ['future schema', { ...files, 'patch.json': strToU8(JSON.stringify({ ...p, version: 999 })) }],
      ['missing sample', { 'patch.json': files['patch.json'] }],
      ['bad manifest', { ...files, 'manifest.json': strToU8('{}') }],
    ]) {
      let rejected = false;
      try { await importProject(archive(bad)); } catch { rejected = true; }
      check(`import rejects ${name}`, rejected);
    }
    check('failed imports leave library unchanged', before === JSON.stringify(await listSamples()));
    const oversized = zipSync({ 'patch.json': files['patch.json'] });
    const dv = new DataView(oversized.buffer);
    for (let i = 0; i < oversized.length - 28; i++) if (dv.getUint32(i, true) === 0x02014b50) { dv.setUint32(i + 24, 9 * 1024 * 1024, true); break; }
    let bounded = false;
    try { await importProject(new File([oversized], 'oversized.zip')); } catch { bounded = true; }
    check('declared decompressed size rejected before inflation', bounded);
    check('duplicate track IDs rejected', !isPatch({ ...normalized, tracks: [{ id: 'same' }, { id: 'same' }] }));
    check('dangling instrument rejected', !isPatch({ ...normalized, tracks: [{ id: 't', instrumentId: 'missing', patterns: [] }] }));
    check('nonfinite tempo rejected', !isPatch({ ...normalized, bpm: Infinity }));
    return checks;
  });
  for (const c of result) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.details !== '' ? ' ' + JSON.stringify(c.details) : ''}`);
  console.log(`audio-contract: ${result.filter(c => c.pass).length}/${result.length}`);
  if (result.some(c => !c.pass)) process.exitCode = 1;
} finally {
  await browser?.close();
  vite.kill();
}
