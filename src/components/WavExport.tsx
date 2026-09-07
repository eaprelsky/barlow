import { useMemo, useRef, useState } from 'react';
import type { Patch, WavRenderOptions } from '../types';
import type { AudioBackend } from '../audio/backend';
import { Modal } from './Modal';

export function WavExport({ patch, sceneId, backend, onClose, onExport }: {
  patch: Patch; sceneId: string; onClose: () => void;
  backend: Pick<AudioBackend, 'capabilities' | 'estimateWav'>;
  onExport: (patch: Patch, bars: number, options: WavRenderOptions) => Promise<number>;
}) {
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
        throw new Error('Введи целое число тактов от 1 до 128.');
      const p = backend.estimateWav(snapshot, sceneId, bars, { tail });
      return { body: p.musicSeconds, total: p.maxSeconds, memory: p.workingBytes, memoryLimit: p.memoryLimitBytes, error: '' };
    } catch (e) { return { body: 0, total: 0, memory: 0, memoryLimit: 0, error: e instanceof Error ? e.message : String(e) }; }
  }, [backend, snapshot, sceneId, bars, tail]);
  const chain = snapshot.followChain && snapshot.chain.length > 0;
  const run = async () => {
    if (active.current || estimate.error) return;
    active.current = true; setBusy(true); setMessage('Рендерим звук. Для большого проекта это может занять несколько минут.');
    try {
      const seconds = await onExport(snapshot, bars, { tail });
      setMessage(`WAV готов: ${seconds.toFixed(2)} с. Файл передан на сохранение.`);
    } catch (e) { setMessage(`Не удалось записать WAV: ${e instanceof Error ? e.message : String(e)}`); }
    finally { active.current = false; setBusy(false); }
  };
  return <Modal label="Запись WAV" className="wav-export" onClose={() => { if (!active.current) onClose(); }}>
    <h2>Запись WAV</h2>
    <p>{chain ? 'Вся цепочка сцен, один проход.' : 'Текущая сцена.'} {backend.capabilities.wav.channels === 2 ? 'Стерео' : `${backend.capabilities.wav.channels} кан.`} · {(backend.capabilities.wav.sampleRate / 1000).toLocaleString('ru-RU')} кГц · PCM {backend.capabilities.wav.bits} bit</p>
    {!chain && <label>Длина сцены, тактов <input type="number" min={1} max={128} step={1} value={barsText} disabled={busy}
      onChange={e => { setBarsText(e.target.value); setMessage(''); }} /></label>}
    <fieldset disabled={busy}>
      <legend>Окончание файла</legend>
      <label><input type="radio" name="wav-tail" checked={tail === 'natural'} onChange={() => { setTail('natural'); setMessage(''); }} /> Дозвучать последней сцене</label>
      <p>Сохраняем релизы нот, эхо и реверберацию. FadeOut последней сцены не применяется; переходы внутри цепочки сохраняются.</p>
      <label><input type="radio" name="wav-tail" checked={tail === 'trim'} onChange={() => { setTail('trim'); setMessage(''); }} /> Точная граница композиции</label>
      <p>Файл заканчивается на границе выбранных тактов. Последние 5 мс плавно гаснут, чтобы избежать щелчка.</p>
    </fieldset>
    <p className={estimate.error ? 'error' : ''} role="status">{estimate.error || `Музыкальная часть: ${estimate.body.toFixed(2)} с. ${tail === 'natural' ? `С хвостом — до ${estimate.total.toFixed(2)} с; лишнюю тишину уберём.` : `Длина файла: ${estimate.body.toFixed(2)} с.`}`}</p>
    {!estimate.error && <p>Рабочие буферы и FX: около {(estimate.memory / 1048576).toFixed(1)} МиБ плюс сэмплы. Бюджет одновременных рендеров — {(estimate.memoryLimit / 1048576).toFixed(0)} МиБ.</p>}
    {message && <p role="status">{message}</p>}
    <div className="dialog-actions">
      <button onClick={onClose} disabled={busy}>закрыть</button>
      <button data-initial-focus className="primary" disabled={busy || !!estimate.error} onClick={() => void run()}>{busy ? 'рендер…' : 'записать WAV'}</button>
    </div>
  </Modal>;
}
