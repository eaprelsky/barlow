import { useSyncExternalStore } from 'react';
import { subscribeLocale, getLocale, type Locale } from './runtime.ts';
export * from './runtime.ts';
export const useLocale = () => useSyncExternalStore(subscribeLocale, getLocale, () => 'ru' as Locale);
