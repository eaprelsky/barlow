import { t as msg, useLocale } from '../i18n';
import { useMemo, useRef, useState } from 'react';
import type { Patch, WavRenderOptions } from '../types';
import type { AudioBackend } from '../audio/backend';
import { Modal } from './Modal';

export function WavExport({ patch, sceneId, backend, onClose, onExport }: {
  patch: Patch; sceneId: string; onClose: () => void;
  backend: Pick<AudioBackend, 'capabilities' | 'estimateWav'>;
  onExport: (patch: Patch, bars: number, options: WavRenderOptions) => Promise<number>;
}) {
  useLocale();
  // One performance per dialog: estimate and render use exactly the same event
  // plan even for projects whose live performance is deliberately unseeded.
  const [snapshot] = useState(() => ({ ...patch, performanceSeed: patch.performanceSeed ?? crypto.getRandomValues(new Uint32Array(1))[0] }));
  const [barsText, setBarsText] = useState('8');
  const bars = Number(barsText);
  const [tail, setTail] = useState<WavRenderOptions['tail']>('natural');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef(false);
  const estimate = useMemo(() => {
    try {
      if (!(snapshot.followChain && snapshot.chain.length) && (!Number.isInteger(bars) || bars < 1 || bars > 128))
        throw new Error(msg("wavExport.enterAWholeNumberOfBarsFrom"));
      const p = backend.estimateWav(snapshot, sceneId, bars, { tail });
      return { body: p.musicSeconds, total: p.maxSeconds, memory: p.workingBytes, memoryLimit: p.memoryLimitBytes, error: '' };
    } catch (e) { return { body: 0, total: 0, memory: 0, memoryLimit: 0, error: e instanceof Error ? e.message : String(e) }; }
  }, [backend, snapshot, sceneId, bars, tail]);
  const chain = snapshot.followChain && snapshot.chain.length > 0;
  const run = async () => {
    if (active.current || estimate.error) return;
    active.current = true; setBusy(true); setMessage(msg("wavExport.renderingAudioALargeProjectMayTake"));
    try {
      const seconds = await onExport(snapshot, bars, { tail });
      setMessage(msg("wavExport.wavReadySTheFileWasSent", {p0: seconds.toFixed(2)}));
    } catch (e) { setMessage(msg("wavExport.couldNotSaveWAV", {p0: e instanceof Error ? e.message : String(e)})); }
    finally { active.current = false; setBusy(false); }
  };
  return <Modal label={msg("wavExport.exportWAV")} className="wav-export" onClose={() => { if (!active.current) onClose(); }}>
    <h2>{msg("wavExport.exportWAV")}</h2>
    <p>{chain ? msg("wavExport.onePassThroughTheEntireSceneSequence") : msg("wavExport.currentScene")} {backend.capabilities.wav.channels === 2 ? msg("wavExport.stereo") : msg("wavExport.ch", {p0: backend.capabilities.wav.channels})} · {(backend.capabilities.wav.sampleRate / 1000).toLocaleString('ru-RU')} {msg("wavExport.khzPCM")}{backend.capabilities.wav.bits} bit</p>
    {!chain && <label>{msg("wavExport.sceneLengthBars")}<input type="number" min={1} max={128} step={1} value={barsText} disabled={busy}
      onChange={e => { setBarsText(e.target.value); setMessage(''); }} /></label>}
    <fieldset disabled={busy}>
      <legend>{msg("wavExport.fileEnding")}</legend>
      <label><input type="radio" name="wav-tail" checked={tail === 'natural'} onChange={() => { setTail('natural'); setMessage(''); }} /> {msg("wavExport.keepTheLastSceneSTails")}</label>
      <p>{msg("wavExport.keepNoteReleasesDelayAndReverbTails")}</p>
      <label><input type="radio" name="wav-tail" checked={tail === 'trim'} onChange={() => { setTail('trim'); setMessage(''); }} /> {msg("wavExport.exactArrangementBoundary")}</label>
      <p>{msg("wavExport.theFileEndsAtTheSelectedBar")}</p>
    </fieldset>
    <p className={estimate.error ? 'error' : ''} role="status">{estimate.error || msg("wavExport.musicalDurationS", {p0: estimate.body.toFixed(2), p1: tail === 'natural' ? msg("wavExport.includingTailsUpToSExcessSilence", {p0: estimate.total.toFixed(2)}) : msg("wavExport.fileLengthS", {p0: estimate.body.toFixed(2)})})}</p>
    {!estimate.error && <p>{msg("wavExport.workingBuffersAndFXAbout")}{(estimate.memory / 1048576).toFixed(1)} {msg("wavExport.mibPlusSamplesConcurrentRenderBudget")}{(estimate.memoryLimit / 1048576).toFixed(0)} {msg("wavExport.mib")}</p>}
    {message && <p role="status">{message}</p>}
    <div className="dialog-actions">
      <button onClick={onClose} disabled={busy}>{msg("wavExport.close")}</button>
      <button data-initial-focus className="primary" disabled={busy || !!estimate.error} onClick={() => void run()}>{busy ? msg("wavExport.rendering") : msg("wavExport.exportWAV23")}</button>
    </div>
  </Modal>;
}
