/** Numeric parameter contract shared by normalization, controls and macros.
 * Values are stored in model units; display formatting never changes the patch. */
type Owner = 'instrument' | 'track' | 'pattern' | 'patch' | 'effect';
const spec = (owner: Owner, label: string, min: number, max: number, step: number, initial: number, unit = '', scale: 'linear' | 'log' = 'linear') =>
  ({ owner, label, min, max, step, initial, unit, scale });

export const PARAMETERS = {
  'track.portamentoSec': spec('track', 'portamento', 0, 4, 0.01, 0, 'с'),
  'effect.mix': spec('effect', 'микс эффекта', 0, 1, 0.01, 0.3, '%'),
  'effect.timeSec': spec('effect', 'время эха', 0.01, 2, 0.01, 0.28, 'с', 'log'),
  'effect.feedback': spec('effect', 'повторы эха', 0, 0.9, 0.01, 0.35, '%'),
  'patch.bpm': spec('patch', 'темп', 30, 300, 1, 120, 'BPM'),
  'patch.masterVolume': spec('patch', 'общая громкость', 0, 2, 0.01, 1, '%'),
  'track.volume': spec('track', 'громкость дорожки', 0, 1, 0.01, 0.8, '%'),
  'track.pan': spec('track', 'панорама', 0, 1, 0.01, 0.5),
  'track.freq': spec('track', 'тоника', 20, 9000, 1, 220, 'Гц', 'log'),
  'track.phase': spec('track', 'сдвиг позиции', -64, 64, 1, 0, 'шагов'),
  'track.noteSteps': spec('track', 'длина новой ноты', 0.1, 16, 0.1, 1, 'шагов'),
  'pattern.volume': spec('pattern', 'уровень партии', 0, 1, 0.01, 1, '%'),
  'pattern.rate': spec('pattern', 'длительность шага', 0.25, 32, 0.01, 1, '×'),
  'pattern.length': spec('pattern', 'длина цикла', 1, 64, 1, 16, 'шагов'),
  'pattern.fadeIn': spec('pattern', 'вход', 0, 8, 0.01, 0.005, 'с'),
  'pattern.fadeOut': spec('pattern', 'выход', 0, 8, 0.01, 0.05, 'с'),
  'instrument.attack': spec('instrument', 'атака', 0, 1, 0.001, 0.002, 'с'),
  'instrument.decay': spec('instrument', 'спад', 0.01, 4, 0.01, 0.25, 'с'),
  'instrument.sustain': spec('instrument', 'плато', 0, 1, 0.01, 0, '%'),
  'instrument.pitchDrop': spec('instrument', 'падение тона', 1, 16, 0.1, 1, '×'),
  'instrument.pitchTime': spec('instrument', 'время падения', 0, 2, 0.01, 0.08, 'с'),
  'instrument.filterLow': spec('instrument', 'нижняя граница', 20, 4000, 1, 20, 'Гц', 'log'),
  'instrument.filterFreq': spec('instrument', 'верхняя граница', 60, 12000, 1, 8000, 'Гц', 'log'),
  'instrument.filterQ': spec('instrument', 'резонанс', 0.5, 20, 0.1, 0.8),
  'instrument.filterEnvAmount': spec('instrument', 'размах фильтра', -24, 24, 1, 0),
  'instrument.filterEnvTime': spec('instrument', 'время фильтра', 0.01, 4, 0.01, 0.3, 'с'),
  'instrument.vibratoRate': spec('instrument', 'скорость вибрато', 0.1, 30, 0.1, 5, 'Гц', 'log'),
  'instrument.vibratoDepth': spec('instrument', 'глубина вибрато', 0, 1200, 1, 0, 'центов'),
  'instrument.vibratoDelay': spec('instrument', 'задержка вибрато', 0, 4, 0.01, 0, 'с'),
  'instrument.unisonVoices': spec('instrument', 'голоса унисона', 1, 8, 1, 1),
  'instrument.unisonDetune': spec('instrument', 'расстройка унисона', 0, 50, 0.5, 12, 'центов'),
  'instrument.unisonSpread': spec('instrument', 'ширина унисона', 0, 1, 0.01, 0, '%'),
  'instrument.rootHz': spec('instrument', 'тоника записи', 1, 24000, 1, 440, 'Гц', 'log'),
  'instrument.loopCrossfadeMs': spec('instrument', 'стык петли', 0, 500, 1, 10, 'мс'),
  'instrument.sampleStart': spec('instrument', 'начало сэмпла', 0, 3600, 0.001, 0, 'с'),
  'instrument.sampleEnd': spec('instrument', 'конец сэмпла', 0.001, 3600, 0.001, 3600, 'с'),
  'instrument.grainSizeMs': spec('instrument', 'размер зерна', 10, 1000, 1, 120, 'мс', 'log'),
  'instrument.grainCount': spec('instrument', 'зёрен на ноту', 1, 32, 1, 10),
  'instrument.grainPos': spec('instrument', 'позиция облака', 0, 1, 0.01, 0.3, '%'),
  'instrument.grainScatter': spec('instrument', 'разброс облака', 0, 1, 0.01, 0.15, '%'),
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
