/** Prepared direct-sampler regions. Cache is bounded per source buffer, and
 * weakly held so unloading an asset releases all of its prepared regions. */
const regions = new WeakMap<AudioBuffer, Map<string, { buffer: AudioBuffer; loopStart: number }>>();
export function prepareSampleRegion(ctx: BaseAudioContext, source: AudioBuffer,
  start: number, end: number, reverse: boolean, crossfadeMs: number) {
  const first = Math.max(0, Math.min(source.length - 1, Math.floor(start * source.sampleRate)));
  const last = Math.max(first + 1, Math.min(source.length, Math.ceil(end * source.sampleRate)));
  const length = last - first;
  const fade = Math.min(Math.floor(length / 2), Math.max(0, Math.round(crossfadeMs * source.sampleRate / 1000)));
  const key = `${first}:${last}:${reverse}:${fade}`;
  let cache = regions.get(source);
  if (!cache) { cache = new Map(); regions.set(source, cache); }
  const previous = cache.get(key);
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
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
