// Модалка выбора сэмпла в слот трека: список библиотеки с прослушиванием,
// плюс загрузка файла с диска прямо отсюда (загрузил — сразу лёг в слот).

import { useEffect, useRef, useState } from 'react';
import type { SampleMeta } from '../audio/library';
import { getSampleBlob, listSamples, putSample } from '../audio/library';

interface Props {
  currentId?: string;
  onPick: (meta: SampleMeta) => void;
  onClose: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

export function SamplePicker({ currentId, onPick, onClose }: Props) {
  const [samples, setSamples] = useState<SampleMeta[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listSamples().then(setSamples).catch(() => setSamples([]));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
    };
  }, [onClose]);

  function togglePlay(meta: SampleMeta) {
    if (playingId === meta.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    void (async () => {
      const blob = await getSampleBlob(meta.id);
      if (!blob) return;
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      setPlayingId(meta.id);
      void audio.play();
    })();
  }

  const loadFile = (f: File) => {
    setErr('');
    putSample(f, f.name)
      .then((meta) => onPick(meta))
      .catch(() => setErr('Не удалось сохранить сэмпл в библиотеку'));
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal picker" role="dialog" aria-modal="true">
        <h3>сэмпл в слот</h3>
        {samples === null ? (
          <p className="empty">загружаю библиотеку…</p>
        ) : samples.length === 0 ? (
          <p className="empty">Библиотека пуста — загрузи файл с диска.</p>
        ) : (
          <div className="picker-list">
            {samples.map((meta) => (
              <div
                key={meta.id}
                className={'picker-item' + (meta.id === currentId ? ' current' : '')}
                title="Клик — положить этот сэмпл в слот трека"
                onClick={() => onPick(meta)}
              >
                <button
                  className="picker-play"
                  title={playingId === meta.id ? 'Стоп' : 'Прослушать'}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(meta);
                  }}
                >
                  {playingId === meta.id ? '■' : '▶'}
                </button>
                <span className="sample-name" title={meta.name}>
                  {meta.name}
                </span>
                <span className="mini-info">{fmtSize(meta.size)}</span>
                <span className="mini-info">
                  {new Date(meta.createdAt).toLocaleDateString()}
                </span>
                {meta.id === currentId && <span className="lib-used">в слоте</span>}
              </div>
            ))}
          </div>
        )}
        {err && <p className="empty">{err}</p>}
        <div className="modal-btns">
          <button onClick={() => fileRef.current?.click()} title="Файл сохранится в библиотеку и ляжет в слот">
            загрузить файл…
          </button>
          <span className="spacer" />
          <button onClick={onClose}>закрыть</button>
          <input
            ref={fileRef} type="file" accept="audio/*" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}
