// Панель нативного звукового вывода (десктоп): WASAPI exclusive/shared.
// Этап 1 кампании порта движка в Rust — труба вывода и тест-тон; позже
// сюда же приедет микс движка и его настройки.

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DeviceInfo {
  id: string;
  name: string;
  default: boolean;
}

interface OutputInfo {
  device: string;
  rate: number;
  channels: number;
  exclusive: boolean;
  period_frames: number;
  format: string;
}

interface AudioSettings {
  device: string | null;
  exclusive: boolean;
  buffer: number;
}

const BUFFERS: [number, string][] = [
  [0, 'авто'],
  [64, '64'],
  [128, '128'],
  [256, '256'],
  [512, '512'],
  [1024, '1024'],
];

export function AudioPanel({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [exclusive, setExclusive] = useState(true);
  const [buffer, setBuffer] = useState(0);
  const [info, setInfo] = useState<OutputInfo | null>(null);
  const [tone, setTone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [ds, st, active] = await Promise.all([
          invoke<DeviceInfo[]>('audio_devices'),
          invoke<AudioSettings>('audio_settings'),
          invoke<OutputInfo | null>('audio_output_status'),
        ]);
        setDevices(ds);
        setDevice(st.device ?? '');
        setExclusive(st.exclusive);
        setBuffer(st.buffer);
        setInfo(active);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = async () => {
    setError('');
    try {
      setInfo(
        await invoke<OutputInfo>('audio_output_start', {
          device: device || null,
          exclusive,
          bufferFrames: buffer,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  };

  const stop = async () => {
    setTone(false);
    setError('');
    try {
      await invoke('audio_output_stop');
    } catch (e) {
      setError(String(e));
    }
    setInfo(null);
  };

  const toggleTone = async () => {
    const next = !tone;
    try {
      await invoke('audio_test_tone', { on: next });
      setTone(next);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal audio-panel" role="dialog" aria-modal="true">
        <h3>звуковой вывод</h3>
        <label title="Устройство, на которое играет нативный движок. «По умолчанию» — системное">
          устройство
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="">по умолчанию</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.default ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
        <label
          title="Exclusive — напрямую драйверу устройства, без виндового микшера: нет ресемплинга, системного лимитера и эффектов. Пока драйвер не позволит — тихий fallback в обычный режим"
        >
          <input
            type="checkbox"
            checked={exclusive}
            onChange={(e) => setExclusive(e.target.checked)}
          />
          exclusive-режим
        </label>
        <label title="Период буфера драйвера, фреймов: меньше — ниже латентность, выше нагрузка. «Авто» — ~1.5× минимума драйвера">
          буфер
          <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>
            {BUFFERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {info && (
          <p className="audio-info">
            играет: {info.device} — {info.rate} Гц, {info.channels} кан.,{' '}
            {info.exclusive ? 'exclusive' : 'shared'}, {info.format}, период ~
            {info.period_frames} фреймов
          </p>
        )}
        {error && <p className="audio-error">{error}</p>}
        <div className="modal-btns">
          {info ? (
            <>
              <button onClick={() => void toggleTone()}>
                {tone ? '■ тон' : 'тест-тон'}
              </button>
              <button onClick={() => void stop()}>остановить</button>
            </>
          ) : (
            <button onClick={() => void start()}>запустить</button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>закрыть</button>
        </div>
      </div>
    </div>
  );
}
