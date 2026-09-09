import { t as msg, useLocale } from '../i18n';
import { useEffect, useState } from 'react';
import type { AudioBackend } from '../audio/backend';

export function AudioStatus({ engine, playing }: { engine: AudioBackend; playing: boolean }) {
  useLocale();
  const [status, setStatus] = useState(() => engine.diagnostics);
  useEffect(() => {
    const timer = window.setInterval(() => setStatus(engine.diagnostics), 500);
    return () => window.clearInterval(timer);
  }, [engine]);
  const details = msg("audioStatus.128Notes8192EstimatedVoiceNodes8192", {p0: engine.capabilities.name, p1: status.activeNotes, p2: status.estimatedNodes, p3: status.queuedEvents}) +
    msg("audioStatus.effects192Chains8192EstimatedNodes96", {p0: status.chains, p1: status.chainNodes, p2: (status.chainBufferBytes / 1048576).toFixed(1)}) +
    msg("audioStatus.sampleCache256MiBPCMSamplesPending", {p0: (status.decodedBytes / 1048576).toFixed(1), p1: status.decodedAssets, p2: status.pendingDecodes}) +
    msg("audioStatus.preparationMsJSSchedulerMaximumMsPasses", {p0: status.preparationMs.toFixed(1), p1: status.schedulerMaxMs.toFixed(1), p2: status.slowSchedulerCalls}) +
    (status.blockedTracks.length ? msg("audioStatus.notPlaying", {p0: status.blockedTracks.join(', ')}) : '');
  return <span className="audio-status" title={details}>
    {playing && <span aria-label={msg("audioStatus.activeNotes")}>♪ {status.activeNotes}</span>}
    <span role="status" aria-live="polite">
      {status.droppedEvents > 0 && msg("audioStatus.overloadSkipped", {p0: status.droppedEvents})}
      {status.lateEvents > 0 && msg("audioStatus.late", {p0: status.lateEvents})}
      {status.blockedTracks.length > 0 && msg("audioStatus.fxBudgetTracksBlocked", {p0: status.blockedTracks.length})}
    </span>
  </span>;
}
