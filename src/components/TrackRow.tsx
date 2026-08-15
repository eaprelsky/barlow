import { memo, useEffect, useRef, useState } from 'react';
import type { Step, Track, Waveform } from '../types';
import { WAVEFORM_LABELS, makeStep } from '../types';
import { SCALE_PRESETS, presetName } from '../music/scales';
import { NumField } from './NumField';

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
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const rollRef = useRef<HTMLDivElement>(null);

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeSteps = (steps: Step[]) => change({ steps });

  const setLength = (length: number) => {
    const clamped = Math.max(1, Math.min(64, Math.round(length) || 1));
    const steps = track.steps.slice(0, clamped);
    while (steps.length < clamped) steps.push(makeStep());
    setSelectedCol((c) => (c !== null && c >= clamped ? null : c));
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

  const setStepField = (col: number, field: 'vel' | 'prob', v: number) => {
    changeSteps(track.steps.map((s, j) => (j === col ? { ...s, [field]: v } : s)));
  };

  // Колесо над нотой — шорткат для ползунков панели шага.
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
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      changeOne(t.id, {
        ...t,
        steps: t.steps.map((st, j) => {
          if (j !== col) return st;
          return e.shiftKey
            ? { ...st, prob: Math.min(1, Math.max(0, st.prob + delta)) }
            : { ...st, vel: Math.min(1, Math.max(0.05, st.vel + delta)) };
        }),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const selectedStep = selectedCol !== null ? (track.steps[selectedCol] ?? null) : null;

  const rows = track.scale.map((ratio, i) => ({ ratio, i })).reverse();

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
          <label title="Базовая частота шкалы. Бас — 30–90 Гц, обычные ноты — 100–500, верхушки — выше">
            тоника, Гц
            <NumField value={track.freq} min={20} max={9000} step={0.1} onChange={(freq) => change({ freq })} />
          </label>
          <label title="Набор высот нотного стана. Любые отношения частот: пентатоники, чистые интервалы (just intonation), четвертитоны">
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
          <label title="Сколько шагов в цикле трека. Разные длины у треков = полиритмия: узоры сдвигаются друг относительно друга и никогда не повторяются">
            длина, шагов
            <NumField value={track.length} min={1} max={64} onChange={(length) => setLength(length)} />
          </label>
          <label title="Сколько шестнадцатых длится один шаг: 4 — как четверть, 2 — как восьмая, 1 — как 1/16. Дробное значение (например 1.5) — шаги плывут относительно других треков">
            длина шага, ×1/16
            <NumField value={track.rate} min={0.25} max={32} step={0.25} onChange={(rate) => change({ rate })} />
          </label>
          <label title="Сдвиг цикла в шагах: тот же рисунок, но стартует на N шагов позже">
            фаза, шагов
            <NumField
              value={track.phase} min={-64} max={64}
              onChange={(phase) => change({ phase: Math.round(phase) })}
            />
          </label>
        </div>
        <div className="group">
          <label title="Фильтр нижних частот: приглушает всё выше этой частоты. Меньше — глуше и мягче, больше — ярче и звонче. У баса держи низко (200–500), у хэтов высоко (6000+)">
            фильтр, Гц
            <NumField
              value={track.filterFreq} min={60} max={12000} step={10}
              onChange={(filterFreq) => change({ filterFreq })}
            />
          </label>
          <label title="Сколько секунд звучит нота после удара">
            спад, с
            <NumField value={track.decay} min={0.01} max={4} step={0.01} onChange={(decay) => change({ decay })} />
          </label>
          <label title="Нота стартует во столько раз выше тоники и слетает вниз за время падения — так делается бочка («вумп»). 1 — выключено. Работает только на тональных волнах, не на шуме">
            падение тона, ×
            <NumField
              value={track.pitchDrop} min={1} max={16} step={0.5}
              onChange={(pitchDrop) => change({ pitchDrop })}
            />
          </label>
          <label title="За сколько секунд тон падает от верха до тоники. Бочке обычно 0.05–0.12">
            время падения, с
            <NumField
              value={track.pitchTime} min={0} max={2} step={0.01}
              onChange={(pitchTime) => change({ pitchTime })}
            />
          </label>
          <label>
            громкость
            <NumField value={track.volume} min={0} max={1} step={0.05} onChange={(volume) => change({ volume })} />
          </label>
        </div>
        <div className="group ops">
          <label title="Евклидов ритм: ноты раскладываются максимально равномерно по циклу. Например, 3 ноты по 8 шагам — знаменитый тресильо (буквально как в десперадо)">
            раскидать нот
            <span className="inline">
              <NumField
                value={pulses} min={0} max={track.length}
                onChange={(n) => setPulses(Math.round(n))}
              />
              <button onClick={() => onEuclid(track.id, pulses)} title="Расставить ноты равномерно по циклу">равномерно</button>
            </span>
          </label>
          <button
            className="mut"
            title="Случайно подвинуть пару нот: вкл/выкл, высоты, вероятность, громкость. Слушай-мутируй-слушай"
            onClick={() => onMutate(track.id)}
          >
            мутировать
          </button>
          <button className="remove" onClick={() => onRemove(track.id)}>удалить</button>
        </div>
      </div>

      <div className="roll" ref={rollRef}>
        <div className="roll-side">
          <div className="col-num-spacer" />
          {rows.map(({ ratio }) => (
            <div key={ratio} className="scale-cell" title={`отношение ${fmtRatio(ratio)} к тонике`}>
              ×{fmtRatio(ratio)}
            </div>
          ))}
        </div>
        <div className="roll-cols">
          {track.steps.map((s, col) => (
            <div key={col} className={'col-wrap' + (col === selectedCol ? ' sel' : '')}>
              <button
                className={'col-num' + (col === selectedCol ? ' sel' : '')}
                title="Настройки шага: громкость и вероятность"
                onClick={() => setSelectedCol(col === selectedCol ? null : col)}
              >
                {col + 1}
              </button>
              <div className="roll-col">
                {rows.map(({ ratio, i }) => {
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
                          ? `${(track.freq * ratio).toFixed(1)} Гц${chord ? ` · аккорд из ${s.notes.length} нот` : ''}\nклик по другой строке — добавить ноту (аккорд) · правый клик — стереть шаг`
                          : `${(track.freq * ratio).toFixed(1)} Гц — поставить ноту`
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
            </div>
          ))}
        </div>
      </div>

      {selectedStep && selectedCol !== null && (
        <div className="step-panel">
          <span className="sp-label">шаг {selectedCol + 1}</span>
          <label className="sp-field">
            громкость
            <input
              type="range" min={0.05} max={1} step={0.05} value={selectedStep.vel}
              onChange={(e) => setStepField(selectedCol, 'vel', Number(e.target.value))}
            />
            {Math.round(selectedStep.vel * 100)}%
          </label>
          <label
            className="sp-field"
            title="Шанс, что нота прозвучит при каждом проходе цикла. Меньше 100% — ритм живой, никогда не повторяется точно"
          >
            вероятность
            <input
              type="range" min={0} max={1} step={0.05} value={selectedStep.prob}
              onChange={(e) => setStepField(selectedCol, 'prob', Number(e.target.value))}
            />
            {Math.round(selectedStep.prob * 100)}%
          </label>
          <button onClick={() => clearCell(selectedCol)}>стереть шаг</button>
        </div>
      )}
    </div>
  );
});
