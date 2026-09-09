import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
export const THEME_KEY = 'barlow.theme.v1';
export const THEME_EVENT = 'barlow:theme';
const current = (): Theme => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function setTheme(theme: Theme) {
  // Do not claim the preference was saved if storage rejected the write.
  localStorage.setItem(THEME_KEY, theme);
  apply(theme);
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) apply(event.newValue === 'light' ? 'light' : 'dark');
  };
  window.addEventListener(THEME_EVENT, notify);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(THEME_EVENT, notify); window.removeEventListener('storage', storage); };
}
export const useTheme = () => useSyncExternalStore(subscribe, current, () => 'dark' as Theme);
