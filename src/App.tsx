import { t as msg, useLocale, setLocale } from './i18n';
import { useTheme, setTheme } from './theme';
import { SoundWorkshop } from './components/SoundWorkshop';
import { LearningStudio } from './components/LearningStudio';
import { Knob } from './components/Knob';
import { PackManager } from './components/PackManager';
import { MainMenu } from './components/MainMenu';
import { pickInstrumentFile } from './platform';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createHistory } from './history';
import { EditGestureContext } from './components/editGesture';
import { Modal } from './components/Modal';
import type { Dispatch, SetStateAction } from 'react';
import { AudioEngine } from './audio/engine';
import { AudioStatus } from './components/AudioStatus';
import { instantiateEffects } from './music/effectAddress';
import { BridgeSettings } from './components/BridgeSettings';
import { WavExport } from './components/WavExport';
import { loadBridgeSession, saveBridgeSession, type BridgeSession, type BridgeStatus } from './bridgeSession';
import { stepIndexAt } from './audio/timing';
import type { AudioBackend } from './audio/backend';
import { euclid, randomMask } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { SCALE_PRESETS } from './music/scales';
import { mutatePattern, scatterHeights, spreadHeights, type MutateModes } from './music/mutate';
import {
  instrumentOfFields,
  isPatch,
  makeNote,
  makePattern,
  makeTrackWithInstrument,
  normalizePatch,
  patternInScene,
  scaleOf,
  uid,
} from './types';
import type { Instrument, Patch, Pattern, SceneSlot, Track, SoundingTrack, WavRenderOptions } from './types';
import { TrackRow } from './components/TrackRow';
import type { InstEditorTab } from './components/InstrumentEditor';
import { LevelBar } from './components/LevelBar';
import { NumField } from './components/NumField';
import { SliderField } from './components/SliderField';
import { DialogHost } from './components/Dialog';
import { alertDialog, confirmDialog } from './components/dialogs';
import { DEFAULT_PROVIDER, PROVIDERS } from './ai/providers';
import { SampleJobs } from './ai/jobs';
import { putSample, getSampleBlob } from './audio/library';
import type { SampleMeta } from './audio/library';
import type { InstrumentPreset } from './music/instrumentPresets';
import { instrumentNameOf } from './music/instrumentPresets';
import { soundForAudition, recommendedHz } from './music/audition';
import { clip } from './music/clip';
import { exportProject, importProject, looksLikeZip } from './audio/project';
import { loadAutosave, saveAutosave, autosaveStatus, subscribeAutosave, flushAutosave, loadRecovery, resumeAutosave } from './storage';
import { isDesktop, pickProjectFile, saveBlob } from './platform';
import { createBridge, setByPointer } from './bridge';
import { sampleAssets } from './music/sampleZones';
import { slugify } from './utils/slug';
import { usePresetRevision } from './components/usePresetRevision';
import { SoundBrowser } from './components/SoundBrowser';
import { HelpHint, HelpMenu, Onboarding } from './onboarding/Onboarding';
import { HelpSearch } from './onboarding/HelpSearch';
import type { HelpEntry } from './onboarding/helpSearchIndex';
import { PointHelp } from './onboarding/PointHelp';
import { HELP_MODE_EVENT, publishPointHelp } from './onboarding/helpMode';
import type { GuideRun } from './onboarding/Onboarding';
import {
  guideById,
  markGuideSeen,
  markInvited,
  needsInvite,
  onboardingUntouched,
  registerGuideStarter,
} from './onboarding/guides';

const UI_KEY = 'barlow.ui.v1';
const AI_KEY_STORE = 'barlow.ai.v1';

/** Стем имён файлов экспорта: название пьесы (транслит) или 'barlow'. */
const exportStem = (patch: Patch): string =>
  patch.title ? slugify(patch.title) : 'barlow';

/** Подпись панорамы: L/R с отклонением или центр. */
const panText = (pan: number) =>
  pan < 0.49
    ? `L${Math.round((0.5 - pan) * 200)}`
    : pan > 0.51
      ? `R${Math.round((pan - 0.5) * 200)}`
      : msg("app.center");

interface AiSettings {
  providerId: string;
  // Ключ на каждого провайдера: переключение сервиса не теряет ключи.
  keys: Record<string, string>;
}

function loadAiSettings(): AiSettings {
  const fallback: AiSettings = { providerId: DEFAULT_PROVIDER, keys: {} };
  try {
    const raw = localStorage.getItem(AI_KEY_STORE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AiSettings> & { apiKey?: string };
    const keys = { ...(parsed.keys ?? {}) };
    // До провайдеров ключ был один (ElevenLabs) — переносим.
    if (typeof parsed.apiKey === 'string' && !keys.elevenlabs) keys.elevenlabs = parsed.apiKey;
    const providerId = PROVIDERS.some((p) => p.id === parsed.providerId)
      ? parsed.providerId!
      : DEFAULT_PROVIDER;
    return { providerId, keys };
  } catch {
    /* настройки необязательны */
  }
  return fallback;
}

function loadUiState(): { collapsed: Record<string, boolean> } {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { collapsed?: Record<string, boolean> };
      if (parsed && typeof parsed.collapsed === 'object') return { collapsed: parsed.collapsed };
    }
  } catch {
    /* UI-состояние необязательно */
  }
  return { collapsed: {} };
}

function loadPatch(): Patch {
  const saved = loadAutosave();
  return saved ? normalizePatch(saved) : defaultPatch();
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function uniqueName(base: string, used: string[]): string {
  if (!used.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!used.includes(candidate)) return candidate;
  }
}

/** Защитный инструмент, если нормализация не нашла ссылку (не бывает). */
const fallbackInst = (t: Track): Instrument => ({
  id: t.instrumentId,
  name: t.name,
  waveform: 'wave',
  wave: { partials: [{ ratio: 1, amp: 1, type: 'sine' }] },
  attack: 0.002,
  decay: 0.25,
  pitchDrop: 1,
  pitchTime: 0.08,
  filterLow: 20,
  filterFreq: 8000,
});

/** Стандартный западный строй нового трека: 12 равных полутонов. */
const CHROMATIC = SCALE_PRESETS.find((p) => p.sourceName === '12 равных полутонов')?.ratios ?? [1];

// Имя нового эскиза: первая свободная буква дорожки (B, C, …).
// Штрихи форков («A′») не занимают букву — базовое имя считается «A».
const nextPatternName = (track: Track): string => {
  const used = new Set(track.patterns.map((p) => p.name.replace(/′+$/, '').trim()));
  for (let i = 1; i < 26; i++) {
    const candidate = String.fromCharCode(65 + i);
    if (!used.has(candidate)) return candidate;
  }
  return `P${track.patterns.length + 1}`;
};

