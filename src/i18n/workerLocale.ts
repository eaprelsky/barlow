import { timbreAnalysis } from './catalogs/timbreAnalysis.ts';
import { wavetableImport } from './catalogs/wavetableImport.ts';

// Workers load only their own small catalog, not the complete help library.
const messages = { ...timbreAnalysis, ...wavetableImport };
let locale: 'ru' | 'en' = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ru';
export const setWorkerLocale = (next: 'ru' | 'en') => { locale = next; };
export const t = (key: keyof typeof messages) => messages[key][locale];
