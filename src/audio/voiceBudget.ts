import type { SoundingTrack } from '../types';
import { duckVoice, type Voice } from './voices';

export const VOICE_LIMITS = { notes: 128, estimatedNodes: 8192 };

/** Conservative admission estimate, not measured browser CPU or node count. */
export function estimateVoiceNodes(st: SoundingTrack, notes: number): number {
  const body = st.waveform === 'sample'
    ? st.sampleMode === 'grain' ? 4 * (st.grainCount ?? 10) : 12
    : 8 * Math.max(1, st.wave?.partials.length ?? 1) * (st.unisonVoices ?? 1);
  return 1 + notes * (20 + body + 2 * (st.formants?.length ?? 0));
}

/** Includes scheduled voices and their release tails. Rejects new events
 * as a whole; never silently changes chord balance or kills an older tail. */
export class VoiceBudget {
  private voices: { voice: Voice; notes: number; nodes: number }[] = [];
  prune(now: number): void { this.voices = this.voices.filter(v => v.voice.stopAt > now); }
  get notes(): number { return this.voices.reduce((n, v) => n + v.notes, 0); }
  get estimatedNodes(): number { return this.voices.reduce((n, v) => n + v.nodes, 0); }
  allows(st: SoundingTrack, notes: number): boolean {
    return this.notes + notes <= VOICE_LIMITS.notes && this.estimatedNodes + estimateVoiceNodes(st, notes) <= VOICE_LIMITS.estimatedNodes;
  }
  add(voice: Voice, st: SoundingTrack, notes: number): void {
    this.voices.push({ voice, notes, nodes: estimateVoiceNodes(st, notes) });
  }
  stop(now: number): void {
    for (const { voice } of this.voices) duckVoice(voice, now);
    this.voices = [];
  }
}
