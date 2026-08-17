import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AudioEngine } from './audio/engine';
import { stepIndexAt } from './audio/timing';
import type { AudioBackend } from './audio/backend';
import { euclid, randomMask } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { mutatePattern, scatterHeights, spreadHeights, type MutateModes } from './music/mutate';
import { InstrumentBrowser } from './components/InstrumentBrowser';
import type { InstrumentPreset } from './music/instrumentPresets';
import {
  isPatch,
  makeNote,
  makePattern,
  makeTrack,
  normalizePatch,
  patternInScene,
  scaleOf,
  uid,
} from './types';
import type { Patch, Pattern, Track } from './types';
import { TrackRow } from './components/TrackRow';
import { LevelBar } from './components/LevelBar';
import { NumField } from './components/NumField';
import { DialogHost } from './components/Dialog';
import { alertDialog, confirmDialog } from './components/dialogs';
import { PROVIDERS } from './ai/providers';
import { putSample } from './audio/library';
import { exportProject, importProject, looksLikeZip } from './audio/project';
import { loadAutosave, saveAutosave } from './storage';
import { isDesktop, pickProjectFile, saveBlob } from './platform';
import { slugify } from './utils/slug';
import { Library } from './components/Library';

const UI_KEY = 'barlow.ui.v1';
const AI_KEY_STORE = 'barlow.ai.v1';
const WAV_BARS = 8;

