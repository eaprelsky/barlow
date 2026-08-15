import { useContext, useEffect, useRef } from 'react';
import type { Step, Track, Waveform } from '../types';
import { makeStep } from '../types';
import { MUL_CYCLE } from '../music/mutate';
import { PlayheadContext } from './PlayheadContext';

const WAVEFORMS: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth', 'noise'];

interface Props {
  track: Track;
  onChange: (t: Track) => void;
  onRemove: () => void;
}

export function TrackRow({ track, onChange, onRemove }: Props) {
  const playhead = useContext(PlayheadContext);
  const activeStep = playhead?.getStepIndex(track) ?? -1;

  const setSteps = (steps: Step[]) => onChange({ ...track, steps });
  const setLength = (length: number) => {
    const clamped = Math.max(1, Math.min(64, Math.round(length) || 1));
    const steps = track.steps.slice(0, clamped);
    while (steps.length < clamped) steps.push(makeStep());
    onChange({ ...track, length: clamped, steps });
  };

  const toggleStep = (i: number) => {
    setSteps(track.steps.map((s, j) => (j === i ? { ...s, on: !s.on } : s)));
  };

  const cycleMul = (i: number) => {
    setSteps(
      track.steps.map((s, j) => {
        if (j !== i) return s;
        const next = MUL_CYCLE[(MUL_CYCLE.indexOf(s.mul) + 1) % MUL_CYCLE.length];
        return { ...s, mul: next };
      }),
    );
  };

  // Колесо над шагом: громкость, shift+колесо — вероятность.
  // Нативный слушатель с passive:false — React-овый onWheel пассивный,
  // preventDefault в нём не работает и страница скроллится.
  const stepsRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ track, onChange });
  stateRef.current = { track, onChange };
  useEffect(() => {
    const el = stepsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.step');
      if (!btn) return;
      const i = Number(btn.dataset.i);
      const { track: t, onChange: change } = stateRef.current;
      const s = t.steps[i];
      if (!s || !s.on) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      change({
        ...t,
        steps: t.steps.map((st, j) => {
          if (j !== i) return st;
          return e.shiftKey
            ? { ...st, prob: Math.min(1, Math.max(0.1, st.prob + delta)) }
            : { ...st, vel: Math.min(1, Math.max(0.1, st.vel + delta)) };
        }),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="track">
      <div className="track-head">
        <input
          className="track-name"
          value={track.name}
          onChange={(e) => onChange({ ...track, name: e.target.value })}
        />
        <label>
          len
          <input
            type="number" min={1} max={64} value={track.length}
            onChange={(e) => setLength(num(e.target.value, track.length))}
          />
        </label>
        <label>
          rate
          <input
            type="number" min={0.25} max={32} step={0.25} value={track.rate}
            onChange={(e) =>
              onChange({ ...track, rate: Math.max(0.25, num(e.target.value, track.rate)) })
            }
          />
        </label>
        <label>
          ph
          <input
            type="number" min={-64} max={64} value={track.phase}
            title="Сдвиг цикла в шагах — на стопе или рестарте"
            onChange={(e) =>
              onChange({
                ...track,
                phase: Math.round(Math.max(-64, Math.min(64, num(e.target.value, track.phase)))),
              })
            }
          />
        </label>
        <label>
          wave
          <select
            value={track.waveform}
            onChange={(e) => onChange({ ...track, waveform: e.target.value as Waveform })}
          >
            {WAVEFORMS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </label>
        <label>
          hz
          <input
            type="number" min={20} max={9000} step={0.1} value={track.freq}
            onChange={(e) =>
              onChange({ ...track, freq: Math.min(9000, Math.max(20, num(e.target.value, track.freq))) })
            }
          />
        </label>
        <label>
          lp
          <input
            type="number" min={60} max={12000} step={10} value={track.filterFreq}
            onChange={(e) =>
              onChange({ ...track, filterFreq: Math.min(12000, Math.max(60, num(e.target.value, track.filterFreq))) })
            }
          />
        </label>
        <label>
          dec
          <input
            type="number" min={0.01} max={4} step={0.01} value={track.decay}
            onChange={(e) =>
              onChange({ ...track, decay: Math.max(0.01, num(e.target.value, track.decay)) })
            }
          />
        </label>
        <label>
          vol
          <input
            type="number" min={0} max={1} step={0.05} value={track.volume}
            onChange={(e) =>
              onChange({ ...track, volume: Math.min(1, Math.max(0, num(e.target.value, track.volume))) })
            }
          />
        </label>
        <button className="remove" onClick={onRemove} title="Удалить трек">×</button>
      </div>
      <div className="steps" ref={stepsRef}>
        {track.steps.map((s, i) => (
          <button
            key={i}
            data-i={i}
            className={[
              'step',
              s.on ? 'on' : '',
              i === activeStep ? 'ph' : '',
              s.mul !== 1 ? 'alt' : '',
            ].join(' ')}
            style={s.on ? { opacity: String(0.55 + 0.45 * s.vel) } : undefined}
            title={
              s.on
                ? `mul ${s.mul} × ${track.freq.toFixed(1)} Hz = ${(track.freq * s.mul).toFixed(1)} Hz\nПКМ — высота, колесо — громкость, shift+колесо — вероятность (${Math.round(s.prob * 100)}%)`
                : 'включить'
            }
            onClick={() => toggleStep(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              cycleMul(i);
            }}
          >
            {s.on && s.prob < 1 && (
              <span className="pbar" style={{ width: `${Math.round(s.prob * 100)}%` }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
