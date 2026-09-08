// Web Audio replaces a previous stop time. Cancellation must only shorten it,
// including short sources inside a longer layered/granular voice.
const stops = new WeakMap<AudioScheduledSourceNode, number>();
export function stopSource(source: AudioScheduledSourceNode, at: number): void {
  const end = Math.min(stops.get(source) ?? Infinity, at);
  stops.set(source, end);
  try { source.stop(end); } catch { /* source already ended/disposed */ }
}
