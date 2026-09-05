// Левая док-панель «инструменты»: дерево пресетов (категории
// схлопываются, свои пресеты, поиск) + сэмплы. Клик по пресету применяет
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
  USER_PRESETS_EVENT,
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
  /** Имя пресета, совпадающего с инструментом целевой дорожки
   *  (instrumentNameOf) — карточка подсвечивается, до неё скролл. */
  targetPresetName?: string | null;
  /** Вкладка управляется снаружи: точка входа знает, что показать
   *  (пикер сэмплов открывает вкладку сэмплов). */
  tab: 'inst' | 'smp';
  onTab: (t: 'inst' | 'smp') => void;
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
  targetPresetName,
  tab,
  onTab,
  onApply,
  onAudition,
  onAssignSample,
  usedSampleIds,
  onAddTrack,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  // Схлопнутые категории инструментов (по умолчанию все раскрыты).
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);
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

  // Свои пресеты меняются мимо React (сохранение из редактора инструмента
  // пишет в localStorage напрямую) — слушаем событие и заодно синк вкладок
  // (storage приходит из других вкладок того же браузера).
  useEffect(() => {
    const bump = () => setListVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'barlow.instruments.v1') bump();
    };
    window.addEventListener(USER_PRESETS_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(USER_PRESETS_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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
  // Фокус текущего пресета дорожки: его категория раскрывается, карточка
  // подсвечивается классом .current и приезжает в поле зрения — видно,
  // от чего отталкиваешься при переборе тембров.
  useEffect(() => {
    if (tab !== 'inst' || !targetPresetName) return;
    const cat = all.find((p) => p.name === targetPresetName)?.category;
    if (!cat) return;
    setClosed((s) => {
      if (!s.has(cat)) return s;
      const next = new Set(s);
      next.delete(cat);
      return next;
    });
    // rAF: после раскрытия категории карточка уже в DOM.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector('.inst-card.current')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }, [tab, targetPresetName, all]);
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
    // Сэмпл-пресет без сэмпла не звучит: ▶ неактуален, а применение
    // перебрасывает на вкладку «сэмплы» — сэмпл выбрать сразу.
    const needsSample = p.track.waveform === 'sample' && !p.track.sampleId;
    const current = p.name === targetPresetName;
    const card = (
      <>
        <span className="inst-name">{p.name}</span>
        {current && (
          <span className="sb-current" title="Текущий инструмент целевой дорожки">
            •
          </span>
        )}
        <span className="sb-wave">{waveOf(p)}</span>
        <span className="spacer" />
        <button
          className="sb-audition"
          title={
            needsSample
              ? 'Слушать нечего: сэмпл ещё не выбран — примени пресет и выбери сэмпл на вкладке «сэмплы»'
              : 'Послушать тембр (нота тоники дорожки) — без применения'
          }
          onClick={(e) => {
            e.stopPropagation();
            if (applyTo && !needsSample) onAudition(applyTo, p);
          }}
          disabled={!applyTo || needsSample}
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
        className={'inst-card user' + (current ? ' current' : '')}
        role="button"
        tabIndex={0}
        title={p.hint ?? `волна: ${waveOf(p)}`}
        onClick={() => {
          if (!applyTo) return;
          onApply(applyTo, p);
          if (needsSample) onTab('smp');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && applyTo) {
            onApply(applyTo, p);
            if (needsSample) onTab('smp');
          }
        }}
      >
        {card}
      </div>
    ) : (
      <button
        key={p.name}
        className={'inst-card' + (current ? ' current' : '')}
        title={p.hint ?? `волна: ${waveOf(p)}`}
        disabled={!applyTo}
        onClick={() => {
          if (!applyTo) return;
          onApply(applyTo, p);
          if (needsSample) onTab('smp');
        }}
      >
        {card}
      </button>
    );
  };

  return (
    <aside className="dock" data-ob="library-panel">
      <div className="sb-head">
        <span className="scenes-label">инструменты</span>
        <HelpHint guide="tracks" step={1} label="Гид: добавить инструмент" />
        <span className="spacer" />
        <button onClick={onClose} title="Скрыть панель">скрыть</button>
      </div>
      {/* Вкладки: пресеты и сэмплы — явные, не теряются. Сэмпл-пресет
          без сэмпла сам перебрасывает сюда на «сэмплы». Вкладка
          управляется снаружи (App) — точка входа знает, что показать. */}
      <div className="seg sb-tabs">
        <button
          className={tab === 'inst' ? 'on' : ''}
          data-ob="sb-tab-instruments"
          onClick={() => onTab('inst')}
          title="Пресеты-инструменты по категориям: клик применяет к дорожке из селектора ниже"
        >
          пресеты
        </button>
        <button
          className={tab === 'smp' ? 'on' : ''}
          data-ob="sb-tab-samples"
          onClick={() => onTab('smp')}
          title="Все сэмплы: клик по имени сажает сэмпл в дорожку"
        >
          сэмплы ({samples.length})
        </button>
      </div>
      <div className="browser-search-wrap">
        <input
          className="browser-search"
          data-ob="inst-search"
          placeholder={tab === 'inst' ? 'поиск: имя, тембр, категория…' : 'поиск по имени сэмпла…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query !== '' && (
          <button
            className="search-clear"
            title="Очистить поиск"
            aria-label="очистить поиск"
            onClick={() => setQuery('')}
          >
            ✕
          </button>
        )}
      </div>
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

      {tab === 'inst' && (
        <>
          <div className="sb-list" data-ob="inst-cards" ref={listRef}>
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
            {groups.length === 0 && (
              <p className="empty">
                {q && samplesShown.length > 0
                  ? `Здесь нет, но в сэмплах есть совпадения (${samplesShown.length}) — вкладка «сэмплы»`
                  : 'Ничего не нашлось'}
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'smp' && (
        <div className="sb-samples" data-ob="library">
          <div className="sb-cat-label static">
            сэмплы
            <span className="spacer" />
            {dirLabel && (
              <button
                className="sb-mini"
                title="Открыть папку сэмплов в проводнике"
                onClick={() => void revealSamplesDir()}
              >
                папка
              </button>
            )}
            {isDesktop && (
              <button
                className="sb-mini"
                title="Выбрать другую папку: сэмплы переедут туда. Если в новой папке уже лежит библиотека (index.json) — будет использована она"
                onClick={() => {
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
          {dirLabel && <p className="sb-dir">{dirLabel}</p>}
          <div className="sb-sample-list">
            {samples.length === 0 && (
              <p className="empty">
                Пусто: загрузи файл («загрузить» в настройке инструмента дорожки)
                или сгенерируй по описанию.
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
                    title={used ? 'Используется треком — сначала отвяжи его' : 'Удалить сэмпл из хранилища'}
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
            {samples.length > 0 && samplesShown.length === 0 && (
              <p className="empty">Ничего не нашлось</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
