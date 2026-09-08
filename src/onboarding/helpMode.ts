export const HELP_MODE_EVENT = 'barlow:point-help';
export function requestPointHelp() { window.dispatchEvent(new Event(HELP_MODE_EVENT)); }
let active = false;
const listeners = new Set<() => void>();
export const pointHelpSnapshot = () => active;
export function subscribePointHelp(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishPointHelp(value: boolean) {
  if (active === value) return;
  active = value;
  listeners.forEach(listener => listener());
}
