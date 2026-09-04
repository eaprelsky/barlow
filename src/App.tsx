import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AudioEngine } from './audio/engine';
import { stepIndexAt } from './audio/timing';
import type { AudioBackend } from './audio/backend';
import { euclid, randomMask } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { SCALE_PRESETS } from './music/scales';
import { mutatePattern, scatterHeights, spreadHeights, type MutateModes } from './music/mutate';
import {
  INSTRUMENT_FIELDS,
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
import type { Instrument, Patch, Pattern, Track } from './types';
import { TrackRow } from './components/TrackRow';
import { LevelBar } from './components/LevelBar';
import { NumField } from './components/NumField';
import { SliderField } from './components/SliderField';
import { DialogHost } from './components/Dialog';
import { alertDialog, confirmDialog } from './components/dialogs';
import { PROVIDERS } from './ai/providers';
import { putSample, getSampleBlob } from './audio/library';
import type { SampleMeta } from './audio/library';
import type { InstrumentPreset } from './music/instrumentPresets';
import { clip } from './music/clip';
import { exportProject, importProject, looksLikeZip } from './audio/project';
import { loadAutosave, saveAutosave } from './storage';
import { isDesktop, pickProjectFile, saveBlob } from './platform';
import { createBridge, setByPointer } from './bridge';
import { slugify } from './utils/slug';
import { SoundBrowser } from './components/SoundBrowser';
import { HelpHint, HelpMenu, Onboarding } from './onboarding/Onboarding';
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
const WAV_BARS = 8;

/** Стем имён файлов экспорта: название пьесы (транслит) или 'barlow'. */
const exportStem = (patch: Patch): string =>
  patch.title ? slugify(patch.title) : 'barlow';

/** Подпись панорамы: L/R с отклонением или центр. */
const panText = (pan: number) =>
  pan < 0.49
    ? `L${Math.round((0.5 - pan) * 200)}`
    : pan > 0.51
      ? `R${Math.round((pan - 0.5) * 200)}`
      : 'центр';

interface AiSettings {
  providerId: string;
  apiKey: string;
}

function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_KEY_STORE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiSettings>;
      if (parsed && typeof parsed.apiKey === 'string') {
        return { providerId: PROVIDERS[0].id, apiKey: parsed.apiKey };
      }
    }
  } catch {
    /* настройки необязательны */
  }
  return { providerId: PROVIDERS[0].id, apiKey: '' };
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
  waveform: 'sine',
  attack: 0.002,
  decay: 0.25,
  pitchDrop: 1,
  pitchTime: 0.08,
  filterLow: 20,
  filterFreq: 8000,
});

