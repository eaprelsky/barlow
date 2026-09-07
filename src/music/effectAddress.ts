import { normalizeEffects, uid, type Effect, type Mod } from '../types';
export const effectId = (effect: Effect, index: number) => effect.id ?? `fx-${index}`;
export const effectIndex = (effects: Effect[], id?: string) => id === undefined ? (effects.length ? 0 : -1) : effects.findIndex((e, i) => effectId(e, i) === id);
export function sameAddress(address: { target: string; fxId?: string }, target: string, fxId: string | undefined, effects: Effect[]): boolean {
  const first = effects[0] ? effectId(effects[0], 0) : undefined;
  return address.target === target && (!target.startsWith('fx') || (address.fxId ?? first) === (fxId ?? first));
}
/** A preset is a new FX instance. Old curves must not silently retarget it. */
export function instantiateEffects(raw: Effect[] = [], mods: Mod[] = []) {
  const old = normalizeEffects(raw), ids = new Map(old.map(e => [e.id, uid('fx')]));
  return { effects: old.map(e => ({ ...e, id: ids.get(e.id)! })),
    mods: mods.map(m => ({ ...m, fxId: m.target.startsWith('fx') ? ids.get(m.fxId ?? old[0]?.id) ?? m.fxId : m.fxId })) };
}
