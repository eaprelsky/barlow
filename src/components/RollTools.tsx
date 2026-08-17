// Тулбар нотного стана: шкала + генерация (заполнение осей, мутация с
// уровнем, очистка). Выделено из TrackRow механически; локальные состояния
// (панель, оси мутации, уровень) живут здесь — наружу только команды.

import { useState } from 'react';
import type { Pattern, Track } from '../types';
import type { MutateModes } from '../music/mutate';
import { presetName } from '../music/scales';
import { NumField } from './NumField';

interface Props {
  track: Track;
  pattern: Pattern;
  /** Текущая подсказка выделения (null — нет): шкала возвращает её после ховера. */
  selHint: string | null;
  onHint: (text: string | null) => void;
  onFillAxis: (
    id: string,
    axis: 'time' | 'height',
    mode: 'even' | 'random' | 'ladder' | 'one',
    pulses: number,
  ) => void;
  onMutate: (id: string, modes: MutateModes, edits: number) => void;
  onPatternCommand: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
  onPickScale: () => void;
}

export function RollTools({
  track,
  pattern,
  selHint,
  onHint,
  onFillAxis,
  onMutate,
  onPatternCommand,
  onPickScale,
}: Props) {
  const [pulses, setPulses] = useState(3);
  const [showFill, setShowFill] = useState(false);
  // Мутация: что правит (оси) и сколько правок за клик (уровень).
  const [mutTime, setMutTime] = useState(true);
  const [mutPitch, setMutPitch] = useState(true);
  const [mutEdits, setMutEdits] = useState(3);

  return (
    <div className="roll-tools">
      <label
        className="rt-scale"
        title={
          track.waveform === 'sample'
            ? 'Шкала = набор скоростей воспроизведения сэмпла (питч). Октавы добавляются кнопками у стана'
            : 'Набор высот нотного стана: мировые строи (гамелан, 22 шрути, макам), чистый строй, N-ET и свои дроби. Октавы — кнопками у стана'
        }
        onMouseEnter={() =>
          onHint('мировые строи — в пресетах выбора шкалы: гамелан, 22 шрути, макам · октавы — кнопками у стана')
        }
        onMouseLeave={() => onHint(selHint)}
      >
        шкала
        <button
          className="scale-btn"
          title="Выбрать шкалу: поиск по названию, пресеты мировых строёв, N равных ступеней, своя дробями"
          onClick={onPickScale}
        >
          {presetName(track.scale)}
        </button>
      </label>
      <span className="rt-sep" />
      {/* Генерация стана за одной кнопкой. Оси независимы: клик по
          кнопке оси применяет только её — время и тон компонуются. */}
      <button
        className={showFill ? 'on' : ''}
        title="Заполнение стана: время и тон по кнопкам, мутация с уровнем, очистка"
        onClick={() => setShowFill((v) => !v)}
      >
        заполнить
      </button>
      {showFill && (
        <span className="fill-tools">
          <span className="rt-label" title="Сколько нот раскидает заполнение по времени">
            нот
          </span>
          <NumField
            narrow
            value={pulses} min={0} max={pattern.length}
            onChange={(n) => setPulses(Math.round(n))}
          />
          <span className="fill-axis">
            <span className="rt-label" title="Клик сразу применяет ось времени">время</span>
            <button
              title="Евклидово раскладывание N нот: максимально равномерно, 3 по 8 — тресильо"
              onClick={() => onFillAxis(track.id, 'time', 'even', pulses)}
            >
              равномерно
            </button>
            <button
              title="N нот по случайным шагам цикла — то же количество, без равномерности"
              onClick={() => onFillAxis(track.id, 'time', 'random', pulses)}
            >
              случайно
            </button>
          </span>
          <span className="fill-axis">
            <span className="rt-label" title="Клик сразу применяет ось тона к текущим нотам">тон</span>
            <button
              title="Ровная лестница по строкам шкалы: слева направо, от низа к верху"
              onClick={() => onFillAxis(track.id, 'height', 'ladder', pulses)}
            >
              лестница
            </button>
            <button
              title="Случайные строки шкалы: ритм, громкости и длины не трогаются"
              onClick={() => onFillAxis(track.id, 'height', 'random', pulses)}
            >
              случайно
            </button>
            <button
              title="Все ноты на одну высоту ×1 (тоника шкалы) — сплошная полоска, как у баса или бочки"
              onClick={() => onFillAxis(track.id, 'height', 'one', pulses)}
            >
              ×1
            </button>
          </span>
          <span className="rt-sep" />
          <span className="fill-axis">
            <span className="rt-label" title="Что мутирует: щепотка случайных правок по включённым осям">мутировать</span>
            <span className="rt-sw" title="Мутация времени: вкл/выкл нот, вероятность, громкость">
              <button
                className={'sw' + (mutTime ? ' on' : '')}
                role="switch"
                aria-checked={mutTime}
                onClick={() => setMutTime((v) => !v)}
              >
                <span className="sw-knob" />
              </button>
              <span className="rt-label">время</span>
            </span>
            <span className="rt-sw" title="Мутация тона: высота отдельной ноты">
              <button
                className={'sw' + (mutPitch ? ' on' : '')}
                role="switch"
                aria-checked={mutPitch}
                onClick={() => setMutPitch((v) => !v)}
              >
                <span className="sw-knob" />
              </button>
              <span className="rt-label">тон</span>
            </span>
            <span className="rt-label" title="Сколько случайных правок за один клик — уровень мутации">правок</span>
            <NumField
              narrow
              value={mutEdits} min={1} max={32}
              onChange={(n) => setMutEdits(Math.round(n))}
            />
            <button
              disabled={!mutTime && !mutPitch}
              title="Случайные правки по включённым осям: слушай — мутируй — оставляй или снова мутируй"
              onClick={() => onMutate(track.id, { time: mutTime, pitch: mutPitch }, mutEdits)}
            >
              мутировать
            </button>
          </span>
          <span className="rt-sep" />
          <button
            title="Очистить стан этого эскиза: убрать все ноты (undo вернёт)"
            onClick={() =>
              onPatternCommand(track.id, pattern.id, {
                steps: pattern.steps.map((s) => ({ ...s, notes: [] })),
              })
            }
          >
            очистить
          </button>
        </span>
      )}
    </div>
  );
}
