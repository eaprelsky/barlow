export const HELP_MODE_EVENT = 'barlow:point-help';
export function requestPointHelp() { window.dispatchEvent(new Event(HELP_MODE_EVENT)); }
