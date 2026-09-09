import { t as msg, useLocale } from '../i18n';
// Модалка выбора сэмпла в слот трека: список хранилища с прослушиванием,
// плюс загрузка файла с диска прямо отсюда (загрузил — сразу лёг в слот).

import { useEffect, useRef, useState } from 'react';
import type { SampleMeta } from '../audio/library';
import { getSampleBlob, listSamples, putSample } from '../audio/library';
import { Modal } from './Modal';

interface Props {
  currentId?: string;
  onPick: (meta: SampleMeta) => void;
  onClose: () => void;
  /** Открыть полную библиотеку (скачать/удалить) из пикера. */
  onOpenLibrary?: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return msg("samplePicker.mib", {p0: (bytes / 1024 / 1024).toFixed(1)});
  return msg("samplePicker.kib", {p0: Math.round(bytes / 1024)});
}

export function SamplePicker({ currentId, onPick, onClose, onOpenLibrary }: Props) {
  useLocale();
  const [samples, setSamples] = useState<SampleMeta[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const previewRequest = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listSamples().then(setSamples).catch(() => setSamples([]));
    return () => {
      previewRequest.current++;
      audioRef.current?.pause();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function togglePlay(meta: SampleMeta) {
    const request = ++previewRequest.current;
    audioRef.current?.pause();
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if (playingId === meta.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    void (async () => {
      const blob = await getSampleBlob(meta.id);
      if (!blob || request !== previewRequest.current) return;
      audioRef.current?.pause();
      urlRef.current = URL.createObjectURL(blob);
      const audio = new Audio(urlRef.current);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      setPlayingId(meta.id);
      await audio.play();
    })().catch(() => { if (request === previewRequest.current) { setPlayingId(null); setErr(msg("samplePicker.couldNotAuditionTheSample")); } });
  }

  const loadFile = (f: File) => {
    setErr('');
    putSample(f, f.name)
      .then((meta) => onPick(meta))
      .catch(() => setErr(msg("samplePicker.couldNotSaveTheSampleToStorage")));
  };

  return (
    <Modal label={msg("samplePicker.chooseSample")} className="picker" onClose={onClose}>
        <h3>{msg("samplePicker.chooseSample")}</h3>
        {samples === null ? (
          <p className="empty">{msg("samplePicker.loadingSamples")}</p>
        ) : samples.length === 0 ? (
          <p className="empty">{msg("samplePicker.noSamplesYetImportAnAudioFile")}</p>
        ) : (
          <div className="picker-list">
            {samples.map((meta) => (
              <div
                key={meta.id}
                className={'picker-item' + (meta.id === currentId ? ' current' : '')}
                title={msg("samplePicker.assignThisSampleToTheTrack")}
                onClick={() => onPick(meta)}
              >
                <button
                  className="picker-play"
                  title={playingId === meta.id ? msg("samplePicker.stop") : msg("samplePicker.audition")}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(meta);
                  }}
                >
                  {playingId === meta.id ? '■' : '▶'}
                </button>
                <button className="sample-name sb-apply" title={meta.name} onClick={e => { e.stopPropagation(); onPick(meta); }}>
                  {meta.name}
                </button>
                <span className="mini-info">{fmtSize(meta.size)}</span>
                <span className="mini-info">
                  {new Date(meta.createdAt).toLocaleDateString()}
                </span>
                {meta.id === currentId && <span className="lib-used">{msg("samplePicker.assigned")}</span>}
              </div>
            ))}
          </div>
        )}
        {err && <p className="empty">{err}</p>}
        <div className="modal-btns">
          <button onClick={() => fileRef.current?.click()} title={msg("samplePicker.saveThisFileToTheSampleLibrary")}>
            {msg("samplePicker.importFile")}</button>
          {onOpenLibrary && (
            <button
              title={msg("samplePicker.openTheInstrumentBrowserSSamplesTab")}
              onClick={onOpenLibrary}
            >
              {msg("samplePicker.allSamples")}</button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>{msg("samplePicker.close")}</button>
          <input
            ref={fileRef} type="file" accept="audio/*" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = '';
            }}
          />
        </div>
    </Modal>
  );
}
