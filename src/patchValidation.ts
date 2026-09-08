import { validWavetable, validVA } from './music/wavetable.ts';
// Bounded validation before migrations or asset I/O; legacy versions retain
// their own optional fields and are converted by normalizePatch afterwards.
import { validMseg, validControlMseg } from './music/mseg.ts';
import { validNoteLocks } from './music/noteLocks.ts';
import { validSampleSlices } from './music/sampleSlices.ts';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128;

export function validPatchInput(value: unknown, latestVersion: number): boolean {
  if (!record(value) || !Number.isInteger(value.version) || (value.version as number) < 0 || (value.version as number) > latestVersion
    || typeof value.bpm !== 'number' || !Number.isFinite(value.bpm) || value.bpm <= 0 || value.bpm > 1000
    || !Array.isArray(value.tracks) || value.tracks.length > 128) return false;
  // Walk iteratively so malicious depth cannot overflow the JS call stack.
  const queue: [unknown, number][] = [[value, 0]];
  let count = 0;
  while (queue.length) {
    const [v, depth] = queue.pop()!;
    if (++count > 500000 || depth > 24) return false;
    if (typeof v === 'number' && !Number.isFinite(v)) return false;
    if (typeof v === 'string' && v.length > 65536) return false;
    if (Array.isArray(v)) {
      if (v.length > 8192) return false;
      for (const child of v) queue.push([child, depth + 1]);
    } else if (record(v)) {
      for (const [key, child] of Object.entries(v)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
        queue.push([child, depth + 1]);
      }
    }
  }
  const unique = (items: unknown[], limit: number): items is Record<string, unknown>[] => {
    if (items.length > limit) return false;
    const seen = new Set<string>();
    for (const item of items) {
      if (!record(item) || !id(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
    }
    return true;
  };
  if (!unique(value.tracks, 128)) return false;
  const instruments = value.instruments ?? [];
  const scenes = value.scenes ?? [];
  if (!Array.isArray(instruments) || !unique(instruments, 512) || !Array.isArray(scenes) || !unique(scenes, 512)) return false;
  const instrumentIds = new Set(instruments.map(i => i.id));
  const patterns = new Map<string, Set<string>>();
  for (const t of value.tracks) {
    if (t.portamentoSec !== undefined && (typeof t.portamentoSec !== 'number' || !Number.isFinite(t.portamentoSec) || t.portamentoSec < 0 || t.portamentoSec > 4)) return false;
    if (t.chokeGroup !== undefined && (!Number.isInteger(t.chokeGroup) || (t.chokeGroup as number) < 1 || (t.chokeGroup as number) > 16)) return false;
    if (t.chokePriority !== undefined && (!Number.isInteger(t.chokePriority) || (t.chokePriority as number) < 0 || (t.chokePriority as number) > 16)) return false;
    if (t.effects !== undefined) {
      if (!Array.isArray(t.effects) || t.effects.length > 16) return false;
      const ids = new Set<string>();
      for (const fx of t.effects) {
        if (!record(fx)) return false;
        if (fx.id !== undefined) { if (!id(fx.id) || ids.has(fx.id)) return false; ids.add(fx.id); }
      }
    }
    if (t.mods !== undefined && (!Array.isArray(t.mods) || t.mods.length > 16)) return false;
    if ((value.version as number) >= 34 && (!id(t.instrumentId) || !instrumentIds.has(t.instrumentId))) return false;
    const ps = t.patterns ?? [];
    if (!Array.isArray(ps) || !unique(ps, 128)) return false;
    patterns.set(t.id as string, new Set(ps.map(p => p.id as string)));
    for (const p of ps) {
      if (p.mods !== undefined && (!Array.isArray(p.mods) || p.mods.length > 16)) return false;
      if (!Array.isArray(p.steps) || p.steps.length > 4096) return false;
      if ((value.version as number) < 37) continue; // old step shapes are migrated
      for (const step of p.steps) {
        if (!record(step) || !Array.isArray(step.notes) || step.notes.length > 128) return false;
        if (step.notes.some(n => !record(n) || typeof n.n !== 'number' || typeof n.vel !== 'number' || typeof n.prob !== 'number' || !validNoteLocks(n.locks) || n.sliceId !== undefined && !id(n.sliceId))) return false;
      }
    }
  }
  const sounds = [...instruments];
  for (const inst of instruments) {
    if (inst.baseVoiceGain !== undefined && (typeof inst.baseVoiceGain !== 'number' || inst.baseVoiceGain < 0 || inst.baseVoiceGain > 1)) return false;
    if (inst.layers === undefined) continue;
    if (!Array.isArray(inst.layers) || !unique(inst.layers, 3)) return false;
    for (const layer of inst.layers) {
      if (!record(layer.sound) || layer.sound.layers !== undefined || layer.sound.baseVoiceGain !== undefined
        || typeof layer.name !== 'string' || layer.name.length > 160
        || typeof layer.gain !== 'number' || layer.gain < 0 || layer.gain > 1
        || typeof layer.ratio !== 'number' || layer.ratio < .125 || layer.ratio > 8) return false;
      sounds.push(layer.sound);
    }
  }
  for (const inst of sounds) {
    if (record(inst.wave) && (!validWavetable(inst.wave.wavetable) || !validVA(inst.wave.va) || inst.wave.wavetable !== undefined && inst.wave.va !== undefined)) return false;
    for (const [field, lo, hi] of [['ringMix',0,1],['ringRatio',.125,16],['foldDrive',0,8],['combMix',0,1],['combHz',40,4000],['combFeedback',0,.85]] as const) {
      const v = inst[field]; if (v !== undefined && (typeof v !== 'number' || v < lo || v > hi)) return false;
    }
    if (inst.synthQuality !== undefined && inst.synthQuality !== '2x' && inst.synthQuality !== '4x') return false;
    if (!validMseg(inst.ampMseg) || !validControlMseg(inst.pitchMseg) || !validControlMseg(inst.filterMseg, true)) return false;
    if (inst.recommendedHz !== undefined && (typeof inst.recommendedHz !== 'number' || inst.recommendedHz < 20 || inst.recommendedHz > 9000)) return false;
    if (!validSampleSlices(inst.sampleSlices)) return false;
    if (inst.sampleId !== undefined && (typeof inst.sampleId !== 'string' || !/^[a-f0-9]{64}$/.test(inst.sampleId))) return false;
    if (inst.sampleZones !== undefined) {
      if (!Array.isArray(inst.sampleZones) || !unique(inst.sampleZones, 64)) return false;
      if (inst.sampleZones.some(z => typeof z.sampleId !== 'string' || !/^[a-f0-9]{64}$/.test(z.sampleId))) return false;
      if (inst.sampleZones.some(z => z.alternates !== undefined && (!Array.isArray(z.alternates) || z.alternates.length > 7
        || z.alternates.some(v => !record(v) || typeof v.sampleId !== 'string' || !/^[a-f0-9]{64}$/.test(v.sampleId))))) return false;
    }
  }
  for (const scene of scenes) {
    if (scene.slots !== undefined && !record(scene.slots)) return false;
    for (const [trackId, slot] of Object.entries((scene.slots ?? {}) as Record<string, unknown>)) {
      const patternId = typeof slot === 'string' ? slot : record(slot) ? slot.patternId : null;
      if (!patterns.has(trackId) || !id(patternId) || !patterns.get(trackId)!.has(patternId)) return false;
    }
  }
  const chain = value.chain ?? [];
  if (!Array.isArray(chain) || chain.length > 4096) return false;
  const sceneIds = new Set(scenes.map(s => s.id));
  return chain.every(item => record(item) && sceneIds.has(item.sceneId));
}
