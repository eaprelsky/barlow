import { memo, useEffect, useRef, useState } from 'react';
import type { Step, Track, Waveform } from '../types';
import { WAVEFORM_LABELS, makeStep } from '../types';
import { SCALE_PRESETS, presetName } from '../music/scales';

const WAVEFORMS = Object.keys(WAVEFORM_LABELS) as Waveform[];

interface Props {
  track: Track;
  activeStep: number;
  onChange: (id: string, t: Track) => void;
  onEuclid: (id: string, pulses: number) => void;
  onMutate: (id: string) => void;
  onRemove: (id: string) => void;
}

function fmtRatio(r: number): string {
  return Math.abs(r - Math.round(r)) < 1e-6 ? String(Math.round(r)) : r.toFixed(2);
}

export const TrackRow = memo(function TrackRow({
  track,
  activeStep,
  onChange,
  onEuclid,
  onMutate,
  onRemove,
}: Props) {
  const [pulses, setPulses] = useState(3);
  const rollRef = useRef<HTMLDivElement>(null);

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeSteps = (steps: Step[]) => change({ steps });

  const setLength = (length: number) => {
    const clamped = Math.max(1, Math.min(64, Math.round(length) || 1));
    const steps = track.steps.slice(0, clamped);
    while (steps.length < clamped) steps.push(makeStep());
    change({ length: clamped, steps });
  };

  const setScaleByName = (name: string) => {
    const preset = SCALE_PRESETS.find((p) => p.name === name);
    if (!preset) return; // «своя» — не меняем
    const max = preset.ratios.length - 1;
    change({
      scale: preset.ratios,
      steps: track.steps.map((s) => ({ ...s, notes: s.notes.map((n) => Math.min(n, max)) })),
    });
  };

  // Клик по ячейке: добавить/убрать высоту в этом шаге. Несколько кликов
  // по разным строкам колонки — аккорд; когда высот не остаётся — пауза.
  const clickCell = (col: number, row: number) => {
    changeSteps(
      track.steps.map((s, j) => {
        if (j !== col) return s;
        const has = s.notes.includes(row);
        const notes = has ? s.notes.filter((n) => n !== row) : [...s.notes, row].sort((a, b) => a - b);
        return { ...s, notes };
      }),
    );
  };

  const clearCell = (col: number) => {
    changeSteps(track.steps.map((s, j) => (j === col ? { ...s, notes: [] } : s)));
  };

  // Колесо над нотой: громкость, shift+колесо — вероятность.
  // Нативный слушатель с passive:false — React-овый onWheel пассивный,
  // preventDefault в нём не работает и страница скроллится.
  const stateRef = useRef({ track, onChange });
  stateRef.current = { track, onChange };
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (!cell) return;
      const col = Number(cell.dataset.col);
      const { track: t, onChange: changeOne } = stateRef.current;
      const s = t.steps[col];
      if (!s || s.notes.length === 0) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      changeOne(t.id, {
        ...t,
        steps: t.steps.map((st, j) => {
          if (j !== col) return st;
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

  const cellSize = track.scale.length > 12 ? 13 : 18;

  return (
    <div className="track">
      <div className="track-head">
        <input
          className="track-name"
          value={track.name}
          onChange={(e) => change({ name: e.target.value })}
        />
        <div className="group">
          <label>
            волна
            <select value={track.waveform} onChange={(e) => change({ waveform: e.target.value as Waveform })}>
              {WAVEFORMS.map((w) => (
                <option key={w} value={w}>{WAVEFORM_LABELS[w]}</option>
              ))}
            </select>
          </label>
          <label>
            тоника, Гц
            <input
              type="number" min={20} max={9000} step={0.1} value={track.freq}
              onChange={(e) => change({ freq: Math.min(9000, Math.max(20, num(e.target.value, track.freq))) })}
            />
          </label>
          <label>
            шкала
            <select value={presetName(track.scale)} onChange={(e) => setScaleByName(e.target.value)}>
              {[presetName(track.scale), ...SCALE_PRESETS.map((p) => p.name)]
                .filter((n, i, arr) => arr.indexOf(n) === i)
                .map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
            </select>
          </label>
        </div>
        <div className="group">
          <label>
            длина, шагов
            <input
              type="number" min={1} max={64} value={track.length}
              onChange={(e) => setLength(num(e.target.value, track.length))}
            />
          </label>
          <label title="Шаг длится столько шестнадцатых. Дробные значения (например 1.5) дают дрейф относительно других треков">
            скорость, ×1/16
            <input
              type="number" min={0.25} max={32} step={0.25} value={track.rate}
              onChange={(e) => change({ rate: Math.max(0.25, num(e.target.value, track.rate)) })}
            />
          </label>
          <label title="Сдвиг цикла в шагах — тот же ритм, но стартует позже">
            фаза, шагов
            <input
              type="number" min={-64} max={64} value={track.phase}
              onChange={(e) =>
                change({ phase: Math.round(Math.max(-64, Math.min(64, num(e.target.value, track.phase)))) })
              }
            />
          </label>
        </div>
        <div className="group">
          <label title="Нижняя граница фильтра низких частот">
            фильтр, Гц
            <input
              type="number" min={60} max={12000} step={10} value={track.filterFreq}
              onChange={(e) =>
                change({ filterFreq: Math.min(12000, Math.max(60, num(e.target.value, track.filterFreq))) })
              }
            />
          </label>
          <label title="Время затухания ноты">
            спад, с
            <input
              type="number" min={0.01} max={4} step={0.01} value={track.decay}
              onChange={(e) => change({ decay: Math.max(0.01, num(e.target.value, track.decay)) })}
            />
          </label>
          <label>
            громкость
            <input
              type="number" min={0} max={1} step={0.05} value={track.volume}
              onChange={(e) => change({ volume: Math.min(1, Math.max(0, num(e.target.value, track.volume))) })}
            />
          </label>
        </div>
        <div className="group ops">
          <label title="Расставить ноты равномерно по циклу (евклидов ритм)">
            евклид, пульсов
            <span className="inline">
              <input
                type="number" min={0} max={track.length} value={pulses}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setPulses(Math.max(0, Math.min(track.length, Math.round(n))));
                }}
              />
              <button onClick={() => onEuclid(track.id, pulses)}>распределить</button>
            </span>
          </label>
          <button
            className="mut"
            title="Случайно подвинуть пару нот: вкл/выкл, высота, вероятность, громкость"
            onClick={() => onMutate(track.id)}
          >
            мутировать
          </button>
          <button className="remove" onClick={() => onRemove(track.id)}>удалить</button>
        </div>
      </div>

      <div className="roll" ref={rollRef} style={{ '--cell': `${cellSize}px` } as React.CSSProperties}>
        <div className="roll-scale" style={{ '--cell': `${cellSize}px` } as React.CSSProperties}>
          {track.scale
            .map((ratio, i) => ({ ratio, i }))
            .reverse()
            .map(({ ratio, i }) => (
              <div key={i} className="scale-cell" title={`${(track.freq * ratio).toFixed(1)} Гц`}>
                ×{fmtRatio(ratio)}
              </div>
            ))}
        </div>
        <div className="roll-grid">
          {track.steps.map((s, col) => (
            <div key={col} className="roll-col">
              {track.scale
                .map((ratio, i) => ({ ratio, i }))
                .reverse()
                .map(({ ratio, i }) => {
                  const on = s.notes.includes(i);
                  const chord = on && s.notes.length > 1;
                  return (
                    <button
                      key={i}
                      data-col={col}
                      className={[
                        'cell',
                        on ? 'on' : '',
                        ratio === 1 ? 'tonic-row' : '',
                        col === activeStep ? 'ph' : '',
                      ].join(' ')}
                      style={on ? { opacity: String(0.55 + 0.45 * s.vel) } : undefined}
                      title={
                        on
                          ? `${(track.freq * ratio).toFixed(1)} Гц (×${fmtRatio(ratio)})${chord ? ` · аккорд, ${s.notes.length} ноты` : ''} · громкость ${Math.round(s.vel * 100)}% · вероятность ${Math.round(s.prob * 100)}%\nклик по другой строке — добавить ноту (аккорд) · колесо — громкость · shift+колесо — вероятность · правый клик — стереть шаг`
                          : `${(track.freq * ratio).toFixed(1)} Гц (×${fmtRatio(ratio)}) — поставить ноту`
                      }
                      onClick={() => clickCell(col, i)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        clearCell(col);
                      }}
                    >
                      {on && s.prob < 1 && (
                        <span className="pbar" style={{ width: `${Math.round(s.prob * 100)}%` }} />
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
