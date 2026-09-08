import { instrumentOfFields } from '../types';
import type { SoundingTrack, Track } from '../types';
import type { InstrumentPreset } from './instrumentPresets';

/** Metadata fallback for old presets; rootHz still describes the recording. */
export function recommendedHz(sound: Partial<SoundingTrack>): number {
  const candidates = [sound.recommendedHz, sound.freq,
    sound.waveform === 'sample' ? sound.rootHz : undefined, 220];
  return candidates.find(v => typeof v === 'number' && Number.isFinite(v) && v >= 20 && v <= 9000)!;
}

/** A characteristic single note, isolated from the destination's tuning and mix. */
export function soundForAudition(target: Track, preset: InstrumentPreset): SoundingTrack {
  const sound = preset.track, hz = recommendedHz(sound);
  const inst = instrumentOfFields({ ...sound, recommendedHz: hz }, preset.id ?? 'audition', preset.name);
  return { ...target, ...inst, id: target.id, freq: hz, scale: [1], scaleOctUp: 0, scaleOctDown: 0,
    patterns: [], rate: sound.rate ?? 1, phase: 0, noteSteps: sound.noteSteps,
    volume: sound.volume ?? .8, pan: sound.pan ?? .5, enabled: true, arp: undefined,
    sidechain: undefined, mono: sound.mono, portamentoSec: sound.portamentoSec,
    effects: sound.effects ?? [], mods: sound.mods ?? [] };
}
