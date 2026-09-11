import { t as msg, useLocale } from '../i18n';
// Тулбар нотного стана: строй (шкала + тоника), время партии (длина ноты,
// фаза) и генерация (заполнение осей, мутация с уровнем, очистка).
// Автоматизация партии (кривые и модуляции) живёт отдельной панелью под
// станом. Выделено из TrackRow механически; локальные состояния (панель,
// оси мутации, уровень, выпадашка шкалы) живут здесь — наружу только команды.

import { useState } from 'react';
import type { Pattern, SoundingTrack, Track } from '../types';
import type { MutateModes } from '../music/mutate';
import { presetName } from '../music/scales';
import { NumField } from './NumField';
import { ScalePicker } from './ScalePicker';
import { HelpHint } from '../onboarding/Onboarding';

interface Props {
  track: SoundingTrack;
  pattern: Pattern;
  /** Длина ноты по умолчанию, шагов (0 — «авто» по огибающей). */
  noteSteps: number;
  onNoteSteps: (steps: number) => void;
  /** Трековые ручки тулбара: тоника, фаза. */
  onTrack: (patch: Partial<Track>) => void;
  /** Применить шкалу (переиндексация нот — на стороне TrackRow). */
  onApplyScale: (ratios: number[]) => void;
  onFillAxis: (
    id: string,
    axis: 'time' | 'height',
    mode: 'even' | 'random' | 'ladder' | 'one',
    pulses: number,
  ) => void;
  onMutate: (id: string, modes: MutateModes, edits: number) => void;
  onPatternCommand: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
}

