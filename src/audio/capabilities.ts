export interface AudioCapabilities {
  readonly name: string;
  readonly samplePCM: 'planar-copy';
  readonly streamingSamples: boolean;
  readonly wav: { readonly channels: number; readonly sampleRate: number; readonly bits: number };
}
export const WEB_AUDIO_CAPABILITIES: AudioCapabilities = Object.freeze({
  name: 'Web Audio', samplePCM: 'planar-copy', streamingSamples: false,
  wav: Object.freeze({ channels: 2, sampleRate: 44100, bits: 16 }),
});
