import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, stepIndexAt } from './audio/engine';
import { euclid } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { mutateTrack } from './music/mutate';
import { INSTRUMENT_PRESETS } from './music/instrumentPresets';
import { isPatch, makeTrack, normalizePatch } from './types';
import type { Patch, Track } from './types';
import { TrackRow } from './components/TrackRow';
import { NumField } from './components/NumField';

const STORAGE_KEY = 'barlow.patch.v5';
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

function uniqueName(base: string, tracks: Track[]): string {
  const used = new Set(tracks.map((t) => t.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(candidate)) return candidate;
  }
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

export default function App() {
  const [patch, setPatch] = useState<Patch>(loadPatch);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [ui, setUi] = useState(loadUiState);
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
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    } else {
      engine.play(patch);
      setPlaying(true);
    }
  }, [engine, patch]);

  // Стабильные колбэки: TrackRow мемоизирован, пересобирается только
  // когда меняются его данные или активная колонка.
  const changeTrack = useCallback((id: string, t: Track) => {
    setPatch((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === id ? t : x)) }));
  }, []);

  const removeTrack = useCallback((id: string) => {
    setPatch((p) => ({ ...p, tracks: p.tracks.filter((x) => x.id !== id) }));
  }, []);

  const addTrack = useCallback((preset: (typeof INSTRUMENT_PRESETS)[number]) => {
    setPatch((p) => ({
      ...p,
      tracks: [
        ...p.tracks,
        makeTrack({
          id: `t${Date.now().toString(36)}`,
          ...preset.track,
          name: uniqueName(preset.track.name ?? 'трек', p.tracks),
        }),
      ],
    }));
  }, []);

  const applyEuclid = useCallback((id: string, pulses: number) => {
    setPatch((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== id) return t;
        const mask = euclid(t.length, pulses);
        return {
          ...t,
          steps: t.steps.map((s, i) => ({
            ...s,
            notes: mask[i] ? (s.notes.length > 0 ? s.notes : [0]) : [],
          })),
        };
      }),
    }));
  }, []);

  const mutate = useCallback((id: string) => {
    setPatch((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? mutateTrack(t) : t)),
    }));
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setUi((u) => {
      const next = { collapsed: { ...u.collapsed, [id]: !u.collapsed[id] } };
      localStorage.setItem(UI_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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
        if (isPatch(parsed)) setPatch(normalizePatch(parsed));
        else alert('Файл не похож на патч barlow');
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
    setPatch(defaultPatch());
  };

  const renderWav = async () => {
    if (rendering) return;
    setRendering(true);
    try {
      const blob = await engine.renderToWav(patch, WAV_BARS);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `barlow-${WAV_BARS}bars.wav`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setRendering(false);
    }
  };

  // Та же формула, что в движке — playhead и звук не расходятся.
  const activeOf = (t: Track) =>
    playing && engine.playing ? stepIndexAt(t, engine.now, engine.startTime, patch.bpm) : -1;

  return (
    <div className="app">
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
            onChange={(e) =>
              setPatch((p) => ({ ...p, masterVolume: Number(e.target.value) }))
            }
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
        <button onClick={renderWav} disabled={rendering} title={`Оффлайн-рендер ${WAV_BARS} тактов в WAV`}>
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

      <main>
        {patch.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            activeStep={activeOf(t)}
            collapsed={!!ui.collapsed[t.id]}
            onToggleCollapse={toggleCollapse}
            onChange={changeTrack}
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
          и вероятность · белая полоска на ноте — вероятность · правый клик —
          стереть шаг
        </span>
        <span>независимые циклы: {patch.tracks.map((t) => t.length).join(' · ')}</span>
      </footer>
    </div>
  );
}
