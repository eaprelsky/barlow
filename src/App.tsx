import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AudioEngine, stepIndexAt } from './audio/engine';
import { euclid } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { mutatePattern } from './music/mutate';
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
import { NumField } from './components/NumField';
import { DialogHost } from './components/Dialog';
import { alertDialog, confirmDialog } from './components/dialogs';
import { PROVIDERS } from './ai/providers';
import { putSample } from './audio/library';
import { exportProject, importProject, looksLikeZip } from './audio/project';
import { loadAutosave, saveAutosave } from './storage';
import { isDesktop, pickProjectFile, saveBlob } from './platform';
import { Library } from './components/Library';

const UI_KEY = 'barlow.ui.v1';
const AI_KEY_STORE = 'barlow.ai.v1';
const WAV_BARS = 8;

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
  const [fileOpen, setFileOpen] = useState(false);
  const [genBusy, setGenBusy] = useState<Record<string, boolean>>({});
  const [, setFrame] = useState(0); // перерисовка playhead раз в кадр
  const engineRef = useRef<AudioEngine | null>(null);
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

  const applyEuclid = useCallback(
    (trackId: string, pulses: number) => {
      setPatchStep((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const scene = p.scenes.find((s) => s.id === sceneId);
          const pattern = patternInScene(t, scene);
          const mask = euclid(pattern.length, pulses);
          return {
            ...t,
            patterns: t.patterns.map((pt) =>
              pt.id === pattern.id
                ? {
                    ...pt,
                    steps: pattern.steps.map((s, i) => ({
                      ...s,
                      notes: mask[i] ? (s.notes.length ? s.notes : [makeNote(0)]) : [],
                    })),
                  }
                : pt,
            ),
          };
        }),
      }));
    },
    [sceneId],
  );

  const mutate = useCallback(
    (trackId: string) => {
      setPatchStep((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const scene = p.scenes.find((s) => s.id === sceneId);
          const pattern = patternInScene(t, scene);
          return {
            ...t,
            patterns: t.patterns.map((pt) =>
              pt.id === pattern.id ? mutatePattern(pt, scaleOf(t).length) : pt,
            ),
          };
        }),
      }));
    },
    [sceneId],
  );

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
    void saveBlob(new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }), 'barlow-patch.json')
      .catch((e) => void alertDialog(`Экспорт не удался: ${errText(e)}`, 'экспорт'));
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
      await saveBlob(blob, `barlow-${new Date().toISOString().slice(0, 10)}.zip`);
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
      await saveBlob(blob, 'barlow.wav');
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
        <label title="Темп в ударах в минуту. Изменение на ходу пока запрещено — смените на стопе">
          темп
          <NumField
            value={patch.bpm} min={30} max={300} disabled={playing}
            onChange={(bpm) => setPatch((p) => ({ ...p, bpm: Math.round(bpm) }))}
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
          className={showAi ? 'on' : ''}
          onClick={() => { setShowAi((v) => !v); if (showLib) setShowLib(false); }}
          title="Настройки: ключ ИИ-генерации"
        >
          настройки
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
          <span className="scenes-label">микшер — громкости и выключатели дорожек</span>
          <span className="spacer" />
          <button onClick={() => setShowMix(false)} title="Скрыть панель">скрыть</button>
          <div className="mix-rack">
            {patch.tracks.map((t) => (
              <div key={t.id} className={'mix-block' + (t.enabled === false ? ' off' : '')}>
                <span className="mix-name" title={t.name}>{t.name}</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={t.volume}
                  title="Громкость дорожки — та же ручка, что в карточке трека"
                  onChange={(e) =>
                    setPatch((p) => ({
                      ...p,
                      tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, volume: Number(e.target.value) } : x)),
                    }))
                  }
                />
                <span className="mini-info">{Math.round(t.volume * 100)}%</span>
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
            ))}
            {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
          </div>
        </div>
      )}

      {showAi && (
        <div className="ai-panel">
          <span className="scenes-label">настройки · ИИ-генерация</span>
          <label title="Ключ хранится только в этом браузере (localStorage). Barlow — локальный инструмент; при публикации ключи должны уйти за прокси">
            ключ {PROVIDERS.find((p) => p.id === ai.providerId)?.title}
            <input
              type="password" className="ai-key-input"
              placeholder="вставь API-ключ (elevenlabs.io → Profile → API Keys)"
              value={ai.apiKey}
              onChange={(e) => saveAi({ apiKey: e.target.value })}
            />
          </label>
          {ai.apiKey && <span className="ai-ok">ключ сохранён</span>}
          <span className="hint">сэмпл-трек → «сгенерировать по описанию»</span>
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
        <label title="Играть сцены по цепочке (арранжмент). Выключено — текущая сцена держится, пока не кликнешь другую">
          <input
            type="checkbox" checked={patch.followChain}
            onChange={(e) => setFollowChain(e.target.checked)}
          />
          по цепочке
        </label>
        <button className="more-btn" onClick={() => setShowChain((v) => !v)}>
          {showChain ? 'арранжмент ▴' : 'арранжмент ▾'}
        </button>
        {currentScene && (
          <span className="scene-edit" title="Переименуй или удали текущую сцену">
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
          <span className="scenes-label">цепочка (арранжмент)</span>
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
            onEuclid={applyEuclid}
            onMutate={mutate}
            onRemove={removeTrack}
            onDuplicate={duplicateTrack}
            onReorder={reorderTrack}
            soloActive={currentScene?.soloTrackId === t.id}
            onSolo={toggleSceneSolo}
            patternSceneCounts={patternSceneCounts}
            onGenerateSample={generateSample}
            genBusy={!!genBusy[t.id]}
          />
        ))}
        {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
      </main>

      <footer>
        <span>
          клик по клетке — нота · столбик нот — аккорд · номер шага — громкость
          и вероятность · рамка с пустой клетки — выделение нот · тянуть
          выделенную — перенос · Ctrl+C/V — копипаст (и между треками) ·
          Ctrl+D — дублировать выделение · Delete — стереть · правый клик
          по эскизу — форк
        </span>
      </footer>

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
