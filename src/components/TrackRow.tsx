import { memo, useEffect, useRef, useState } from 'react';
import type { Effect, Mod, Pattern, Step, Track, Waveform } from '../types';
import {
  EFFECT_LABELS,
  MOD_TARGET_LABELS,
  WAVEFORM_LABELS,
  makeNote,
  makeStep,
  scaleOf,
} from '../types';
import { SCALE_PRESETS, presetName } from '../music/scales';
import { NumField } from './NumField';
import { EnvGraph, PitchGraph } from './EnvGraph';
import { putSample } from '../audio/library';
import { tickDuration } from '../audio/engine';

const WAVEFORMS = Object.keys(WAVEFORM_LABELS) as Waveform[];
const LFO_SHAPES: Mod['shape'][] = ['sine', 'triangle', 'square', 'sawtooth'];

// Длительность шага в 1/16: осмысленные значения, «точёные» дают
// полиметрический дрейф (1/8. = 1.5 шестнадцатых).
const RATE_OPTIONS: { v: number; label: string }[] = [
  { v: 1, label: '1/16' },
  { v: 1.5, label: '1/8 точ.' },
  { v: 2, label: '1/8' },
  { v: 3, label: '1/4 точ.' },
  { v: 4, label: '1/4' },
  { v: 6, label: '1/2 точ.' },
  { v: 8, label: '1/2' },
  { v: 16, label: 'такт' },
];

function panLabel(pan: number): string {
  if (pan < 0.49) return `L${Math.round((0.5 - pan) * 200)}`;
  if (pan > 0.51) return `R${Math.round((pan - 0.5) * 200)}`;
  return 'центр';
}

function fmtRatio(r: number): string {
  return Math.abs(r - Math.round(r)) < 1e-6 ? String(Math.round(r)) : r.toFixed(2);
}

/** Заняты ли ноты в верхней/нижней добавленной октаве (удалять нельзя). */
function octaveBusy(track: Track, dir: 'up' | 'down'): boolean {
  const base = track.scale.length;
  const rows = scaleOf(track).length;
  const from = dir === 'up' ? rows - base : 0;
  const to = dir === 'up' ? rows : base;
  return track.patterns.some((pt) =>
    pt.steps.some((s) => s.notes.some((nt) => nt.n >= from && nt.n < to)),
  );
}

interface Props {
  track: Track;
  pattern: Pattern;
  bpm: number;
  activeStep: number;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onChange: (id: string, t: Track) => void;
  onPatternChange: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
  onSelectPattern: (trackId: string, patternId: string) => void;
  onAddPattern: (trackId: string) => void;
  onForkPattern: (trackId: string, patternId: string) => void;
  onRemovePattern: (trackId: string, patternId: string) => void;
  onEuclid: (id: string, pulses: number) => void;
  onMutate: (id: string) => void;
  onRemove: (id: string) => void;
  onGenerateSample: (trackId: string, prompt: string, seconds: number) => void;
  genBusy: boolean;
}

