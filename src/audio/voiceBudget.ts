import { estimateChainResources } from './chainBudget';
import { stopSource } from './sourceLifecycle';
import { instrumentVoices } from '../music/layers';
import type { SoundingTrack, Note } from '../types';
import { withNoteLocks } from '../music/noteLocks';
import { duckVoice, type Voice } from './voices';

export const VOICE_LIMITS = { notes: 128, estimatedNodes: 8192 };

/** Conservative admission estimate, not measured browser CPU or node count. */
function noteCost(st: SoundingTrack): number {
  const body = st.waveform === 'sample'
    ? st.sampleMode === 'grain' ? 4 * (st.grainCount ?? 10) : 12
    : 8 * Math.max(1, st.wave?.wavetable?.frames.length ?? (st.wave?.va ? st.wave.va.shape === 'pulse' && st.wave.va.pwmDepth ? 8 : 1 : st.wave?.partials.length) ?? 1) * (st.unisonVoices ?? 1);
  const motion = st.wave?.wavetable && (st.wave.wavetable.scan || st.wave.wavetable.positionLfo) ? 3 + st.wave.wavetable.frames.length : 0;
  return 20 + motion + (st.wave?.va?.pwmDepth ? 11 : 0) + (st.wave?.va?.driftCents ? 2 * (st.unisonVoices ?? 1) : 0) + (st.ringMix ? 6 : 0) + (st.foldDrive ? 2 : 0) + (st.combMix ? 7 : 0) + (st.ampMseg ? 1 : 0) + (st.pitchMseg ? 1 : 0) + (st.filterMseg ? 1 : 0) + (st.mono && (st.portamentoSec ?? 0) > 0 ? 1 : 0) + body + 2 * (st.formants?.length ?? 0);
}
export function estimateVoiceNodes(st: SoundingTrack, notes: number | readonly Note[]): number {
  if (st.layers?.length || st.baseVoiceGain !== undefined) return 1 + instrumentVoices(st).filter(v => v.gain > 0).reduce((n, v) => n + estimateVoiceNodes(v.sound, notes), 0);
  return 1 + (st.voiceEffects?.length ? estimateChainResources({effects:st.voiceEffects,mods:[]}).nodes + 2 : 0) + (typeof notes === 'number' ? notes * noteCost(st)
    : notes.reduce((sum, note) => sum + noteCost(withNoteLocks(st, note.locks)), 0));
}

/** Includes scheduled voices and their release tails. Rejects new events
 * as a whole; never silently changes chord balance or kills an older tail. */
export class VoiceBudget {
  private voices: { voice: Voice; notes: number; nodes: number }[] = [];
  prune(now: number): void { this.voices = this.voices.filter(v => v.voice.stopAt > now); }
  get notes(): number { return this.voices.reduce((n, v) => n + v.notes, 0); }
  get estimatedNodes(): number { return this.voices.reduce((n, v) => n + v.nodes, 0); }
  allows(st: SoundingTrack, notes: number | readonly Note[]): boolean {
    return this.notes + (typeof notes === 'number' ? notes : notes.length) <= VOICE_LIMITS.notes && this.estimatedNodes + estimateVoiceNodes(st, notes) <= VOICE_LIMITS.estimatedNodes;
  }
  add(voice: Voice, st: SoundingTrack, notes: number | readonly Note[]): void {
    this.voices.push({ voice, notes: typeof notes === 'number' ? notes : notes.length, nodes: estimateVoiceNodes(st, notes) });
  }
  /** The scene output has already faded to zero. End its sources at the
   * boundary, so inaudible long envelopes do not consume future admission. */
  endScene(at: number): void {
    for (const { voice } of this.voices) {
      voice.stopAt = Math.min(voice.stopAt, at);
      voice.amp.gain.cancelScheduledValues(at); voice.amp.gain.setValueAtTime(0, at);
      for (const source of voice.sources) {
        if ('stop' in source) stopSource(source, voice.stopAt);
        else source.parameters.get('off')?.setValueAtTime(1, voice.stopAt);
      }
    }
    this.prune(at);
  }
  stop(now: number): void {
    for (const { voice } of this.voices) duckVoice(voice, now);
    this.voices = [];
  }
}
