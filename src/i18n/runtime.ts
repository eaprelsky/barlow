import { setWorkerLocale } from './workerLocale.ts';
import { messages, type MessageKey } from './messages.ts';
export type Locale = 'ru' | 'en';
export const LOCALE_KEY = 'barlow.locale.v1';
const EVENT = 'barlow:locale';
let locale: Locale = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ru';
export const getLocale = () => locale;
export function setLocale(next: Locale) {
  localStorage.setItem(LOCALE_KEY, next);
  applyLocale(next);
}
function applyLocale(next: Locale) {
  locale = next;
  setWorkerLocale(next);
  document.documentElement.lang = next;
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeLocale(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === LOCALE_KEY || event.key === null) applyLocale(event.newValue === 'en' ? 'en' : 'ru');
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage); };
}
/** Complete messages only: interpolated values are opaque user data. */
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return messages[key][locale].replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
export const formatCount = (n: number) => new Intl.NumberFormat(locale).format(n);
export const pluralCategory = (n: number) => new Intl.PluralRules(locale).select(n);
