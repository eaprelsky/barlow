import { duckVoice, type Voice } from './voices';

/** Mono retriggers follow musical time, not the order hosts schedule events.
 * Simultaneous chord members survive together. Inserting an earlier event
 * between already-scheduled arp events updates both neighbouring groups. */
export class MonoVoices {
  private tracks = new Map<string, { at: number; voices: Voice[] }[]>();
  register(trackId: string, voice: Voice, at: number): void {
    const groups = this.tracks.get(trackId) ?? [];
    this.tracks.set(trackId, groups);
    const same = groups.find(g => Math.abs(g.at-at)<1e-7);
    const nextIndex = groups.findIndex(g => g.at > at+1e-7);
    const index = nextIndex < 0 ? groups.length : nextIndex;
    const next = groups[index];
    if (next && voice.stopAt > next.at) duckVoice(voice,next.at);
    if (same) { same.voices.push(voice); return; }
    const previous = groups[index-1];
    if (previous) for (const v of previous.voices) if (v.stopAt > at) duckVoice(v,at);
    groups.splice(index,0,{at,voices:[voice]});
  }
  prune(now: number): void {
    for (const [id,groups] of this.tracks) {
      const alive = groups.filter(g=>g.voices.some(v=>v.stopAt>now));
      if (alive.length) this.tracks.set(id,alive); else this.tracks.delete(id);
    }
  }
  delete(trackId: string): void { this.tracks.delete(trackId); }
  clear(): void { this.tracks.clear(); }
}
