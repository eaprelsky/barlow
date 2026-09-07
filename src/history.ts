export interface HistoryState<T> {
  present: T;
  past: T[];
  future: T[];
  gesture: { id: string; base: T; future: T[] } | null;
}
type Action<T> = { type: 'set'; value: T } | { type: 'begin'; id: string }
  | { type: 'commit' | 'cancel'; id?: string } | { type: 'undo' | 'redo' };

/** Pure history reducer. No React updater owns mutable stacks or clocks. */
export function reduceHistory<T>(s: HistoryState<T>, a: Action<T>, limit = 100): HistoryState<T> {
  const push = (past: T[], value: T) => [...past, value].slice(-limit);
  switch (a.type) {
    case 'set':
      if (a.value === s.present) return s;
      return { ...s, present: a.value, future: [], past: s.gesture ? s.past : push(s.past, s.present) };
    case 'begin': {
      if (s.gesture?.id === a.id) return s;
      const next = reduceHistory(s, { type: 'commit' }, limit);
      return { ...next, gesture: { id: a.id, base: next.present, future: next.future } };
    }
    case 'commit':
      if (!s.gesture || (a.id !== undefined && a.id !== s.gesture.id)) return s;
      return { ...s, gesture: null, future: s.present === s.gesture.base ? s.gesture.future : s.future, past: s.present === s.gesture.base ? s.past : push(s.past, s.gesture.base) };
    case 'cancel':
      if (!s.gesture || (a.id !== undefined && a.id !== s.gesture.id)) return s;
      return { ...s, present: s.gesture.base, future: s.gesture.future, gesture: null };
    case 'undo': {
      if (s.gesture && s.present !== s.gesture.base) return reduceHistory(s, { type: 'cancel' }, limit);
      if (!s.past.length) return s;
      return { present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future], gesture: null };
    }
    case 'redo':
      if (!s.future.length) return s;
      return { present: s.future[0], past: push(s.past, s.present), future: s.future.slice(1), gesture: null };
  }
}

/** Application command boundary: an updater is evaluated once, outside React. */
export function createHistory<T>(initial: T) {
  let state: HistoryState<T> = { present: initial, past: [], future: [], gesture: null };
  const listeners = new Set<() => void>();
  const dispatch = (action: Action<T>) => {
    const next = reduceHistory(state, action);
    if (next === state) return;
    state = next;
    for (const cb of listeners) cb();
  };
  const set = (update: T | ((prev: T) => T)) => dispatch({ type: 'set', value: typeof update === 'function' ? (update as (prev: T) => T)(state.present) : update });
  return {
    snapshot: () => state,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    set,
    step: (update: T | ((prev: T) => T)) => { dispatch({ type: 'commit' }); set(update); },
    begin: (id: string) => dispatch({ type: 'begin', id }),
    commit: (id?: string) => dispatch({ type: 'commit', id }),
    cancel: (id?: string) => dispatch({ type: 'cancel', id }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
  };
}
