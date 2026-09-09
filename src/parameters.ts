import { t as msg } from './i18n/runtime.ts';
/** Numeric parameter contract shared by normalization, controls and macros.
 * Values are stored in model units; display formatting never changes the patch. */
type Owner = 'instrument' | 'track' | 'pattern' | 'patch' | 'effect';
const spec = (owner: Owner, label: string | (() => string), min: number, max: number, step: number, initial: number, unit: string | (() => string) = '', scale: 'linear' | 'log' = 'linear') =>
  ({ owner, get label() { return typeof label === 'function' ? label() : label; }, min, max, step, initial, get unit() { return typeof unit === 'function' ? unit() : unit; }, scale });

export const PARAMETERS = {
  'instrument.ringMix': spec('instrument', () => msg("parameters.ringMix"), 0, 1, .01, 0),
  'instrument.ringRatio': spec('instrument', () => msg("parameters.ringRatio"), .125, 16, .01, 1, '×'),
  'instrument.foldDrive': spec('instrument', 'wavefold', 0, 8, .1, 0),
  'instrument.combMix': spec('instrument', () => msg("parameters.combMix"), 0, 1, .01, 0),
  'instrument.combHz': spec('instrument', () => msg("parameters.combFrequency"), 40, 4000, 1, 220, () => msg("parameters.hz"), 'log'),
  'instrument.combFeedback': spec('instrument', () => msg("parameters.combFeedback"), 0, .85, .01, .5),
  'track.portamentoSec': spec('track', 'portamento', 0, 4, 0.01, 0, () => msg("parameters.s")),
  'effect.mix': spec('effect', () => msg("parameters.effectMix"), 0, 1, 0.01, 0.3, '%'),
  'effect.timeSec': spec('effect', () => msg("parameters.delayTime"), 0.01, 2, 0.01, 0.28, () => msg("parameters.s"), 'log'),
  'effect.feedback': spec('effect', () => msg("parameters.delayFeedback"), 0, 0.9, 0.01, 0.35, '%'),
  'patch.bpm': spec('patch', () => msg("parameters.tempo"), 30, 300, 1, 120, 'BPM'),
  'patch.masterVolume': spec('patch', () => msg("parameters.masterVolume"), 0, 2, 0.01, 1, '%'),
  'track.volume': spec('track', () => msg("parameters.trackVolume"), 0, 1, 0.01, 0.8, '%'),
  'track.pan': spec('track', () => msg("parameters.pan"), 0, 1, 0.01, 0.5),
  'track.freq': spec('track', () => msg("parameters.rootFrequency"), 20, 9000, 1, 220, () => msg("parameters.hz"), 'log'),
  'track.phase': spec('track', () => msg("parameters.phaseOffset"), -64, 64, 1, 0, () => msg("parameters.steps")),
  'track.noteSteps': spec('track', () => msg("parameters.newNoteLength"), 0.1, 16, 0.1, 1, () => msg("parameters.steps")),
  'pattern.volume': spec('pattern', () => msg("parameters.clipLevel"), 0, 1, 0.01, 1, '%'),
  'pattern.rate': spec('pattern', () => msg("parameters.stepLength"), 0.25, 32, 0.01, 1, '×'),
  'pattern.length': spec('pattern', () => msg("parameters.cycleLength"), 1, 64, 1, 16, () => msg("parameters.steps")),
  'pattern.fadeIn': spec('pattern', () => msg("parameters.fadeIn"), 0, 8, 0.01, 0.005, () => msg("parameters.s")),
  'pattern.fadeOut': spec('pattern', () => msg("parameters.fadeOut"), 0, 8, 0.01, 0.05, () => msg("parameters.s")),
  'instrument.attack': spec('instrument', () => msg("parameters.attack"), 0, 1, 0.001, 0.002, () => msg("parameters.s")),
  'instrument.decay': spec('instrument', () => msg("parameters.decay"), 0.01, 4, 0.01, 0.25, () => msg("parameters.s")),
  'instrument.sustain': spec('instrument', () => msg("parameters.hold"), 0, 1, 0.01, 0, '%'),
  'instrument.pitchDrop': spec('instrument', () => msg("parameters.pitchDrop"), 1, 16, 0.1, 1, '×'),
  'instrument.pitchTime': spec('instrument', () => msg("parameters.pitchDropTime"), 0, 2, 0.01, 0.08, () => msg("parameters.s")),
  'instrument.filterLow': spec('instrument', () => msg("parameters.lowCut"), 20, 4000, 1, 20, () => msg("parameters.hz"), 'log'),
  'instrument.filterFreq': spec('instrument', () => msg("parameters.highCut"), 60, 12000, 1, 8000, () => msg("parameters.hz"), 'log'),
  'instrument.filterQ': spec('instrument', () => msg("parameters.resonance"), 0.5, 20, 0.1, 0.8),
  'instrument.filterEnvAmount': spec('instrument', () => msg("parameters.filterEnvelopeAmount"), -24, 24, 1, 0),
  'instrument.filterEnvTime': spec('instrument', () => msg("parameters.filterEnvelopeTime"), 0.01, 4, 0.01, 0.3, () => msg("parameters.s")),
  'instrument.vibratoRate': spec('instrument', () => msg("parameters.vibratoRate"), 0.1, 30, 0.1, 5, () => msg("parameters.hz"), 'log'),
  'instrument.vibratoDepth': spec('instrument', () => msg("parameters.vibratoDepth"), 0, 1200, 1, 0, () => msg("parameters.cents")),
  'instrument.vibratoDelay': spec('instrument', () => msg("parameters.vibratoDelay"), 0, 4, 0.01, 0, () => msg("parameters.s")),
  'instrument.unisonVoices': spec('instrument', () => msg("parameters.unisonVoices"), 1, 8, 1, 1),
  'instrument.unisonDetune': spec('instrument', () => msg("parameters.unisonDetune"), 0, 50, 0.5, 12, () => msg("parameters.cents")),
  'instrument.unisonSpread': spec('instrument', () => msg("parameters.unisonSpread"), 0, 1, 0.01, 0, '%'),
  'instrument.rootHz': spec('instrument', () => msg("parameters.sampleRootFrequency"), 1, 24000, 1, 440, () => msg("parameters.hz"), 'log'),
  'instrument.loopCrossfadeMs': spec('instrument', () => msg("parameters.loopCrossfade"), 0, 500, 1, 10, () => msg("parameters.ms")),
  'instrument.sampleStart': spec('instrument', () => msg("parameters.sampleStart"), 0, 3600, 0.001, 0, () => msg("parameters.s")),
  'instrument.sampleEnd': spec('instrument', () => msg("parameters.sampleEnd"), 0.001, 3600, 0.001, 3600, () => msg("parameters.s")),
  'instrument.grainSizeMs': spec('instrument', () => msg("parameters.grainSize"), 10, 1000, 1, 120, () => msg("parameters.ms"), 'log'),
  'instrument.grainCount': spec('instrument', () => msg("parameters.grainsPerNote"), 1, 32, 1, 10),
  'instrument.grainPos': spec('instrument', () => msg("parameters.grainPosition"), 0, 1, 0.01, 0.3, '%'),
  'instrument.grainScatter': spec('instrument', () => msg("parameters.grainScatter"), 0, 1, 0.01, 0.15, '%'),
} as const;
export type ParameterId = keyof typeof PARAMETERS;
export function isParameterId(value: unknown): value is ParameterId {
  return typeof value === 'string' && Object.hasOwn(PARAMETERS, value);
}
export function normalizeParameter(id: ParameterId, value: unknown): number {
  const p = PARAMETERS[id];
  const n = typeof value === 'number' && Number.isFinite(value) ? value : p.initial;
  const bounded = Math.min(p.max, Math.max(p.min, n));
  return id === 'instrument.unisonVoices' || id === 'instrument.grainCount' || id === 'pattern.length' || id === 'track.phase' ? Math.round(bounded) : bounded;
}
export function parameterRange(id: ParameterId) {
  const { min, max, step } = PARAMETERS[id];
  return { min, max, step };
}
export function parameterAt(id: ParameterId, amount: number): number {
  const p = PARAMETERS[id], t = Math.min(1, Math.max(0, amount));
  return normalizeParameter(id, p.scale === 'log' ? p.min * (p.max / p.min) ** t : p.min + (p.max - p.min) * t);
}
export function formatParameter(id: ParameterId, value: number): string {
  const p = PARAMETERS[id], shown = p.unit === '%' ? value * 100 : value;
  return `${Number(shown.toFixed(3))}${p.unit ? ` ${p.unit}` : ''}`;
}
export function parseRatio(raw: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:\/\s*(\d+(?:[.,]\d*)?|[.,]\d+))?\s*$/.exec(raw);
  if (!match) return null;
  const n = Number(match[1].replace(',', '.')) / (match[2] ? Number(match[2].replace(',', '.')) : 1);
  return Number.isFinite(n) && n >= PARAMETERS['pattern.rate'].min && n <= PARAMETERS['pattern.rate'].max ? n : null;
}
