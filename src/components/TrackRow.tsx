import { useContext } from 'react';
import type { Step, Track, Waveform } from '../types';
import { makeStep } from '../types';
import { PlayheadContext } from './PlayheadContext';

const MUL_CYCLE = [1, 2, 1.5, 0.5, 3, 0.75];
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
    const steps = track.steps.map((s, j) => (j === i ? { ...s, on: !s.on } : s));
    setSteps(steps);
  };

  const cycleMul = (i: number) => {
    const steps = track.steps.map((s, j) => {
      if (j !== i) return s;
      const next = MUL_CYCLE[(MUL_CYCLE.indexOf(s.mul) + 1) % MUL_CYCLE.length];
      return { ...s, mul: next };
    });
    setSteps(steps);
  };

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
      <div className="steps">
        {track.steps.map((s, i) => (
          <button
            key={i}
            className={[
              'step',
              s.on ? 'on' : '',
              i === activeStep ? 'ph' : '',
              s.mul !== 1 ? 'alt' : '',
            ].join(' ')}
            style={s.on ? { opacity: String(0.55 + 0.45 * s.vel) } : undefined}
            title={
              s.on
                ? `mul ${s.mul} × ${track.freq.toFixed(1)} Hz = ${(track.freq * s.mul).toFixed(1)} Hz\nПКМ — сменить высоту, колёсико — громкость`
                : 'включить'
            }
            onClick={() => toggleStep(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              cycleMul(i);
            }}
            onWheel={(e) => {
              if (!s.on) return;
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.1 : -0.1;
              const steps = track.steps.map((st, j) =>
                j === i ? { ...st, vel: Math.min(1, Math.max(0.1, st.vel + delta)) } : st,
              );
              setSteps(steps);
            }}
          />
        ))}
      </div>
    </div>
  );
}
