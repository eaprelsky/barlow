import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, stepIndexAt } from './audio/engine';
import { euclid } from './music/euclid';
import { defaultPatch } from './music/defaultPatch';
import { mutateTrack } from './music/mutate';
import { isPatch, makeTrack, normalizePatch } from './types';
import type { Patch, Track } from './types';
import { TrackRow } from './components/TrackRow';

const STORAGE_KEY = 'barlow.patch.v4';
const WAV_BARS = 8;

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

  const addTrack = useCallback(() => {
    setPatch((p) => ({
      ...p,
      tracks: [
        ...p.tracks,
        makeTrack({
          id: `t${Date.now().toString(36)}`,
          name: `трек ${p.tracks.length + 1}`,
          length: 11,
          rate: 2,
          waveform: 'square',
          freq: 220,
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
        <label title="Изменение темпа на ходу пока запрещено — смените на стопе">
          темп
          <input
            type="number" min={30} max={300} value={patch.bpm}
            disabled={playing}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setPatch((p) => ({ ...p, bpm: Math.min(300, Math.max(30, n)) }));
            }}
          />
        </label>
        <span className="spacer" />
        <button onClick={addTrack}>добавить трек</button>
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
            onChange={changeTrack}
            onEuclid={applyEuclid}
            onMutate={mutate}
            onRemove={removeTrack}
          />
        ))}
        {patch.tracks.length === 0 && <p className="empty">Треков нет — добавь первый.</p>}
      </main>

      <footer>
        <span>клик — нота · колесо — громкость · shift+колесо — вероятность · правый клик — стереть</span>
        <span>независимые циклы: {patch.tracks.map((t) => t.length).join(' · ')}</span>
      </footer>
    </div>
  );
}