export default function App() {
  const locale = useLocale();
  const theme = useTheme();
  const presetRevision = usePresetRevision();
  const [showPacks,setShowPacks]=useState(false);
  const [showLearning,setShowLearning]=useState(false);
  const [showWorkshop,setShowWorkshop]=useState(false);
  const [history] = useState(() => createHistory(loadPatch()));
  const historyState = useSyncExternalStore(history.subscribe, history.snapshot);
  const patch = historyState.present;
  const saveStatus = useSyncExternalStore(subscribeAutosave, autosaveStatus);
  // Последний трек, у которого правили строй (шкала/тоника/октавы): новый
  // трек наследует шкалу от него — «от прошлого трека», а не от верхнего
  // в списке. Запись идемпотентна, двойной прогон апдейтера безвреден.
  const lastScaleRef = useRef<string | null>(null);

  // Все правки патча идут через этот сеттер: он пишет историю.
  // Границы жестов задаются явно; вычисление апдейтера происходит вне React.
  const setPatch: Dispatch<SetStateAction<Patch>> = useCallback((updater) => {
    history.set((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      const prevTracks = new Map(prev.tracks.map((t) => [t.id, t]));
      for (const t of next.tracks) {
        const o = prevTracks.get(t.id);
        if (
          o &&
          (o.scale !== t.scale ||
            o.freq !== t.freq ||
            o.scaleOctUp !== t.scaleOctUp ||
            o.scaleOctDown !== t.scaleOctDown)
        ) {
          lastScaleRef.current = t.id;
        }
      }
      return next;
    });
  }, [history]);

  // Дискретная команда (перенос/вставка/удаление нот, структурные правки) —
  // всегда отдельный шаг истории: не склеивается с соседней правкой по
  // времени, Ctrl+Z откатывает ровно одно действие.
  const setPatchStep: Dispatch<SetStateAction<Patch>> = useCallback((updater) => {
    history.commit();
    setPatch(updater);
  }, [setPatch, history]);

  const undo = history.undo;
  const redo = history.redo;

  useEffect(() => {
    // Native ranges and graphical editors share a pointer transaction.
    // Knob/NumField use their own owner IDs and may replace this empty one.
    const down = (e: PointerEvent) => {
      if (e.button === 0 && e.target instanceof Element && !e.target.closest('[data-recording-control]') && e.target.closest('input[type="range"], canvas, svg')) history.begin('pointer');
    };
    const up = () => history.commit('pointer');
    const cancel = () => history.cancel('pointer');
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (document.querySelector('dialog[open]') || (e.target instanceof Element && e.target.closest('textarea, input[type="text"], [contenteditable="true"]'))) return;
      // e.code — физическая клавиша, раскладка не важна (Ctrl+Z на русской
      // раскладке даёт e.key «я»).
      if (e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.code === 'KeyY') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [ui, setUi] = useState(loadUiState);
  const [sceneRename, setSceneRename] = useState<{id: string; name: string} | null>(null);
  const cancelSceneRename = useRef(false);
  const [sceneId, setSceneId] = useState(() => patch.scenes[0]?.id ?? '');
  const [showChain, setShowChain] = useState(false);
  const [ai, setAi] = useState<AiSettings>(loadAiSettings);
  const [showAi, setShowAi] = useState(false);
  // Глазик у поля ключа: показать/скрыть символы.
  const [showAiKey, setShowAiKey] = useState(false);
  const [showLib, setShowLib] = useState(false);
  const [showMix, setShowMix] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Онбординг: меню гидов у «?» и текущий гид (id + шаг + зона-скоуп).
  const [showHelpSearch,setShowHelpSearch] = useState(false);
  const [helpDestination,setHelpDestination] = useState<{entry:HelpEntry;trackId:string}|null>(null);
  const [helpArrival,setHelpArrival] = useState('');
  const openHelpSearch = useCallback(()=>{setPointHelp(false);setObRun(null);setShowHelpMenu(false);setShowHelpSearch(true);},[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.code==='Slash'){e.preventDefault();e.stopImmediatePropagation();openHelpSearch();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[openHelpSearch]);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  // Режим «что это?»: клик по контролу показывает его карточку (cards.ts),
  // контролы не активируются. F1 — вход/выход.
  const [pointHelp, setPointHelp] = useState(false);
  const [obRun, setObRun] = useState<GuideRun | null>(null);
  useEffect(() => {
    const toggleHelp = () => { setObRun(null); setShowHelpMenu(false); setPointHelp(v => !v); };
    window.addEventListener(HELP_MODE_EVENT, toggleHelp);
    return () => window.removeEventListener(HELP_MODE_EVENT, toggleHelp);
  }, []);
  useEffect(() => { publishPointHelp(pointHelp); }, [pointHelp]);
  const [trackQuery, setTrackQuery] = useState('');
  const [hideSceneMuted, setHideSceneMuted] = useState(false);
  const [, setHelpInvite] = useState(needsInvite);
  const obRef = useRef<GuideRun | null>(null);
  obRef.current = obRun;

  const startGuide = useCallback((guideId: string, opts?: { scope?: string; step?: number }) => {
    markInvited(); // любой запуск гасит пульс-приглашение на «?»
    setShowHelpMenu(false);
    setPointHelp(false);
    const active=document.querySelector('[data-ob="mode-inst"].on')?.closest('[data-track-id]');
    const first=Array.from(document.querySelectorAll('[data-track-id]')).find(el=>el.getBoundingClientRect().height>0);
    const id=(active??first)?.getAttribute('data-track-id');
    setObRun({ guideId: guideId, step: opts?.step ?? 0, scope: opts?.scope ?? (id?`[data-track-id="${CSS.escape(id)}"]`:undefined) });
  }, []);
  useEffect(() => registerGuideStarter(startGuide), [startGuide]);

  // Первый заход в жизни — вводный гид «собери бит» стартует сам.
  useEffect(() => {
    if (!onboardingUntouched()) return;
    const t = window.setTimeout(() => startGuide('main'), 700);
    return () => window.clearTimeout(t);
  }, [startGuide]);

  // Любой выход из гида (✕, Esc, клик мимо, «готово») — он отмечен пройденным.
  const stopGuide = useCallback(() => {
    const r = obRef.current;
    if (r) markGuideSeen(r.guideId);
    setObRun(null);
  }, []);

  const stepGuide = useCallback((delta: number) => {
    setObRun((r) => {
      if (!r) return r;
      const n = guideById(r.guideId)?.steps.length ?? 0;
      return { ...r, step: Math.max(0, Math.min(n - 1, r.step + delta)) };
    });
  }, []);

  // Гид пошёл — пульс-приглашение на «?» больше не нужен.
  useEffect(() => {
    if (obRun) setHelpInvite(false);
  }, [obRun]);

  // Шаг гида может попросить раскрыть панель шапки (микшер, цепочка, ИИ).
  const openGuidePanel = useCallback((what: string) => {
    if (what === 'mix') setShowMix(true);
    else if (what === 'chain') setShowChain(true);
    else if (what === 'ai') setShowAi(true);
    else if (what === 'lib') setShowLib(true);
  }, []);

  // «?» — меню гидов; F1 — режим «что это?»; Esc — закрыть. Проверки по
  // e.key — символы, не зависящие от раскладки (?, Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      } else if (e.key === 'F1') {
        e.preventDefault();
        setObRun(null);
        setShowHelpMenu(false);
        setPointHelp((v) => !v);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setShowHelpMenu((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);
  const [incomingInstrument,setIncomingInstrument] = useState<File|null>(null);
  const instrumentFileRef=useRef<HTMLInputElement>(null);
  const [wavExport, setWavExport] = useState<{ patch: Patch; sceneId: string } | null>(null);
  const [genBusy, setGenBusy] = useState<Record<string, boolean>>({});
  const [sampleJobs] = useState(() => new SampleJobs());
  useEffect(() => () => sampleJobs.cancelAll(), [sampleJobs]);
  const cancelSampleJob = useCallback((id: string) => { sampleJobs.cancel(id); setGenBusy(b => ({ ...b, [id]: false })); }, [sampleJobs]);
  // Редактор инструмента: id дорожки в раздвижном режиме (остальные
  // съёживаются) + вкладка, на которой его открыли.
  const [editorTrack, setEditorTrack] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<InstEditorTab>('snd');
  // Прицел переноса сцены: подсветка вставки до/после кнопки.
  const [sceneDrop, setSceneDrop] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  // Прицел переноса пункта цепочки.
  const [chainDrop, setChainDrop] = useState<{ idx: number; side: 'before' | 'after' } | null>(null);
  const openEditor = useCallback((id: string, tab?: InstEditorTab) => {
    setEditorTrack(id);
    if (tab) setEditorTab(tab);
  }, []);
  const closeEditor = useCallback(() => setEditorTrack(null), []);
  const [, setFrame] = useState(0); // перерисовка playhead раз в кадр
  const engineRef = useRef<AudioBackend | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Движок один — Web Audio (нативный Rust-вывод отложен: звук не сходился
  // с эталоном). Конструктор дешёвый: AudioContext создаётся лениво.
  if (!engineRef.current) {
    engineRef.current = new AudioEngine();
    // Тихие падения превью («▶ нота», жесты) — причина «не слышно» без
    // объяснений; движок докладывает их сюда сообщением.
    engineRef.current.warnSink = (m) => void alertDialog(m, msg("app.audio"));
  }
  const engine: AudioBackend = engineRef.current;
  const getSamplePCM = useCallback(
    (id?: string) => engine.getSamplePCM(id),
    [engine],
  );
  const previewSampleRegion = useCallback(
    (t: SoundingTrack, fromSec: number, toSec: number) => engine.previewSampleRegion(t, fromSec, toSec),
    [engine],
  );
  const previewNote = useCallback((t: Track) => engine.previewNote(t), [engine]);
  // Панель инструментов (левая док-панель): открывается с целевой дорожкой —
  // той, чей чип нажали; из шапки — последний работавший стан. Точка входа
  // может назвать и вкладку (пикер сэмплов открывает «сэмплы»).
  const [libTarget, setLibTarget] = useState<string | null>(null);
  // Зеркало libTarget для стабильного openLibraryAt (цель вкладки).
  const libTargetRef = useRef<string | null>(null);
  libTargetRef.current = libTarget;
  const [libTab, setLibTab] = useState<'inst' | 'smp'>('inst');
  const openLibraryAt = useCallback(
    (trackId: string | null, tab?: 'inst' | 'smp') => {
      setShowLib(true);
      if (showAi) setShowAi(false);
      if (trackId) {
        setLibTarget(trackId);
        // Чип дорожки переводит и открытый редактор инструмента:
        // работа с тембром следует за дорожкой, которую выбрали чипом
        // (и в свёрнутой карточке).
        setEditorTrack((cur) => (cur && cur !== trackId ? trackId : cur));
      }
      if (tab) {
        setLibTab(tab);
        return;
      }
      // Вкладка без явного указания — по источнику дорожки-цели:
      // сэмпловой дорожке сразу сэмплы, остальным — пресеты тембров.
      const p = liveRef.current.patch;
      const want = trackId ?? libTargetRef.current;
      const tid =
        want && p.tracks.some((t) => t.id === want)
          ? want
          : clip.activeTrackId && p.tracks.some((t) => t.id === clip.activeTrackId)
            ? clip.activeTrackId
            : p.tracks[0]?.id;
      if (!tid) return;
      const inst = p.instruments.find(
        (i) => i.id === p.tracks.find((t) => t.id === tid)?.instrumentId,
      );
      setLibTab(inst?.waveform === 'sample' ? 'smp' : 'inst');
    },
    [showAi],
  );

  // Режим редактора гаснет сам, когда его дорожка исчезла (очистить всё,
  // удаление, undo, импорт): стухший id иначе держал бы все новые треки
  // насильно свёрнутыми, а кнопка разворота на них не действовала бы.
  const editorActive =
    editorTrack && patch.tracks.some((t) => t.id === editorTrack)
      ? editorTrack
      : null;

  const navigateHelp = (entry:HelpEntry,trackId:string):string|undefined => {
    if(document.querySelector('[data-help-navigation-blocked="true"]')) return msg("app.applyOrDiscardTheWaveformDraftOr");
    if(document.querySelectorAll('dialog[open]').length>1) return msg("app.closeTheOriginalDialogThenTryOpening");
    const loc=entry.location;if(!loc)return;
    setShowHelpSearch(false);setPointHelp(false);setObRun(null);setHelpArrival('');
    setTrackQuery('');setHideSceneMuted(false);
    if(['track','snd','env','timbre'].includes(loc.panel)) {
      setUi(u=>({...u,collapsed:{...u.collapsed,[trackId]:false}}));
      if(loc.panel==='track')setEditorTrack(null);
      else {setEditorTrack(trackId);setEditorTab(loc.panel as InstEditorTab);}
    } else openGuidePanel(loc.panel);
    setHelpDestination({entry,trackId});
  };
  useEffect(()=>{
    if(!helpDestination)return;
    const {entry,trackId}=helpDestination,loc=entry.location!;
    let frame=0,attempts=0,marked:HTMLElement|null=null;
    const run=()=>{
      const scoped=['track','snd','env','timbre'].includes(loc.panel);
      const root=scoped?document.querySelector(`[data-track-id="${CSS.escape(trackId)}"]`):document;
      if(loc.panel==='track') {const mode=root?.querySelector<HTMLButtonElement>('[data-ob="mode-track"]');if(mode&&!mode.classList.contains('on'))mode.click();}
      const visible=(selector:string)=>Array.from(root?.querySelectorAll<HTMLElement>(selector)??[]).find(e=>e.getBoundingClientRect().height>0);
      const target=visible(loc.selector)??visible(loc.fallback);
      if((!target||attempts<2)&&attempts++<12){frame=requestAnimationFrame(run);return;}
      setHelpArrival(`${entry.card.title}. ${loc.path}${target?'':' Настройка пока скрыта: следуй этому пути.'}`);
      if(target){marked=target;target.scrollIntoView({block:'center',behavior:'instant'});target.classList.add('help-found-target');}
    };frame=requestAnimationFrame(run);
    return()=>{cancelAnimationFrame(frame);marked?.classList.remove('help-found-target');};
  },[helpDestination]);

  // Движок всегда видит актуальный патч — редактирование без остановки.
  useEffect(() => {
    engine.setPatch(patch);
    saveAutosave(patch);
  }, [patch, engine]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      setFrame((f) => f + 1);
      // Движок ведёт по цепочке — UI показывает звучащую сцену.
      if (engine.currentSceneId && engine.currentSceneId !== sceneId) {
        setSceneId(engine.currentSceneId);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, engine, sceneId]);

  const currentScene = patch.scenes.find((s) => s.id === sceneId) ?? patch.scenes[0];
  const visibleTracks = patch.tracks.filter(t =>
    (!hideSceneMuted || !currentScene?.slots[t.id]?.muted) &&
    t.name.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(
      trackQuery.trim().normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е')));


  // Сколько сцен играют каждый эскиз: чип показывает связь «правка эскиза
  // меняет все сцены, где он играет». Стабильная ссылка — треки не
  // перерисовываются лишний раз.
  // Стабильный список дорожек для сайдчейн-селектов.
  const trackList = useMemo(
    () => patch.tracks.map((t) => ({ id: t.id, name: t.name, instrumentId: t.instrumentId })),
    [patch.tracks],
  );

  /** Правка инструмента дорожки. Инструмент — свойство дорожки: если он
   *  зачем-то оказался общим у нескольких (старый патч), правка с этой
   *  дорожки сначала отвязывает её — копия «на себя», соседей не задевает. */
  const changeInst = useCallback((trackId: string, inst: Instrument, command = false) => {
    (command ? setPatchStep : setPatch)((p) => {
      const t = p.tracks.find((x) => x.id === trackId);
      if (!t) return p;
      const shared = p.tracks.some((x) => x.id !== trackId && x.instrumentId === t.instrumentId);
      const instId = shared ? uid('i') : t.instrumentId;
      return {
        ...p,
        tracks: shared
          ? p.tracks.map((x) => (x.id === trackId ? { ...x, instrumentId: instId } : x))
          : p.tracks,
        instruments: shared
          ? [...p.instruments, { ...inst, id: instId }]
          : p.instruments.map((x) => (x.id === instId ? inst : x)),
      };
    });
  }, [setPatch, setPatchStep]);

  // Сколько сцен играют каждый эскиз: чип показывает связь «правка эскиза
  // меняет все сцены, где он играет». Замьюченный слот не играет — его
  // эскиз в счётчик не попадает (тишина считается отдельно, у чипа M).
  const patternSceneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sc of patch.scenes) {
      for (const slot of Object.values(sc.slots)) {
        if (slot.muted) continue;
        counts[slot.patternId] = (counts[slot.patternId] ?? 0) + 1;
      }
    }
    return counts;
  }, [patch.scenes]);

  // В скольких сценах дорожка в мьюте — счётчик чипа M.
  const muteSceneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sc of patch.scenes) {
      for (const [trackId, slot] of Object.entries(sc.slots)) {
        if (slot.muted) counts[trackId] = (counts[trackId] ?? 0) + 1;
      }
    }
    return counts;
  }, [patch.scenes]);

  const playRequest = useRef(0), pendingPlay = useRef(false);
  const [preparingPlay, setPreparingPlay] = useState(false);
  const stopTransport = useCallback(() => {
    ++playRequest.current; pendingPlay.current = false; setPreparingPlay(false);
    engine.stop(); setPlaying(false);
  }, [engine]);
  const startTransport = useCallback((snapshot: Patch, sid: string) => {
    if (engine.playing || pendingPlay.current) return;
    const request = ++playRequest.current;
    pendingPlay.current = true; setPreparingPlay(true);
    void engine.ensureSamples(snapshot).then(() => {
      if (request !== playRequest.current || history.snapshot().present !== snapshot || liveRef.current.sceneId !== sid) return;
      engine.play(snapshot, sid); setPlaying(true);
    }).catch(error => {
      if (request === playRequest.current) void alertDialog(errText(error), msg("app.couldNotStartPlayback"));
    }).finally(() => {
      if (request === playRequest.current) { pendingPlay.current = false; setPreparingPlay(false); }
    });
  }, [engine, history]);
  const togglePlay = useCallback(() => {
    if (engine.playing || pendingPlay.current) stopTransport();
    else startTransport(history.snapshot().present, sceneId);
  }, [engine, history, sceneId, startTransport, stopTransport]);

  const [libraryFocus, setLibraryFocus] = useState(0);
  useEffect(() => {
    if (libraryFocus) document.querySelector<HTMLInputElement>('.browser-search')?.focus();
  }, [libraryFocus]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault(); setShowLib(true); setLibraryFocus(v => v + 1); return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (e.code === 'Space' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
        && !target?.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"], [role="button"]')) {
        e.preventDefault(); togglePlay();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [togglePlay]);

  // Пока играем — прогреваем кэш сэмплов (загрузил новый — заиграл без рестарта).
  useEffect(() => {
    if (playing) void engine.ensureSamples(patch).catch(error => engine.warnSink?.(errText(error)));
  }, [playing, patch, engine]);

  // ---- Сцены ----

  /** Соло сцены (эксклюзивное): повторный клик по соло-треку снимает. */
  const toggleSceneSolo = useCallback(
    (trackId: string) => {
      setPatchStep((p) => ({
        ...p,
        scenes: p.scenes.map((s) =>
          s.id === sceneId
            ? { ...s, soloTrackId: s.soloTrackId === trackId ? undefined : trackId }
            : s,
        ),
      }));
    },
    [sceneId, setPatch],
  );

  const selectScene = useCallback(
    (id: string) => {
      if (engine.playing) engine.setScene(id);
      setSceneId(id);
    },
    [engine],
  );

  // ---- Дебаг-мост (ИИ-агент по MCP): приложение — WS-клиент хоста.
  // Хендлеры видят свежие стейты через liveRef: мост создаётся один раз,
  // а замыкания не должны протухать. Правки идут через перехваченный
  // setPatch/setPatchStep — undo-история общая с ручными правками.
  const bridgeRef = useRef<ReturnType<typeof createBridge> | null>(null);
  const [bridgeSession, setBridgeSession] = useState<BridgeSession | null>(loadBridgeSession);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ phase: 'off', message: msg("app.localAgentIsDisabled") });
  const liveRef = useRef({ patch, sceneId, playing });
  liveRef.current = { patch, sceneId, playing };

  useEffect(() => {
    const bridge = createBridge({
      onStatus: setBridgeStatus,
      appKind: isDesktop ? 'desktop' : 'web',
      getPatch: () => liveRef.current.patch,
      getTransport: () => ({
        playing: liveRef.current.playing,
        sceneId: liveRef.current.sceneId,
        sceneName:
          liveRef.current.patch.scenes.find((s) => s.id === liveRef.current.sceneId)?.name ?? '',
        bpm: engine.currentBpm || liveRef.current.patch.bpm,
      }),
      onSetPatch(raw) {
        if (!isPatch(raw)) throw new Error(msg("app.thisJSONIsNotABarlowProject"));
        const norm = normalizePatch(raw);
        setPatchStep(norm);
        setSceneId(norm.scenes[0].id);
      },
      onSetParam(pointer, value) {
        // Путь проверяем на копии текущего патча: исключение должно уйти
        // в ack моста, а не в рендер React (апдейтер setPatch выполняется
        // позже и уронил бы всё дерево).
        const candidate = setByPointer(history.snapshot().present, pointer, value);
        if (!isPatch(candidate)) throw new Error(msg("app.theChangeWouldBreakTheProjectStructure"));
        setPatchStep(normalizePatch(candidate));
      },
      onTransport(cmd) {
        const live = liveRef.current;
        if (cmd.action === 'play') {
          startTransport(live.patch, live.sceneId);
        } else if (cmd.action === 'stop') {
          stopTransport();
        } else if (cmd.action === 'scene' && cmd.sceneId) {
          if (!live.patch.scenes.some((s) => s.id === cmd.sceneId)) {
            throw new Error(msg("app.sceneIsNotInTheProject", {p0: cmd.sceneId}));
          }
          if (engine.playing) engine.setScene(cmd.sceneId);
          setSceneId(cmd.sceneId);
        } else if (cmd.action === 'bpm' && Number.isFinite(cmd.value)) {
          if (typeof cmd.value !== 'number') throw new Error(msg("app.invalidTempo"));
          const v = Math.max(30, Math.min(300, Math.round(cmd.value)));
          if (engine.playing) engine.setBpm(v);
          setPatch((p) => ({ ...p, bpm: v }));
        } else if (cmd.action === 'solo') {
          // Соло — свойство сцены (types.ts): пустой trackId снимает соло
          // текущей сцены, как повторный клик по кнопке S.
          const trackId = cmd.trackId ?? '';
          if (trackId && !live.patch.tracks.some((t) => t.id === trackId)) {
            throw new Error(msg("app.trackIsNotInTheProject", {p0: trackId}));
          }
          const scene = live.patch.scenes.find((s) => s.id === live.sceneId) ?? live.patch.scenes[0];
          setPatchStep((p) => ({
            ...p,
            scenes: p.scenes.map((s) => (s.id === scene.id ? { ...s, soloTrackId: trackId || undefined } : s)),
          }));
        } else throw new Error(msg("app.unknownTransportCommandOrInvalidParameter"));
      },
    }, bridgeSession);
    bridgeRef.current = bridge;
    // Ноты — в мост батчем: видно, что реально триггернулось (доли арпеджиатора тоже).
    engine.noteSink = (trackId, at, notes) =>
      bridge.pushNotes([{ trackId, at, notes: notes.map((nt) => ({ n: nt.n, oct: nt.oct, vel: nt.vel })) }]);
    return () => {
      engine.noteSink = undefined;
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [engine, setPatch, setPatchStep, startTransport, stopTransport, bridgeSession, history]);

  // Патч и транспорт — стрим в мост (коалесценция внутри моста).
  useEffect(() => {
    bridgeRef.current?.pushPatch(patch);
  }, [patch]);
  useEffect(() => {
    bridgeRef.current?.pushTransport({
      playing,
      sceneId,
      sceneName: patch.scenes.find((s) => s.id === sceneId)?.name ?? '',
      bpm: engine.currentBpm || patch.bpm,
    });
  }, [playing, sceneId, patch, engine]);

  const addScene = useCallback(() => {
    // Новая сцена — снимок ансамбля ссылками на те же эскизы (общие:
    // правишь эскиз — меняется во всех сценах, где он играет; для
    // независимой вариации — форк эскиза правым кликом по чипу).
    const freshId = uid('s');
    setPatchStep((p) => {
      const from = p.scenes.find((s) => s.id === sceneId) ?? p.scenes[0];
      const scene = {
        id: freshId,
        name: msg("app.scene", {p0: Math.max(0, ...p.scenes.map(s => Number(/^(?:сцена|scene)\s+(\d+)$/i.exec(s.name.trim())?.[1] ?? 0))) + 1}),
        // Снимок ансамбля: какие эскизы играют. Мьют и соло — живые
        // состояния прослушивания СЦЕНЫ, в новую не переносятся: новая
        // сцена начинается со звуком (v38).
        slots: Object.fromEntries(
          Object.entries(from?.slots ?? {}).map(([k, v]) => [k, { patternId: v.patternId }]),
        ),
      };
      return { ...p, scenes: [...p.scenes, scene], chain: [...p.chain, { sceneId: scene.id, bars: 8 }] };
    });
    if (engine.playing) engine.setScene(freshId);
    setSceneId(freshId);
  }, [sceneId, engine]);

  const removeScene = useCallback(
    (id: string) => {
      setPatchStep((p) => {
        if (p.scenes.length <= 1) return p;
        const scenes = p.scenes.filter((s) => s.id !== id);
        const chain = p.chain.filter((it) => it.sceneId !== id);
        return { ...p, scenes, chain: chain.length ? chain : [{ sceneId: scenes[0].id, bars: 8 }] };
      });
      if (sceneId === id) {
        const fallback = patch.scenes.find((s) => s.id !== id);
        if (fallback) setSceneId(fallback.id);
      }
    },
    [sceneId, patch.scenes],
  );

  const setFollowChain = useCallback(
    (on: boolean) => {
      setPatch((p) => ({ ...p, followChain: on }));
      if (engine.playing) engine.setFollowChain(on);
    },
    [engine],
  );

  const chainAdd = useCallback(() => {
    setPatchStep((p) => ({ ...p, chain: [...p.chain, { sceneId: p.scenes[0].id, bars: 8 }] }));
  }, [setPatchStep]);

  const chainRemove = useCallback((idx: number) => {
    setPatchStep((p) => (p.chain.length <= 1 ? p : { ...p, chain: p.chain.filter((_, i) => i !== idx) }));
  }, [setPatchStep]);

  const chainSetItem = useCallback(
    (idx: number, item: Partial<{ sceneId: string; bars: number; bpm?: number }>, command = false) => {
      (command ? setPatchStep : setPatch)((p) => ({
        ...p,
        chain: p.chain.map((it, i) => (i === idx ? { ...it, ...item } : it)),
      }));
    },
    [setPatch, setPatchStep],
  );

  /** Переставить пункт цепочки драгом: порядок = арранжмент. */
  const chainReorder = useCallback((from: number, to: number, place: 'before' | 'after') => {
    setPatchStep((p) => {
      const n = p.chain.length;
      if (from === to || from < 0 || from >= n || to < 0 || to >= n) return p;
      const item = p.chain[from];
      const rest = p.chain.filter((_, i) => i !== from);
      let at = place === 'after' ? to + 1 : to;
      if (at > from) at--; // индекс считается в массиве с ещё не удалённым from
      return { ...p, chain: [...rest.slice(0, at), item, ...rest.slice(at)] };
    });
  }, [setPatchStep]);

  // ---- Треки и паттерны ----

  const changeTrack = useCallback((id: string, t: Track) => {
    setPatch((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === id ? t : x)) }));
  }, []);

  /** Инструмент дорожки (создан нормализацией, fallback — пустой). */
  const instOf = useCallback(
    (p: Patch, t: Track): Instrument =>
      p.instruments.find((i) => i.id === t.instrumentId) ?? fallbackInst(t),
    [],
  );

  /** Структурная правка трека (октавы стана, смена шкалы — переиндексируют
   *  ноты): всегда отдельный шаг истории, как команды нот. */
  const changeTrackCommand = useCallback((id: string, t: Track) => {
    setPatchStep((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === id ? t : x)) }));
  }, [setPatchStep]);

  /** Применить пресет из библиотеки к дорожке: тембр — в инструмент
   *  (v34; копия, если инструмент общий), плюс эффекты/моно/модуляции.
   *  Из строя пресет приносит только несущую (регистр — часть тембра:
   *  «бас» от 55 Гц) и только треку без нот; шкала (интервалы) и ноты —
   *  всегда пользователя, у сыгранного тоника уже часть музыки.
   *  Отдельный шаг undo. */
  const applyPreset = useCallback(
    (trackId: string, preset: InstrumentPreset) => {
      setPatchStep((p) => {
        const track = p.tracks.find((t) => t.id === trackId);
        const inst = track && p.instruments.find((i) => i.id === track.instrumentId);
        if (!track || !inst) return p;
        const t = preset.track;
        const merged = instrumentOfFields({ ...t, recommendedHz: recommendedHz(t) }, inst.id, preset.name);
        const empty = !track.patterns.some((pt) => pt.steps.some((s) => s.notes.length > 0));
        const updTrack: Track = {
          ...track,
          ...(empty ? { freq: recommendedHz(t) } : {}),
          ...instantiateEffects(t.effects, t.mods),
          mono: t.mono,
          portamentoSec: t.portamentoSec,
        };
        // Инструмент общий с чужой дорожкой — у этой своя копия (copy-on-write).
        const shared = p.tracks.some((x) => x.id !== trackId && x.instrumentId === track.instrumentId);
        const instId = shared ? uid('i') : track.instrumentId;
        updTrack.instrumentId = instId;
        return {
          ...p,
          tracks: p.tracks.map((x) => (x.id === trackId ? updTrack : x)),
          instruments: shared
            ? [...p.instruments, { ...merged, id: instId }]
            : p.instruments.map((i) => (i.id === instId ? merged : i)),
        };
      });
    },
    [setPatchStep],
  );

  /** Library audition uses the preset's own register, independent of the target. */
  const auditionPreset = useCallback(
    (trackId: string, preset: InstrumentPreset) => {
      const track = patch.tracks.find((t) => t.id === trackId);
      if (track) engine.previewSounding(soundForAudition(track, preset));
    },
    [patch.tracks, engine],
  );

  /** Сэмпл из библиотеки — в инструмент дорожки (волна «сэмпл»). */
  const assignSample = useCallback(
    (trackId: string, meta: SampleMeta) => {
      const track = patch.tracks.find((t) => t.id === trackId);
      const inst = track && instOf(patch, track);
      if (!track || !inst) return;
      changeInst(trackId, { ...inst, waveform: 'sample', sampleId: meta.id, sampleName: meta.name });
    },
    [patch, instOf, changeInst],
  );

  const clearAll = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    }
    const scene = { id: uid('s'), name: msg("app.scene1"), slots: {} as Record<string, SceneSlot> };
    setPatchStep((p) => ({ ...p, tracks: [], scenes: [scene], chain: [{ sceneId: scene.id, bars: 8 }] }));
    setSceneId(scene.id);
  }, [engine]);

  /** Переставить трек: порядок карточек = порядок массива tracks. */
  const reorderTrack = useCallback((fromId: string, toId: string, place: 'before' | 'after') => {
    setPatchStep((p) => {
      const moved = p.tracks.find((t) => t.id === fromId);
      if (!moved || fromId === toId) return p;
      const rest = p.tracks.filter((t) => t.id !== fromId);
      let to = rest.findIndex((t) => t.id === toId);
      if (to < 0) return p;
      if (place === 'after') to++;
      return { ...p, tracks: [...rest.slice(0, to), moved, ...rest.slice(to)] };
    });
  }, [setPatch]);

  /** Переставить сцену: порядок кнопок = порядок массива scenes. */
  const reorderScenes = useCallback((fromId: string, toId: string, place: 'before' | 'after') => {
    setPatchStep((p) => {
      const moved = p.scenes.find((s) => s.id === fromId);
      if (!moved || fromId === toId) return p;
      const rest = p.scenes.filter((s) => s.id !== fromId);
      let to = rest.findIndex((s) => s.id === toId);
      if (to < 0) return p;
      if (place === 'after') to++;
      return { ...p, scenes: [...rest.slice(0, to), moved, ...rest.slice(to)] };
    });
  }, [setPatchStep]);

  /** Дубль трека: тот же звук, эскизы и рисунок — база для подложек и вариаций. */
  const duplicateTrack = useCallback((id: string) => {
    setPatchStep((p) => {
      const src = p.tracks.find((t) => t.id === id);
      if (!src) return p;
      // Эскизы копируются с новыми id; в каждой сцене дубль играет копию
      // того эскиза, что играл там оригинал.
      const idMap = new Map<string, string>();
      const patterns = src.patterns.map((pt) => {
        const nid = uid('p');
        idMap.set(pt.id, nid);
        return {
          ...pt,
          id: nid,
          steps: pt.steps.map((s) => ({ ...s, notes: s.notes.map((n) => ({ ...n })) })),
        };
      });
      const srcInst =
        p.instruments.find((i) => i.id === src.instrumentId) ?? fallbackInst(src);
      const instrument: Instrument = { ...srcInst, id: uid('i') };
      const copy: Track = {
        ...src,
        instrumentId: instrument.id,
        id: uid('t'),
        name: uniqueName(src.name, p.tracks.map((t) => t.name)),
        patterns,
      };
      const scenes = p.scenes.map((s) => {
        const old = s.slots[src.id];
        return {
          ...s,
          slots: {
            ...s.slots,
            [copy.id]: {
              patternId: (old && idMap.get(old.patternId)) ?? patterns[0].id,
              ...(old?.muted ? { muted: true } : {}),
            },
          },
        };
      });
      return {
        ...p,
        tracks: [...p.tracks, copy],
        instruments: [...p.instruments, instrument],
        scenes,
      };
    });
  }, [setPatch]);

  const removeTrack = useCallback((id: string) => {
    const victim = patch.tracks.find((t) => t.id === id);
    if (!victim) return;
    // Вопрос до setPatch: подтверждение внутри updater'а вызывалось дважды
    // (StrictMode прогоняет апдейтеры по два раза в dev).
    void confirmDialog({
      title: msg("app.deleteTrack", {p0: victim.name}),
      okLabel: msg("app.delete"),
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      setPatchStep((p) => {
        const victim = p.tracks.find((t) => t.id === id);
        const tracks = p.tracks.filter((x) => x.id !== id);
        const instShared = p.tracks.some(
          (x) => x.id !== id && x.instrumentId === victim?.instrumentId,
        );
        const instruments = instShared
          ? p.instruments
          : p.instruments.filter((i) => i.id !== victim?.instrumentId);
        const scenes = p.scenes.map((s) => {
          const slots = { ...s.slots };
          delete slots[id];
          const soloTrackId = s.soloTrackId === id ? undefined : s.soloTrackId;
          return { ...s, slots, soloTrackId };
        });
        return { ...p, tracks, instruments, scenes };
      });
    });
  }, [patch.tracks, setPatch]);

  /** Новый трек — сразу, без браузера: чистый синус, стан 16 шагов.
   *  Лад (шкала, тоника, октавы стана) наследуется от верхнего трека:
   *  работа обычно идёт в одном строе — новая партия встаёт в тот же
   *  звукоряд. Нет треков — западные 12 полутонов. Встаёт ПЕРВЫМ:
   *  добавил — и работаешь с ним, не скролля. */
  const addTrack = useCallback(() => {
    setTrackQuery('');
    setHideSceneMuted(false);
    // id — снаружи апдейтера: StrictMode прогоняет апдейтер дважды, id
    // должен остаться тем же (и он нужен, чтобы открыть библиотеку).
    const id = uid('t');
    setPatchStep((p) => {
      // Наследование строя — от последнего трека, у которого его правили
      // (lastScaleRef), а не от верхнего в списке.
      const prev =
        p.tracks.find((t) => t.id === lastScaleRef.current) ?? p.tracks[0];
      const { track, instrument } = makeTrackWithInstrument({
        id,
        name: uniqueName(msg("app.newTrackName"), p.tracks.map((t) => t.name)),
        scale: prev ? [...prev.scale] : CHROMATIC,
        freq: prev?.freq,
        scaleOctUp: prev?.scaleOctUp,
        scaleOctDown: prev?.scaleOctDown,
      });
      // Новый трек добавляется во все сцены своим первым паттерном.
      const scenes = p.scenes.map((s) => ({
        ...s,
        slots: { ...s.slots, [track.id]: { patternId: track.patterns[0].id } },
      }));
      return {
        ...p,
        tracks: [track, ...p.tracks],
        instruments: [...p.instruments, instrument],
        scenes,
      };
    });
    // Библиотека сразу предлагает тембр: старт по умолчанию — синус,
    // но перебрать пресеты на слух можно не отходя.
    setLibTarget(id);
    setShowLib(true);
  }, [setPatchStep]);

  const changePatternCommand = useCallback(
    (trackId: string, patternId: string, patchUpd: Partial<Pattern>) => {
      setPatchStep((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id !== trackId
            ? t
            : {
                ...t,
                patterns: t.patterns.map((pt) => (pt.id === patternId ? { ...pt, ...patchUpd } : pt)),
              },
        ),
      }));
    },
    [setPatchStep],
  );

  const changePattern = useCallback(
    (trackId: string, patternId: string, patchUpd: Partial<Pattern>) => {
      setPatch((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id !== trackId
            ? t
            : {
                ...t,
                patterns: t.patterns.map((pt) => (pt.id === patternId ? { ...pt, ...patchUpd } : pt)),
              },
        ),
      }));
    },
    [],
  );

  // Слот текущей сцены: смена эскиза «на лету» (мягкая подмена без рестарта).
  // Выбор партии снимает мьют слота: клик по чипу — намерение играть.
  const selectPattern = useCallback(
    (trackId: string, patternId: string) => {
      setPatch((p) => ({
        ...p,
        scenes: p.scenes.map((s) =>
          s.id === sceneId ? { ...s, slots: { ...s.slots, [trackId]: { patternId } } } : s,
        ),
      }));
    },
    [sceneId],
  );

  /** Мьют слота текущей сцены (v38): дорожка молчит в этой сцене, часы
   *  партии идут — сняв мьют, войдёшь в фазе. Дискретная команда. */
  const toggleSlotMute = useCallback(
    (trackId: string) => {
      setPatchStep((p) => ({
        ...p,
        scenes: p.scenes.map((s) => {
          if (s.id !== sceneId) return s;
          const slot = s.slots[trackId];
          if (!slot) return s;
          return { ...s, slots: { ...s.slots, [trackId]: { ...slot, muted: !slot.muted } } };
        }),
      }));
    },
    [sceneId, setPatchStep],
  );

  const addPattern = useCallback((trackId: string, fromSlices = false) => {
    setPatchStep((p) => {
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track || track.patterns.length >= 128) return p;
      const slices = fromSlices ? p.instruments.find(i => i.id === track.instrumentId)?.sampleSlices : undefined;
      if (fromSlices && !slices?.length) return p;
      const current = patternInScene(track, p.scenes.find(s => s.id === sceneId));
      const pattern = makePattern(`${fromSlices ? 'нарезка ' : ''}${nextPatternName(track)}`, slices?.length ?? current?.length ?? 16,
        slices?.map(slice => ({ notes: [{ ...makeNote(0, .8, 1, 1), sliceId: slice.id }] })), current?.rate ?? track.rate);
      return {
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, patterns: [...t.patterns, pattern] } : t,
        ),
        scenes: p.scenes.map((s) =>
          s.id === sceneId ? { ...s, slots: { ...s.slots, [trackId]: { patternId: pattern.id } } } : s,
        ),
      };
    });
  }, [sceneId, setPatchStep]);

  const forkPattern = useCallback(
    (trackId: string, patternId: string) => {
      setPatchStep((p) => {
        const track = p.tracks.find((t) => t.id === trackId);
        const src = track?.patterns.find((pt) => pt.id === patternId);
        if (!track || !src || track.patterns.length >= 128) return p;
        const copy = makePattern(
          `${src.name}′`,
          src.length,
          src.steps.map((s) => ({ ...s, notes: s.notes.map((n) => ({ ...n })) })),
        );
        copy.forkedFrom = src.id;
        copy.rate = src.rate;
        copy.volume = src.volume;
        copy.pan = src.pan;
        copy.mods = src.mods?.map((m) => ({ ...m }));
        copy.fadeIn = src.fadeIn;
        copy.fadeOut = src.fadeOut;
        // Кривые автоматизации (громкость/фильтр/пан по циклу) — часть
        // партии: форк обязан нести их с собой, точки — глубокой копией.
        copy.automation = src.automation?.map((a) => ({
          ...a,
          points: a.points.map((pt) => ({ ...pt })),
        }));
        return {
          ...p,
          tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, patterns: [...t.patterns, copy] } : t)),
          scenes: p.scenes.map((s) =>
            s.id === sceneId ? { ...s, slots: { ...s.slots, [trackId]: { patternId: copy.id } } } : s,
          ),
        };
      });
    },
    [sceneId],
  );

  const removePattern = useCallback((trackId: string, patternId: string) => {
    setPatchStep((p) => {
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track || track.patterns.length <= 1) return p;
      const patterns = track.patterns.filter((pt) => pt.id !== patternId);
      const fallback = patterns[0].id;
      return {
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, patterns } : t)),
        // Сцены, игравшие удалённый эскиз, переходят на первый оставшийся.
        scenes: p.scenes.map((s) =>
          s.slots[trackId]?.patternId === patternId
            ? { ...s, slots: { ...s.slots, [trackId]: { patternId: fallback } } }
            : s,
        ),
      };
    });
  }, []);

  /** Заполнение одной оси стана — клик по кнопке оси применяет её сразу,
   *  оси независимы и компонуются: время (равномерно/случайно N нот),
   *  тон (лестница/случайно/одна высота ×1). */
  const applyFillAxis = useCallback(
    (
      trackId: string,
      axis: 'time' | 'height',
      mode: 'even' | 'random' | 'ladder' | 'one',
      pulses: number,
    ) => {
      setPatchStep((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const scene = p.scenes.find((s) => s.id === sceneId);
          const pattern = patternInScene(t, scene);
          const rows = scaleOf(t).length;
          let steps = pattern.steps;
          if (axis === 'time') {
            const mask =
              mode === 'even'
                ? euclid(pattern.length, pulses)
                : randomMask(pattern.length, pulses);
            steps = steps.map((s, i) => ({
              ...s,
              // одна нота на колонку: «раскидать N нот» даёт ровно N
              notes: mask[i] ? [s.notes[0] ?? makeNote(0)] : [],
            }));
          } else if (mode === 'one') {
            // Полоска на уровне ×1 (тоника шкалы); нет точной единицы — низ стана
            const n = Math.max(0, scaleOf(t).findIndex((r) => Math.abs(r - 1) < 1e-6));
            steps = steps.map((s) => ({ ...s, notes: s.notes.map((nt) => ({ ...nt, n })) }));
          } else {
            const next = mode === 'ladder' ? spreadHeights(pattern, rows) : scatterHeights(pattern, rows);
            steps = next.steps;
          }
          return {
            ...t,
            patterns: t.patterns.map((pt) => (pt.id === pattern.id ? { ...pt, steps } : pt)),
          };
        }),
      }));
    },
    [sceneId],
  );

  const mutate = useCallback(
    (trackId: string, modes: MutateModes, edits: number) => {
      setPatchStep((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const scene = p.scenes.find((s) => s.id === sceneId);
          const pattern = patternInScene(t, scene);
          return {
            ...t,
            patterns: t.patterns.map((pt) =>
              pt.id === pattern.id ? mutatePattern(pt, scaleOf(t).length, edits, modes) : pt,
            ),
          };
        }),
      }));
    },
    [sceneId],
  );

  // Живой уровень дорожки для тумбометров (карточка трека и микшер).
  const getTrackLevel = useCallback((id: string) => engine.trackLevel(id), [engine]);

  // ---- Дуги сайдчейна: кто кого качает, видно между карточками ----
  const mainRef = useRef<HTMLElement | null>(null);
  const [scLinks, setScLinks] = useState<{ key: string; d: string }[]>([]);
  useLayoutEffect(() => {
    const compute = () => {
      const main = mainRef.current;
      if (!main) return;
      const mr = main.getBoundingClientRect();
      const links: { key: string; d: string }[] = [];
      for (const t of patch.tracks) {
        const sc = t.sidechain;
        if (!sc?.sourceId || sc.sourceId === t.id) continue;
        const from = main.querySelector(`[data-track-id="${sc.sourceId}"]`);
        const to = main.querySelector(`[data-track-id="${t.id}"]`);
        if (!from || !to) continue;
        const fr = from.getBoundingClientRect();
        const tr = to.getBoundingClientRect();
        if (fr.bottom < mr.top - 50 || tr.top > mr.bottom + 50) continue;
        const x = 30;
        const y1 = fr.top - mr.top + Math.min(fr.height / 2, 40);
        const y2 = tr.top - mr.top + Math.min(tr.height / 2, 40);
        links.push({
          key: `${sc.sourceId}->${t.id}`,
          d: `M ${x} ${y1} C ${x - 16} ${y1 + 24}, ${x - 16} ${y2 - 24}, ${x} ${y2}`,
        });
      }
      setScLinks((prev) =>
        prev.length === links.length && prev.every((l, i) => l.key === links[i].key && l.d === links[i].d)
          ? prev
          : links,
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (mainRef.current) ro.observe(mainRef.current);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [patch.tracks, editorActive, trackQuery, hideSceneMuted, currentScene]);

  const saveAi = useCallback((next: Partial<AiSettings>) => {
    setAi((prev) => {
      const merged = { ...prev, ...next };
      localStorage.setItem(AI_KEY_STORE, JSON.stringify(merged));
      return merged;
    });
  }, []);

  /** One application job for both providers and both entry points. */
  const runSampleJob = useCallback(async (trackId: string, prompt: string, seconds: number, strength?: number) => {
    const provider = PROVIDERS.find(p => p.id === ai.providerId) ?? PROVIDERS[0];
    if (!ai.keys[provider.id]) { void alertDialog(msg("app.enterYourAPIKeyInSettingsFirst"), msg("app.ai")); return; }
    if (strength !== undefined && !provider.transform) { void alertDialog(msg("app.thisProviderDoesNotSupportAudioTo"), msg("app.ai")); return; }
    if (!prompt.trim() || !Number.isFinite(seconds) || seconds <= 0) return;
    const before = history.snapshot().present;
    const target = before.tracks.find(t => t.id === trackId);
    const baseline = target && before.instruments.find(i => i.id === target.instrumentId);
    if (!target || !baseline) return;
    const job = sampleJobs.begin(trackId);
    if (!job) return;
    setGenBusy(b => ({ ...b, [trackId]: true }));
    try {
      const params = { apiKey: ai.keys[provider.id], prompt: prompt.trim(), signal: job.signal };
      let result: Blob;
      if (strength !== undefined) {
        const audio = baseline.sampleId ? await getSampleBlob(baseline.sampleId) : null;
        if (!audio) throw new Error(msg("app.theMainSampleSlotHasNoAudio"));
        job.signal.throwIfAborted();
        result = await provider.transform!({ ...params, audio, strength, duration: seconds });
      } else result = await provider.generate({ ...params, seconds });
      if (!sampleJobs.current(trackId, job)) return;
      const meta = await putSample(result, prompt.slice(0, 40));
      if (!sampleJobs.current(trackId, job)) return;
      const latest = history.snapshot().present;
      const currentTrack = latest.tracks.find(t => t.id === trackId);
      const approved = currentTrack && latest.instruments.find(i => i.id === currentTrack.instrumentId);
      if (!approved) { void alertDialog(msg("app.wasSavedToTheLibraryTheOriginal", {p0: meta.name}), msg("app.ai")); return; }
      if (approved !== baseline) {
        const replace = await confirmDialog({ title: msg("app.instrumentChanged"), text: msg("app.isAlreadyInTheLibraryApplyIt", {p0: meta.name, p1: currentTrack.name}), okLabel: msg("app.apply"), cancelLabel: msg("app.keepInLibrary") });
        if (!replace || !sampleJobs.current(trackId, job)) return;
      }
      setPatchStep(p => {
        const track = p.tracks.find(t => t.id === trackId);
        if (!track || p.instruments.find(i => i.id === track.instrumentId) !== approved) return p;
        const shared = p.tracks.some(t => t.id !== trackId && t.instrumentId === track.instrumentId);
        const id = shared ? uid('i') : approved.id;
        const instrument: Instrument = { ...approved, id, waveform: 'sample', sampleId: meta.id, sampleName: meta.name,
          sampleStart: undefined, sampleEnd: undefined, sampleZones: undefined, keyTracking: false };
        return { ...p, tracks: p.tracks.map(t => t.id === trackId ? { ...t, instrumentId: id } : t),
          instruments: shared ? [...p.instruments, instrument] : p.instruments.map(i => i.id === id ? instrument : i) };
      });
    } catch (error) {
      if (!job.signal.aborted) void alertDialog(msg("app.taskFailed", {p0: errText(error)}), msg("app.ai"));
    } finally {
      if (sampleJobs.finish(trackId, job)) setGenBusy(b => ({ ...b, [trackId]: false }));
    }
  }, [ai, history, sampleJobs, setPatchStep]);
  const generateSample = useCallback((trackId: string, prompt: string, seconds: number) => runSampleJob(trackId, prompt, seconds), [runSampleJob]);
  const transformSample = useCallback((trackId: string, prompt: string, strength: number, duration = 5) => runSampleJob(trackId, prompt, duration, strength), [runSampleJob]);

  /** Заморозить жест скрэтча сэмпла: оффлайн-рендер ноты жеста → WAV
   *  в библиотеку (десктоп положит файлом в папку сэмплов). */
  const saveScratchSample = useCallback(
    async (trackId: string, name?: string) => {
      const t = patch.tracks.find((x) => x.id === trackId);
      if (!t) return;
      try {
        const blob = await engine.renderScratchWav(t);
        // Имя — ровно из поля у кнопки (пустое — база «<трек> скрэтч»):
        // файл называется так, как видно в интерфейсе, без сюрпризов.
        const final = (name ?? '').trim() || msg("app.scratch", {p0: t.name});
        await putSample(blob, final);
        // Успех — молча: галочку рисует сам редактор (scratchSavedTick).
      } catch (e) {
        void alertDialog(msg("app.couldNotSaveTheScratchPerformance", {p0: errText(e)}), msg("app.scratchToSample"));
      }
    },
    [patch.tracks, engine],
  );

  /** Свернуть/развернуть дорожку. Пока открыт редактор инструмента, чужие
   *  дорожки форс-свёрнуты — клик по ним пробивает режим: закрывает
   *  редактор и разворачивает дорожку. Иначе любой «залипший» режим
   *  блокировал бы разворот (клик крутил бы ui.collapsed, который
   *  игнорируется). */
  const toggleCollapse = useCallback((id: string) => {
    if (editorActive && editorActive !== id) {
      setEditorTrack(null);
      setUi((u) => {
        const next = { collapsed: { ...u.collapsed, [id]: false } };
        localStorage.setItem(UI_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }
    if (editorActive && editorActive === id) {
      setEditorTrack(null); // «свернуть» карточку с редактором = закрыть редактор
      return;
    }
    setUi((u) => {
      const next = { collapsed: { ...u.collapsed, [id]: !u.collapsed[id] } };
      localStorage.setItem(UI_KEY, JSON.stringify(next));
      return next;
    });
  }, [editorActive]);

  // ---- Файлы ----

  const exportPatch = () => {
    void saveBlob(
      new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }),
      `${exportStem(patch)}-patch.json`,
    ).catch((e) => void alertDialog(msg("app.exportFailed", {p0: errText(e)}), msg("app.export")));
  };

  // Импорт: zip-проект (сэмплы укладываются в библиотеку, хеши совпадают
  // со ссылками патча) или голый json патча.
  const importFile = (file: File) => {
    void (async () => {
      try {
        if (await looksLikeZip(file)) {
          const imported = await importProject(file);
          if (!imported) {
            void alertDialog(msg("app.theArchiveContainsNoBarlowProject"), msg("app.importProject"));
            return;
          }
          const norm = normalizePatch(imported);
          setPatchStep(norm);
          setSceneId(norm.scenes[0].id);
          return;
        }
        if (file.size > 8 * 1024 * 1024) throw new Error(msg("app.projectJSONExceeds8MiB"));
        const parsed: unknown = JSON.parse(await file.text());
        if (isPatch(parsed)) {
          const norm = normalizePatch(parsed);
          setPatchStep(norm);
          setSceneId(norm.scenes[0].id);
        } else void alertDialog(msg("app.thisFileIsNotABarlowProject"), msg("app.import"));
      } catch (e) {
        void alertDialog(msg("app.couldNotImport", {p0: errText(e)}), msg("app.import"));
      }
    })();
  };

  const exportZip = async () => {
    try {
      const blob = await exportProject(patch);
      await saveBlob(blob, `${exportStem(patch)}-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      void alertDialog(msg("app.exportFailed", {p0: errText(e)}), msg("app.export"));
    }
  };

  const resetPatch = () => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    }
    const fresh = defaultPatch();
    setPatch(fresh);
    setSceneId(fresh.scenes[0].id);
  };

  const renderWav = async (snapshot: Patch, bars: number, options: WavRenderOptions) => {
    if (rendering) throw new Error(msg("app.anExportIsAlreadyRunning"));
    setRendering(true);
    try {
      const blob = await engine.renderToWav(snapshot, wavExport?.sceneId ?? sceneId, bars, options);
      const saved = await saveBlob(blob, `${exportStem(snapshot)}.wav`);
      if (isDesktop && saved === null) throw new Error(msg("app.saveCanceledNoFileWasWritten"));
      return (blob.size - 44) / (44100 * 4);
    } finally {
      setRendering(false);
    }
  };

  // Playhead: позиция трека по часам движка (та же формула).
  const activeOf = (t: Track): number => {
    if (!playing || !engine.playing) return -1;
    const pattern = patternInScene(t, currentScene);
    const clock = engine.clockOf(t.id);
    if (!pattern || !clock) return -1;
    return stepIndexAt(t, pattern, engine.now, clock.resetTime, engine.currentBpm);
  };

  // Куда применяются пресеты/сэмплы: явно назначенная дорожка, иначе
  // работавший последним стан, иначе первая. Единый расчёт для панели
  // и подсветки дорожки-цели.
  const libTargetId =
    libTarget && patch.tracks.some((t) => t.id === libTarget)
      ? libTarget
      : clip.activeTrackId && patch.tracks.some((t) => t.id === clip.activeTrackId)
        ? clip.activeTrackId
        : (patch.tracks[0]?.id ?? null);
  // Имя пресета, совпадающего с инструментом дорожки-цели: панель
  // подсвечивает его карточку и скроллит к ней.
  const libPresetName = useMemo(() => {
    const t = patch.tracks.find((x) => x.id === libTargetId);
    return t ? instrumentNameOf({ ...t, ...instOf(patch, t) }) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, libTargetId, instOf, presetRevision]);

  return (
    <EditGestureContext.Provider value={history}>
    <div className="global-header">
      <MainMenu menus={[
        {label:msg("app.file"),help:'file-menu',anchor:'file-menu',items:[
          {label:msg("app.newProject"),help:'file-menu',action:clearAll},
          {label:msg("app.openProject"),help:'file-menu',action:()=>{if(isDesktop)void pickProjectFile().then(f=>{if(f)importFile(f);}).catch(e=>void alertDialog(errText(e),msg("app.import")));else fileRef.current?.click();}},
          {label:msg("app.saveProject"),help:'file-menu',action:()=>{void exportZip();}},
          {label:msg("app.openDemo"),help:'file-menu',action:resetPatch},
          {label:msg("app.importInstrument"),help:'instrument-import',separator:true,action:()=>{void pickInstrumentFile(()=>instrumentFileRef.current?.click()).then(f=>{if(f){setIncomingInstrument(f);setLibTab('inst');setShowLib(true);}}).catch(e=>void alertDialog(errText(e),msg("app.import")));}},
          {label:msg("app.soundWorkshop"),help:'sound-workshop',action:()=>{stopTransport();setShowWorkshop(true);}},
          {label:msg("app.instrumentPacks"),help:'portable-packs',action:()=>setShowPacks(true)},
          {label:msg("app.exportWAV"),help:'file-menu',disabled:rendering,action:()=>setWavExport({patch,sceneId})},
          {label:msg("app.exportPatchJSON"),help:'file-menu',action:exportPatch},
        ]},
        {label:msg("app.edit"),help:'undo',items:[
          {label:msg("app.undo"),help:'undo',shortcut:'Ctrl+Z',disabled:historyState.past.length===0&&(!historyState.gesture||historyState.gesture.base===patch),action:undo},
          {label:msg("app.redo"),help:'redo',shortcut:'Ctrl+Shift+Z',disabled:historyState.future.length===0,action:redo},
        ]},
        {label:msg("app.view"),help:'panel-switches',items:[
          {label:msg("app.instrumentLibrary"),help:'library-btn',checked:showLib,action:()=>showLib?setShowLib(false):openLibraryAt(null)},
          {label:msg("app.mixer"),help:'mixer-btn',checked:showMix,action:()=>setShowMix(v=>!v)},
          {label:msg("app.sceneSequence"),help:'chain-panel',checked:showChain,action:()=>setShowChain(v=>!v)},
        ]},
        {label:msg("app.settings"),help:'ai-btn',anchor:'ai-btn',items:[
          {label:msg("app.audioAndConnections"),help:'ai-btn',checked:showAi,action:()=>setShowAi(v=>!v)},
          {label:'Русский',help:'language',checked:locale==='ru',separator:true,action:()=>{try{setLocale('ru');}catch{void alertDialog(msg('language.saveError'));}}},
          {label:'English',help:'language',checked:locale==='en',action:()=>{try{setLocale('en');}catch{void alertDialog(msg('language.saveError'));}}},
          {label:msg("app.lightTheme"),help:'theme',checked:theme==='light',separator:true,action:()=>{try { setTheme(theme==='light'?'dark':'light'); } catch { void alertDialog(msg("app.couldNotSaveTheThemePreference"),msg("app.settings73")); }}},
        ]},
        {label:msg("app.help"),help:'help-guides',items:[
          {label:msg("app.searchHelp"),help:'help-search',shortcut:'Ctrl+/',action:openHelpSearch},
          {label:msg("app.learningStudio"),help:'learning-studio',action:()=>setShowLearning(true)},
          {label:msg("app.guidedTours"),help:'help-guides',action:()=>setShowHelpMenu(true)},
          {label:msg("app.explainAControl"),help:'point-help',shortcut:'F1',action:()=>{setObRun(null);setPointHelp(v=>!v);}},
          {label:msg("app.shortcutsAndGlossary"),help:'help-guides',action:()=>setShowHelp(true)},
        ]},
      ]}/>
      <header className="transport-bar">
        <button
          className={playing ? 'play-btn stop' : 'play-btn'}
          data-ob="play"
          onClick={togglePlay}
          title={preparingPlay ? msg("app.cancelPreparationSpace") : playing ? msg("app.stopSpace") : msg("app.playSpace")}
          aria-label={preparingPlay ? msg("app.cancelPreparation") : playing ? msg("app.stop") : msg("app.play")}
        >
          {preparingPlay ? '…' : playing ? '■' : '▶'}
        </button>
        <AudioStatus engine={engine} playing={playing} />
        <label data-ob="bpm" title={msg("app.tempoInBeatsPerMinuteYouCan")}>
          {msg("app.tempo")}<NumField help="patch.bpm"
            value={patch.bpm} min={30} max={300}
            onChange={(bpm) => {
              const v = Math.round(bpm);
              if (engine.playing) engine.setBpm(v);
              setPatch((p) => ({ ...p, bpm: v }));
            }}
          />
        </label>
        <SliderField
          className="master-vol"
          variant="label"
          label={msg("app.masterVolume")}
          title={msg("app.masterVolumeAbove100TheLimiterGently")}
          value={Math.round(patch.masterVolume * 100)}
          min={0} max={200} step={5}
          display={`${Math.round(patch.masterVolume * 100)}%`}
          unit="%"
          onChange={(v) => setPatch((p) => ({ ...p, masterVolume: v / 100 }))}
        />
        <span className="spacer" />
        <input
          className="title-input"
          data-ob="title"
          value={patch.title ?? ''}
          placeholder={msg("app.projectName")}
          title={msg("app.projectNameIsUsedInExportedFilenames")}
          onChange={(e) =>
            setPatch((p) => ({ ...p, title: e.target.value.trim() ? e.target.value : undefined }))
          }
        />
        <button
          className="undo-btn"
          disabled={historyState.past.length === 0 && (!historyState.gesture || historyState.gesture.base === patch)}
          data-help="undo" onClick={undo}
          title={msg("app.undoCtrlZ")}
        >↶</button>
        <button
          className="undo-btn"
          disabled={historyState.future.length === 0}
          data-help="redo" onClick={redo}
          title={msg("app.redoCtrlShiftZCtrlY")}
        >↷</button>
        <button className={(pointHelp?'on ':'')+'help-btn'} data-ob="help" data-help="point-help" data-help-toggle aria-label={msg("app.whatIsThis")} aria-pressed={pointHelp} title={msg("app.explainAControlF1")} onClick={()=>{setShowHelpMenu(false);setObRun(null);setPointHelp(v=>!v);}}>?</button>
        <input
          ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
        <input ref={instrumentFileRef} type="file" hidden accept=".zip" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f){setIncomingInstrument(f);setLibTab('inst');setShowLib(true);}}}/>
      </header>
      {showHelpMenu&&<div className="guide-menu-host"><HelpMenu onClose={()=>{setShowHelpMenu(false);setHelpInvite(needsInvite());}} onCheatSheet={()=>{setShowHelpMenu(false);setShowHelp(true);}} onPointHelp={()=>{setShowHelpMenu(false);setPointHelp(v=>!v);}} pointHelpOn={pointHelp}/></div>}
    </div>
    <div className="app-shell">
      {showLib && (
        <SoundBrowser
          incomingFile={incomingInstrument}
          onIncomingHandled={()=>setIncomingInstrument(null)}
          tracks={patch.tracks}
          targetId={libTargetId}
          onTarget={setLibTarget}
          targetPresetName={libPresetName}
          tab={libTab}
          onTab={setLibTab}
          onApply={applyPreset}
          onAudition={auditionPreset}
          onAssignSample={assignSample}
          usedSampleIds={
            new Set(patch.instruments.flatMap(sampleAssets).map((a) => a.sampleId))
          }
          onAddTrack={addTrack}
          onClose={() => setShowLib(false)}
        />
      )}
    <div className="app">
      <div className="topbar">
      <div className="workspace-bar">
      <div className="view-shortcuts" data-help="panel-switches">
        <button data-ob="library-btn" aria-pressed={showLib} className={showLib?'on':''} onClick={()=>showLib?setShowLib(false):openLibraryAt(null)}>{msg("app.instruments")}</button>
        <button data-ob="mixer-btn" aria-pressed={showMix} className={showMix?'on':''} onClick={()=>setShowMix(v=>!v)}>{msg("app.mixer97")}</button>
      </div>
      <div className="autosave-strip">
        <span className={`autosave-status ${saveStatus.phase}`} role="status" title={saveStatus.message}>
          {saveStatus.phase === 'error' ? msg("app.saveError") : saveStatus.message}
        </span>
        {saveStatus.phase === 'error' && <button onClick={() => { flushAutosave(); void alertDialog(autosaveStatus().message, msg("app.autosave")); }}>{msg("app.detailsRetry")}</button>}
        <button className="recovery-button" title={msg("app.restoreTheLastSuccessfulBackupUndoCan")} onClick={async () => {
          const recovered = loadRecovery();
          if (!recovered) { void alertDialog(msg("app.noBackupIsAvailableYet"), msg("app.recovery")); return; }
          if (await confirmDialog({ title: msg("app.restoreTheBackup"), text: msg("app.theCurrentProjectWillRemainInUndo"), okLabel: msg("app.restore") })) {
            const normalized = normalizePatch(recovered);
            resumeAutosave();
            setPatchStep(normalized);
            setSceneId(normalized.scenes[0].id);
          }
        }}>{msg("app.backup")}</button>
      </div>

      </div>
      {showMix && (
        <div className="mix-panel" data-ob="mix-panel">
          <div className="section-heading" data-help="mix-master"><strong>{msg("app.mixer108")}</strong><span className="spacer" /><HelpHint guide="mix" label={msg("app.tourBalanceAMix")} /><button data-help="panel-close" aria-label={msg("app.hideMixer")} title={msg("app.hideMixer")} onClick={()=>setShowMix(false)}>×</button></div>
          <div className="mix-rack">
            <div className="mix-block master" data-ob="mix-master">
              <div className="mix-main">
                <span className="mix-name">{msg("app.master")}</span>
                <label className="mix-ctl" data-help="scene-space"><span>{msg("app.sharedReverb")}</span><input type="checkbox" aria-label={msg("app.sharedReverb114")} checked={!!patch.sceneSpace} onChange={e=>setPatchStep(p=>({...p,sceneSpace:e.target.checked?{sizeSec:2,level:.3}:undefined}))}/></label>
                {patch.sceneSpace&&<div className="eq-knobs" data-help="scene-space"><Knob label={msg("app.tailS")} value={patch.sceneSpace.sizeSec} min={.2} max={8} step={.1} onChange={sizeSec=>setPatch(p=>({...p,sceneSpace:{...p.sceneSpace!,sizeSec}}))}/><Knob label={msg("app.return")} value={patch.sceneSpace.level*100} min={0} max={100} step={1} onChange={v=>setPatch(p=>({...p,sceneSpace:{...p.sceneSpace!,level:v/100}}))}/></div>}

                <SliderField
                  variant="mix"
                  label={msg("app.pan")}
                  title={msg("app.panTheEntireStereoMixTrackPanning")}
                  value={Math.round((patch.masterPan ?? 0.5) * 100)}
                  min={0} max={100} step={5}
                  display={panText(patch.masterPan ?? 0.5)}
                  onChange={(v) => setPatch((p) => ({ ...p, masterPan: v / 100 }))}
                />
                <label className="mix-ctl" title={msg("app.backgroundNoiseAddsTapeHissOrAir")}>
                  <span className="mc-cap">{msg("app.noise")}</span>
                  <select
                    value={patch.masterNoise ?? 'off'}
                    onChange={(e) =>
                      setPatch((pp) => ({ ...pp, masterNoise: e.target.value as Patch['masterNoise'] }))
                    }
                  >
                    <option value="off">—</option>
                    <option value="white">{msg("app.white")}</option>
                    <option value="pink">{msg("app.pink")}</option>
                  </select>
                </label>
                {(patch.masterNoise ?? 'off') !== 'off' && (
                  <SliderField
                    variant="mix"
                    label={msg("app.level")}
                    title={msg("app.noiseLevel0205Adds")}
                    value={Math.round((patch.masterNoiseLevel ?? 0.01) * 1000) / 10}
                    min={0} max={15} step={0.1}
                    display={`${(Math.round((patch.masterNoiseLevel ?? 0.01) * 1000) / 10).toFixed(1)}%`}
                    unit="%"
                    onChange={(v) => setPatch((pp) => ({ ...pp, masterNoiseLevel: v / 100 }))}
                  />
                )}
                <SliderField
                  variant="mix"
                  label={msg("app.compression")}
                  title={msg("app.masterCompression0IsOffHigherSettings")}
                  value={Math.round((patch.masterComp ?? 0) * 100)}
                  min={0} max={100} step={5}
                  display={`${Math.round((patch.masterComp ?? 0) * 100)}%`}
                  unit="%"
                  onChange={(v) => setPatch((pp) => ({ ...pp, masterComp: v / 100 }))}
                />
              </div>
            </div>
            {patch.tracks.map((t, ti) => (
              <div key={t.id} className={'mix-block' + (t.enabled === false ? ' off' : '')} data-ob={ti === 0 ? 'mix-track' : undefined}>
                <div className="mix-main">
                  <span className="mix-name" title={t.name}>{t.name}</span>
                  {patch.sceneSpace&&<div data-help="scene-space"><SliderField variant="mix" label={msg("app.reverbSend")} title={msg("app.reverbSendHint")} display={`${Math.round((t.spaceSend??0)*100)}%`} value={(t.spaceSend??0)*100} min={0} max={100} step={1} onChange={v=>setPatch(p=>({...p,tracks:p.tracks.map(x=>x.id===t.id?{...x,spaceSend:v/100}:x)}))}/></div>}

                  <SliderField
                    variant="mix"
                    label={msg("app.trackVolume")}
                    title={msg("app.trackVolumeHint")}
                    value={Math.round(t.volume * 100)}
                    min={0} max={100} step={5}
                    display={`${Math.round(t.volume * 100)}%`}
                    unit="%"
                    onChange={(v) =>
                      setPatch((p) => ({
                        ...p,
                        tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, volume: v / 100 } : x)),
                      }))
                    }
                  />
                  <SliderField
                    variant="mix"
                    label={msg("app.pan")}
                    title={msg("app.panDoubleClickForNumericEntry0", {p0: panText(t.pan)})}
                    value={Math.round(t.pan * 100)}
                    min={0} max={100} step={5}
                    display={panText(t.pan)}
                    onChange={(v) =>
                      setPatch((p) => ({
                        ...p,
                        tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, pan: v / 100 } : x)),
                      }))
                    }
                  />
                  <button
                    className={'mix-power ' + (t.enabled === false ? '' : 'on')}
                    title={msg("app.disableThisTrackInEverySceneRegardless")}
                    onClick={() =>
                      setPatch((p) => ({
                        ...p,
                        tracks: p.tracks.map((x) =>
                          x.id === t.id ? { ...x, enabled: x.enabled === false ? undefined : false } : x,
                        ),
                      }))
                    }
                  >
                    {t.enabled === false ? msg("app.enable") : msg("app.disable")}
                  </button>
                </div>
                <LevelBar vertical read={() => getTrackLevel(t.id)} />
              </div>
            ))}
            {patch.tracks.length === 0 && <p className="empty">{msg("app.noTracksYetAddOne")}</p>}
          </div>
        </div>
      )}

      {showAi && (
        <div className="ai-panel" data-ob="ai-panel">
          <div className="section-heading" data-help="ai-btn"><strong>{msg("app.audioAndConnections137")}</strong><span className="spacer" /><HelpHint guide="ai" /><button data-help="panel-close" aria-label={msg("app.hideSettings")} title={msg("app.hideSettings")} onClick={()=>setShowAi(false)}>×</button></div>
          <div className="inline seed-controls" data-help="playback-settings"><span className="settings-group-label">{msg("app.playback")}</span>
            <label title={msg("app.repeatTheSameRandomNoteChoicesArpeggios")}>
              <input type="checkbox" checked={patch.performanceSeed !== undefined}
                onChange={e => setPatchStep(p=>({...p,performanceSeed:e.target.checked ? 1 : undefined}))} />{msg("app.repeatablePlayback")}</label>
            {patch.performanceSeed !== undefined && <>
              <label>{msg("app.seed")}<NumField value={patch.performanceSeed} min={0} max={4294967295} step={1}
                onChange={performanceSeed=>setPatch(p=>({...p,performanceSeed:performanceSeed>>>0}))} /></label>
              <button onClick={()=>setPatchStep(p=>({...p,performanceSeed:crypto.getRandomValues(new Uint32Array(1))[0]}))}>{msg("app.newVariation")}</button>
            </>}
          </div>
          {(() => {
            const provider = PROVIDERS.find((p) => p.id === ai.providerId) ?? PROVIDERS[0];
            return (
              <>
                <span className="settings-group-label" data-help="ai-provider">{msg("app.soundGeneration")}</span>
                <label data-ob="ai-provider" title={msg("app.aiProviderElevenLabsGeneratesSoundsFromDescriptions")}>
                  {msg("app.provider")}<select value={ai.providerId} onChange={(e) => saveAi({ providerId: e.target.value })}>
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </label>
                <label data-ob="ai-key" title={msg("app.thisKeyIsStoredOnlyInThis", {p0: provider.keyHint ?? ''})}>
                  {msg("app.apiKey")}<span className="ai-key-wrap">
                    <input
                      type={showAiKey ? 'text' : 'password'} className="ai-key-input"
                      placeholder={provider.id === 'fal' ? 'id:secret' : 'sk_…'}
                      value={ai.keys[provider.id] ?? ''}
                      onChange={(e) => saveAi({ keys: { ...ai.keys, [provider.id]: e.target.value } })}
                    />
                    <button
                      className="ai-key-eye"
                      aria-label={showAiKey ? msg("app.hideKey") : msg("app.showKey")}
                      title={showAiKey ? msg("app.hideKey152") : msg("app.showKey153")}
                      onClick={() => setShowAiKey((v) => !v)}
                    >
                      {/* глаз: контур со зрачком; перечёркнут — скрыт */}
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M1.4 7C2.6 4.6 4.7 3.2 7 3.2S11.4 4.6 12.6 7C11.4 9.4 9.3 10.8 7 10.8S2.6 9.4 1.4 7Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        <circle cx="7" cy="7" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
                        {!showAiKey && <path d="M2.2 11.8 11.8 2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
                      </svg>
                    </button>
                  </span>
                </label>
              </>
            );
          })()}
          <BridgeSettings session={bridgeSession} status={bridgeStatus}
            onConnect={value => { saveBridgeSession(value); setBridgeSession(value); }}
            onDisconnect={() => { try { saveBridgeSession(null); } finally { setBridgeSession(null); } }} />

        </div>
      )}
      <div className="scenes" data-ob="scenes">
        <span className="scenes-label">{msg("app.scenes")}</span>
        {patch.scenes.map((s) => sceneRename?.id === s.id ? (
          <input key={s.id} className="scene-name-input scene-chip-input" data-help="scene-name" aria-label={msg("app.sceneName")}
            autoFocus value={sceneRename.name} onFocus={e => e.currentTarget.select()}
            onChange={e => setSceneRename({id:s.id,name:e.target.value})}
            onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if(e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelSceneRename.current=true; setSceneRename(null); } }}
            onBlur={() => { const name=sceneRename.name.trim(); if(!cancelSceneRename.current && name && name!==s.name)
              setPatchStep(p=>({...p,scenes:p.scenes.map(sc=>sc.id===s.id?{...sc,name}:sc)})); setSceneRename(null); }} />
        ) : (
          <button
            key={s.id}
            className={`scene-btn${s.id === sceneId ? ' on' : ''}${
              sceneDrop?.id === s.id ? ` drop-${sceneDrop.side}` : ''
            }`}
            title={
              (playing && engine.currentSceneId === s.id ? msg("app.playingNow") : '') +
              msg("app.clickToLaunchThisSceneAtThe")
            }
            data-ob="scene-edit" data-help="scene-chip"
            onDoubleClick={() => { cancelSceneRename.current=false; setSceneRename({id:s.id,name:s.name}); }}
            onKeyDown={e => { if(e.key==='F2') { e.preventDefault(); cancelSceneRename.current=false; setSceneRename({id:s.id,name:s.name}); } }}
            onClick={() => selectScene(s.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              removeScene(s.id);
            }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', `scene:${s.id}`);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('text/plain')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const r = e.currentTarget.getBoundingClientRect();
              setSceneDrop({ id: s.id, side: e.clientX < r.left + r.width / 2 ? 'before' : 'after' });
            }}
            onDragLeave={() => setSceneDrop((d) => (d?.id === s.id ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer.getData('text/plain');
              const side =
                sceneDrop?.id === s.id
                  ? sceneDrop.side
                  : (() => {
                      const r = e.currentTarget.getBoundingClientRect();
                      return e.clientX < r.left + r.width / 2 ? 'before' : 'after';
                    })();
              setSceneDrop(null);
              if (!raw.startsWith('scene:')) return;
              reorderScenes(raw.slice(6), s.id, side);
            }}
          >
            {s.name}
            {playing && engine.currentSceneId === s.id ? ' ●' : ''}
          </button>
        ))}
        <button className="scene-btn add" data-ob="scene-add" title={msg("app.newSceneSnapshotOfTheEnsembleWith")} onClick={addScene}>+</button>
        <button className="scene-btn remove" data-help="scene-delete" aria-label={msg("app.deleteCurrentScene")}
          disabled={patch.scenes.length<=1} title={patch.scenes.length<=1?msg("app.theOnlySceneCannotBeDeleted"):msg("app.deleteCurrentScene")}
          onClick={() => currentScene && removeScene(currentScene.id)}>×</button>
        <button className={showChain?'on':''} data-ob="chain-btn" data-help="scene-chain" aria-pressed={showChain}
          onClick={() => setShowChain(v=>!v)}>{msg("app.sequence")}{showChain?'▴':'▾'}</button>
        <span className="spacer" />
        <span
          className="seg"
          data-ob="follow-chain"
          title={msg("app.playbackModeSceneKeepsTheCurrentScene")}
        >
          <button className={!patch.followChain ? 'on' : ''} onClick={() => setFollowChain(false)}>
            {msg("app.sceneLabel")}</button>
          <button className={patch.followChain ? 'on' : ''} onClick={() => setFollowChain(true)}>
            {msg("app.sequence")}</button>
        </span>
        <HelpHint guide="arrangement" label={msg("app.tourArrangeScenes")} />
      </div>
      </div>

      {showChain && (
        <div className="chain-panel" data-ob="chain-panel">
          {patch.chain.map((it, i) => {
            const isPlaying =
              playing && patch.followChain && engine.currentChainPos === i;
            return (
              <div
                key={i}
                className={
                  (isPlaying ? 'chain-item playing' : 'chain-item') +
                  (chainDrop?.idx === i ? ` drop-${chainDrop.side}` : '')
                }
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('text/plain')) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const r = e.currentTarget.getBoundingClientRect();
                  setChainDrop({ idx: i, side: e.clientX < r.left + r.width / 2 ? 'before' : 'after' });
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setChainDrop((d) => (d?.idx === i ? null : d));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const d = chainDrop;
                  const side = d?.idx === i ? d.side : 'before';
                  setChainDrop(null);
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  if (Number.isInteger(from) && from !== i) chainReorder(from, i, side);
                }}
              >
                <span
                  className="chain-grip" data-help="chain-order" role="button" tabIndex={0}
                  aria-label={msg("app.positionMoveInSequence", {p0: i + 1})}
                  onKeyDown={e => { if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); chainReorder(i, i - 1, 'before'); } if (e.key === 'ArrowRight' && i < patch.chain.length - 1) { e.preventDefault(); chainReorder(i, i + 1, 'after'); } }}
                  title={msg("app.dragOrUseTheLeftRightArrow")}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  }}
                >
                  <span className="drag-dots" aria-hidden="true">⠿</span>
                </span>
                <span className="chain-number" data-help="chain-order">{i + 1}</span>
                <select className="chain-scene" data-help="chain-scene" aria-label={msg("app.sceneAtPosition", {p0: i + 1})}
                  title={patch.scenes.find(s => s.id === it.sceneId)?.name}
                  value={it.sceneId}
                  onChange={(e) => chainSetItem(i, { sceneId: e.target.value }, true)}
                >
                  {patch.scenes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button className="remove" data-help="chain-remove" aria-label={msg("app.removePosition", {p0: i + 1})} disabled={patch.chain.length <= 1} title={msg("app.removeFromSequence")} onClick={() => chainRemove(i)}>×</button>
                <div className="chain-parameters">
                  <label data-help="chain-bars">{msg("app.bars")}<NumField ariaLabel={msg("app.barsAtPosition", {p0: i + 1})} value={it.bars} min={1} max={256} w={48}
                      onChange={bars => chainSetItem(i, { bars: Math.round(bars) })} />
                  </label>
                  <div className="chain-tempo" data-help="scene-tempo">
                    <span>BPM</span>
                    <div>
                      <select aria-label={msg("app.tempoModeAtPosition", {p0: i + 1})} value={it.bpm === undefined ? 'global' : 'custom'}
                        onChange={e => chainSetItem(i, { bpm: e.target.value === 'custom' ? Math.round(patch.bpm) : undefined }, true)}>
                        <option value="global">{msg("app.global")}</option><option value="custom">{msg("app.custom")}</option>
                      </select>
                      <NumField help="scene-tempo" ariaLabel={msg("app.bpmAtPosition", {p0: i + 1})} value={it.bpm ?? patch.bpm} min={30} max={300} w={50} disabled={it.bpm === undefined}
                        onChange={bpm => chainSetItem(i, { bpm: Math.round(bpm) })} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <button data-help="chain-add" aria-label={msg("app.addAPositionToTheSequence")} onClick={chainAdd}>+</button>
          <HelpHint guide="arrangement" step={5} label={msg("app.tourSceneSequence")} />
        </div>
      )}

      <main ref={mainRef} className="main-area">
        <svg className="sc-links" width="100%" height="100%" aria-hidden="true">
          {scLinks.map((l) => (
            <path key={l.key} d={l.d} className="sc-link" />
          ))}
        </svg>
        <div className="track-navigation" data-help="track-filters">
        {/* Кнопка строго над треками: нажал — новый трек появился сразу под ней */}
        <button
          className="add-track"
          data-ob="add-track"
          onClick={addTrack}
          title={msg("app.newTrackSineWaveUsingThePrevious")}
        >
          {msg("app.track")}</button>
        <div className="track-filters" data-help="track-filters" role="group" aria-label={msg("app.trackFilters")}>
          <label className="track-name-filter" data-help="track-filter-name">
            <span>{msg("app.findTrack")}</span>
            <input type="search" aria-label={msg("app.filterByTrackName")} placeholder={msg("app.name")}
              value={trackQuery} onChange={e => setTrackQuery(e.target.value)} />
          </label>
          <label className="track-mute-filter" data-help="track-filter-muted">
            <input type="checkbox" checked={hideSceneMuted} onChange={e => setHideSceneMuted(e.target.checked)} />
            {msg("app.hideMutedInThisScene")}</label>
          <span className="track-filter-count" aria-live="polite">{visibleTracks.length} {msg("app.of")}{patch.tracks.length}</span>
          {(trackQuery || hideSceneMuted) && <button data-help="track-filter-reset" onClick={() => { setTrackQuery(''); setHideSceneMuted(false); }}>{msg("app.reset")}</button>}
        </div>
        </div>
        {patch.tracks.length > 0 && visibleTracks.length === 0 && <div className="track-filter-empty" data-help="track-filters">{msg("app.noTracksMatchTheseFiltersChangeThe")}</div>}
        {visibleTracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            inst={instOf(patch, t)}
            onChangeInst={changeInst}
            pattern={patternInScene(t, currentScene)}
            bpm={patch.bpm}
            activeStep={activeOf(t)}
            collapsed={editorActive ? editorActive !== t.id : !!ui.collapsed[t.id]}
            onToggleCollapse={toggleCollapse}
            onChange={changeTrack}
            onTrackCommand={changeTrackCommand}
            onPatternChange={changePattern}
            onPatternCommand={changePatternCommand}
            onSelectPattern={selectPattern}
            onToggleSlotMute={toggleSlotMute}
            slotMuted={currentScene?.slots[t.id]?.muted === true}
            onAddPattern={addPattern}
            onForkPattern={forkPattern}
            onRemovePattern={removePattern}
            onFillAxis={applyFillAxis}
            onMutate={mutate}
            getLevel={getTrackLevel}
            onRemove={removeTrack}
            onDuplicate={duplicateTrack}
            onReorder={reorderTrack}
            soloActive={currentScene?.soloTrackId === t.id}
            libTarget={showLib && libTargetId === t.id}
            onSolo={toggleSceneSolo}
            onScratchBegin={(pos) => engine.scratchBegin(t, pos)}
            onScratchMove={(pos) => engine.scratchMove(pos)}
            onScratchEnd={() => engine.scratchEnd()}
            onScratchPreview={() => {
              // Молчаливые отказы превратили «не слышно» в загадку: теперь
              // движок возвращает причину тишины — показываем её.
              void engine.previewScratch(t).then((why) => {
                if (why) void alertDialog(msg("app.scratchPlaybackUnavailable", {p0: why}), msg("app.scratchLabel"));
              });
            }}
            onScratchSave={saveScratchSample}
            onScratchPeaks={() => engine.getSamplePeaks(t.instrumentId && instOf(patch, t).sampleId)}
            patternSceneCounts={patternSceneCounts}
            muteSceneCount={muteSceneCounts[t.id] ?? 0}
            allTracks={trackList}
            onGenerateSample={generateSample}
            onTransformSample={transformSample}
            genBusy={!!genBusy[t.id]}
            onCancelSampleJob={() => cancelSampleJob(t.id)}
            editorOpen={editorActive === t.id}
            editorTab={editorTab}
            onEditorTab={setEditorTab}
            onOpenEditor={openEditor}
            onCloseEditor={closeEditor}
            onGetSamplePCM={getSamplePCM}
            onPreviewSampleRegion={previewSampleRegion}
            onPreviewNote={previewNote}
            onOpenBrowser={openLibraryAt}
          />
        ))}
        {patch.tracks.length === 0 && <p className="empty">{msg("app.noTracksYetAddOne")}</p>}
      </main>

      {showHelp && (
        <Modal label={msg("app.quickReference")} className="help-modal" onClose={() => setShowHelp(false)}>
            <h3>{msg("app.quickReference")}</h3>
            <div className="help-cols">
              <div className="help-col">
                <h4>{msg("app.notesAndGrid")}</h4>
                <ul>
                  <li>{msg("app.clickACellToAddANote")}</li>
                  <li>{msg("app.dragFromAnEmptyCellToSelect")}</li>
                  <li>{msg("app.dragSelectedNotesToMoveThemWheel")}</li>
                  <li>{msg("app.dragANoteSRightEdgeTo")}</li>
                  <li>{msg("app.automationOpensBelowTheNoteGridClick")}</li>
                </ul>
              </div>
              <div className="help-col">
                <h4>{msg("app.structureAndEditing")}</h4>
                <ul>
                  <li>{msg("app.rightClickAClipToMakeAn")}</li>
                  <li>{msg("app.ctrlCVCopiesAndPastesNotes")}</li>
                  <li>{msg("app.deleteRemovesSelectedNotesEscClearsThe")}</li>
                  <li>{msg("app.ctrlZCtrlShiftZUndoRedo")}</li>
                  <li>{msg("app.f1EnablesWhatIsThisClickA")}</li>
                </ul>
              </div>
            </div>
            <h3>{msg("app.glossary")}</h3>
            <ul className="help-dict">
              <li><span className="help-term">{msg("app.part")}</span> {msg("app.theClipAssignedToATrackIn")}</li>
              <li><span className="help-term">{msg("app.clip")}</span> {msg("app.aReusableNotePatternChangesAffectEvery")}</li>
              <li><span className="help-term">{msg("app.sceneLabel")}</span> {msg("app.anEnsembleSnapshotWithOneClipAssignment")}</li>
              <li><span className="help-term">{msg("app.sequence")}</span> {msg("app.scenesInPlaybackOrderWithTheirLengths")}</li>
              <li><span className="help-term">{msg("app.noteGrid")}</span> {msg("app.stepsInColumnsAndPitchesInRows")}</li>
              <li><span className="help-term">{msg("app.pitchScale")}</span> {msg("app.theGridSPitchesWorldTuningsN")}</li>
              <li><span className="help-term">{msg("app.automation")}</span> {msg("app.aParameterSSavedMovementOverTime")}</li>
              <li><span className="help-term">{msg("app.clipCurve")}</span> {msg("app.volumeFilterOrPanOverTheClip")}</li>
              <li><span className="help-term">{msg("app.modulation")}</span> {msg("app.aSourceThatMovesAParameterSuch")}</li>
              <li><span className="help-term">LFO</span> {msg("app.aLowFrequencyOscillatorASlowWaveform")}</li>
              <li><span className="help-term">{msg("app.sHSteps")}</span> {msg("app.sampleHoldARandomValueIsHeld")}</li>
              <li><span className="help-term">{msg("app.perlinNoise")}</span> {msg("app.smoothlyVaryingNoiseRandomValuesConnectedBy")}</li>
            </ul>
            <div className="modal-btns">
              <span className="spacer" />
              <button onClick={() => setShowHelp(false)}>{msg("app.close")}</button>
            </div>
        </Modal>
      )}

      {wavExport && <WavExport patch={wavExport.patch} sceneId={wavExport.sceneId} backend={engine}
        onClose={() => setWavExport(null)} onExport={renderWav} />}
      {showWorkshop && <SoundWorkshop onStop={()=>engine.stopAudition()} apiKey={ai.keys.fal ?? ''} onPreview={preset=>{const {track}=makeTrackWithInstrument({id:'workshop-preview',name:preset.name});engine.previewSounding(soundForAudition(track,preset));}} onClose={()=>setShowWorkshop(false)} />}
      {showLearning && <LearningStudio patch={patch} onProject={p=>{stopTransport();setPatchStep(p);setSceneId(p.scenes[0]?.id ?? '');}} onClose={()=>setShowLearning(false)} />}
      {showPacks && <PackManager onClose={()=>setShowPacks(false)} />}
      <DialogHost />
      {showHelpSearch && <HelpSearch onClose={()=>setShowHelpSearch(false)} onNavigate={navigateHelp} tracks={patch.tracks.map(t=>({id:t.id,name:t.name}))} initialTrack={editorActive??patch.tracks[0]?.id??''} />}
      {helpArrival&&<aside className="help-arrival" data-help="help-search-arrival" role="status"><span>{helpArrival}</span><button aria-label={msg("app.closeNavigationHint")} onClick={()=>{setHelpArrival('');setHelpDestination(null);}}>×</button></aside>}
      {pointHelp && <PointHelp onExit={() => setPointHelp(false)} />}
      {obRun && (
        <Onboarding run={obRun} onDone={stopGuide} onStep={stepGuide} onOpenPanel={openGuidePanel} />
      )}
    </div>
    </div>
    </EditGestureContext.Provider>
  );
}