export function RollTools({
  track,
  pattern,
  noteSteps,
  onNoteSteps,
  onTrack,
  onApplyScale,
  onFillAxis,
  onMutate,
  onPatternCommand,
}: Props) {
  useLocale();
  const [pulses, setPulses] = useState(3);
  const [showFill, setShowFill] = useState(false);
  const [showScales, setShowScales] = useState(false);
  // Мутация: что правит (оси) и сколько правок за клик (уровень).
  const [mutTime, setMutTime] = useState(true);
  const [mutPitch, setMutPitch] = useState(true);
  const [mutEdits, setMutEdits] = useState(3);

  return (
    <div className="roll-tools" data-ob="roll-tools">
      <HelpHint guide="roll" scope={`[data-track-id="${track.id}"]`} label={msg("rollTools.tourNoteGrid")} />
      {/* Строй целиком — здесь: интервалы (шкала, выпадашкой с поиском)
          и якорь (тоника). Панель «трек» остаётся комнатой микса. */}
      <span className="rt-scale-wrap">
        <label
          className="rt-scale"
          title={
            track.waveform === 'sample'
              ? msg("rollTools.theScaleSetsSamplePlaybackRatesAnd")
              : msg("rollTools.pitchesForTheNoteGridWorldTunings")
          }
        >
          {msg("rollTools.scale")}<button
            className="scale-btn"
            data-ob="scale-btn"
            title={msg("rollTools.chooseAScaleSearchByNameWorld")}
            onClick={() => setShowScales((v) => !v)}
          >
            {presetName(track.scale)}
          </button>
          <HelpHint guide="scales" scope={`[data-track-id="${track.id}"]`} label={msg("rollTools.tourScalesAndTuning")} />
        </label>
        {showScales && (
          <ScalePicker
            current={track.scale}
            onPick={onApplyScale}
            onClose={() => setShowScales(false)}
          />
        )}
      </span>
      <label
        className="rt-freq"
        data-ob="roll-tonic"
        title={msg("rollTools.rootFrequencyForThePitchScaleBass")}
      >
        {msg("rollTools.root")}<NumField help="track.freq"
          narrow w={64} wheel
          value={track.freq} min={20} max={9000} step={0.1}
          onChange={(freq) => onTrack({ freq })}
        />
        <span className="rt-label">{msg("rollTools.hz")}</span>
      </label>
      <span className="rt-sep" />
      {/* Длина ноты по умолчанию — ровно над станом: какой длины бары
          рисует клик (и сколько звучит нота, если у неё нет своего гейта). */}
      <label
        className="rt-note"
        title={
          noteSteps > 0
            ? msg("rollTools.defaultNoteLengthInStepsLinkedTo")
            : msg("rollTools.autoUsesTheInstrumentEnvelopeSDuration")
        }
      >
        {msg("rollTools.note")}<NumField
          narrow w={56} wheel
          value={noteSteps} min={0} max={16} step={1}
          onChange={onNoteSteps}
        />
        <span className="rt-label">{noteSteps > 0 ? msg("rollTools.steps") : msg("rollTools.auto")}</span>
      </label>
      {/* Фаза — время партии: где цикл стартует. Как и «нота» — трековая
          ручка в шагах, но про смещение рисунка, а не длину ноты. */}
      <label
        className="rt-phase"
        data-ob="roll-phase"
        title={msg("rollTools.cycleOffsetInStepsTheSamePattern")}
      >
        {msg("rollTools.phase")}<NumField help="track.phase"
          narrow w={56} wheel
          value={track.phase} min={-64} max={64} step={1}
          onChange={(phase) => onTrack({ phase: Math.round(phase) })}
        />
        <span className="rt-label">{msg("rollTools.steps")}</span>
      </label>
      <span className="rt-sep" />
      {/* Генерация стана за одной кнопкой. Оси независимы: клик по
          кнопке оси применяет только её — время и тон компонуются. */}
      <button
        className={showFill ? 'on' : ''}
        data-ob="fill-btn"
        title={msg("rollTools.fillTheNoteGridChangeRhythmOr")}
        onClick={() => setShowFill((v) => !v)}
      >
        {msg("rollTools.fill")}</button>
      {showFill && (
        <span className="fill-tools" data-ob="fill-tools">
          <span className="rt-label" title={msg("rollTools.howManyNotesToDistributeAcrossThe")}>
            {msg("rollTools.notes")}</span>
          <NumField
            narrow
            value={pulses} min={0} max={pattern.length}
            onChange={(n) => setPulses(Math.round(n))}
          />
          <span className="fill-axis">
            <span className="rt-label" title={msg("rollTools.clickToApplyARhythmPattern")}>{msg("rollTools.rhythm")}</span>
            <button
              data-ob="fill-even"
              title={msg("rollTools.distributeNNotesAsEvenlyAsPossible")}
              onClick={() => onFillAxis(track.id, 'time', 'even', pulses)}
            >
              {msg("rollTools.even")}</button>
            <button
              title={msg("rollTools.placeNNotesOnRandomStepsKeeping")}
              onClick={() => onFillAxis(track.id, 'time', 'random', pulses)}
            >
              {msg("rollTools.random")}</button>
          </span>
          <span className="fill-axis">
            <span className="rt-label" title={msg("rollTools.clickToChangeThePitchesOfExisting")}>{msg("rollTools.pitch")}</span>
            <button
              title={msg("rollTools.ascendingStepsThroughTheScaleFromLeft")}
              onClick={() => onFillAxis(track.id, 'height', 'ladder', pulses)}
            >
              {msg("rollTools.ascending")}</button>
            <button
              title={msg("rollTools.randomScalePitchesRhythmVelocitiesAndNote")}
              onClick={() => onFillAxis(track.id, 'height', 'random', pulses)}
            >
              {msg("rollTools.random")}</button>
            <button
              title={msg("rollTools.putAllNotesAt1TheRoot")}
              onClick={() => onFillAxis(track.id, 'height', 'one', pulses)}
            >
              ×1
            </button>
          </span>
          <span className="rt-sep" />
          <span className="fill-axis">
            <span className="rt-label" title={msg("rollTools.chooseWhichDimensionsReceiveRandomEdits")}>{msg("rollTools.mutate")}</span>
            <span className="rt-sw" title={msg("rollTools.rhythmMutationNoteOnOffProbabilityAnd")}>
              <button
                className={'sw' + (mutTime ? ' on' : '')}
                role="switch"
                aria-checked={mutTime}
                onClick={() => setMutTime((v) => !v)}
              >
                <span className="sw-knob" />
              </button>
              <span className="rt-label">{msg("rollTools.rhythm")}</span>
            </span>
            <span className="rt-sw" title={msg("rollTools.pitchMutationChangesIndividualNotePitches")}>
              <button
                className={'sw' + (mutPitch ? ' on' : '')}
                role="switch"
                aria-checked={mutPitch}
                onClick={() => setMutPitch((v) => !v)}
              >
                <span className="sw-knob" />
              </button>
              <span className="rt-label">{msg("rollTools.pitch")}</span>
            </span>
            <span className="rt-label" title={msg("rollTools.numberOfRandomEditsPerClick")}>{msg("rollTools.edits")}</span>
            <NumField
              narrow
              value={mutEdits} min={1} max={32}
              onChange={(n) => setMutEdits(Math.round(n))}
            />
            <button
              disabled={!mutTime && !mutPitch}
              data-ob="fill-mutate"
              title={msg("rollTools.applyRandomEditsToTheSelectedDimensions")}
              onClick={() => onMutate(track.id, { time: mutTime, pitch: mutPitch }, mutEdits)}
            >
              {msg("rollTools.mutate")}</button>
          </span>
          <span className="rt-sep" />
          <button
            data-ob="fill-clear"
            title={msg("rollTools.removeAllNotesFromThisClipUndo")}
            onClick={() =>
              onPatternCommand(track.id, pattern.id, {
                steps: pattern.steps.map((s) => ({ ...s, notes: [] })),
              })
            }
          >
            {msg("rollTools.clear")}</button>
          <HelpHint
            guide="generators"
            scope={`[data-track-id="${track.id}"]`}
            label={msg("rollTools.tourFillAndMutate")}
          />
        </span>
      )}
    </div>
  );
}
