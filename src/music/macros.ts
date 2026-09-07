import { PARAMETERS, normalizeParameter, type ParameterId } from '../parameters';
export type InstrumentParameterId = Extract<ParameterId, `instrument.${string}`>;
export interface SoundMacro {
  id: string;
  name: string;
  value: number;
  /** Depth is model units, or octaves for logarithmic parameters. */
  bindings: { target: InstrumentParameterId; depth: number }[];
}
export function normalizeMacros(value: unknown): SoundMacro[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  return value.slice(0, 8).flatMap((m, index) => {
    if (!m || typeof m !== 'object') return [];
    const id = typeof m.id === 'string' && m.id.length <= 80 && !ids.has(m.id) ? m.id : `macro-${index + 1}`;
    if (ids.has(id)) return [];
    ids.add(id);
    const bindings = Array.isArray(m.bindings) ? m.bindings.slice(0, 8).filter((b: SoundMacro['bindings'][number]) =>
      b && typeof b.target === 'string' && b.target.startsWith('instrument.') && Object.hasOwn(PARAMETERS, b.target) && Number.isFinite(b.depth))
      .map((b: SoundMacro['bindings'][number]) => {
        const p = PARAMETERS[b.target], limit = p.scale === 'log' ? 16 : p.max - p.min;
        return { target: b.target, depth: Math.max(-limit, Math.min(limit, b.depth)) };
      }) : [];
    return [{ id, name: String(m.name ?? 'макрос').slice(0, 48), value: Number.isFinite(m.value) ? Math.max(0, Math.min(1, m.value)) : 0.5, bindings }];
  });
}
/** Pure, one-time resolution at the DSP boundary. Base knobs remain editable;
 * center (0.5) is neutral and removing a macro restores their exact values. */
export function resolveMacros<T extends { macros?: SoundMacro[] }>(source: T): T {
  if (!source.macros?.length) return source;
  const result = { ...source, macros: undefined } as T & Record<string, unknown>;
  for (const macro of normalizeMacros(source.macros) ?? []) for (const binding of macro.bindings) {
    const p = PARAMETERS[binding.target], field = binding.target.slice(11);
    const base = typeof result[field] === 'number' ? result[field] as number : p.initial;
    const offset = (macro.value - 0.5) * 2 * binding.depth;
    (result as Record<string, unknown>)[field] = normalizeParameter(binding.target,
      p.scale === 'log' ? base * 2 ** offset : base + offset);
  }
  return result;
}
export const DEFAULT_MACROS: SoundMacro[] = [
  { id: 'brightness', name: 'яркость', value: 0.5, bindings: [{ target: 'instrument.filterFreq', depth: 2 }] },
  { id: 'length', name: 'длина', value: 0.5, bindings: [{ target: 'instrument.decay', depth: 0.6 }] },
  { id: 'space', name: 'ширина', value: 0.5, bindings: [{ target: 'instrument.unisonSpread', depth: 0.5 }, { target: 'instrument.unisonDetune', depth: 12 }] },
];
