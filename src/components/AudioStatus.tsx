import { useEffect, useState } from 'react';
import type { AudioBackend } from '../audio/backend';

export function AudioStatus({ engine, playing }: { engine: AudioBackend; playing: boolean }) {
  const [status, setStatus] = useState(() => engine.diagnostics);
  useEffect(() => {
    const timer = window.setInterval(() => setStatus(engine.diagnostics), 500);
    return () => window.clearInterval(timer);
  }, [engine]);
  const details = `${status.activeNotes}/128 нот, ${status.estimatedNodes}/8192 условных узлов, ${status.queuedEvents}/8192 событий в очереди. Оценка ресурсов, не загрузка CPU.`;
  return <span className="audio-status" title={details}>
    {playing && <span aria-label="Активные ноты">♪ {status.activeNotes}</span>}
    <span role="status" aria-live="polite">
      {status.droppedEvents > 0 && ` · перегрузка: пропущено ${status.droppedEvents}`}
      {status.lateEvents > 0 && ` · опоздало ${status.lateEvents}`}
    </span>
  </span>;
}
