/** Musical pitch trajectory, independent of audio nodes and wall-clock time. */
export interface PitchGlide { fromHz: number; toHz: number; seconds: number }
type Trajectory = PitchGlide & { at: number };
export class PitchMemory {
  private trajectories = new Map<string, Trajectory>();
  clear(): void { this.trajectories.clear(); }
  forget(owner: string): void { this.trajectories.delete(owner); }
  next(owner: string, hz: number, at: number, seconds: number): PitchGlide | undefined {
    if (!(hz > 0) || !Number.isFinite(hz) || !Number.isFinite(at) || !(seconds > 0) || seconds > 4) {
      this.forget(owner); return undefined;
    }
    const previous = this.trajectories.get(owner);
    // Overlapping same-time attacks are not an ordered melody.
    const prior = previous && at > previous.at + 1e-7 ? previous : undefined;
    const progress = prior ? Math.min(1, Math.max(0, (at - prior.at) / prior.seconds)) : 1;
    const fromHz = prior ? prior.fromHz * (prior.toHz / prior.fromHz) ** progress : hz;
    this.trajectories.delete(owner);
    if (this.trajectories.size >= 128) this.trajectories.delete(this.trajectories.keys().next().value!);
    this.trajectories.set(owner, { fromHz, toHz: hz, at, seconds });
    return Math.abs(fromHz - hz) > 1e-9 ? { fromHz, toHz: hz, seconds } : undefined;
  }
}

/** Exclude simultaneous split events (ratchets/arp chords) as well as whole chords.
 * Input is chronological, as supplied by the live queue and WAV plan. */
export function monophonicAttacks<T>(events: readonly T[], info: (event: T) => { owner: string; at: number; noteCount: number }): Set<T> {
  const result = new Set<T>();
  const last = new Map<string, { at: number; event: T }>();
  for (const event of events) {
    const { owner, at, noteCount } = info(event), previous = last.get(owner);
    if (previous && Math.abs(at - previous.at) < 1e-7) result.delete(previous.event);
    else {
      last.set(owner, { at, event });
      if (noteCount === 1) result.add(event);
    }
  }
  return result;
}
