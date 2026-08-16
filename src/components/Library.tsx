// Панель «сэмплы»: библиотека IndexedDB — прослушать, скачать, удалить
// неиспользуемый. Контент живёт в браузере; переезд на папку — вместе с Tauri
// (меняется только audio/library.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SampleMeta } from '../audio/library';
import {
  deleteSample,
  getSampleBlob,
  listSamples,
  revealSamplesDir,
  samplesDirLabel,
  samplesDirPick,
} from '../audio/library';
import { isDesktop } from '../platform';

interface Props {
  open: boolean;
  usedIds: Set<string>;
  onClose: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

export function Library({ open, usedIds, onClose }: Props) {
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [dirLabel, setDirLabel] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    void listSamples().then(setSamples).catch(() => setSamples([]));
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      if (isDesktop) void samplesDirLabel().then(setDirLabel);
      else setDirLabel(null);
    }
  }, [open, refresh]);

  // Останавливаем прослушивание при закрытии панели.
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPlayingId(null);
    }
  }, [open]);

  if (!open) return null;

  const play = (meta: SampleMeta, blobUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    }
    const audio = new Audio(blobUrl);
    audioRef.current = audio;
    urlRef.current = blobUrl;
    audio.onended = () => setPlayingId(null);
    setPlayingId(meta.id);
    void audio.play();
  };

  return (
    <div className="lib-panel">
      <span className="scenes-label">
        сэмплы ({samples.length}) —{' '}
        {dirLabel ? `папка: ${dirLabel}` : 'библиотека этого браузера'}
      </span>
      <span className="spacer" />
      {dirLabel && (
        <button onClick={() => void revealSamplesDir()} title="Открыть папку сэмпла в проводнике">
          показать папку
        </button>
      )}
      {isDesktop && (
        <button
          title="Выбрать другую папку: сэмплы переедут туда. Если в новой папке уже лежит библиотека (index.json) — будет использована она"
          onClick={() => {
            void samplesDirPick().then((p) => {
              if (p) {
                setDirLabel(p);
                refresh();
              }
            });
          }}
        >
          сменить…
        </button>
      )}
      <button onClick={onClose} title="Скрыть панель">скрыть</button>
      {samples.length === 0 && <p className="empty">Пусто: загрузи файл или сгенерируй по описанию в сэмпл-треке.</p>}
      <div className="lib-list">
        {samples.map((meta) => {
          const used = usedIds.has(meta.id);
          return (
            <div className="lib-item" key={meta.id}>
              <span className="lib-name" title={`${meta.name} · ${fmtSize(meta.size)} · ${new Date(meta.createdAt).toLocaleString()}`}>
                {meta.name}
              </span>
              <span className="mini-info">{fmtSize(meta.size)}</span>
              {used && <span className="lib-used" title="Используется хотя бы одним треком — удалить нельзя">в треке</span>}
              <button
                title={playingId === meta.id ? 'Играет…' : 'Прослушать'}
                onClick={() => {
                  if (playingId === meta.id) {
                    audioRef.current?.pause();
                    setPlayingId(null);
                    return;
                  }
                  void (async () => {
                    const blob = await getSampleBlob(meta.id);
                    if (blob) play(meta, URL.createObjectURL(blob));
                  })();
                }}
              >
                {playingId === meta.id ? '■' : '▶'}
              </button>
              <button
                title="Скачать файлом"
                onClick={() => {
                  void (async () => {
                    const blob = await getSampleBlob(meta.id);
                    if (!blob) return;
                    const ext = blob.type.includes('wav') ? 'wav' : 'mp3';
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${meta.name.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  })();
                }}
              >
                скачать
              </button>
              <button
                className="remove"
                disabled={used}
                title={used ? 'Используется треком — сначала отвяжи его' : 'Удалить из библиотеки'}
                onClick={() => {
                  void deleteSample(meta.id).then(refresh);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