export const TrackRow = memo(function TrackRow({
  track,
  pattern,
  bpm,
  activeStep,
  collapsed,
  onToggleCollapse,
  onChange,
  onPatternChange,
  onSelectPattern,
  onAddPattern,
  onForkPattern,
  onRemovePattern,
  onEuclid,
  onMutate,
  onRemove,
  onGenerateSample,
  genBusy,
}: Props) {
  const [pulses, setPulses] = useState(3);
  const [prompt, setPrompt] = useState('');
  const [genSeconds, setGenSeconds] = useState(3);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [showRoll, setShowRoll] = useState(true);
  const [tab, setTab] = useState<'snd' | 'env' | 'timbre' | 'fx' | 'mods'>('snd');
  const rollRef = useRef<HTMLDivElement>(null);
  const sampleFileRef = useRef<HTMLInputElement>(null);

  const rows = scaleOf(track).map((ratio, i) => ({ ratio, i })).reverse();
  const baseLen = track.scale.length;

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeSteps = (steps: Step[]) => onPatternChange(track.id, pattern.id, { steps });

  const loadSampleFile = (f: File) => {
    void putSample(f, f.name)
      .then((meta) => change({ sampleId: meta.id, sampleName: meta.name }))
      .catch(() => alert('Не удалось сохранить сэмпл в библиотеку'));
  };

  const setLength = (length: number) => {
    const clamped = Math.max(1, Math.min(64, Math.round(length) || 1));
    const steps = pattern.steps.slice(0, clamped);
    while (steps.length < clamped) steps.push(makeStep());
    setSelectedCol((c) => (c !== null && c >= clamped ? null : c));
    onPatternChange(track.id, pattern.id, { length: clamped, steps });
  };

  /** Клампит ноты во всех эскизах под новую длину стана. */
  const clampAllNotes = (max: number) =>
    track.patterns.map((pt) => ({
      ...pt,
      steps: pt.steps.map((s) => ({
        ...s,
        notes: s.notes
          .map((nt) => ({ ...nt, n: Math.min(nt.n, max) }))
          .filter((nt, i, arr) => arr.findIndex((x) => x.n === nt.n) === i),
      })),
    }));

  const setScaleByName = (name: string) => {
    const preset = SCALE_PRESETS.find((p) => p.name === name);
    if (!preset) return; // «своя» — не меняем
    change({
      scale: preset.ratios,
      scaleOctUp: 0,
      scaleOctDown: 0,
      patterns: clampAllNotes(preset.ratios.length - 1),
    });
  };

  const addOctave = (dir: 'up' | 'down') => {
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    const now = (track[key] ?? 0) + 1;
    if (now > 4) return;
    change({ [key]: now } as Partial<Track>);
  };

  const removeOctave = (dir: 'up' | 'down') => {
    if (octaveBusy(track, dir)) return;
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    const now = (track[key] ?? 0) - 1;
    if (now < 0) return;
    const base = baseLen;
    const patterns = track.patterns.map((pt) => ({
      ...pt,
      steps: pt.steps.map((s) => ({
        ...s,
        notes: s.notes
          .map((nt) => ({ ...nt, n: nt.n - base }))
          .filter((nt) => nt.n >= 0),
      })),
    }));
    change({ [key]: now, patterns } as Partial<Track>);
  };

  // Клик по ячейке: добавить/убрать ноту на этой высоте. Несколько нот в
  // колонке — аккорд; когда нот не остаётся — пауза.
  const clickCell = (col: number, row: number) => {
    changeSteps(
      pattern.steps.map((s, j) => {
        if (j !== col) return s;
        const has = s.notes.some((nt) => nt.n === row);
        const notes = has ? s.notes.filter((nt) => nt.n !== row) : [...s.notes, makeNote(row)];
        return { ...s, notes };
      }),
    );
  };

  const removeNoteAt = (col: number, row: number) => {
    changeSteps(
      pattern.steps.map((s, j) =>
        j === col ? { ...s, notes: s.notes.filter((nt) => nt.n !== row) } : s,
      ),
    );
  };

  const setNoteField = (col: number, row: number, field: 'vel' | 'prob', v: number) => {
    changeSteps(
      pattern.steps.map((s, j) =>
        j === col
          ? { ...s, notes: s.notes.map((nt) => (nt.n === row ? { ...nt, [field]: v } : nt)) }
          : s,
      ),
    );
  };

  const clearCell = (col: number) => {
    changeSteps(pattern.steps.map((s, j) => (j === col ? { ...s, notes: [] } : s)));
  };

  // Колесо над нотой — шорткат громкости/вероятности (как в панели шага).
  // Нативный слушатель с passive:false — React-овый onWheel пассивный.
  const stateRef = useRef({ track, pattern, onPatternChange });
  stateRef.current = { track, pattern, onPatternChange };
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (!cell) return;
      const col = Number(cell.dataset.col);
      const row = Number(cell.dataset.row);
      const { pattern: pt, onPatternChange: changeOne } = stateRef.current;
      const s = pt.steps[col];
      const nt = s?.notes.find((x) => x.n === row);
      if (!nt) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      changeOne(stateRef.current.track.id, pt.id, {
        steps: pt.steps.map((st, j) =>
          j !== col
            ? st
            : {
                ...st,
                notes: st.notes.map((x) =>
                  x.n !== row
                    ? x
                    : e.shiftKey
                      ? { ...x, prob: Math.min(1, Math.max(0, x.prob + delta)) }
                      : { ...x, vel: Math.min(1, Math.max(0.05, x.vel + delta)) },
                ),
              },
        ),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Модуляции живут на эскизе: первая правка переносит наследованный
  // с трека список в этот эскиз (правки дальше — только здесь).
  const changePatternMods = (mods: Mod[]) => onPatternChange(track.id, pattern.id, { mods });

  const updateMod = (i: number, upd: Partial<Mod>) => {
    const base = pattern.mods ?? track.mods;
    changePatternMods(base.map((m, j) => (j === i ? { ...m, ...upd } : m)));
  };

  const addMod = () => {
    const base = pattern.mods ?? track.mods;
    changePatternMods([...base, { target: 'pan', shape: 'sine', rate: 0.2, depth: 0.5 }]);
  };

  const removeMod = (i: number) =>
    changePatternMods((pattern.mods ?? track.mods).filter((_, j) => j !== i));

  // Эффекты — на треке: фильтр → эффекты → панорама.
  const effects = track.effects ?? [];
  const updateDelay = (i: number, upd: Partial<Extract<Effect, { type: 'delay' }>>) =>
    change({ effects: effects.map((e, j) => (j === i && e.type === 'delay' ? { ...e, ...upd } : e)) });
  const updateReverb = (i: number, upd: Partial<Extract<Effect, { type: 'reverb' }>>) =>
    change({ effects: effects.map((e, j) => (j === i && e.type === 'reverb' ? { ...e, ...upd } : e)) });
  const setEffectType = (i: number, type: Effect['type']) =>
    change({
      effects: effects.map((e, j) => {
        if (j !== i) return e;
        const mix = e.mix;
        return type === 'delay'
          ? { type: 'delay', timeSec: 0.28, feedback: 0.35, mix }
          : { type: 'reverb', sizeSec: 1.8, mix };
      }),
    });
  const removeEffect = (i: number) => change({ effects: effects.filter((_, j) => j !== i) });
  const addEffect = () =>
    change({ effects: [...effects, { type: 'delay', timeSec: 0.28, feedback: 0.35, mix: 0.3 }] });

  const modTargets: string[] = ['pan', 'volume', 'filterFreq'];
  if (effects.length > 0) modTargets.push('fxMix');
  if (effects.some((e) => e.type === 'delay')) modTargets.push('fxTime', 'fxFeedback');

  const patternChips = (
    <div className="pattern-chips">
      {track.patterns.map((pt) => (
        <button
          key={pt.id}
          className={pt.id === pattern.id ? 'chip on' : 'chip'}
          title={
            pt.forkedFrom
              ? 'вариация (форк). Клик — играть в этой сцене, правый клик — новая вариация от этого'
              : 'эскиз дорожки — общий для всех сцен, где играет. Клик — играть, правый клик — независимая копия (форк)'
          }
          onClick={() => onSelectPattern(track.id, pt.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            onForkPattern(track.id, pt.id);
          }}
        >
          {pt.name}
        </button>
      ))}
      <button className="chip add" title="Новый пустой эскиз" onClick={() => onAddPattern(track.id)}>
        +
      </button>
    </div>
  );

  if (collapsed) {
    return (
      <div className="track collapsed">
        <button className="track-del" title="Удалить трек" onClick={() => onRemove(track.id)}>
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <path d="M1 3h10M4 3V1h4v2M2.5 3l1 10h5l1-10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <div className="collapsed-row">
          <button className="fold" title="Развернуть трек" onClick={() => onToggleCollapse(track.id)}>▸</button>
          <span className={activeStep >= 0 ? 'live-dot on' : 'live-dot'}>●</span>
          <input className="track-name" value={track.name} onChange={(e) => change({ name: e.target.value })} />
          <span className="mini-wave">{WAVEFORM_LABELS[track.waveform]}</span>
          {patternChips}
          <input
            className="mini-vol"
            type="range" min={0} max={1} step={0.05} value={track.volume}
            title={`громкость ${Math.round(track.volume * 100)}%`}
            onChange={(e) => change({ volume: Number(e.target.value) })}
          />
          <span className="mini-info">{pattern.length} шагов</span>
        </div>
      </div>
    );
  }

  const selectedStep = selectedCol !== null ? (pattern.steps[selectedCol] ?? null) : null;
  const up = track.scaleOctUp ?? 0;
  const down = track.scaleOctDown ?? 0;
  const scaleRows = scaleOf(track);

  return (
    <div className="track">
      <button className="track-del" title="Удалить трек" onClick={() => onRemove(track.id)}>
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M1 3h10M4 3V1h4v2M2.5 3l1 10h5l1-10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      <div className="track-head">
        <button className="fold" title="Свернуть трек" onClick={() => onToggleCollapse(track.id)}>▾</button>
        <input className="track-name" value={track.name} onChange={(e) => change({ name: e.target.value })} />
        <div className="group">
          <label title="Эскизы дорожки: какой играет — решает сцена. Правый клик по эскизу — вариация (форк)">
            эскизы
            {patternChips}
          </label>
        </div>
        <div className="group">
          <label title="Сколько шагов в цикле эскиза. Разные длины у треков = полиритмия: узоры сдвигаются друг относительно друга и никогда не повторяются">
            длина, шагов
            <NumField value={pattern.length} min={1} max={64} onChange={(length) => setLength(length)} />
          </label>
          <label title="Длительность шага. «Точёные» (1/8 точ.) — шаги плывут относительно других треков: полиметрия">
            шаг
            <select
              value={RATE_OPTIONS.some((o) => o.v === track.rate) ? String(track.rate) : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom') change({ rate: Number(e.target.value) });
              }}
            >
              {RATE_OPTIONS.map((o) => (
                <option key={o.v} value={String(o.v)}>{o.label}</option>
              ))}
              {!RATE_OPTIONS.some((o) => o.v === track.rate) && (
                <option value="custom">своя ×{track.rate}</option>
              )}
            </select>
          </label>
          <label title="Громкость трека — общая для всех эскизов. Свою на эскиз можно задать во вкладке «тембр»">
            громкость
            <NumField value={track.volume} min={0} max={1} step={0.05} onChange={(volume) => change({ volume })} />
          </label>
          <label title="Евклидов ритм: ноты раскладываются максимально равномерно по циклу. Например, 3 ноты по 8 шагов — знаменитый тресильо">
            раскидать нот
            <span className="inline">
              <NumField
                value={pulses} min={0} max={pattern.length}
                onChange={(n) => setPulses(Math.round(n))}
              />
              <button onClick={() => onEuclid(track.id, pulses)} title="Расставить ноты равномерно по циклу">равномерно</button>
            </span>
          </label>
          <button
            className="mut"
            title="Случайно подвинуть пару нот активного эскиза: вкл/выкл, высоты, вероятность, громкость"
            onClick={() => onMutate(track.id)}
          >
            мутировать
          </button>
        </div>
        <div className="group ops">
          <button
            className={showRoll ? 'on' : ''}
            onClick={() => setShowRoll((v) => !v)}
            title={showRoll ? 'Скрыть нотный стан (ноты продолжат играть)' : 'Показать нотный стан'}
          >
            {showRoll ? 'ноты ▴' : 'ноты ▾'}
          </button>
          <button className="more-btn" onClick={() => setMore((m) => !m)}>
            {more ? 'меньше ▴' : 'ещё ▾'}
          </button>
        </div>
      </div>

      {more && (
        <div className="track-head more-row">
          <div className="tabs">
            {(
              [
                ['snd', 'звук'],
                ['env', 'огибающая'],
                ['timbre', 'тембр'],
                ['fx', 'эффекты'],
                ['mods', 'модуляции'],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? 'tab on' : 'tab'}
                onClick={() => setTab(id)}
              >
                {title}
              </button>
            ))}
          </div>
          {tab === 'snd' && (
          <div className="group">
            <label title="Форма волны осциллятора — основа тембра">
              волна
              <select value={track.waveform} onChange={(e) => change({ waveform: e.target.value as Waveform })}>
                {WAVEFORMS.map((w) => (
                  <option key={w} value={w}>{WAVEFORM_LABELS[w]}</option>
                ))}
              </select>
            </label>
            {track.waveform === 'sample' ? (
              <>
                <label title="Сэмпл из библиотеки. Строки нотного стана = скорость воспроизведения (×1 — как есть)">
                  сэмпл
                  <span className="inline">
                    <span className="sample-name" title={track.sampleName ?? 'сэмпл не выбран'}>
                      {track.sampleName ?? 'не выбран'}
                    </span>
                    <button onClick={() => sampleFileRef.current?.click()}>загрузить</button>
                    <input
                      ref={sampleFileRef} type="file" accept="audio/*" hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) loadSampleFile(f);
                        e.target.value = '';
                      }}
                    />
                  </span>
                </label>
                <label title="Шкала = набор скоростей воспроизведения сэмпла (питч). Октавы добавляются кнопками у стана">
                  шкала питча
                  <select value={presetName(track.scale)} onChange={(e) => setScaleByName(e.target.value)}>
                    {[presetName(track.scale), ...SCALE_PRESETS.map((p) => p.name)]
                      .filter((n, i, arr) => arr.indexOf(n) === i)
                      .map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label title="Базовая частота шкалы. Бас — 30–90 Гц, обычные ноты — 100–500, верхушки — выше">
                  тоника, Гц
                  <NumField value={track.freq} min={20} max={9000} step={0.1} onChange={(freq) => change({ freq })} />
                </label>
                <label title="Набор высот нотного стана. Любые отношения частот: пентатоники, чистые интервалы (just intonation), четвертитоны. Октавы добавляются кнопками у стана">
                  шкала
                  <select value={presetName(track.scale)} onChange={(e) => setScaleByName(e.target.value)}>
                    {[presetName(track.scale), ...SCALE_PRESETS.map((p) => p.name)]
                      .filter((n, i, arr) => arr.indexOf(n) === i)
                      .map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                  </select>
                </label>
              </>
            )}
          </div>
          )}
          {tab === 'env' && (
          <div className="group env-tab">
            <div className="env-block">
              <EnvGraph attack={track.attack} decay={track.decay} gridSec={tickDuration(bpm)} />
              <span className="env-info">
                нота ≈ {(Math.max(track.attack, 0.0005) + track.decay).toFixed(2)} с ·{' '}
                {((Math.max(track.attack, 0.0005) + track.decay) / tickDuration(bpm)).toFixed(1)} шестнадцатых
              </span>
            </div>
            <div className="env-block">
              <PitchGraph
                pitchDrop={track.pitchDrop}
                pitchTime={track.pitchTime}
                total={Math.max(track.attack, 0.0005) + track.decay}
              />
            </div>
            <div className="env-fields">
              <label title="За сколько миллисекунд нота достигает полной громкости. Быстрые — удар, медленные — мягкие">
                атака, мс
                <NumField
                  value={Math.round(Math.max(track.attack, 0.0005) * 1000)} min={0} max={500} step={1}
                  onChange={(ms) => change({ attack: Math.max(0.0005, ms / 1000) })}
                />
              </label>
              <label
                title={
                  track.waveform === 'sample'
                    ? 'Сколько секунд звучит нота — сэмпл длиннее обрезается. Для длинных сэмплов ставь больше'
                    : 'Сколько секунд звучит нота после удара'
                }
              >
                спад, с
                <NumField value={track.decay} min={0.01} max={4} step={0.01} onChange={(decay) => change({ decay })} />
              </label>
              <label title="Нота стартует во столько раз выше тоники и слетает вниз за время падения — так делается бочка («вумп»). 1 — выключено. Не работает на шуме">
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
            </div>
          </div>
          )}
          {tab === 'timbre' && (
          <>
          <div className="group">
            <label title="Сдвиг цикла в шагах: тот же рисунок, но стартует на N шагов позже">
              фаза, шагов
              <NumField
                value={track.phase} min={-64} max={64}
                onChange={(phase) => change({ phase: Math.round(phase) })}
              />
            </label>
            <label title="Обрезка низа (highpass): убирает гул и рокот ниже этой частоты. У басов аккуратно (не выше 30–40), у хэтов смело поднимай">
              низ, Гц
              <NumField
                value={track.filterLow} min={20} max={4000} step={10}
                onChange={(filterLow) => change({ filterLow })}
              />
            </label>
            <label title="Обрезка верха (lowpass): всё выше частоты приглушается. Меньше — глуше и мягче, больше — ярче и звонче. У баса 200–500, у хэтов 6000+">
              верх, Гц
              <NumField
                value={track.filterFreq} min={60} max={12000} step={10}
                onChange={(filterFreq) => change({ filterFreq })}
              />
            </label>
          </div>
          <div className="group">
            <label title="Эскиз = партия: свои ручки, пока он играет (в этой и других сценах, где он звучит)">
              громкость эскиза
              <NumField
                value={pattern.volume ?? track.volume} min={0} max={1} step={0.05}
                onChange={(volume) => onPatternChange(track.id, pattern.id, { volume })}
              />
            </label>
            <label title="Панорама этого эскиза: слева — центр — справа. Синус-LFO 0.2 Гц на панораме ниже — пинг-понг">
              панорама эскиза
              <span className="inline">
                <input
                  type="range" min={0} max={1} step={0.05} value={pattern.pan ?? track.pan}
                  onChange={(e) => onPatternChange(track.id, pattern.id, { pan: Number(e.target.value) })}
                />
                <span className="pan-label">{panLabel(pattern.pan ?? track.pan)}</span>
              </span>
            </label>
          </div>
          </>
          )}
          {tab === 'fx' && (
          <div className="group mods-group">
            {effects.map((fx, i) => (
              <div className="mod-row" key={i}>
                <select value={fx.type} title="Тип эффекта: фильтр → эффекты → панорама" onChange={(e) => setEffectType(i, e.target.value as Effect['type'])}>
                  {(Object.keys(EFFECT_LABELS) as Effect['type'][]).map((t) => (
                    <option key={t} value={t}>{EFFECT_LABELS[t]}</option>
                  ))}
                </select>
                {fx.type === 'delay' ? (
                  <>
                    <span className="mr" title="Через сколько миллисекунд повтор (при темпе 118: восьмая ≈ 254 мс)">
                      <NumField
                        value={Math.round(fx.timeSec * 1000)} min={10} max={2000} step={10}
                        onChange={(ms) => updateDelay(i, { timeSec: ms / 1000 })}
                      />
                      <i>мс</i>
                    </span>
                    <span className="mr" title="Затухание повторов: 0% — один повтор, 80% — длинное эхо">
                      <input
                        type="range" min={0} max={0.9} step={0.05} value={fx.feedback}
                        onChange={(e) => updateDelay(i, { feedback: Number(e.target.value) })}
                      />
                      <i>{Math.round(fx.feedback * 100)}%</i>
                    </span>
                  </>
                ) : (
                  <span className="mr" title="Размер пространства: 0.5 — комната, 2 — зал, 5 — собор">
                    <NumField
                      value={fx.sizeSec} min={0.2} max={8} step={0.1}
                      onChange={(sizeSec) => updateReverb(i, { sizeSec })}
                    />
                    <i>с</i>
                  </span>
                )}
                <span className="mr" title="Сколько эффекта подмешать к чистому звуку">
                  <input
                    type="range" min={0} max={1} step={0.05} value={fx.mix}
                    onChange={(e) => {
                      const mix = Number(e.target.value);
                      if (fx.type === 'delay') updateDelay(i, { mix });
                      else updateReverb(i, { mix });
                    }}
                  />
                  <i>{Math.round(fx.mix * 100)}%</i>
                </span>
                <button className="remove" title="Убрать эффект" onClick={() => removeEffect(i)}>×</button>
              </div>
            ))}
            <button onClick={addEffect} title="Добавить эффект">+ эффект</button>
          </div>
          )}
          {tab === 'mods' && (
          <div className="group mods-group">
            {(pattern.mods ?? track.mods).map((m, i) => (
              <div className="mod-row" key={i}>
                <select
                  value={m.target}
                  title="Какой параметр качает LFO. Цели эффектов — на первый эффект в списке"
                  onChange={(e) => updateMod(i, { target: e.target.value as string })}
                >
                  {modTargets.map((t) => (
                    <option key={t} value={t}>
                      {MOD_TARGET_LABELS[t as keyof typeof MOD_TARGET_LABELS] ?? t}
                    </option>
                  ))}
                </select>
                <select
                  value={m.shape}
                  title="Форма колебания"
                  onChange={(e) => updateMod(i, { shape: e.target.value as Mod['shape'] })}
                >
                  {LFO_SHAPES.map((sh) => (
                    <option key={sh} value={sh}>{WAVEFORM_LABELS[sh]}</option>
                  ))}
                </select>
                <span className="mr" title="Скорость колебаний: 0.2 Гц — период 5 секунд; 4–8 Гц — вибрато">
                  <NumField
                    value={m.rate} min={0.01} max={40} step={0.05}
                    onChange={(rate) => updateMod(i, { rate })}
                  />
                  <i>Гц</i>
                </span>
                <span className="mr" title="Глубина: насколько сильно LFO отклоняет параметр">
                  <input
                    type="range" min={0} max={1} step={0.05} value={m.depth}
                    onChange={(e) => updateMod(i, { depth: Number(e.target.value) })}
                  />
                  <i>{Math.round(m.depth * 100)}%</i>
                </span>
                <button className="remove" title="Убрать модуляцию" onClick={() => removeMod(i)}>×</button>
              </div>
            ))}
            <button onClick={addMod} title="Добавить LFO">+ модуляция</button>
            {track.patterns.length > 1 && (
              <button
                className="remove"
                title="Удалить этот эскиз (сцены, где он играл, перейдут на первый оставшийся)"
                onClick={() => onRemovePattern(track.id, pattern.id)}
              >
                удалить эскиз «{pattern.name}»
              </button>
            )}
          </div>
          )}
        </div>
      )}

      {track.waveform === 'sample' && (
        <div className="gen-bar">
          <label
            className="gen-label"
            title="Опиши звук словами — ИИ сгенерирует сэмпл прямо в слот. Например: «глубокий басовый удар с глиной», «хрустящее стеклянное тиканье», «шорох виниловой пыли»"
          >
            описание
            <input
              className="gen-prompt"
              placeholder="например: глубокий басовый удар с глиной, хрустящее стеклянное тиканье, шорох виниловой пыли…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && prompt.trim()) onGenerateSample(track.id, prompt.trim(), genSeconds);
              }}
            />
          </label>
          <label title="Длительность сэмпла в секундах">
            сек
            <NumField
              value={genSeconds} min={0.5} max={20} step={0.5}
              onChange={(v) => setGenSeconds(v)}
            />
          </label>
          <button
            disabled={genBusy || !prompt.trim()}
            title="Сгенерировать и положить в слот (Enter в поле тоже работает)"
            onClick={() => onGenerateSample(track.id, prompt.trim(), genSeconds)}
          >
            {genBusy ? 'генерирую…' : 'сгенерировать'}
          </button>
          {track.sampleName && genBusy === false && (
            <span className="mini-info" title="Сейчас в слоте">в слоте: {track.sampleName}</span>
          )}
        </div>
      )}

      {showRoll && (
      <div className="roll" ref={rollRef}>
        <div className="roll-side">
          <div className="col-num-spacer oct-row">
            <button className="oct-btn" title="Добавить октаву вверх" onClick={() => addOctave('up')}>+окт</button>
            <button
              className="oct-btn"
              title={octaveBusy(track, 'up') ? 'В верхней октаве есть ноты — сначала убери их' : 'Убрать верхнюю октаву'}
              disabled={up === 0 || octaveBusy(track, 'up')}
              onClick={() => removeOctave('up')}
            >−</button>
          </div>
          {rows.map(({ ratio }) => (
            <div key={ratio} className="scale-cell" title={`отношение ${fmtRatio(ratio)} к тонике`}>
              ×{fmtRatio(ratio)}
            </div>
          ))}
          <div className="col-num-spacer oct-row">
            <button className="oct-btn" title="Добавить октаву вниз" onClick={() => addOctave('down')}>+окт</button>
            <button
              className="oct-btn"
              title={octaveBusy(track, 'down') ? 'В нижней октаве есть ноты — сначала убери их' : 'Убрать нижнюю октаву'}
              disabled={down === 0 || octaveBusy(track, 'down')}
              onClick={() => removeOctave('down')}
            >−</button>
          </div>
        </div>
        <div className="roll-cols">
          {pattern.steps.map((s, col) => (
            <div key={col} className={'col-wrap' + (col === selectedCol ? ' sel' : '')}>
              <button
                className={'col-num' + (col === selectedCol ? ' sel' : '')}
                title="Настройки нот шага: громкость и вероятность каждой"
                onClick={() => setSelectedCol(col === selectedCol ? null : col)}
              >
                {col + 1}
              </button>
              <div className="roll-col">
                {rows.map(({ ratio, i }) => {
                  const nt = s.notes.find((x) => x.n === i);
                  const on = !!nt;
                  const chord = on && s.notes.length > 1;
                  return (
                    <button
                      key={i}
                      data-col={col}
                      data-row={i}
                      className={[
                        'cell',
                        on ? 'on' : '',
                        ratio === 1 ? 'tonic-row' : '',
                        col === activeStep ? 'ph' : '',
                      ].join(' ')}
                      style={on ? { opacity: String(0.55 + 0.45 * nt!.vel) } : undefined}
                      title={
                        on
                          ? `${(track.freq * ratio).toFixed(1)} Гц${chord ? ` · аккорд из ${s.notes.length} нот` : ''} · громкость ${Math.round(nt!.vel * 100)}% · вероятность ${Math.round(nt!.prob * 100)}%\nклик по другой строке — добавить ноту (аккорд) · правый клик — убрать ноту`
                          : `${(track.freq * ratio).toFixed(1)} Гц — поставить ноту`
                      }
                      onClick={() => clickCell(col, i)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (on) removeNoteAt(col, i);
                        else clearCell(col);
                      }}
                    >
                      {on && nt!.prob < 1 && (
                        <span className="pbar" style={{ width: `${Math.round(nt!.prob * 100)}%` }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {selectedStep && selectedCol !== null && (
        <div className="step-panel">
          <span className="sp-label">шаг {selectedCol + 1}</span>
          {selectedStep.notes.length === 0 && (
            <span className="none">пусто — поставь ноты кликом по стану</span>
          )}
          {selectedStep.notes.map((nt) => (
            <div className="note-panel" key={nt.n}>
              <span className="np-label" title="Высота ноты">
                ×{fmtRatio(scaleRows[nt.n] ?? 1)}
              </span>
              <label className="sp-field">
                громкость
                <input
                  type="range" min={0.05} max={1} step={0.05} value={nt.vel}
                  onChange={(e) => setNoteField(selectedCol, nt.n, 'vel', Number(e.target.value))}
                />
                {Math.round(nt.vel * 100)}%
              </label>
              <label
                className="sp-field"
                title="Шанс, что нота прозвучит при каждом проходе цикла — у каждой ноты свой"
              >
                вероятность
                <input
                  type="range" min={0} max={1} step={0.05} value={nt.prob}
                  onChange={(e) => setNoteField(selectedCol, nt.n, 'prob', Number(e.target.value))}
                />
                {Math.round(nt.prob * 100)}%
              </label>
              <button className="remove" title="Убрать эту ноту" onClick={() => removeNoteAt(selectedCol, nt.n)}>
                ×
              </button>
            </div>
          ))}
          {selectedStep.notes.length > 0 && (
            <button onClick={() => clearCell(selectedCol)}>стереть шаг</button>
          )}
        </div>
      )}
    </div>
  );
});
