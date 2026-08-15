import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, stepIndexAt } from './audio/engine';
import { euclid } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { isPatch, makeTrack } from './types';
import type { Patch, Track } from './types';
import { TrackRow } from './components/TrackRow';
import { PlayheadContext } from './components/PlayheadContext';

const STORAGE_KEY = 'barlow.patch.v1';

function loadPatch(): Patch {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPatch(parsed)) return parsed;
    }
  } catch {
    /* повреждённый автосейв — начинаем с дефолта */
  }
  return defaultPatch();
}

export default function App() {
  const [patch, setPatch] = useState<Patch>(loadPatch);
  const [playing, setPlaying] = useState(false);
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

  // Пересчёт каждый рендер (rAF) по часам AudioContext — та же формула, что в движке.
  const playhead = playing
    ? {
        getStepIndex: (track: Track) =>
          engine.playing ? stepIndexAt(track, engine.now, engine.startTime, patch.bpm) : -1,
      }
    : null;

  const togglePlay = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    } else {
      engine.play(patch);
      setPlaying(true);
    }
  }, [engine, patch]);

  const changeTrack = (id: string, t: Track) =>
    setPatch((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === id ? t : x)) }));

  const removeTrack = (id: string) =>
    setPatch((p) => ({ ...p, tracks: p.tracks.filter((x) => x.id !== id) }));

  const addTrack = () =>
    setPatch((p) => ({
      ...p,
      tracks: [
        ...p.tracks,
        makeTrack({
          id: `t${Date.now().toString(36)}`,
          name: `trk ${p.tracks.length + 1}`,
          length: 11,
          rate: 2,
          waveform: 'square',
          freq: 220,
        }),
      ],
    }));

  const applyEuclid = (id: string, pulses: number) =>
    setPatch((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== id) return t;
        const mask = euclid(t.length, pulses);
        return { ...t, steps: t.steps.map((s, i) => ({ ...s, on: mask[i] })) };
      }),
    }));

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
        if (isPatch(parsed)) setPatch(parsed);
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

  return (
    <PlayheadContext.Provider value={playhead}>
      <div className="app">
        <header>
          <span className="logo">barlow</span>
          <button className={playing ? 'stop' : ''} onClick={togglePlay}>
            {playing ? '■ stop' : '▶ play'}
          </button>
          <label>
            bpm
            <input
              type="number" min={30} max={300} value={patch.bpm}
              disabled={playing}
              title="Изменение BPM на ходу пока запрещено — смените на стопе"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setPatch((p) => ({ ...p, bpm: Math.min(300, Math.max(30, n)) }));
              }}
            />
          </label>
          <span className="hint">ЛКМ — вкл/выкл · ПКМ — высота · колесо — громкость шага</span>
          <span className="spacer" />
          <button onClick={addTrack}>+ трек</button>
          <button onClick={exportPatch}>export</button>
          <button onClick={() => fileRef.current?.click()}>import</button>
          <button onClick={resetPatch} title="Сбросить к дефолтному полиритму">reset</button>
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
            <div className="track-wrap" key={t.id}>
              <TrackRow track={t} onChange={(nt) => changeTrack(t.id, nt)} onRemove={() => removeTrack(t.id)} />
              <EuclidRow length={t.length} onApply={(pulses) => applyEuclid(t.id, pulses)} />
            </div>
          ))}
          {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
        </main>

        <footer>
          полиритмия: независимые циклы — {patch.tracks.map((t) => t.length).join(' · ')}
        </footer>
      </div>
    </PlayheadContext.Provider>
  );
}

function EuclidRow({ length, onApply }: { length: number; onApply: (pulses: number) => void }) {
  const [pulses, setPulses] = useState(3);
  return (
    <div className="euclid">
      <label>
        euclid p
        <input
          type="number" min={0} max={length} value={pulses}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setPulses(Math.max(0, Math.min(length, Math.round(n))));
          }}
        />
      </label>
      <button onClick={() => onApply(pulses)}>spread</button>
    </div>
  );
}
