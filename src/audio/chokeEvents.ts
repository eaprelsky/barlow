export interface ChokeAddress { trackId: string; group?: number; priority?: number; order: number }
/** Input is chronological. Simultaneous events of the winning track survive
 * together; the choice does not depend on the order audio nodes are created. */
export function selectChokeEvents<T extends { at: number }>(events: readonly T[], address: (event: T) => ChokeAddress): T[] {
  const result: T[] = [];
  for (let start = 0; start < events.length;) {
    let end = start + 1;
    while (end < events.length && Math.abs(events[end].at - events[start].at) < 1e-7) end++;
    const winners = new Map<number, ChokeAddress>();
    const chunk = events.slice(start, end).map(event => ({ event, owner: address(event) }));
    for (const { owner } of chunk) {
      if (!owner.group) continue;
      const old = winners.get(owner.group);
      if (!old || (owner.priority ?? 0) > (old.priority ?? 0)
        || (owner.priority ?? 0) === (old.priority ?? 0) && owner.order > old.order) winners.set(owner.group, owner);
    }
    for (const { event, owner } of chunk)
      if (!owner.group || winners.get(owner.group)?.trackId === owner.trackId) result.push(event);
    start = end;
  }
  return result;
}
