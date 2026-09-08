import { importTable, readTableWav } from './wavetableImport';
self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; size: number; count: number }>) => {
  try { const samples = readTableWav(event.data.buffer); self.postMessage({ frames: importTable(samples, event.data.size, event.data.count), sourceCount: samples.length / event.data.size }); }
  catch (error) { self.postMessage({ error: String(error instanceof Error ? error.message : error) }); }
};