/** Стандартный западный строй нового трека: 12 равных полутонов. */
const CHROMATIC = SCALE_PRESETS.find((p) => p.name === '12 равных полутонов')?.ratios ?? [1];

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
  const [patch, setPatchRaw] = useState<Patch>(loadPatch);
  const undoStack = useRef<Patch[]>([]);
  const redoStack = useRef<Patch[]>([]);
  const lastPush = useRef(0);

  // Все правки патча идут через этот сеттер: он пишет историю.
  // Быстрые изменения (движение ползунка) коалесцируются в один шаг (< 700 мс).
  const setPatch: Dispatch<SetStateAction<Patch>> = useCallback((updater) => {
    setPatchRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      const now = Date.now();
      if (now - lastPush.current > 700) {
        undoStack.current.push(prev);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
        lastPush.current = now;
      }
      return next;
    });
  }, []);

  // Дискретная команда (перенос/вставка/удаление нот, структурные правки) —
  // всегда отдельный шаг истории: не склеивается с соседней правкой по
  // времени, Ctrl+Z откатывает ровно одно действие.
  const setPatchStep: Dispatch<SetStateAction<Patch>> = useCallback((updater) => {
    lastPush.current = 0;
    setPatch(updater);
  }, [setPatch]);

  const undo = useCallback(() => {
    setPatchRaw((prev) => {
      const p = undoStack.current.pop();
      if (!p) return prev;
      redoStack.current.push(prev);
      lastPush.current = 0;
      return p;
    });
  }, []);

  const redo = useCallback(() => {
    setPatchRaw((prev) => {
      const p = redoStack.current.pop();
      if (!p) return prev;
      undoStack.current.push(prev);
      lastPush.current = 0;
      return p;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
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
  const [sceneId, setSceneId] = useState(() => patch.scenes[0]?.id ?? '');
  const [showChain, setShowChain] = useState(false);
  const [ai, setAi] = useState<AiSettings>(loadAiSettings);
  const [showAi, setShowAi] = useState(false);
  const [showLib, setShowLib] = useState(false);
  const [showMix, setShowMix] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Онбординг: меню гидов у «?» и текущий гид (id + шаг + зона-скоуп).
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [obRun, setObRun] = useState<GuideRun | null>(null);
  const [helpInvite, setHelpInvite] = useState(needsInvite);
  const obRef = useRef<GuideRun | null>(null);
  obRef.current = obRun;

  const startGuide = useCallback((guideId: string, opts?: { scope?: string; step?: number }) => {
    markInvited(); // любой запуск гасит пульс-приглашение на «?»
    setShowHelpMenu(false);
    setObRun({ guideId: guideId, step: opts?.step ?? 0, scope: opts?.scope });
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

  // «?» — меню гидов; Esc — закрыть. Проверки по e.key — символы,
  // не зависящие от раскладки (?, Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setShowHelpMenu((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);
  const [fileOpen, setFileOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [genBusy, setGenBusy] = useState<Record<string, boolean>>({});
  // Редактор волны: id дорожки в раздвижном режиме (остальные съёживаются).
  const [waveEditorTrack, setWaveEditorTrack] = useState<string | null>(null);
  // Прицел переноса сцены: подсветка вставки до/после кнопки.
  const [sceneDrop, setSceneDrop] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  // Прицел переноса пункта цепочки.
  const [chainDrop, setChainDrop] = useState<{ idx: number; side: 'before' | 'after' } | null>(null);
  const toggleWaveEditor = useCallback((id: string) => {
    setWaveEditorTrack((cur) => (cur === id ? null : id));
  }, []);
  const [, setFrame] = useState(0); // перерисовка playhead раз в кадр
  const engineRef = useRef<AudioBackend | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Движок один — Web Audio (нативный Rust-вывод отложен: звук не сходился
  // с эталоном). Конструктор дешёвый: AudioContext создаётся лениво.
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine: AudioBackend = engineRef.current;
  const getSampleBuffer = useCallback(
    (id?: string) => engine.getSampleBuffer(id),
    [engine],
  );
  const previewSampleRegion = useCallback(
    (t: Track, fromSec: number, toSec: number) => engine.previewSampleRegion(t, fromSec, toSec),
    [engine],
  );
  const previewNote = useCallback((t: Track) => engine.previewNote(t), [engine]);
  // Библиотека звуков (левая док-панель): открывается с целевой дорожкой —
  // той, чей чип нажали; из шапки — последний работавший стан.
  const [libTarget, setLibTarget] = useState<string | null>(null);
  const openLibraryAt = useCallback(
    (trackId: string | null) => {
      setShowLib(true);
      if (showAi) setShowAi(false);
      if (trackId) setLibTarget(trackId);
    },
    [showAi],
  );

  // Режим редактора гаснет сам, когда его дорожка исчезла (очистить всё,
  // удаление, undo, импорт): стухший id иначе держал бы все новые треки
  // насильно свёрнутыми, а кнопка разворота на них не действовала бы.
  const waveEditorActive =
    waveEditorTrack && patch.tracks.some((t) => t.id === waveEditorTrack)
      ? waveEditorTrack
      : null;

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
  const changeInst = useCallback((trackId: string, inst: Instrument) => {
    setPatch((p) => {
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
  }, []);

  const patternSceneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sc of patch.scenes) {
      for (const pid of Object.values(sc.slots)) counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return counts;
  }, [patch.scenes]);

  const togglePlay = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
      return;
    }
    void engine.ensureSamples(patch).then(() => {
      engine.play(patch, sceneId);
      setPlaying(true);
    });
  }, [engine, patch, sceneId]);

  // Пока играем — прогреваем кэш сэмплов (загрузил новый — заиграл без рестарта).
  useEffect(() => {
    if (playing) void engine.ensureSamples(patch);
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
  const liveRef = useRef({ patch, sceneId, playing });
  liveRef.current = { patch, sceneId, playing };

  useEffect(() => {
    const bridge = createBridge({
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
        if (!isPatch(raw)) throw new Error('JSON не похож на патч barlow');
        const norm = normalizePatch(raw);
        setPatchStep(norm);
        setSceneId(norm.scenes[0].id);
      },
      onSetParam(pointer, value) {
        // Путь проверяем на копии текущего патча: исключение должно уйти
        // в ack моста, а не в рендер React (апдейтер setPatch выполняется
        // позже и уронил бы всё дерево).
        setByPointer(liveRef.current.patch, pointer, value);
        setPatch((p) => setByPointer(p, pointer, value));
      },
      onTransport(cmd) {
        const live = liveRef.current;
        if (cmd.action === 'play') {
          if (engine.playing) return;
          void engine.ensureSamples(live.patch).then(() => {
            engine.play(live.patch, live.sceneId);
            setPlaying(true);
          });
        } else if (cmd.action === 'stop') {
          engine.stop();
          setPlaying(false);
        } else if (cmd.action === 'scene' && cmd.sceneId) {
          if (!live.patch.scenes.some((s) => s.id === cmd.sceneId)) {
            throw new Error(`сцены «${cmd.sceneId}» нет в патче`);
          }
          if (engine.playing) engine.setScene(cmd.sceneId);
          setSceneId(cmd.sceneId);
        } else if (cmd.action === 'bpm' && cmd.value) {
          const v = Math.max(30, Math.min(300, Math.round(cmd.value)));
          if (engine.playing) engine.setBpm(v);
          setPatch((p) => ({ ...p, bpm: v }));
        }
      },
    });
    bridgeRef.current = bridge;
    // Ноты — в мост батчем: видно, что реально триггернулось (доли арпеджиатора тоже).
    engine.noteSink = (trackId, at, notes) =>
      bridge.pushNotes([{ trackId, at, notes: notes.map((nt) => ({ n: nt.n, oct: nt.oct, vel: nt.vel })) }]);
    return () => {
      engine.noteSink = undefined;
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [engine, setPatch, setPatchStep]);

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
        name: uniqueName('сцена', p.scenes.map((s) => s.name)),
        slots: { ...(from?.slots ?? {}) },
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
    (idx: number, item: Partial<{ sceneId: string; bars: number; bpm?: number }>) => {
      setPatch((p) => ({
        ...p,
        chain: p.chain.map((it, i) => (i === idx ? { ...it, ...item } : it)),
      }));
    },
    [],
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
   *  (v34; копия, если инструмент общий), строй/тоника/эффекты/моно — на
   *  трек, ноты клемпятся в новую шкалу. Ноты и ритм — пользователя.
   *  Отдельный шаг undo. */
  const applyPreset = useCallback(
    (trackId: string, preset: InstrumentPreset) => {
      setPatchStep((p) => {
        const track = p.tracks.find((t) => t.id === trackId);
        const inst = track && p.instruments.find((i) => i.id === track.instrumentId);
        if (!track || !inst) return p;
        const t = preset.track;
        const scale = t.scale && t.scale.length > 0 ? t.scale : [1];
        const instUpd: Record<string, unknown> = {};
        for (const f of INSTRUMENT_FIELDS) {
          if (t[f] !== undefined) instUpd[f] = t[f];
        }
        // Поля, у которых пресет задаёт базу, а не «пусто»:
        const instDefaults: Partial<Instrument> = {
          sustain: t.sustain ?? 0,
          pitchDrop: t.pitchDrop ?? 1,
          pitchTime: t.pitchTime ?? 0.08,
          filterLow: t.filterLow ?? 20,
          filterFreq: t.filterFreq ?? 8000,
          filterQ: t.filterQ ?? 0.8,
          fmRatio: t.fmRatio ?? 2,
          fmIndex: t.fmIndex ?? 3,
          voiceMorph: t.voiceMorph ?? 0.5,
          ksLife: t.ksLife ?? 2.5,
          sampleMode: t.sampleMode ?? 'plain',
          grainSizeMs: t.grainSizeMs ?? 120,
          grainCount: t.grainCount ?? 10,
          grainPos: t.grainPos ?? 0.3,
          grainScatter: t.grainScatter ?? 0.15,
          vibratoRate: t.vibratoRate ?? 5,
          vibratoDepth: t.vibratoDepth ?? 0,
          unisonVoices: t.unisonVoices ?? 1,
          unisonDetune: t.unisonDetune ?? 12,
          unisonSpread: t.unisonSpread ?? 0,
          vibratoDelay: t.vibratoDelay ?? 0,
          filterEnvAmount: t.filterEnvAmount ?? 0,
          filterEnvTime: t.filterEnvTime ?? 0.3,
        };
        const merged: Instrument = { ...inst, ...instDefaults, ...instUpd, name: preset.name } as Instrument;
        // Ноты выше новой шкалы — вниз; дубли строк (шкала схлопнулась) — один.
        const patterns = track.patterns.map((pt) => ({
          ...pt,
          steps: pt.steps.map((s) => ({
            ...s,
            notes: s.notes
              .map((nt) => ({ ...nt, n: Math.min(nt.n, scale.length - 1) }))
              .filter((nt, i, arr) => arr.findIndex((x) => x.n === nt.n) === i),
          })),
        }));
        const updTrack: Track = {
          ...track,
          freq: t.freq ?? track.freq,
          scale,
          scaleOctUp: 0,
          scaleOctDown: 0,
          effects: t.effects ?? [],
          mono: t.mono,
          mods: t.mods ? t.mods.map((m) => ({ ...m })) : track.mods,
          patterns,
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

  /** Слушать пресет в библиотеке: нота тоники дорожки, тембр пресета —
   *  без применения (тот же triggerVoice, что будет в паттерне). */
  const auditionPreset = useCallback(
    (trackId: string, preset: InstrumentPreset) => {
      const track = patch.tracks.find((t) => t.id === trackId);
      if (!track) return;
      const inst = instrumentOfFields(preset.track, uid('i'), preset.name);
      engine.previewSounding({ ...track, ...inst });
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
    const scene = { id: uid('s'), name: 'сцена 1', slots: {} as Record<string, string> };
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
        return { ...s, slots: { ...s.slots, [copy.id]: (old && idMap.get(old)) ?? patterns[0].id } };
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
      title: `удалить трек «${victim.name}»?`,
      okLabel: 'удалить',
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

  /** Новый трек — сразу, без браузера: чистый синус, западные 12 полутонов,
   *  стан 16 шагов. Встаёт ПЕРВЫМ: добавил — и работаешь с ним, не скролля. */
  const addTrack = useCallback(() => {
    // id — снаружи апдейтера: StrictMode прогоняет апдейтер дважды, id
    // должен остаться тем же (и он нужен, чтобы открыть библиотеку).
    const id = uid('t');
    setPatchStep((p) => {
      const { track, instrument } = makeTrackWithInstrument({
        id,
        name: uniqueName('трек', p.tracks.map((t) => t.name)),
        scale: CHROMATIC,
      });
      // Новый трек добавляется во все сцены своим первым паттерном.
      const scenes = p.scenes.map((s) => ({ ...s, slots: { ...s.slots, [track.id]: track.patterns[0].id } }));
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
  const selectPattern = useCallback(
    (trackId: string, patternId: string) => {
      setPatch((p) => ({
        ...p,
        scenes: p.scenes.map((s) =>
          s.id === sceneId ? { ...s, slots: { ...s.slots, [trackId]: patternId } } : s,
        ),
      }));
    },
    [sceneId],
  );

  const addPattern = useCallback((trackId: string) => {
    setPatchStep((p) => {
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track) return p;
      const pattern = makePattern(nextPatternName(track), track.patterns[0]?.length ?? 16, undefined, track.rate);
      return {
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, patterns: [...t.patterns, pattern] } : t,
        ),
        scenes: p.scenes.map((s) =>
          s.id === sceneId ? { ...s, slots: { ...s.slots, [trackId]: pattern.id } } : s,
        ),
      };
    });
  }, [sceneId]);

  const forkPattern = useCallback(
    (trackId: string, patternId: string) => {
      setPatchStep((p) => {
        const track = p.tracks.find((t) => t.id === trackId);
        const src = track?.patterns.find((pt) => pt.id === patternId);
        if (!track || !src) return p;
        const copy = makePattern(
          `${src.name}′`,
          src.length,
          src.steps.map((s) => ({ ...s, notes: [...s.notes] })),
        );
        copy.forkedFrom = src.id;
        copy.rate = src.rate;
        copy.volume = src.volume;
        copy.pan = src.pan;
        copy.mods = src.mods?.map((m) => ({ ...m }));
        copy.fadeIn = src.fadeIn;
        copy.fadeOut = src.fadeOut;
        return {
          ...p,
          tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, patterns: [...t.patterns, copy] } : t)),
          scenes: p.scenes.map((s) =>
            s.id === sceneId ? { ...s, slots: { ...s.slots, [trackId]: copy.id } } : s,
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
          s.slots[trackId] === patternId ? { ...s, slots: { ...s.slots, [trackId]: fallback } } : s,
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
  }, [patch.tracks, waveEditorActive]);

  const saveAi = useCallback((next: Partial<AiSettings>) => {
    setAi((prev) => {
      const merged = { ...prev, ...next };
      localStorage.setItem(AI_KEY_STORE, JSON.stringify(merged));
      return merged;
    });
  }, []);

  /** Сгенерировать сэмпл по описанию и положить в слот трека. */
  const generateSample = useCallback(
    async (trackId: string, prompt: string, seconds: number) => {
      const provider = PROVIDERS.find((p) => p.id === ai.providerId) ?? PROVIDERS[0];
      if (!ai.apiKey) {
        void alertDialog('Сначала укажи API-ключ: кнопка «настройки» в шапке', 'ИИ-генерация');
        return;
      }
      setGenBusy((b) => ({ ...b, [trackId]: true }));
      try {
        const blob = await provider.generate({ apiKey: ai.apiKey, prompt, seconds });
        const meta = await putSample(blob, prompt.slice(0, 40));
        setPatch((p) => ({
          ...p,
          instruments: p.instruments.map((i) =>
            i.id === p.tracks.find((t) => t.id === trackId)?.instrumentId
              ? { ...i, sampleId: meta.id, sampleName: meta.name }
              : i,
          ),
        }));
      } catch (e) {
        void alertDialog(
          `Генерация не удалась: ${e instanceof Error ? e.message : String(e)}`,
          'ИИ-генерация',
        );
      } finally {
        setGenBusy((b) => ({ ...b, [trackId]: false }));
      }
    },
    [ai],
  );

  /** ИИ-преобразование сэмпла в слоте по описанию (audio-to-audio).
   *  Провайдер без a2a честно отказывается — нужен fal.ai (роадмап). */
  const transformSample = useCallback(
    async (trackId: string, prompt: string, strength: number) => {
      const provider = PROVIDERS.find((p) => p.id === ai.providerId) ?? PROVIDERS[0];
      if (!ai.apiKey) {
        void alertDialog('Сначала укажи API-ключ: кнопка «настройки» в шапке', 'ИИ-преобразование');
        return;
      }
      if (!provider.transform || !provider.supportsTransform) {
        void alertDialog(
          `«${provider.title}» не умеет audio-to-audio — только текст→звук. Преобразование сэмпла появится с провайдером fal.ai (в роадмапе)`,
          'ИИ-преобразование',
        );
        return;
      }
      const track = patch.tracks.find((t) => t.id === trackId);
      const inst = track && instOf(patch, track);
      const blob = inst?.sampleId ? await getSampleBlob(inst.sampleId) : null;
      if (!blob) return;
      setGenBusy((b) => ({ ...b, [trackId]: true }));
      try {
        const out = await provider.transform({ apiKey: ai.apiKey, prompt, audio: blob, strength });
        const meta = await putSample(out, prompt.slice(0, 40));
        setPatch((p) => ({
          ...p,
          instruments: p.instruments.map((i) =>
            i.id === p.tracks.find((t) => t.id === trackId)?.instrumentId
              ? { ...i, sampleId: meta.id, sampleName: meta.name }
              : i,
          ),
        }));
      } catch (e) {
        void alertDialog(
          `Преобразование не удалось: ${e instanceof Error ? e.message : String(e)}`,
          'ИИ-преобразование',
        );
      } finally {
        setGenBusy((b) => ({ ...b, [trackId]: false }));
      }
    },
    [ai, patch.tracks, instOf],
  );

  /** Свернуть/развернуть дорожку. Пока открыт редактор волны, чужие дорожки
   *  форс-свёрнуты — клик по ним пробивает режим: закрывает редактор и
   *  разворачивает дорожку. Иначе любой «залипший» режим блокировал бы
   *  разворот (клик крутил бы ui.collapsed, который игнорируется). */
  const toggleCollapse = useCallback((id: string) => {
    if (waveEditorActive && waveEditorActive !== id) {
      setWaveEditorTrack(null);
      setUi((u) => {
        const next = { collapsed: { ...u.collapsed, [id]: false } };
        localStorage.setItem(UI_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }
    if (waveEditorActive && waveEditorActive === id) {
      setWaveEditorTrack(null); // «свернуть» карточку с редактором = закрыть редактор
      return;
    }
    setUi((u) => {
      const next = { collapsed: { ...u.collapsed, [id]: !u.collapsed[id] } };
      localStorage.setItem(UI_KEY, JSON.stringify(next));
      return next;
    });
  }, [waveEditorActive]);

  // ---- Файлы ----

  const exportPatch = () => {
    void saveBlob(
      new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }),
      `${exportStem(patch)}-patch.json`,
    ).catch((e) => void alertDialog(`Экспорт не удался: ${errText(e)}`, 'экспорт'));
  };

  // Импорт: zip-проект (сэмплы укладываются в библиотеку, хеши совпадают
  // со ссылками патча) или голый json патча.
  const importFile = (file: File) => {
    void (async () => {
      try {
        if (await looksLikeZip(file)) {
          const imported = await importProject(file);
          if (!imported) {
            void alertDialog('В архиве нет патча barlow', 'импорт проекта');
            return;
          }
          const norm = normalizePatch(imported);
          setPatchStep(norm);
          setSceneId(norm.scenes[0].id);
          return;
        }
        const parsed: unknown = JSON.parse(await file.text());
        if (isPatch(parsed)) {
          const norm = normalizePatch(parsed);
          setPatchStep(norm);
          setSceneId(norm.scenes[0].id);
        } else void alertDialog('Файл не похож на патч barlow', 'импорт');
      } catch {
        void alertDialog('Не удалось прочитать файл', 'импорт');
      }
    })();
  };

  const exportZip = async () => {
    try {
      const blob = await exportProject(patch);
      await saveBlob(blob, `${exportStem(patch)}-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      void alertDialog(`Экспорт не удался: ${errText(e)}`, 'экспорт');
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

  const renderWav = async () => {
    if (rendering) return;
    setRendering(true);
    try {
      const blob = await engine.renderToWav(patch, sceneId, WAV_BARS);
      await saveBlob(blob, `${exportStem(patch)}.wav`);
    } catch (e) {
      void alertDialog(`Рендер не удался: ${errText(e)}`, 'запись wav');
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

  return (
    <div className="app-shell">
      {showLib && (
        <SoundBrowser
          tracks={patch.tracks}
          targetId={
            libTarget && patch.tracks.some((t) => t.id === libTarget)
              ? libTarget
              : clip.activeTrackId && patch.tracks.some((t) => t.id === clip.activeTrackId)
                ? clip.activeTrackId
                : patch.tracks[0]?.id ?? null
          }
          onTarget={setLibTarget}
          onApply={applyPreset}
          onAudition={auditionPreset}
          onAssignSample={assignSample}
          usedSampleIds={
            new Set(patch.instruments.map((i) => i.sampleId).filter((v): v is string => !!v))
          }
          onAddTrack={addTrack}
          onClose={() => setShowLib(false)}
        />
      )}
    <div className="app">
      <div className="topbar">
      <header>
        <span className="logo">barlow</span>
        <button
          className={playing ? 'play-btn stop' : 'play-btn'}
          data-ob="play"
          onClick={togglePlay}
          title={playing ? 'Стоп (пробел тоже работает — в будущих версиях)' : 'Играть'}
        >
          {playing ? '■' : '▶'}
        </button>
        <label data-ob="bpm" title="Темп, ударах в минуту. Меняется и на ходу: часы пере-якорятся, позиция не сбивается">
          темп
          <NumField
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
          label="общая громкость"
          title="Общая громкость. Выше 100% — лимитер мягко пережимает пики: звук плотнее и жирнее, без треска. Двойной клик по подписи — точное число"
          value={Math.round(patch.masterVolume * 100)}
          min={0} max={200} step={5}
          display={`${Math.round(patch.masterVolume * 100)}%`}
          unit="%"
          onChange={(v) => setPatch((p) => ({ ...p, masterVolume: v / 100 }))}
        />
        <SliderField
          className="master-vol"
          variant="label"
          label="пан"
          title="Панорама всего микса: сдвигает стерео поле целиком. Панорамы треков и их модуляции остаются как есть — едут внутри поля. Двойной клик — точное число"
          value={Math.round((patch.masterPan ?? 0.5) * 100)}
          min={0} max={100} step={5}
          display={panText(patch.masterPan ?? 0.5)}
          onChange={(v) => setPatch((p) => ({ ...p, masterPan: v / 100 }))}
        />
        {/* Правый угол первой строки — настройки и справка; частые
            действия уедут на вторую строку за переносом */}
        <span className="spacer" />
        <button
          className={showAi ? 'on hdr-icon' : 'hdr-icon'}
          data-ob="ai-btn"
          onClick={() => { setShowAi((v) => !v); if (showLib) setShowLib(false); }}
          title="Настройки: ключ ИИ-генерации"
          aria-label="настройки"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M6.1 1.5h2.8l.35 1.9c.5.16.96.4 1.37.72l1.8-.7 1.4 2.42-1.44 1.28c.04.28.04.56 0 .84l1.44 1.28-1.4 2.42-1.8-.7c-.41.31-.87.55-1.37.72l-.35 1.9H6.1l-.35-1.9a4.9 4.9 0 0 1-1.37-.72l-1.8.7-1.4-2.42 1.44-1.28a4.5 4.5 0 0 1 0-.84L1.18 6.34l1.4-2.42 1.8.7c.41-.32.87-.56 1.37-.72l.35-1.9Z"
              fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
            />
            <circle cx="7.5" cy="7.5" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        {/* «?» — меню интерактивных гидов + шпаргалка. Пока гиды ни разу
            не открывались — кнопка пульсирует, приглашая. */}
        <span className="menu">
          <button
            className={(showHelpMenu ? 'on ' : '') + (helpInvite ? 'help-btn pulse' : 'help-btn')}
            onClick={() => setShowHelpMenu((v) => !v)}
            title="Гиды по задачам и шпаргалка"
            data-ob="help"
          >
            ?
          </button>
          {showHelpMenu && (
            <HelpMenu
              onClose={() => {
                setShowHelpMenu(false);
                setHelpInvite(needsInvite());
              }}
              onCheatSheet={() => setShowHelp(true)}
            />
          )}
        </span>
        {/* Перенос строки: название пьесы и всё после него — вторым рядом.
            Правый верхний угол остаётся за частыми действиями. */}
        <span className="hdr-break" />
        <input
          className="title-input"
          data-ob="title"
          value={patch.title ?? ''}
          placeholder="название пьесы"
          title="Название пьесы: попадает в имена файлов экспорта (транслитом)"
          onChange={(e) =>
            setPatch((p) => ({ ...p, title: e.target.value.trim() ? e.target.value : undefined }))
          }
        />
        <span
          className="cycle-info"
          title="Длины циклов дорожек в этой сцене, в шагах. Разные длины = полиритмия: узоры сдвигаются друг относительно друга и не повторяются"
        >
          циклы: {patch.tracks.map((t) => patternInScene(t, currentScene)?.length ?? 0).join(' · ') || '—'}
        </span>
        <span className="spacer" />
        <span className="tb-sep" />
        <button
          className={showChain ? 'on' : ''}
          data-ob="chain-btn"
          onClick={() => setShowChain((v) => !v)}
          title="Цепочка: порядок сцен и их длины — арранжмент от начала до конца"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            {/* два звена цепочки */}
            <path d="M5.6 8.4 8.4 5.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M4.2 6.3 2.9 7.6a2.5 2.5 0 0 0 3.5 3.5l1.3-1.3M9.8 7.7l1.3-1.3a2.5 2.5 0 0 0-3.5-3.5L6.3 4.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          цепочка
        </button>
        <button
          className={showMix ? 'on' : ''}
          data-ob="mixer-btn"
          onClick={() => setShowMix((v) => !v)}
          title="Микшер-рэк: громкости дорожек и глобальные выключатели — не зависят от сцен и эскизов"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            {/* рэк: три вертикальных фейдера */}
            <path d="M3 1.5v11M7 1.5v11M11 1.5v11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <rect x="1.6" y="4" width="2.8" height="2.2" rx="0.8" fill="currentColor" />
            <rect x="5.6" y="8" width="2.8" height="2.2" rx="0.8" fill="currentColor" />
            <rect x="9.6" y="3" width="2.8" height="2.2" rx="0.8" fill="currentColor" />
          </svg>
          микшер
        </button>
        <span className="tb-sep" />
        <button
          className={showLib ? 'on' : ''}
          data-ob="library-btn"
          onClick={() => {
            if (showLib) setShowLib(false);
            else openLibraryAt(null);
          }}
          title="Библиотека звуков: инструменты и сэмплы — дерево, поиск, прослушивание. Клик по пресету меняет тембр выбранной дорожки"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            {/* волна в рамке */}
            <rect x="1.2" y="2.2" width="11.6" height="9.6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3 8.4c1-.2 1.4-3 2.2-3s.9 4 1.8 4 1.1-5 2-5 1 2.6 2 2.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          библиотека
        </button>
        <div className="menu">
          <button
            data-ob="file-menu"
            onClick={() => { setFileOpen((v) => !v); setExportOpen(false); }}
            title="Файлы: новый, открыть, записать, экспорт"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
              {/* лист с загнутым углом */}
              <path d="M3 1.5h5.2L11.5 5v7.5H3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M8 1.8V5.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            файл ▾
          </button>
          {fileOpen && (
            <div className="menu-list">
              <button
                onClick={() => { clearAll(); setFileOpen(false); }}
                title="Новый проект: пусто, одна сцена"
              >
                новый
              </button>
              <button
                onClick={() => {
                  setFileOpen(false);
                  if (isDesktop)
                    void pickProjectFile()
                      .then((f) => { if (f) importFile(f); })
                      .catch((e) => void alertDialog(`Открытие не удалось: ${errText(e)}`, 'импорт'));
                  else fileRef.current?.click();
                }}
                title="Открыть zip-проект или json патча"
              >
                открыть…
              </button>
              <button onClick={() => { resetPatch(); setFileOpen(false); }} title="Открыть демо: дефолтный полиритм">
                открыть демо
              </button>
              <button onClick={() => { renderWav(); setFileOpen(false); }} disabled={rendering} title="Записать аранжмент в wav">
                {rendering ? 'рендер…' : 'записать wav'}
              </button>
              <button
                className="has-sub"
                onClick={(e) => { e.stopPropagation(); setExportOpen((v) => !v); }}
                title="Экспорт пьесы"
              >
                экспорт ▾
              </button>
              {exportOpen && (
                <div className="menu-sub">
                  <button onClick={() => { exportPatch(); setFileOpen(false); }} title="Только патч JSON, без сэмплов — лёгкий обмен">
                    патч (json)
                  </button>
                  <button onClick={() => { void exportZip(); setFileOpen(false); }} title="Патч + все сэмплы одним zip — переезд на другую машину или в десктоп">
                    проект (zip)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="tb-sep" />
        <button
          className="undo-btn"
          disabled={undoStack.current.length === 0}
          onClick={undo}
          title="Отменить (Ctrl+Z)"
        >↶</button>
        <button
          className="undo-btn"
          disabled={redoStack.current.length === 0}
          onClick={redo}
          title="Вернуть (Ctrl+Shift+Z / Ctrl+Y)"
        >↷</button>
        <input
          ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </header>

      {showMix && (
        <div className="mix-panel" data-ob="mix-panel">
          <div className="mix-rack">
            <div className="mix-block master" data-ob="mix-master">
              <div className="mix-main">
                <span className="mix-name">мастер</span>
                <label className="mix-ctl" title="Фоновый шум: лента и воздух поверх всего. Розовый — мягче, белый — свежее шипение. После лимитера — компрессия его не качает. Играет, пока играет транспорт">
                  <span className="mc-cap">шум</span>
                  <select
                    value={patch.masterNoise ?? 'off'}
                    onChange={(e) =>
                      setPatch((pp) => ({ ...pp, masterNoise: e.target.value as Patch['masterNoise'] }))
                    }
                  >
                    <option value="off">—</option>
                    <option value="white">белый</option>
                    <option value="pink">розовый</option>
                  </select>
                </label>
                {(patch.masterNoise ?? 'off') !== 'off' && (
                  <SliderField
                    variant="mix"
                    label="уровень"
                    title="Уровень шума, %: 0.2–0.5 — дышащий воздух, 1–3 — лёгкая лента, дальше — винил и плёнка. Двойной клик по подписи — точное число"
                    value={Math.round((patch.masterNoiseLevel ?? 0.01) * 1000) / 10}
                    min={0} max={15} step={0.1}
                    display={`${(Math.round((patch.masterNoiseLevel ?? 0.01) * 1000) / 10).toFixed(1)}%`}
                    unit="%"
                    onChange={(v) => setPatch((pp) => ({ ...pp, masterNoiseLevel: v / 100 }))}
                  />
                )}
                <SliderField
                  variant="mix"
                  label="компрессия"
                  title="Мастер-компрессия: 0 — выключена; выше — плотнее и сочнее (порог ниже, ratio выше, громкость компенсируется). Двойной клик по подписи — точное число"
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
                  <SliderField
                    variant="mix"
                    label="громкость"
                    title="Громкость дорожки — та же ручка, что в карточке трека. Двойной клик по подписи — точное число"
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
                    label="пан"
                    title={`Панорама дорожки — ${panText(t.pan)}. Двойной клик — точное число (0 — лево, 50 — центр, 100 — право)`}
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
                    className={t.enabled === false ? '' : 'on'}
                    title="Глобальный выключатель дорожки: молчит во всех сценах, с любым эскизом. Не путать с мьютом партии"
                    onClick={() =>
                      setPatch((p) => ({
                        ...p,
                        tracks: p.tracks.map((x) =>
                          x.id === t.id ? { ...x, enabled: x.enabled === false ? undefined : false } : x,
                        ),
                      }))
                    }
                  >
                    {t.enabled === false ? 'вкл' : 'выкл'}
                  </button>
                </div>
                <LevelBar vertical read={() => getTrackLevel(t.id)} />
              </div>
            ))}
            {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
          </div>
          <HelpHint guide="mix" label="Гид: свести микс" />
        </div>
      )}

      {showAi && (
        <div className="ai-panel" data-ob="ai-panel">
          <label data-ob="ai-key" title="Ключ хранится только в этом браузере (localStorage). Взять: elevenlabs.io → Profile → API Keys. Сэмпл-трек → «сгенерировать по описанию»">
            ключ API к ElevenLabs
            <input
              type="password" className="ai-key-input"
              placeholder="sk_…"
              value={ai.apiKey}
              onChange={(e) => saveAi({ apiKey: e.target.value })}
            />
          </label>
          <HelpHint guide="ai" label="Гид: включить ИИ-генерацию" />
        </div>
      )}
      <div className="scenes" data-ob="scenes">
        <span className="scenes-label">сцены</span>
        {patch.scenes.map((s) => (
          <button
            key={s.id}
            className={`scene-btn${s.id === sceneId ? ' on' : ''}${
              sceneDrop?.id === s.id ? ` drop-${sceneDrop.side}` : ''
            }`}
            title={
              (playing && engine.currentSceneId === s.id ? 'звучит сейчас · ' : '') +
              'Клик — играть эту сцену (квант к такту). Правый клик — удалить. Перетащи — поменять порядок'
            }
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
        <button className="scene-btn add" data-ob="scene-add" title="Новая сцена — снимок ансамбля с независимыми копиями эскизов (старые сцены не изменятся). Сразу станет активной" onClick={addScene}>+</button>
        <span className="spacer" />
        <span
          className="seg"
          data-ob="follow-chain"
          title="Режим игры: «сцена» — текущая держится, пока не выберешь другую; «цепочка» — сцены идут по порядку из панели «цепочка»"
        >
          <button className={!patch.followChain ? 'on' : ''} onClick={() => setFollowChain(false)}>
            сцена
          </button>
          <button className={patch.followChain ? 'on' : ''} onClick={() => setFollowChain(true)}>
            цепочка
          </button>
        </span>
        {currentScene && (
          <span className="scene-edit" data-ob="scene-edit" title="Переименуй или удали текущую сцену">
            <span className="mini-info">название сцены</span>
            <input
              className="scene-name-input"
              value={currentScene.name}
              onChange={(e) =>
                setPatch((p) => ({
                  ...p,
                  scenes: p.scenes.map((sc) =>
                    sc.id === currentScene.id ? { ...sc, name: e.target.value } : sc,
                  ),
                }))
              }
            />
            <button
              className="remove"
              title={patch.scenes.length <= 1 ? 'Единственную сцену удалить нельзя' : 'Удалить текущую сцену'}
              disabled={patch.scenes.length <= 1}
              onClick={() => removeScene(currentScene.id)}
            >
              удалить сцену
            </button>
          </span>
        )}
        <HelpHint guide="arrangement" label="Гид: собрать пьесу из сцен" />
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
                  className="chain-grip"
                  title="Перетащи — пункт встанет на новое место в цепочке"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  }}
                >
                  ⠿
                </span>
                <select
                  value={it.sceneId}
                  onChange={(e) => chainSetItem(i, { sceneId: e.target.value })}
                >
                  {patch.scenes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <label title="Сколько тактов звучит эта сцена">
                  тактов
                  <NumField
                    value={it.bars} min={1} max={256}
                    onChange={(bars) => chainSetItem(i, { bars: Math.round(bars) })}
                  />
                </label>
                <label title="Темп этого пункта (30–300). 0 — как в шапке патча">
                  bpm
                  <NumField
                    value={it.bpm ?? 0} min={0} max={300}
                    onChange={(bpm) => chainSetItem(i, { bpm: bpm >= 30 ? Math.round(bpm) : undefined })}
                  />
                </label>
                <button className="remove" title="Убрать из цепочки" onClick={() => chainRemove(i)}>×</button>
              </div>
            );
          })}
          <button onClick={chainAdd}>+</button>
          <HelpHint guide="arrangement" step={5} label="Гид: цепочка сцен" />
        </div>
      )}

      <main ref={mainRef} className="main-area">
        <svg className="sc-links" width="100%" height="100%" aria-hidden="true">
          {scLinks.map((l) => (
            <path key={l.key} d={l.d} className="sc-link" />
          ))}
        </svg>
        {/* Кнопка строго над треками: нажал — новый трек появился сразу под ней */}
        <button
          className="add-track"
          data-ob="add-track"
          onClick={addTrack}
          title="Новый трек: синус и 12 равных полутонов — библиотека звуков сразу предложит тембр на слух"
        >
          + трек
        </button>
        {patch.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            inst={instOf(patch, t)}
            onChangeInst={changeInst}
            pattern={patternInScene(t, currentScene)}
            bpm={patch.bpm}
            activeStep={activeOf(t)}
            collapsed={waveEditorActive ? waveEditorActive !== t.id : !!ui.collapsed[t.id]}
            onToggleCollapse={toggleCollapse}
            onChange={changeTrack}
            onTrackCommand={changeTrackCommand}
            onPatternChange={changePattern}
            onPatternCommand={changePatternCommand}
            onSelectPattern={selectPattern}
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
            onSolo={toggleSceneSolo}
            onScratchBegin={(pos) => engine.scratchBegin(t, pos)}
            onScratchMove={(pos) => engine.scratchMove(pos)}
            onScratchEnd={() => engine.scratchEnd()}
            onScratchPreview={() => engine.previewScratch(t)}
            onScratchPeaks={() => engine.getSamplePeaks(t.instrumentId && instOf(patch, t).sampleId)}
            patternSceneCounts={patternSceneCounts}
            allTracks={trackList}
            onGenerateSample={generateSample}
            onTransformSample={transformSample}
            genBusy={!!genBusy[t.id]}
            waveEditor={waveEditorActive === t.id}
            onToggleWaveEditor={toggleWaveEditor}
            onGetSampleBuffer={getSampleBuffer}
            onPreviewSampleRegion={previewSampleRegion}
            onPreviewNote={previewNote}
            onOpenBrowser={openLibraryAt}
          />
        ))}
        {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
      </main>

      {showHelp && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowHelp(false);
          }}
        >
          <div className="modal help-modal">
            <h3>шпаргалка</h3>
            <div className="help-cols">
              <div className="help-col">
                <h4>ноты и стан</h4>
                <ul>
                  <li>клик по клетке — нота · столбик — аккорд · правый клик — убрать</li>
                  <li>рамка с пустой клетки — выделение · Shift-клик — добавить к выделению</li>
                  <li>тянуть выделенное — перенос · колесо над нотой — громкость (Shift — вероятность, Alt — длина)</li>
                  <li>тянуть правый край ноты — длительность</li>
                  <li>клик по номеру шага — панель шага</li>
                </ul>
              </div>
              <div className="help-col">
                <h4>структура и правки</h4>
                <ul>
                  <li>правый клик по эскизу — форк: независимая копия</li>
                  <li>Ctrl+C / V — копипаст нот (и между треками) · Ctrl+D — дубль выделения</li>
                  <li>Delete — стереть выделенное · Esc — снять выделение</li>
                  <li>Ctrl+Z / Ctrl+Shift+Z — отменить / вернуть</li>
                </ul>
              </div>
            </div>
            <h3>словарь</h3>
            <ul className="help-dict">
              <li><span className="help-term">партия</span> — какой эскиз трека играет в этой сцене</li>
              <li><span className="help-term">эскиз</span> — вариация партии: свой рисунок нот, один на все сцены, где играет</li>
              <li><span className="help-term">сцена</span> — снимок ансамбля: по партии на каждый трек</li>
              <li><span className="help-term">цепочка</span> — порядок сцен и их длины: арранжмент от начала до конца</li>
              <li><span className="help-term">стан</span> — нотная сетка: колонки-шаги × строки-высоты</li>
              <li><span className="help-term">шкала</span> — набор высот стана: мировые строи, N-ET, свои дроби</li>
            </ul>
            <div className="modal-btns">
              <span className="spacer" />
              <button onClick={() => setShowHelp(false)}>закрыть</button>
            </div>
          </div>
        </div>
      )}

      <DialogHost />
      {obRun && (
        <Onboarding run={obRun} onDone={stopGuide} onStep={stepGuide} onOpenPanel={openGuidePanel} />
      )}
    </div>
    </div>
  );
}
