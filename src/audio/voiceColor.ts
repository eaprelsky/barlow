import { stopSource } from './sourceLifecycle';
import type { SoundingTrack } from '../types';

export function combTail(st: SoundingTrack): number {
  return (st.combMix ?? 0) > 0 ? Math.min(1.5, -Math.log(10000) / Math.log(Math.max(.001, st.combFeedback ?? .5)) / (st.combHz ?? 220)) + .03 : 0;
}
/** Voice-local color before the note's MSEG. Feedback is bounded and closed
 * explicitly; no free-running oscillator or delay graph survives the voice. */
export function voiceColor(ctx: BaseAudioContext, dest: AudioNode, st: SoundingTrack, hz: number, at: number) {
  const sources: OscillatorNode[] = [];
  const feedbacks: GainNode[] = [];
  if (!(st.ringMix || st.foldDrive || st.combMix)) return { input: dest, sources, finish: (end: number) => end };
  const input = ctx.createGain(); let output: AudioNode = input;
  if ((st.ringMix ?? 0) > 0) {
    const sum = ctx.createGain(), dry = ctx.createGain(), ring = ctx.createGain(), depth = ctx.createGain();
    dry.gain.value = 1 - st.ringMix!; ring.gain.value = 0; depth.gain.value = st.ringMix!;
    const osc = ctx.createOscillator(); osc.frequency.value = Math.min(ctx.sampleRate * .45, hz * (st.ringRatio ?? 1));
    osc.connect(depth); depth.connect(ring.gain); output.connect(ring); ring.connect(sum); output.connect(dry); dry.connect(sum);
    osc.start(at); sources.push(osc); output = sum;
  }
  if ((st.foldDrive ?? 0) > 0) {
    const folder = ctx.createWaveShaper();
    folder.curve = Float32Array.from({ length: 4097 }, (_, i) => 2 / Math.PI * Math.asin(Math.sin((i / 2048 - 1) * (1 + st.foldDrive!) * Math.PI / 2)));
    folder.oversample = st.synthQuality ?? '4x'; output.connect(folder); output = folder;
  }
  if ((st.combMix ?? 0) > 0) {
    const sum = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), delay = ctx.createDelay(.025), feedback = ctx.createGain();
    delay.delayTime.value = 1 / (st.combHz ?? 220); feedback.gain.value = st.combFeedback ?? .5;
    dry.gain.value = 1 - st.combMix!; wet.gain.value = st.combMix! * (1 - feedback.gain.value);
    output.connect(dry); dry.connect(sum); output.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(sum);
    output = sum; feedbacks.push(feedback);
  }
  const gate = ctx.createGain(); output.connect(gate); gate.connect(dest);
  return { input, sources, finish: (end: number) => {
    const until = end + combTail(st);
    gate.gain.setValueAtTime(1, Math.max(at, until - .01)); gate.gain.linearRampToValueAtTime(0, until);
    for (const gain of feedbacks) { gain.gain.setValueAtTime(gain.gain.value, Math.max(at, until - .01)); gain.gain.linearRampToValueAtTime(0, until); }
    for (const source of sources) stopSource(source, until);
    return until;
  } };
}
