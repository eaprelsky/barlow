import { analyzeTimbre, estimateRoot } from './timbreAnalysis';
self.onmessage = (e: MessageEvent<{ samples: Float32Array; sampleRate: number; rootHz?: number }>) => {
  try { const {samples,sampleRate,rootHz}=e.data;self.postMessage(rootHz ? {sound:analyzeTimbre(samples,sampleRate,rootHz)} : {pitch:estimateRoot(samples,sampleRate)}); }
  catch(e){self.postMessage({error:String(e instanceof Error?e.message:e)});}
};
