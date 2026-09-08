import { localEffectTail } from './localEffectTail';
import { msegDuration } from '../music/mseg';
import { combTail } from './voiceColor';
import { instrumentVoices } from '../music/layers';
import { withNoteLocks } from '../music/noteLocks';
import type { Note, Pattern, SoundingTrack } from '../types';
import { autoToParam } from '../types';
import { sameAddress, effectId } from '../music/effectAddress';
import { modScale } from './fx';

/** Conservative allocation bounds, not a musical envelope or a CPU estimate. */
export function voiceLifetimeBound(st: SoundingTrack, notes: Note[], stepSec: number, durSec?: number): number {
  if (st.layers?.length || st.baseVoiceGain !== undefined) return Math.max(0, ...instrumentVoices(st).filter(v => v.gain > 0).map(v => voiceLifetimeBound(v.sound, notes, stepSec, durSec)));
  let longest = 0;
  for (const nt of notes) {
    const sound = withNoteLocks(st, nt.locks);
    const attack = Math.max(sound.attack, .012);
    const base = durSec ?? (sound.noteSteps && sound.noteSteps > 0 ? sound.noteSteps * stepSec : sound.ampMseg?.seconds ?? attack + sound.decay);
    const gate = nt.len && nt.len > 0
      ? Math.min(64, Math.max(.05, Math.min(64, Math.max(.05, nt.len)) * stepSec / Math.max(base, 1e-6)))
      : Math.min(4, Math.max(.1, nt.gate ?? 1));
    let len = durSec ?? base * gate;
    if (sound.ampMseg) len = msegDuration(sound.ampMseg, len);
    if (!sound.ampMseg && durSec === undefined && !sound.noteSteps && nt.len === undefined && (sound.sustain ?? 0) >= .99) len = Math.max(len, 16);
    const body = Math.max(len + .05, attack + Math.max(sound.decay, .01)) + .05;
    const partials = attack + Math.max(0, ...(sound.wave?.partials ?? []).map(p => p.decay ?? 0)) + .05;
    const grain = len + Math.min(2, Math.max(.01, (sound.grainSizeMs ?? 120) / 1000)) + .05;
    longest = Math.max(longest, combTail(sound) + (sound.waveform === 'sample' && sound.sampleMode === 'grain' ? grain : Math.max(body, partials) + .1));
  }
  return longest + localEffectTail(st.voiceEffects ?? []);
}

/** Serial tails add. Bound the modulated delay controls, whose summed signal
 * is clamped in fx.ts. The -100 dB repeat bound leaves headroom for later FX. */
export function effectTailBound(st: SoundingTrack, pattern: Pattern): number {
  const mods = pattern.mods ?? st.mods;
  let seconds = 2; // biquad settling, worklet/oversampling latency and safety
  for (const [i, fx] of (st.effects ?? []).entries()) {
    const id = effectId(fx, i);
    const maximum = (target: 'fxMix' | 'fxTime' | 'fxFeedback', base: number, cap: number) => {
      const curves = (pattern.automation ?? []).filter(c => sameAddress(c, target, id, st.effects ?? []));
      const values = curves.flatMap(c => c.points.map(p => autoToParam(target, p.v)));
      const depth = mods.filter(m => sameAddress(m, target, id, st.effects ?? [])).reduce((sum, m) => sum + Math.abs(modScale(target, m.depth)), 0);
      return Math.min(cap, Math.max(base, ...values) + depth);
    };
    if (maximum('fxMix', fx.mix, 1) <= 0) continue;
    if (fx.type === 'reverb') seconds += fx.sizeSec;
    if (fx.type === 'chorus') seconds += .031;
    if (fx.type === 'delay') {
      const feedback = maximum('fxFeedback', fx.feedback, .9);
      const repeats = feedback <= 0 ? 1 : Math.ceil(Math.log(1e-5) / Math.log(feedback)) + 1;
      seconds += maximum('fxTime', fx.timeSec, 2) * repeats;
    }
  }
  return seconds;
}

