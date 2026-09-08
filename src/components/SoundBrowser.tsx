import { prepareInstrument, installInstrument } from '../audio/instrumentFile';
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
  LIBRARY_CHANGED_EVENT,
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
import { sampleAssets } from '../music/sampleZones';
import { recommendedHz } from '../music/audition';
import { isDesktop, saveBlob, pickInstrumentFile } from '../platform';
import { alertDialog, confirmDialog, promptDialog } from './dialogs';
import { HelpHint } from '../onboarding/Onboarding';
import { SOUND_PACKS, presetPackOf, presetMatches, soundMatches, presetFavoriteId, sampleFavoriteId, loadSoundFavorites, saveSoundFavorites, FAVORITES_KEY, FAVORITES_EVENT } from '../music/soundSearch';

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
  /** Слушать тембр в рекомендуемом регистре (без применения). */
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
  const [transfer, setTransfer] = useState<'reading'|'installing'|null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  useEffect(() => () => { importGeneration.current++; }, []);
  const readInstrument = async (file: File) => {
    const request=++importGeneration.current;setTransfer('reading');
    try {
      const prepared=await prepareInstrument(file);
      if(request!==importGeneration.current) return;
      const name=await promptDialog({title:'добавить инструмент из файла',
        text:`${prepared.preset.name} · записей: ${prepared.samples.length}. Появится в «Мои инструменты». Текущая партия не изменится.`,
        input:{value:prepared.preset.name,placeholder:'Имя инструмента'},okLabel:'добавить'});
      if(name===null || request!==importGeneration.current) return;
      setTransfer('installing');const saved=await installInstrument(prepared,name);
      setQuery(saved);setPack('user');setFavoritesOnly(false);onTab('inst');
      setClosed(prev=>{const next=new Set(prev);next.delete(USER_CATEGORY);return next;});
    } catch(error) { if(request===importGeneration.current) await alertDialog(String(error),'не удалось импортировать инструмент'); }
    finally { if(request===importGeneration.current) setTransfer(null); }
  };
  const [query, setQuery] = useState('');
  const [pack, setPack] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteState, setFavoriteState] = useState(() => {
    try { return { ids: loadSoundFavorites(), error: '' }; }
    catch (e) { return { ids: new Set<string>(), error: String(e) }; }
  });
  const favorites = favoriteState.ids;
  const [libraryError, setLibraryError] = useState('');
  const libraryRequest = useRef(0);
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
  const previewRequest = useRef(0);

  const refreshSamples = useCallback(() => {
    const request = ++libraryRequest.current;
    void listSamples().then(s => { if (request === libraryRequest.current) { setSamples(s); setLibraryError(''); } })
      .catch(e => { if (request === libraryRequest.current) setLibraryError(`Не удалось прочитать библиотеку: ${String(e)}`); });
  }, []);

  useEffect(() => {
    refreshSamples();
    if (isDesktop) void samplesDirLabel().then(setDirLabel).catch(e => setLibraryError(String(e)));
    else setDirLabel(null);
    window.addEventListener(LIBRARY_CHANGED_EVENT, refreshSamples);
    return () => { ++libraryRequest.current; window.removeEventListener(LIBRARY_CHANGED_EVENT, refreshSamples); };
  }, [refreshSamples]);

  useEffect(() => {
    const reload = () => { try { setFavoriteState({ ids: loadSoundFavorites(), error: '' }); } catch (e) { setFavoriteState(s => ({ ...s, error: String(e) })); } };
    const storage = (e: StorageEvent) => { if (e.key === FAVORITES_KEY) reload(); };
    window.addEventListener(FAVORITES_EVENT, reload); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(FAVORITES_EVENT, reload); window.removeEventListener('storage', storage); };
  }, []);
  const toggleFavorite = (id: string) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { saveSoundFavorites(next); } catch (e) { setFavoriteState(s => ({ ...s, error: String(e) })); }
  };
  const star = (id: string, name: string) => <button className="sb-favorite" data-help="favorite" aria-label={`Избранное: ${name}`}
    aria-pressed={favorites.has(id)} title={favorites.has(id) ? 'Убрать из избранного' : 'Добавить в избранное'}
    onClick={() => toggleFavorite(id)}>{favorites.has(id) ? '★' : '☆'}</button>;

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

  // Смена вкладки и закрытие отменяют также ещё не закончившуюся загрузку.
  useEffect(() => {
    setPlayingId(null);
    return () => {
      ++previewRequest.current;
      audioRef.current?.pause();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [tab]);

  const all = useMemo(
    () => [...loadUserPresets(), ...INSTRUMENT_PRESETS],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listVersion],
  );

  const q = query.trim().toLowerCase();
  const reservedSamples = new Set([...usedSampleIds, ...all.flatMap(p => sampleAssets(p.track).map(a => a.sampleId))]);
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
    const filtered = all.filter(p => (!pack || presetPackOf(p) === pack)
      && (!favoritesOnly || favorites.has(presetFavoriteId(p))) && presetMatches(p, q));
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((p) => p.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [all, q, pack, favoritesOnly, favorites]);

  const samplesShown = samples.filter(s => soundMatches(s.name, q) && (!favoritesOnly || favorites.has(sampleFavoriteId(s.id))));

  const removeUser = async (name: string) => {
    const ok = await confirmDialog({
      title: 'удалить пресет?',
      text: `«${name}» исчезнет из категории «мои». Дорожки, где он уже применён, не изменятся.`,
      okLabel: 'удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      deleteUserPreset(name);
      setListVersion((v) => v + 1);
    } catch (error) { await alertDialog(String(error), 'не удалось удалить пресет'); }
  };

  const playSample = async (meta: SampleMeta) => {
    const request = ++previewRequest.current;
    audioRef.current?.pause(); audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (playingId === meta.id) { setPlayingId(null); return; }
    setPlayingId(meta.id);
    setLibraryError('');
    try {
      const blob = await getSampleBlob(meta.id);
      if (request !== previewRequest.current) return;
      if (!blob) throw new Error('Запись отсутствует в библиотеке.');
      const url = URL.createObjectURL(blob), audio = new Audio(url);
      audioRef.current = audio; urlRef.current = url;
      audio.onended = () => { if (request === previewRequest.current) setPlayingId(null); };
      await audio.play();
    } catch (e) {
      if (request === previewRequest.current) { setPlayingId(null); setLibraryError(`Прослушивание: ${String(e)}`); }
    }
  };

  const downloadSample = async (meta: SampleMeta) => {
    try {
      const blob = await getSampleBlob(meta.id);
      if (!blob) throw new Error('Запись отсутствует в библиотеке.');
      const ext = ({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'weba' } as Record<string, string>)[blob.type] ?? 'bin';
      const name = meta.name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.(wav|mp3|m4a|ogg|flac|weba|webm|bin)$/i, '');
      await saveBlob(blob, `${name}.${ext}`);
    } catch (e) { setLibraryError(`Сохранение: ${String(e)}`); }
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
  // Бейдж источника: у волны (v39 — почти все пресеты) он не говорит
  // ничего — показываем только сэмпл.
  const waveOf = (p: InstrumentPreset) =>
    p.track.waveform === 'sample' ? WAVEFORM_LABELS.sample : '';

  const presetRow = (p: InstrumentPreset) => {
    const user = p.category === USER_CATEGORY;
    // Сэмпл-пресет без сэмпла не звучит: ▶ неактуален, а применение
    // перебрасывает на вкладку «сэмплы» — сэмпл выбрать сразу.
    const needsSample = p.track.waveform === 'sample' && sampleAssets(p.track).length === 0;
    const current = p.name === targetPresetName;
    const card = (
      <>
        <button className="sb-apply" data-help="preset-apply" data-help-detail={p.hint} disabled={!applyTo} onClick={() => {
          if (!applyTo) return;
          onApply(applyTo, p);
          if (needsSample) onTab('smp');
        }}>
        <span className="inst-name">{p.name}</span>
        {current && (
          <span className="sb-current" title="Текущий инструмент целевой дорожки">
            •
          </span>
        )}
        <span className="sb-wave">{waveOf(p)}</span>
        </button>
        <button
          className="sb-audition"
          data-ob="preset-audition"
          aria-label={`прослушать ${p.name}`}
          title={
            needsSample
              ? 'Слушать нечего: сэмпл ещё не выбран — примени пресет и выбери сэмпл на вкладке «сэмплы»'
              : `Послушать тембр: ${recommendedHz(p.track)} Гц — без изменения дорожки`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (applyTo && !needsSample) onAudition(applyTo, p);
          }}
          disabled={!applyTo || needsSample}
        >
          ▶
        </button>
        {star(presetFavoriteId(p), p.name)}
        {user ? (
          <button
            className="inst-del" data-help="preset-delete"
            aria-label={`удалить пресет ${p.name}`}
            title="Удалить пресет"
            onClick={(e) => {
              e.stopPropagation();
              void removeUser(p.name);
            }}
          >
            ✕
          </button>
        ) : <span className="sb-delete-space" aria-hidden="true" />}
      </>
    );
    return (
      <div
        key={p.id ?? p.name}
        className={'inst-card' + (user ? ' user' : '') + (current ? ' current' : '')}
        role="group"
        aria-label={p.name}
        title={p.hint ?? `волна: ${waveOf(p)}`}
      >
        {card}
      </div>
    );
  };

  return (
    <aside className="dock" data-ob="library-panel">
      <div className="sb-head">
        <span className="scenes-label">инструменты</span>
        <HelpHint guide="browser" step={1} label="Гид: найти и выбрать звук" />
        <span className="spacer" />
        <button data-help="panel-close" onClick={onClose} title="Скрыть панель">скрыть</button>
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
          aria-label="поиск звука"
          data-ob="inst-search"
          placeholder={tab === 'inst' ? 'поиск: имя, тембр, категория…' : 'поиск по имени сэмпла…'}
          value={query}
          maxLength={256}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query !== '' && (
          <button
            className="search-clear" data-help="search-clear"
            title="Очистить поиск"
            aria-label="очистить поиск"
            onClick={() => setQuery('')}
          >
            ✕
          </button>
        )}
      </div>
      {tab === 'inst' && <div className="sb-transfer" data-help="instrument-import">
        <input ref={importInput} type="file" hidden accept=".zip,.barlow-instrument.zip" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file) void readInstrument(file);}} />
        <button disabled={!!transfer} onClick={async()=>{try { const file=await pickInstrumentFile(()=>importInput.current?.click());if(file) await readInstrument(file); }
          catch(error) { await alertDialog(String(error),'не удалось открыть файл'); }}}>из файла…</button>
        {transfer && <span role="status">{transfer==='reading'?'проверяем…':'добавляем…'}</span>}
        {transfer==='reading' && <button data-help="instrument-import-cancel" onClick={()=>{importGeneration.current++;setTransfer(null);}}>отмена</button>}
      </div>}
      <div className="sb-filters">
        {tab === 'inst' && <label className="sb-pack">пакет <select data-help="library-pack" aria-label="Пакет звуков" value={pack} onChange={e => setPack(e.target.value)}>
          <option value="">все пакеты</option>
          {SOUND_PACKS.map(p => <option key={p.id} value={p.id}>{p.name} ({all.filter(s => presetPackOf(s) === p.id).length})</option>)}
        </select></label>}
        <label><input data-help="favorites-only" type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} /> только избранное</label>
        <span role="status">найдено: {tab === 'inst' ? groups.reduce((n, g) => n + g.items.length, 0) : samplesShown.length}</span>
        {(pack || favoritesOnly || query) && <button data-help="filters-reset" onClick={() => { setPack(''); setFavoritesOnly(false); setQuery(''); }}>сбросить фильтры</button>}
      </div>
      {favoriteState.error && <p className="error" role="alert">{favoriteState.error}</p>}
      {libraryError && <p className="error" role="alert">{libraryError} <button onClick={refreshSamples}>обновить список</button></p>}
      {/* Куда применяется клик: пресет меняет тембр этой дорожки. */}
      <div className="sb-target">
        <span className="rt-label">в дорожку</span>
        {tracks.length > 0 ? (
          <select
            value={targetId ?? ''}
            onChange={(e) => onTarget(e.target.value)}
            title="Клик по пресету или сэмплу применит его к этой дорожке: сменится тембр (пустому треку — ещё и регистр), а шкала, ноты и ритм останутся твоими"
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
                  className="sb-cat-label" data-help="library-category"
                  role={q ? 'heading' : 'button'}
                  aria-level={q ? 3 : undefined}
                  tabIndex={q ? undefined : 0}
                  aria-expanded={q ? undefined : !closed.has(g.cat)}
                  onClick={() => { if (!q) toggleCat(g.cat); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!q) toggleCat(g.cat); }
                  }}
                >
                  <span className={'sb-caret' + (q || !closed.has(g.cat) ? ' open' : '')}>▸</span>
                  {g.cat}
                  <span className="sb-count">{g.items.length}</span>
                </div>
                {(q || !closed.has(g.cat)) && <div className="sb-cards">{g.items.map(presetRow)}</div>}
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
                  }).catch(e => setLibraryError(String(e)));
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
              const used = reservedSamples.has(meta.id);
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
                  {star(sampleFavoriteId(meta.id), meta.name)}
                  {used && (
                    <span className="lib-used" title="Используется проектом или сохранённым пресетом — удалить нельзя">
                      используется
                    </span>
                  )}
                  <button
                    title={playingId === meta.id ? 'Остановить прослушивание / загрузку' : 'Прослушать'}
                    aria-label={`${playingId === meta.id ? 'Остановить' : 'Прослушать'} сэмпл ${meta.name}`}
                    onClick={() => void playSample(meta)}
                  >
                    {playingId === meta.id ? '■' : '▶'}
                  </button>
                  <button
                    title="Скачать файлом"
                    aria-label={`Скачать сэмпл ${meta.name}`}
                    onClick={() => void downloadSample(meta)}
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
                      }).catch(e => setLibraryError(`Удаление: ${String(e)}`));
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
