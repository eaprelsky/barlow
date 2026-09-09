import { setWorkerLocale } from '../i18n/workerLocale.ts';
import { analyzeTimbre, estimateRoot } from './timbreAnalysis';
self.onmessage = (e: MessageEvent<{ locale?: 'ru' | 'en'; samples: Float32Array; sampleRate: number; rootHz?: number }>) => {
  setWorkerLocale(e.data.locale === 'en' ? 'en' : 'ru');
  try { const {samples,sampleRate,rootHz}=e.data;self.postMessage(rootHz ? {sound:analyzeTimbre(samples,sampleRate,rootHz)} : {pitch:estimateRoot(samples,sampleRate)}); }
  catch(e){self.postMessage({error:String(e instanceof Error?e.message:e)});}
};
