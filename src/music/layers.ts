import { sampleAssets } from './sampleZones';
import type { Instrument, InstrumentLayer, SoundingTrack } from '../types';
import { resolveMacros } from './macros';

export function voiceSnapshot(inst: Instrument): InstrumentLayer['sound'] {
  const { id: _id, name: _name, layers: _layers, baseVoiceGain: _gain, ...sound } = structuredClone(inst);
  return sound;
}
/** Flat expansion shared by DSP, allocation bounds and asset preparation. */
export function instrumentVoices(st: SoundingTrack): { sound: SoundingTrack; gain: number; key: string }[] {
  const base = { ...st, layers: undefined, baseVoiceGain: undefined };
  return [{ sound: base, gain: st.baseVoiceGain ?? 1, key: '' }, ...(st.layers ?? []).map(layer => ({
    sound: resolveMacros({ ...base, ...layer.sound, voiceEffects:layer.sound.voiceEffects, voiceRange:layer.sound.voiceRange, freq: st.freq * layer.ratio }), gain: layer.gain, key: layer.id,
  }))];
}

/** Live preparation excludes dormant sample slots retained for editing/ZIP. */
export function soundingSampleAssets(st: SoundingTrack): { sampleId: string; sampleName?: string }[] {
  const assets = new Map<string, { sampleId: string; sampleName?: string }>();
  for (const voice of instrumentVoices(st)) if (voice.gain > 0 && voice.sound.waveform === 'sample')
    for (const asset of sampleAssets(voice.sound)) assets.set(asset.sampleId, asset);
  return [...assets.values()];
}
