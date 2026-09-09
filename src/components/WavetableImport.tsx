import { t as msg, useLocale, getLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { pickAudioFile } from '../platform';
export function WavetableImport({ onApply, onClose }: { onApply: (frames: number[][]) => void; onClose: () => void }) {
  useLocale();
  const input = useRef<HTMLInputElement>(null), worker = useRef<Worker | null>(null);
  const [file, setFile] = useState<File>(), [size, setSize] = useState(2048), [count, setCount] = useState(8);
  const [result, setResult] = useState<{ frames: number[][]; sourceCount: number }>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => () => worker.current?.terminate(), []);
  const cancel = () => { worker.current?.terminate(); worker.current = null; setBusy(false); };
  const load = async () => {
    if (!file) return; setError(''); setBusy(true); setResult(undefined);
    try {
      if (file.size > 16 * 1024 * 1024) throw Error(msg("wavetableImport.wavExceeds16MiB"));
      const w = new Worker(new URL('../music/wavetableImport.worker.ts', import.meta.url), { type: 'module' }); worker.current = w;
      w.onmessage = e => { if (e.data.error) setError(e.data.error); else setResult(e.data); cancel(); };
      w.onerror = () => { setError(msg("wavetableImport.couldNotProcessWAV")); cancel(); };
      const buffer = await file.arrayBuffer(); if (worker.current === w) w.postMessage({locale:getLocale(), buffer, size, count }, [buffer]);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); cancel(); }
  };
  const choose = (f: File) => { setFile(f); setResult(undefined); setError(''); };
  return <Modal label={msg("wavetableImport.importWavetable")} onClose={onClose}><div data-help="wave-import">
    <h3>{msg("wavetableImport.importWavetable")}</h3>
    <input hidden ref={input} type="file" accept=".wav" onChange={e => { if (e.target.files?.[0]) choose(e.target.files[0]); }} />
    <button disabled={busy} onClick={() => void pickAudioFile(() => input.current?.click()).then(f => { if (f) choose(f); }).catch(e => setError(String(e)))}>{msg("wavetableImport.openWAV")}</button> <span>{file?.name}</span>
    <div className="mseg-toolbar"><label>{msg("wavetableImport.samplesPerSourceFrame")}<select disabled={busy} value={size} onChange={e => { setSize(+e.target.value); setResult(undefined); }}>{[128,256,512,1024,2048,4096].map(n => <option key={n}>{n}</option>)}</select></label>
    <label>{msg("wavetableImport.instrumentFrames")}<select disabled={busy} value={count} onChange={e => { setCount(+e.target.value); setResult(undefined); }}>{[2,3,4,5,6,7,8].map(n => <option key={n}>{n}</option>)}</select></label></div>
    {busy && <progress aria-label={msg("wavetableImport.wavetableConversion")} />}
    {error && <p role="alert">{error}</p>}
    {result && <><output>{result.sourceCount} × {size} → {count} × 128</output><svg viewBox="0 0 560 100" className="mseg-graph">{result.frames.map((f,i) => <polyline key={i} fill="none" stroke="var(--accent)" opacity={.25 + i / count * .75} points={f.map((v,n) => `${n/127*560},${50-v*45}`).join(' ')} />)}</svg></>}
    <div className="mseg-toolbar">{busy ? <button onClick={cancel}>{msg("wavetableImport.cancelProcessing")}</button> : <button disabled={!file} onClick={() => void load()}>{msg("wavetableImport.prepare")}</button>}<button disabled={!result || busy} onClick={() => { onApply(result!.frames); onClose(); }}>{msg("wavetableImport.apply")}</button><button onClick={onClose}>{msg("wavetableImport.close")}</button></div>
  </div></Modal>;
}