/** Стем имён файлов экспорта: название пьесы (транслит) или 'barlow'. */
const exportStem = (patch: Patch): string =>
  patch.title ? slugify(patch.title) : 'barlow';

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
  const [showInstruments, setShowInstruments] = useState(false);
  const [ui, setUi] = useState(loadUiState);
  const [sceneId, setSceneId] = useState(() => patch.scenes[0]?.id ?? '');
  const [showChain, setShowChain] = useState(false);
  const [ai, setAi] = useState<AiSettings>(loadAiSettings);
  const [showAi, setShowAi] = useState(false);
  const [showLib, setShowLib] = useState(false);
  const [showMix, setShowMix] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // «?» — шпаргалка; Esc — закрыть. Проверки по e.key — символы,
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
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);
  const [fileOpen, setFileOpen] = useState(false);
  const [genBusy, setGenBusy] = useState<Record<string, boolean>>({});
  const [, setFrame] = useState(0); // перерисовка playhead раз в кадр
  const engineRef = useRef<AudioBackend | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const engine = (engineRef.current ??= new AudioEngine());

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
    () => patch.tracks.map((t) => ({ id: t.id, name: t.name })),
    [patch.tracks],
  );

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
    } else {
      void engine.ensureSamples(patch).then(() => {
        engine.play(patch, sceneId);
        setPlaying(true);
      });
    }
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

  const chainSetItem = useCallback((idx: number, item: Partial<{ sceneId: string; bars: number }>) => {
    setPatch((p) => ({
      ...p,
      chain: p.chain.map((it, i) => (i === idx ? { ...it, ...item } : it)),
    }));
  }, []);

  // ---- Треки и паттерны ----

  const changeTrack = useCallback((id: string, t: Track) => {
    setPatch((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === id ? t : x)) }));
  }, []);

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
      const copy: Track = {
        ...src,
        id: uid('t'),
        name: uniqueName(src.name, p.tracks.map((t) => t.name)),
        patterns,
      };
      const scenes = p.scenes.map((s) => {
        const old = s.slots[src.id];
        return { ...s, slots: { ...s.slots, [copy.id]: (old && idMap.get(old)) ?? patterns[0].id } };
      });
      return { ...p, tracks: [...p.tracks, copy], scenes };
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
        const tracks = p.tracks.filter((x) => x.id !== id);
        const scenes = p.scenes.map((s) => {
          const slots = { ...s.slots };
          delete slots[id];
          const soloTrackId = s.soloTrackId === id ? undefined : s.soloTrackId;
          return { ...s, slots, soloTrackId };
        });
        return { ...p, tracks, scenes };
      });
    });
  }, [patch.tracks, setPatch]);

  const addTrack = useCallback((preset: InstrumentPreset) => {
    setPatchStep((p) => {
      const track = makeTrack({
        id: uid('t'),
        ...preset.track,
        name: uniqueName(preset.track.name ?? 'трек', p.tracks.map((t) => t.name)),
      });
      // Новый трек добавляется во все сцены своим первым паттерном.
      const scenes = p.scenes.map((s) => ({ ...s, slots: { ...s.slots, [track.id]: track.patterns[0].id } }));
      return { ...p, tracks: [...p.tracks, track], scenes };
    });
  }, []);

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
      const pattern = makePattern(nextPatternName(track), track.patterns[0]?.length ?? 16);
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
        copy.volume = src.volume;
        copy.pan = src.pan;
        copy.mods = src.mods?.map((m) => ({ ...m }));
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
          tracks: p.tracks.map((t) =>
            t.id === trackId ? { ...t, sampleId: meta.id, sampleName: meta.name } : t,
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

  const toggleCollapse = useCallback((id: string) => {
    setUi((u) => {
      const next = { collapsed: { ...u.collapsed, [id]: !u.collapsed[id] } };
      localStorage.setItem(UI_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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
    return stepIndexAt(t, pattern, engine.now, clock.resetTime, patch.bpm);
  };

  return (
    <div className="app">
      <div className="topbar">
      <header>
        <span className="logo">barlow</span>
        <button
          className={playing ? 'play-btn stop' : 'play-btn'}
          onClick={togglePlay}
          title={playing ? 'Стоп (пробел тоже работает — в будущих версиях)' : 'Играть'}
        >
          {playing ? '■' : '▶'}
        </button>
        <label title="Темп, ударах в минуту. Меняется и на ходу: часы пере-якорятся, позиция не сбивается">
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
        <label
          className="master-vol"
          title="Общая громкость. Выше 100% — лимитер мягко пережимает пики: звук плотнее и жирнее, без треска"
        >
          общая громкость
          <input
            type="range" min={0} max={2} step={0.05} value={patch.masterVolume}
            onChange={(e) => setPatch((p) => ({ ...p, masterVolume: Number(e.target.value) }))}
          />
          {Math.round(patch.masterVolume * 100)}%
        </label>
        <label
          className="master-vol"
          title="Панорама всего микса: сдвигает стерео поле целиком. Панорамы треков и их модуляции остаются как есть — едут внутри поля"
        >
          пан
          <input
            type="range" min={0} max={1} step={0.05} value={patch.masterPan ?? 0.5}
            onChange={(e) => setPatch((pp) => ({ ...pp, masterPan: Number(e.target.value) }))}
          />
          {(patch.masterPan ?? 0.5) < 0.49
            ? `L${Math.round((0.5 - (patch.masterPan ?? 0.5)) * 200)}`
            : (patch.masterPan ?? 0.5) > 0.51
              ? `R${Math.round(((patch.masterPan ?? 0.5) - 0.5) * 200)}`
              : 'центр'}
        </label>
        {/* Правый угол первой строки — настройки и справка; частые
            действия уедут на вторую строку за переносом */}
        <span className="spacer" />
        <button
          className={showAi ? 'on hdr-icon' : 'hdr-icon'}
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
        <button
          className={showHelp ? 'on help-btn' : 'help-btn'}
          onClick={() => setShowHelp(true)}
          title="Шпаргалка жестов и словарь терминов"
        >
          ?
        </button>
        {/* Перенос строки: название пьесы и всё после него — вторым рядом.
            Правый верхний угол остаётся за частыми действиями. */}
        <span className="hdr-break" />
        <input
          className="title-input"
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
        <button
          onClick={() => setShowInstruments(true)}
          title="Браузер инструментов: выбрать тембр и добавить дорожку"
        >
          + трек
        </button>
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
        <div className="menu">
          <button onClick={() => setFileOpen((v) => !v)} title="Файлы: запись, экспорт, импорт">файл ▾</button>
          {fileOpen && (
            <div className="menu-list">
              <button onClick={() => { renderWav(); setFileOpen(false); }} disabled={rendering}>
                {rendering ? 'рендер…' : 'записать wav'}
              </button>
              <button onClick={() => { exportPatch(); setFileOpen(false); }} title="Только патч JSON, без сэмплов — лёгкий обмен">экспорт патча (json)</button>
              <button onClick={() => { void exportZip(); setFileOpen(false); }} title="Патч + все сэмплы одним zip — переезд на другую машину или в десктоп">экспорт проекта (zip)</button>
              <button
                onClick={() => {
                  setFileOpen(false);
                  if (isDesktop)
                    void pickProjectFile()
                      .then((f) => { if (f) importFile(f); })
                      .catch((e) => void alertDialog(`Открытие не удалось: ${errText(e)}`, 'импорт'));
                  else fileRef.current?.click();
                }}
                title="Zip-проект или json патча"
              >
                импорт проекта…
              </button>
              <button onClick={() => { resetPatch(); setFileOpen(false); }} title="Сбросить к дефолтному полиритму">сброс к демо</button>
              <button
                onClick={() => { clearAll(); setFileOpen(false); }}
                title="Пустой проект: без треков, одна сцена"
              >
                очистить всё
              </button>
            </div>
          )}
        </div>
        <button
          className={showLib ? 'on' : ''}
          onClick={() => { setShowLib((v) => !v); if (showAi) setShowAi(false); }}
          title="Библиотека сэмплов: прослушать, скачать, удалить"
        >
          сэмплы
        </button>
        <button
          className={showMix ? 'on' : ''}
          onClick={() => setShowMix((v) => !v)}
          title="Микшер-рэк: громкости дорожек и глобальные выключатели — не зависят от сцен и эскизов"
        >
          микшер
        </button>
        <button
          className={showChain ? 'on' : ''}
          onClick={() => setShowChain((v) => !v)}
          title="Цепочка: порядок сцен и их длины — арранжмент от начала до конца"
        >
          цепочка
        </button>
        <input
          ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </header>

      <Library
        open={showLib}
        usedIds={new Set(patch.tracks.map((t) => t.sampleId).filter((v): v is string => !!v))}
        onClose={() => setShowLib(false)}
      />

      {showMix && (
        <div className="mix-panel">
          <div className="mix-rack">
            <div className="mix-block master">
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
                  <label className="mix-ctl" title="Уровень шума, %: 0.2–0.5 — дышащий воздух, 1–3 — лёгкая лента, дальше — винил и плёнка">
                    <span className="mc-cap">
                      уровень
                      <i>{(Math.round((patch.masterNoiseLevel ?? 0.01) * 1000) / 10).toFixed(1)}%</i>
                    </span>
                    <input
                      type="range" min={0} max={15} step={0.1}
                      value={Math.round((patch.masterNoiseLevel ?? 0.01) * 1000) / 10}
                      onChange={(e) => setPatch((pp) => ({ ...pp, masterNoiseLevel: Number(e.target.value) / 100 }))}
                    />
                  </label>
                )}
                <label className="mix-ctl" title="Мастер-компрессия: 0 — выключена; выше — плотнее и сочнее (порог ниже, ratio выше, громкость компенсируется)">
                  <span className="mc-cap">
                    компрессия
                    <i>{Math.round((patch.masterComp ?? 0) * 100)}%</i>
                  </span>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={Math.round((patch.masterComp ?? 0) * 100)}
                    onChange={(e) => setPatch((pp) => ({ ...pp, masterComp: Number(e.target.value) / 100 }))}
                  />
                </label>
              </div>
            </div>
            {patch.tracks.map((t) => (
              <div key={t.id} className={'mix-block' + (t.enabled === false ? ' off' : '')}>
                <div className="mix-main">
                  <span className="mix-name" title={t.name}>{t.name}</span>
                  <label className="mix-ctl" title="Громкость дорожки — та же ручка, что в карточке трека">
                    <span className="mc-cap">громкость<i>{Math.round(t.volume * 100)}%</i></span>
                    <input
                      type="range" min={0} max={1} step={0.05} value={t.volume}
                      onChange={(e) =>
                        setPatch((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, volume: Number(e.target.value) } : x)),
                        }))
                      }
                    />
                  </label>
                  <label
                    className="mix-ctl"
                    title={`Панорама дорожки — ${t.pan < 0.49 ? `L${Math.round((0.5 - t.pan) * 200)}` : t.pan > 0.51 ? `R${Math.round((t.pan - 0.5) * 200)}` : 'центр'}`}
                  >
                    <span className="mc-cap">
                      пан
                      <i>
                        {t.pan < 0.49 ? `L${Math.round((0.5 - t.pan) * 200)}` : t.pan > 0.51 ? `R${Math.round((t.pan - 0.5) * 200)}` : 'центр'}
                      </i>
                    </span>
                    <input
                      type="range" min={0} max={1} step={0.05} value={t.pan}
                      onChange={(e) =>
                        setPatch((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, pan: Number(e.target.value) } : x)),
                        }))
                      }
                    />
                  </label>
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
        </div>
      )}

      {showAi && (
        <div className="ai-panel">
          <label title="Ключ хранится только в этом браузере (localStorage). Взять: elevenlabs.io → Profile → API Keys. Сэмпл-трек → «сгенерировать по описанию»">
            ключ API к ElevenLabs
            <input
              type="password" className="ai-key-input"
              placeholder="sk_…"
              value={ai.apiKey}
              onChange={(e) => saveAi({ apiKey: e.target.value })}
            />
          </label>
        </div>
      )}
      <div className="scenes">
        <span className="scenes-label">сцены</span>
        {patch.scenes.map((s) => (
          <button
            key={s.id}
            className={s.id === sceneId ? 'scene-btn on' : 'scene-btn'}
            title={playing && engine.currentSceneId === s.id ? 'звучит сейчас' : 'Клик — играть эту сцену (квант к такту). Правый клик — удалить'}
            onClick={() => selectScene(s.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              removeScene(s.id);
            }}
          >
            {s.name}
            {playing && engine.currentSceneId === s.id ? ' ●' : ''}
          </button>
        ))}
        <button className="scene-btn add" title="Новая сцена — снимок ансамбля с независимыми копиями эскизов (старые сцены не изменятся). Сразу станет активной" onClick={addScene}>+</button>
        <span className="spacer" />
        <span
          className="seg"
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
          <span className="scene-edit" title="Переименуй или удали текущую сцену">
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
      </div>
      </div>

      {showChain && (
        <div className="chain-panel">
          {patch.chain.map((it, i) => {
            const isPlaying =
              playing && patch.followChain && engine.currentChainPos === i;
            return (
              <div key={i} className={isPlaying ? 'chain-item playing' : 'chain-item'}>
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
                <button className="remove" title="Убрать из цепочки" onClick={() => chainRemove(i)}>×</button>
              </div>
            );
          })}
          <button onClick={chainAdd}>+</button>
        </div>
      )}

      <main>
        {patch.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            pattern={patternInScene(t, currentScene)}
            bpm={patch.bpm}
            activeStep={activeOf(t)}
            collapsed={!!ui.collapsed[t.id]}
            onToggleCollapse={toggleCollapse}
            onChange={changeTrack}
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
            onScratchPeaks={() => engine.getSamplePeaks(t.sampleId)}
            patternSceneCounts={patternSceneCounts}
            allTracks={trackList}
            onGenerateSample={generateSample}
            genBusy={!!genBusy[t.id]}
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

      {showInstruments && (
        <InstrumentBrowser
          title="добавить дорожку"
          onPick={(preset: InstrumentPreset) => {
            addTrack(preset);
            setShowInstruments(false);
          }}
          onClose={() => setShowInstruments(false)}
        />
      )}

      <DialogHost />
    </div>
  );
}
