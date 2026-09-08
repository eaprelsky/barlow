import type { SoundingTrack } from '../types';

export interface ChainResources { chains: number; nodes: number; bufferBytes: number }
export const LIVE_CHAIN_LIMITS: ChainResources = { chains: 192, nodes: 8192, bufferBytes: 96 * 1024 * 1024 };
export const OFFLINE_CHAIN_LIMITS: ChainResources = { chains: 512, nodes: 32768, bufferBytes: 192 * 1024 * 1024 };
export const emptyResources = (): ChainResources => ({ chains: 0, nodes: 0, bufferBytes: 0 });
export function addResources(a: ChainResources, b: ChainResources): ChainResources {
  return { chains: a.chains + b.chains, nodes: a.nodes + b.nodes, bufferBytes: a.bufferBytes + b.bufferBytes };
}
export function estimateChainResources(st: Pick<SoundingTrack, 'effects' | 'mods'>, sampleRate = 44100): ChainResources {
  let nodes = 9, bufferBytes = 0;
  for (const fx of st.effects ?? []) {
    nodes += 1; // bypass control
    nodes += fx.type === 'eq' ? 15 : fx.type === 'delay' ? 18 : fx.type === 'chorus' ? 13 : 10;
    // Four raw stereo impulses allows room for convolver processing/storage.
    // This is deliberately conservative, not a measured browser allocation.
    if (fx.type === 'reverb') bufferBytes += Math.ceil(fx.sizeSec * sampleRate) * 2 * 4 * 4;
    if (fx.type === 'delay') bufferBytes += Math.ceil(2.5 * sampleRate) * 2 * 4;
    if (fx.type === 'chorus') bufferBytes += Math.ceil(.1 * sampleRate) * 2 * 4;
  }
  for (const mod of st.mods ?? []) {
    nodes += 2;
    // Noise modulation uses a 16-second buffer played at variable rate.
    if (mod.source === 'sah' || mod.source === 'perlin') bufferBytes += Math.ceil(16 * sampleRate) * 4;
  }
  return { chains: 1, nodes, bufferBytes };
}
export function resourcesFit(value: ChainResources, limit: ChainResources): boolean {
  return Object.entries(value).every(([key, n]) => Number.isFinite(n) && n >= 0 && n <= limit[key as keyof ChainResources]);
}
export class ChainBudgetError extends Error {
  constructor() { super('Превышен бюджет цепочек эффектов. Уменьши число или длину ревербераций, шумовых модуляторов либо экспортируй проект частями.'); this.name = 'ChainBudgetError'; }
}
export class ChainBudget {
  private entries = new Map<object, ChainResources>();
  readonly limits: ChainResources;
  constructor(limits: ChainResources) { this.limits = limits; }
  get usage(): ChainResources { return [...this.entries.values()].reduce(addResources, emptyResources()); }
  reserve(key: object, value: ChainResources): void {
    const previous = this.entries.get(key) ?? emptyResources(), used = this.usage;
    const proposed = { chains: used.chains - previous.chains + value.chains, nodes: used.nodes - previous.nodes + value.nodes, bufferBytes: used.bufferBytes - previous.bufferBytes + value.bufferBytes };
    if (!resourcesFit(proposed, this.limits)) throw new ChainBudgetError();
    this.entries.set(key, value);
  }
  release(key: object): void { this.entries.delete(key); }
}
const contexts = new WeakMap<BaseAudioContext, ChainBudget>();
export function chainBudgetOf(ctx: BaseAudioContext): ChainBudget {
  let budget = contexts.get(ctx);
  if (!budget) { budget = new ChainBudget('startRendering' in ctx ? OFFLINE_CHAIN_LIMITS : LIVE_CHAIN_LIMITS); contexts.set(ctx, budget); }
  return budget;
}
export interface ChainLease { resize: (st: Pick<SoundingTrack, 'effects' | 'mods'>) => void; release: () => void }
export function reserveChain(ctx: BaseAudioContext, st: Pick<SoundingTrack, 'effects' | 'mods'>): ChainLease {
  const budget = chainBudgetOf(ctx), key = {};
  budget.reserve(key, estimateChainResources(st, ctx.sampleRate));
  let released = false;
  return {
    resize: next => { if (!released) budget.reserve(key, estimateChainResources(next, ctx.sampleRate)); },
    release: () => { if (!released) { budget.release(key); released = true; } },
  };
}
