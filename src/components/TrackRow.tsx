import { memo, useEffect, useRef, useState } from 'react';
import type { Effect, Mod, ModTarget, Pattern, Step, Track, Waveform } from '../types';
import { EFFECT_LABELS, MOD_TARGET_LABELS, WAVEFORM_LABELS, makeStep } from '../types';
import { SCALE_PRESETS, presetName } from '../music/scales';
import { NumField } from './NumField';
import { putSample } from '../audio/library';

const WAVEFORMS = Object.keys(WAVEFORM_LABELS) as Waveform[];
const LFO_SHAPES: Mod['shape'][] = ['sine', 'triangle', 'square', 'sawtooth'];

function panLabel(pan: number): string {
  if (pan < 0.49) return `L${Math.round((0.5 - pan) * 200)}`;
  if (pan > 0.51) return `R${Math.round((pan - 0.5) * 200)}`;
  return 'центр';
}

interface Props {
  track: Track;
  pattern: Pattern;
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
}

function fmtRatio(r: number): string {
  return Math.abs(r - Math.round(r)) < 1e-6 ? String(Math.round(r)) : r.toFixed(2);
}

export const TrackRow = memo(function TrackRow({
  track,
  pattern,
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
}: Props) {
  const [pulses, setPulses] = useState(3);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);
  const sampleFileRef = useRef<HTMLInputElement>(null);

  const loadSampleFile = (f: File) => {
    void putSample(f, f.name)
      .then((meta) => change({ sampleId: meta.id, sampleName: meta.name }))
      .catch(() => alert('Не удалось сохранить сэмпл в библиотеку'));
  };

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeSteps = (steps: Step[]) => onPatternChange(track.id, pattern.id, { steps });

  const setLength = (length: number) => {
    const clamped = Math.max(1, Math.min(64, Math.round(length) || 1));
    const steps = pattern.steps.slice(0, clamped);
    while (steps.length < clamped) steps.push(makeStep());
    setSelectedCol((c) => (c !== null && c >= clamped ? null : c));
    onPatternChange(track.id, pattern.id, { length: clamped, steps });
  };

  const setScaleByName = (name: string) => {
    const preset = SCALE_PRESETS.find((p) => p.name === name);
    if (!preset) return; // «своя» — не меняем
    const max = preset.ratios.length - 1;
    change({
      scale: preset.ratios,
      patterns: track.patterns.map((pt) => ({
        ...pt,
        steps: pt.steps.map((s) => ({ ...s, notes: s.notes.map((n) => Math.min(n, max)) })),
      })),
    });
  };

  // Клик по ячейке: добавить/убрать высоту в этом шаге. Несколько кликов
  // по разным строкам колонки — аккорд; когда высот не остаётся — пауза.
  const clickCell = (col: number, row: number) => {
    changeSteps(
      pattern.steps.map((s, j) => {
        if (j !== col) return s;
        const has = s.notes.includes(row);
        const notes = has ? s.notes.filter((n) => n !== row) : [...s.notes, row].sort((a, b) => a - b);
        return { ...s, notes };
      }),
    );
  };

  const clearCell = (col: number) => {
    changeSteps(pattern.steps.map((s, j) => (j === col ? { ...s, notes: [] } : s)));
  };

  const setStepField = (col: number, field: 'vel' | 'prob', v: number) => {
    changeSteps(pattern.steps.map((s, j) => (j === col ? { ...s, [field]: v } : s)));
  };

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

  // Модуляции живут на эскизе: первая правка переносит наследованный
  // с трека список в этот эскиз (правки дальше — только здесь).
  const changePatternMods = (mods: Mod[]) =>
    onPatternChange(track.id, pattern.id, { mods });

  // Эффекты — на треке, последовательность важна (фильтр → эффекты → панорама).
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

  // Колесо над нотой — шорткат для ползунков панели шага.
  // Нативный слушатель с passive:false — React-овый onWheel пассивный,
  // preventDefault в нём не работает и страница скроллится.
  const stateRef = useRef({ track, pattern, onPatternChange });
  stateRef.current = { track, pattern, onPatternChange };
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (!cell) return;
      const col = Number(cell.dataset.col);
      const { pattern: pt, onPatternChange: changeOne } = stateRef.current;
      const s = pt.steps[col];
      if (!s || s.notes.length === 0) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const steps = pt.steps.map((st, j) => {
        if (j !== col) return st;
        return e.shiftKey
          ? { ...st, prob: Math.min(1, Math.max(0, st.prob + delta)) }
          : { ...st, vel: Math.min(1, Math.max(0.05, st.vel + delta)) };
      });
      changeOne(stateRef.current.track.id, pt.id, { steps });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const patternChips = (
    <div className="pattern-chips">
      {track.patterns.map((pt) => (
        <button
          key={pt.id}
          className={pt.id === pattern.id ? 'chip on' : 'chip'}
          title={
            pt.forkedFrom
              ? 'вариация (форк другого эскиза). Клик — играть в этой сцене, правый клик — форк от этого'
              : 'эскиз дорожки — общий для всех сцен, где играет: правка меняет его везде. Клик — играть в этой сцене, правый клик — независимая копия (форк)'
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
      <button
        className="chip add"
        title="Новый пустой эскиз"
        onClick={() => onAddPattern(track.id)}
      >
        +
      </button>
    </div>
  );

  if (collapsed) {
    return (
      <div className="track collapsed">
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
          <button className="remove" title="Удалить трек" onClick={() => onRemove(track.id)}>×</button>
        </div>
      </div>
    );
  }

  const selectedStep = selectedCol !== null ? (pattern.steps[selectedCol] ?? null) : null;
  const rows = track.scale.map((ratio, i) => ({ ratio, i })).reverse();

  return (
    <div className="track">
      <div className="track-head">
        <button className="fold" title="Свернуть трек" onClick={() => onToggleCollapse(track.id)}>▾</button>
        <input
          className="track-name"
          value={track.name}
          onChange={(e) => change({ name: e.target.value })}
        />
        <div className="group">
          <label title="Эскизы дорожки: какой играет — решает сцена. Правый клик по эскизу — вариация (форк)">
            эскизы
            {patternChips}
          </label>
        </div>
        <div className="group">
          <label>
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
              <label title="Шкала = набор скоростей воспроизведения сэмпла (питч): пентатоника даст музыкальные ступени, «гармоники 1–8» — питч-стек">
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
            </>
          )}
        </div>
        <div className="group">
          <label title="Сколько шагов в цикле эскиза. Разные длины у треков = полиритмия: узоры сдвигаются друг относительно друга и никогда не повторяются">
            длина, шагов
            <NumField value={pattern.length} min={1} max={64} onChange={(length) => setLength(length)} />
          </label>
          <label title="Сколько шестнадцатых длится один шаг: 4 — как четверть, 2 — как восьмая, 1 — как 1/16. Дробное значение (например 1.5) — шаги плывут относительно других треков">
            длина шага, ×1/16
            <NumField value={track.rate} min={0.25} max={32} step={0.25} onChange={(rate) => change({ rate })} />
          </label>
        </div>
        <div className="group">
          <label title="Громкость трека — общая для всех эскизов. Свою на эскиз можно задать в «ещё…»">
            громкость
            <NumField value={track.volume} min={0} max={1} step={0.05} onChange={(volume) => change({ volume })} />
          </label>
        </div>
        <div className="group ops">
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
          <button className="remove" onClick={() => onRemove(track.id)}>удалить</button>
          <button className="more-btn" onClick={() => setMore((m) => !m)}>
            {more ? 'меньше ▴' : 'ещё ▾'}
          </button>
        </div>
      </div>

      {more && (
        <div className="track-head more-row">
          <div className="group">
            <label
              className="mono-label"
              title="Одна нота за раз: новая мягко глушит хвост предыдущей. Убирает фазовую интерференцию наложений — басам включать"
            >
              моно
              <input
                type="checkbox" checked={!!track.mono}
                onChange={(e) => change({ mono: e.target.checked })}
              />
            </label>
            <label title="Сдвиг цикла в шагах: тот же рисунок, но стартует на N шагов позже">
              фаза, шагов
              <NumField
                value={track.phase} min={-64} max={64}
                onChange={(phase) => change({ phase: Math.round(phase) })}
              />
            </label>
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
          </div>
          <div className="group">
            <label title="Нота стартует во сколько раз выше тоники и слетает вниз за время падения — так делается бочка («вумп»). 1 — выключено. Не работает на шуме">
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
          <div className="group mods-group">
            <label title="Эффекты трека, включаются последовательно: фильтр → эффекты → панорама">
              эффекты
            </label>
            {effects.length === 0 && (
              <span className="none">нет — добавь задержку (эхо) или реверб (пространство)</span>
            )}
            {effects.map((fx, i) => (
              <div className="mod-row" key={i}>
                <select value={fx.type} title="Тип эффекта" onChange={(e) => setEffectType(i, e.target.value as Effect['type'])}>
                  {(Object.keys(EFFECT_LABELS) as Effect['type'][]).map((t) => (
                    <option key={t} value={t}>{EFFECT_LABELS[t]}</option>
                  ))}
                </select>
                {fx.type === 'delay' ? (
                  <>
                    <label title="Через сколько миллисекунд повтор (при темпе 118: восьмая ≈ 254 мс, четверть ≈ 508 мс)">
                      повтор, мс
                      <NumField
                        value={Math.round(fx.timeSec * 1000)} min={10} max={2000} step={10}
                        onChange={(ms) => updateDelay(i, { timeSec: ms / 1000 })}
                      />
                    </label>
                    <label title="Насколько затухает каждый следующий повтор: 0% — один повтор, 80% — длинное эхо">
                      затухание
                      <input
                        type="range" min={0} max={0.9} step={0.05} value={fx.feedback}
                        onChange={(e) => updateDelay(i, { feedback: Number(e.target.value) })}
                      />
                      {Math.round(fx.feedback * 100)}%
                    </label>
                  </>
                ) : (
                  <label title="Размер пространства: 0.5 — комната, 2 — зал, 5 — собор">
                    размер, с
                    <NumField
                      value={fx.sizeSec} min={0.2} max={8} step={0.1}
                      onChange={(sizeSec) => updateReverb(i, { sizeSec })}
                    />
                  </label>
                )}
                <label title="Сколько эффекта подмешать к чистому звуку">
                  уровень
                  <input
                    type="range" min={0} max={1} step={0.05} value={fx.mix}
                    onChange={(e) => {
                      const mix = Number(e.target.value);
                      if (fx.type === 'delay') updateDelay(i, { mix });
                      else updateReverb(i, { mix });
                    }}
                  />
                  {Math.round(fx.mix * 100)}%
                </label>
                <button className="remove" title="Убрать эффект" onClick={() => removeEffect(i)}>×</button>
              </div>
            ))}
            <button onClick={addEffect} title="Добавить эффект">+ эффект</button>
          </div>
          <div className="group mods-group">
            <label title="Модуляции этого эскиза: LFO непрерывно качает выбранный параметр, пока эскиз играет">
              модуляции эскиза «{pattern.name}» (LFO)
            </label>
            {(pattern.mods ?? track.mods).length === 0 && (
              <span className="none">нет — добавь, например, LFO на панораму (пинг-понг)</span>
            )}
            {(pattern.mods ?? track.mods).map((m, i) => (
              <div className="mod-row" key={i}>
                <select
                  value={m.target}
                  title="Какой параметр качает LFO"
                  onChange={(e) => updateMod(i, { target: e.target.value as ModTarget })}
                >
                  {(Object.keys(MOD_TARGET_LABELS) as ModTarget[]).map((t) => (
                    <option key={t} value={t}>{MOD_TARGET_LABELS[t]}</option>
                  ))}
                </select>
                <select
                  value={m.shape}
                  title="Форма колебания"
                  onChange={(e) => updateMod(i, { shape: e.target.value as Mod['shape'] })}
                >
                  {LFO_SHAPES.map((s) => (
                    <option key={s} value={s}>{WAVEFORM_LABELS[s]}</option>
                  ))}
                </select>
                <label title="Скорость колебаний, Гц. 0.2 Гц — период 5 секунд; 4–8 Гц — вибрато">
                  Гц
                  <NumField
                    value={m.rate} min={0.01} max={40} step={0.05}
                    onChange={(rate) => updateMod(i, { rate })}
                  />
                </label>
                <label title="Глубина: насколько сильно LFO отклоняет параметр">
                  глубина
                  <input
                    type="range" min={0} max={1} step={0.05} value={m.depth}
                    onChange={(e) => updateMod(i, { depth: Number(e.target.value) })}
                  />
                  {Math.round(m.depth * 100)}%
                </label>
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
        </div>
      )}

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
          {pattern.steps.map((s, col) => (
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
