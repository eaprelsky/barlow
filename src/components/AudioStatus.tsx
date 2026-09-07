import { useEffect, useState } from 'react';
import type { AudioBackend } from '../audio/backend';

export function AudioStatus({ engine, playing }: { engine: AudioBackend; playing: boolean }) {
  const [status, setStatus] = useState(() => engine.diagnostics);
  useEffect(() => {
    const timer = window.setInterval(() => setStatus(engine.diagnostics), 500);
    return () => window.clearInterval(timer);
  }, [engine]);
  const details = `${engine.capabilities.name}: ${status.activeNotes}/128 нот, ${status.estimatedNodes}/8192 условных узлов голосов, ${status.queuedEvents}/8192 событий. ` +
    `Эффекты: ${status.chains}/192 цепочек, ${status.chainNodes}/8192 условных узлов, ${(status.chainBufferBytes / 1048576).toFixed(1)}/96 МиБ буферов (оценка). ` +
    `Кэш сэмплов: ${(status.decodedBytes / 1048576).toFixed(1)}/256 МиБ PCM, ${status.decodedAssets} записей, ожидают загрузки: ${status.pendingDecodes}. ` +
    `Подготовка: ${status.preparationMs.toFixed(1)} мс. Планировщик JS: максимум ${status.schedulerMaxMs.toFixed(1)} мс, проходов дольше 25 мс: ${status.slowSchedulerCalls}. Это не измерение CPU аудиопотока.` +
    (status.blockedTracks.length ? ` Не звучат: ${status.blockedTracks.join(', ')}.` : '');
  return <span className="audio-status" title={details}>
    {playing && <span aria-label="Активные ноты">♪ {status.activeNotes}</span>}
    <span role="status" aria-live="polite">
      {status.droppedEvents > 0 && ` · перегрузка: пропущено ${status.droppedEvents}`}
      {status.lateEvents > 0 && ` · опоздало ${status.lateEvents}`}
      {status.blockedTracks.length > 0 && ` · бюджет FX: не звучат ${status.blockedTracks.length} тр.`}
    </span>
  </span>;
}
