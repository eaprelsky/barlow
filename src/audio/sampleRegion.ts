import { ByteLru } from './byteLru';
/** A global byte bound prevents eight large copies per source. Source IDs are
 * weakly associated; active voices may retain an evicted prepared buffer. */
const sourceIds = new WeakMap<AudioBuffer, number>();
let nextSourceId = 0;
const regions = new ByteLru<string, { buffer: AudioBuffer; loopStart: number }>(64 * 1048576, 32);
export function prepareSampleRegion(ctx: BaseAudioContext, source: AudioBuffer,
  start: number, end: number, reverse: boolean, crossfadeMs: number) {
  const first = Math.max(0, Math.min(source.length - 1, Math.floor(start * source.sampleRate)));
  const last = Math.max(first + 1, Math.min(source.length, Math.ceil(end * source.sampleRate)));
  const length = last - first;
  const fade = Math.min(Math.floor(length / 2), Math.max(0, Math.round(crossfadeMs * source.sampleRate / 1000)));
  let sourceId = sourceIds.get(source);
  if (sourceId === undefined) { sourceId = ++nextSourceId; sourceIds.set(source, sourceId); }
  const key = `${sourceId}:${first}:${last}:${reverse}:${fade}`;
  const previous = regions.get(key);
  if (previous) return previous;
  const buffer = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const input = source.getChannelData(ch), output = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) output[i] = input[reverse ? last - 1 - i : first + i];
    // Preserve the first attack. Subsequent cycles begin after the crossfade.
    // Linear weights avoid a correlated-signal boost at the seam.
    for (let i = 0; i < fade; i++) {
      const mix = (i + 1) / fade;
      output[length - fade + i] = output[length - fade + i] * (1 - mix) + output[i] * mix;
    }
  }
  const result = { buffer, loopStart: fade / source.sampleRate };
  regions.set(key, result, buffer.length * buffer.numberOfChannels * 4);
  return result;
}
