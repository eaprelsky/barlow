/** Portable, caller-owned planar PCM. No AudioContext/AudioBuffer methods or
 * live views into the engine. UI may edit a channel without altering playback. */
export interface SamplePCM {
  readonly sampleRate: number;
  readonly length: number;
  readonly duration: number;
  readonly channels: readonly Float32Array[];
}

export function copySamplePCM(buffer: AudioBuffer): SamplePCM {
  return { sampleRate: buffer.sampleRate, length: buffer.length, duration: buffer.duration,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice()) };
}
