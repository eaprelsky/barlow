import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, stepIndexAt } from './audio/engine';
import { euclid } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { mutatePattern } from './music/mutate';
import { INSTRUMENT_PRESETS } from './music/instrumentPresets';
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

const STORAGE_KEY = 'barlow.patch.v12';
const UI_KEY = 'barlow.ui.v1';
const WAV_BARS = 8;

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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPatch(parsed)) return normalizePatch(parsed);
    }
  } catch {
    /* повреждённый автосейв — начинаем с дефолта */
  }
  return defaultPatch();
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
  const [patch, setPatch] = useState<Patch>(loadPatch);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [ui, setUi] = useState(loadUiState);
  const [sceneId, setSceneId] = useState(() => patch.scenes[0]?.id ?? '');
  const [showChain, setShowChain] = useState(false);
  const [, setFrame] = useState(0); // перерисовка playhead раз в кадр
  const engineRef = useRef<AudioEngine | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const engine = (engineRef.current ??= new AudioEngine());

  // Движок всегда видит актуальный патч — редактирование без остановки.
  useEffect(() => {
    engine.setPatch(patch);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
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
    setPatch((p) => {
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
      setPatch((p) => {
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
    setPatch((p) => ({ ...p, chain: [...p.chain, { sceneId: p.scenes[0].id, bars: 8 }] }));
  }, []);

  const chainRemove = useCallback((idx: number) => {
    setPatch((p) => (p.chain.length <= 1 ? p : { ...p, chain: p.chain.filter((_, i) => i !== idx) }));
  }, []);

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

  const removeTrack = useCallback((id: string) => {
    setPatch((p) => {
      const tracks = p.tracks.filter((x) => x.id !== id);
      const scenes = p.scenes.map((s) => {
        const slots = { ...s.slots };
        delete slots[id];
        return { ...s, slots };
      });
      return { ...p, tracks, scenes };
    });
  }, []);

  const addTrack = useCallback((preset: (typeof INSTRUMENT_PRESETS)[number]) => {
    setPatch((p) => {
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
    setPatch((p) => {
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
      setPatch((p) => {
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
    setPatch((p) => {
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
      setPatch((p) => ({
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
      setPatch((p) => ({
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

  const toggleCollapse = useCallback((id: string) => {
    setUi((u) => {
      const next = { collapsed: { ...u.collapsed, [id]: !u.collapsed[id] } };
      localStorage.setItem(UI_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ---- Файлы ----

  const exportPatch = () => {
    const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'barlow-patch.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importPatch = (file: File) => {
    void file.text().then((text) => {
      try {
        const parsed: unknown = JSON.parse(text);
        if (isPatch(parsed)) {
          const norm = normalizePatch(parsed);
          setPatch(norm);
          setSceneId(norm.scenes[0].id);
        } else alert('Файл не похож на патч barlow');
      } catch {
        alert('Не удалось прочитать JSON');
      }
    });
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
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'barlow.wav';
      a.click();
      URL.revokeObjectURL(a.href);
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
        <button className={playing ? 'stop' : ''} onClick={togglePlay}>
          {playing ? 'стоп' : 'играть'}
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
        <span className="spacer" />
        <label title={INSTRUMENT_PRESETS[presetIdx]?.hint}>
          инструмент
          <select value={presetIdx} onChange={(e) => setPresetIdx(Number(e.target.value))}>
            {INSTRUMENT_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => addTrack(INSTRUMENT_PRESETS[presetIdx])}
          title={INSTRUMENT_PRESETS[presetIdx]?.hint}
        >
          добавить трек
        </button>
        <button onClick={renderWav} disabled={rendering} title="Оффлайн-рендер: цепочка целиком или 8 тактов текущей сцены">
          {rendering ? 'рендер…' : 'записать wav'}
        </button>
        <button onClick={exportPatch}>экспорт</button>
        <button onClick={() => fileRef.current?.click()}>импорт</button>
        <button onClick={resetPatch} title="Сбросить к дефолтному полиритму">сброс</button>
        <input
          ref={fileRef} type="file" accept=".json,application/json" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importPatch(f);
            e.target.value = '';
          }}
        />
      </header>

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
            activeStep={activeOf(t)}
            collapsed={!!ui.collapsed[t.id]}
            onToggleCollapse={toggleCollapse}
            onChange={changeTrack}
            onPatternChange={changePattern}
            onSelectPattern={selectPattern}
            onAddPattern={addPattern}
            onForkPattern={forkPattern}
            onRemovePattern={removePattern}
            onEuclid={applyEuclid}
            onMutate={mutate}
            onRemove={removeTrack}
          />
        ))}
        {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
      </main>

      <footer>
        <span>
          клик по клетке — нота · столбик нот — аккорд · номер шага — громкость
          и вероятность · правый клик по эскизу — форк · эскизы у каждой
          дорожки свои, буквы — имена в пределах дорожки
        </span>
        <span>независимые циклы: {patch.tracks.map((t) => patternInScene(t, currentScene)?.length ?? 0).join(' · ')}</span>
      </footer>
    </div>
  );
}
