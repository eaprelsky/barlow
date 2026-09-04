// Левая док-панель «библиотека»: дерево инструментов (категории
// схлопиваются, свои пресеты, поиск) + сэмплы. Клик по пресету применяет
// его к целевой дорожке (селектор в шапке), ▶ — слушает тембр до
// применения; панель не закрывается — можно перебирать тембры подряд.
// Клик по сэмплу сажает его в инструмент целевой дорожки.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SampleMeta } from '../audio/library';
import {
  deleteSample,
  getSampleBlob,
  listSamples,
  revealSamplesDir,
  samplesDirLabel,
  samplesDirPick,
} from '../audio/library';
import type { InstrumentPreset } from '../music/instrumentPresets';
import {
  CATEGORY_ORDER,
  INSTRUMENT_PRESETS,
  USER_CATEGORY,
  deleteUserPreset,
  loadUserPresets,
} from '../music/instrumentPresets';
import type { Track } from '../types';
import { WAVEFORM_LABELS } from '../types';
import { isDesktop } from '../platform';
import { confirmDialog } from './dialogs';
import { HelpHint } from '../onboarding/Onboarding';

interface Props {
  tracks: Track[];
  /** Дорожка, куда применяются пресеты/сэмплы по клику. */
  targetId: string | null;
  onTarget: (id: string) => void;
  onApply: (trackId: string, preset: InstrumentPreset) => void;
  /** Слушать тембр пресета на тонике целевой дорожки (без применения). */
  onAudition: (trackId: string, preset: InstrumentPreset) => void;
  /** Сэмпл — в инструмент дорожки (волна «сэмпл»). */
  onAssignSample: (trackId: string, meta: SampleMeta) => void;
  usedSampleIds: Set<string>;
  onAddTrack: () => void;
  onClose: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

export function SoundBrowser({
  tracks,
  targetId,
  onTarget,
  onApply,
  onAudition,
  onAssignSample,
  usedSampleIds,
  onAddTrack,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  // Схлопнутые категории (по умолчанию все раскрыты).
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [samplesClosed, setSamplesClosed] = useState(false);
  // Удаление своего пресета/сэмпла перечитывает списки из хранилищ.
  const [listVersion, setListVersion] = useState(0);
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [dirLabel, setDirLabel] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const refreshSamples = useCallback(() => {
    void listSamples().then(setSamples).catch(() => setSamples([]));
  }, []);

  useEffect(() => {
    refreshSamples();
    if (isDesktop) void samplesDirLabel().then(setDirLabel);
    else setDirLabel(null);
  }, [refreshSamples]);

  // Закрытие панели останавливает прослушивание сэмпла.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const all = useMemo(
    () => [...loadUserPresets(), ...INSTRUMENT_PRESETS],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listVersion],
  );

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    // Поиск смотрит и в пояснение встроенных — «дабстеп» находит воббл.
    const filtered = q
      ? all.filter((p) =>
          [p.name, p.hint ?? '', p.category, WAVEFORM_LABELS[p.track.waveform ?? 'sine']]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : all;
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((p) => p.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [all, q]);

  const samplesShown = q
    ? samples.filter((s) => s.name.toLowerCase().includes(q))
    : samples;

  const removeUser = async (name: string) => {
    const ok = await confirmDialog({
      title: 'удалить пресет?',
      text: `«${name}» исчезнет из категории «мои». Дорожки, где он уже применён, не изменятся.`,
      okLabel: 'удалить',
      danger: true,
    });
    if (!ok) return;
    deleteUserPreset(name);
    setListVersion((v) => v + 1);
  };

  const playSample = (meta: SampleMeta, blobUrl: string) => {
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

  const toggleCat = (cat: string) =>
    setClosed((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const applyTo = targetId;
  const targetTrack = tracks.find((t) => t.id === targetId) ?? null;
  const waveOf = (p: InstrumentPreset) => WAVEFORM_LABELS[p.track.waveform ?? 'sine'];

  const presetRow = (p: InstrumentPreset) => {
    const user = p.category === USER_CATEGORY;
    const card = (
      <>
        <span className="inst-name">{p.name}</span>
        <span className="sb-wave">{waveOf(p)}</span>
        <span className="spacer" />
        <button
          className="sb-audition"
          title="Послушать тембр (нота тоники дорожки) — без применения"
          onClick={(e) => {
            e.stopPropagation();
            if (applyTo) onAudition(applyTo, p);
          }}
          disabled={!applyTo}
        >
          ▶
        </button>
        {user && (
          <button
            className="inst-del"
            title="Удалить пресет"
            onClick={(e) => {
              e.stopPropagation();
              void removeUser(p.name);
            }}
          >
            ✕
          </button>
        )}
      </>
    );
    return user ? (
      // div: внутри кнопки удаления, button в button нельзя
      <div
        key={p.name}
        className="inst-card user"
        role="button"
        tabIndex={0}
        title={p.hint ?? `волна: ${waveOf(p)}`}
        onClick={() => applyTo && onApply(applyTo, p)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && applyTo) onApply(applyTo, p);
        }}
      >
        {card}
      </div>
    ) : (
      <button
        key={p.name}
        className="inst-card"
        title={p.hint ?? `волна: ${waveOf(p)}`}
        disabled={!applyTo}
        onClick={() => applyTo && onApply(applyTo, p)}
      >
        {card}
      </button>
    );
  };

  return (
    <aside className="dock" data-ob="library-panel">
      <div className="sb-head">
        <span className="scenes-label">библиотека</span>
        <HelpHint guide="tracks" step={1} label="Гид: добавить инструмент" />
        <span className="spacer" />
        <button onClick={onClose} title="Скрыть панель">скрыть</button>
      </div>
      <input
        className="browser-search"
        data-ob="inst-search"
        placeholder="поиск: имя, тембр, категория…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* Куда применяется клик: пресет меняет тембр этой дорожки. */}
      <div className="sb-target">
        <span className="rt-label">в дорожку</span>
        {tracks.length > 0 ? (
          <select
            value={targetId ?? ''}
            onChange={(e) => onTarget(e.target.value)}
            title="Клик по пресету или сэмплу применит его к этой дорожке: тембр и строй сменятся, ноты и ритм останутся твоими"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <button onClick={onAddTrack} title="Пресету нужна дорожка">+ трек</button>
        )}
      </div>

      <div className="sb-list" data-ob="inst-cards">
        {groups.map((g) => (
          <div className="sb-cat" key={g.cat}>
            <div
              className="sb-cat-label"
              role="button"
              tabIndex={0}
              onClick={() => toggleCat(g.cat)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleCat(g.cat);
              }}
            >
              <span className={'sb-caret' + (closed.has(g.cat) ? '' : ' open')}>▸</span>
              {g.cat}
              <span className="sb-count">{g.items.length}</span>
            </div>
            {!closed.has(g.cat) && <div className="sb-cards">{g.items.map(presetRow)}</div>}
          </div>
        ))}
        {groups.length === 0 && samplesShown.length === 0 && (
          <p className="empty">Ничего не нашлось</p>
        )}
      </div>

      <div className="sb-cat sb-samples" data-ob="library">
        <div
          className="sb-cat-label"
          role="button"
          tabIndex={0}
          onClick={() => setSamplesClosed((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setSamplesClosed((v) => !v);
          }}
        >
          <span className={'sb-caret' + (samplesClosed ? '' : ' open')}>▸</span>
          сэмплы
          <span className="sb-count">{samples.length}</span>
          <span className="spacer" />
          {dirLabel && (
            <button
              className="sb-mini"
              title="Открыть папку сэмплов в проводнике"
              onClick={(e) => {
                e.stopPropagation();
                void revealSamplesDir();
              }}
            >
              папка
            </button>
          )}
          {isDesktop && (
            <button
              className="sb-mini"
              title="Выбрать другую папку: сэмплы переедут туда. Если в новой папке уже лежит библиотека (index.json) — будет использована она"
              onClick={(e) => {
                e.stopPropagation();
                void samplesDirPick().then((p) => {
                  if (p) {
                    setDirLabel(p);
                    refreshSamples();
                  }
                });
              }}
            >
              сменить…
            </button>
          )}
        </div>
        {!samplesClosed && (
          <div className="sb-sample-list">
            {samples.length === 0 && (
              <p className="empty">
                Пусто: загрузи файл или сгенерируй по описанию в сэмпл-треке
                {dirLabel ? `. Папка: ${dirLabel}` : ' (библиотека этого браузера)'}.
              </p>
            )}
            {samplesShown.map((meta) => {
              const used = usedSampleIds.has(meta.id);
              return (
                <div className="lib-item" key={meta.id}>
                  <button
                    className="lib-name"
                    disabled={!applyTo}
                    title={`Сажает сэмпл в инструмент дорожки${applyTo ? ` «${targetTrack?.name ?? ''}»` : ''}: волна станет «сэмпл», строй — скоростями воспроизведения`}
                    onClick={() => applyTo && onAssignSample(applyTo, meta)}
                  >
                    {meta.name}
                  </button>
                  <span className="mini-info">{fmtSize(meta.size)}</span>
                  {used && (
                    <span className="lib-used" title="Используется хотя бы одним треком — удалить нельзя">
                      в треке
                    </span>
                  )}
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
                        if (blob) playSample(meta, URL.createObjectURL(blob));
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
                    ⭳
                  </button>
                  <button
                    className="remove"
                    disabled={used}
                    title={used ? 'Используется треком — сначала отвяжи его' : 'Удалить из библиотеки'}
                    onClick={() => {
                      void deleteSample(meta.id).then(() => {
                        setListVersion((v) => v + 1);
                        refreshSamples();
                      });
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
