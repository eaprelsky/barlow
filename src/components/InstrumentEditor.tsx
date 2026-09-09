import { t as msg, useLocale } from '../i18n';
import { VoiceProcessing } from './VoiceProcessing';
import { saveBlob as saveInstrumentBlob } from '../platform';
import { exportInstrument } from '../audio/instrumentFile';
import { WavetableEditor } from './WavetableEditor';
import { tableRecipe } from '../music/wavetable';
import { LayerEditor } from './LayerEditor';
import { ControlEnvelopeEditor } from './ControlEnvelopeEditor';
import { MsegEditor } from './MsegEditor';
import { MSEG_SHAPES, msegDuration } from '../music/mseg';
import { recommendedHz } from '../music/audition';
import type { SamplePCM } from '../audio/pcm';
// Большой редактор инструмента дорожки: «раздвинутый» режим карточки
// (остальные треки съёживаются). Пресет из панели инструментов
// переставляет именно эти ручки — здесь тембр крутят и дотюнивают.
// Вкладки: источник | огибающая | тембр. «Источник» (v39): инструмент —
// таблица строк-операторов (множитель, громкость/глубина, форма, хвост,
// маршрут «в сумму / модулирует строку») плюс большой канвас суммы.
// Правки идут в черновик — звучащий тембр остаётся призраком на канвасе,
// пока черновик не применён. Слои, не привязанные к строкам (унисон,
// вибрато, форманты, заготовка), — правой панелью. Моделей больше нет:
// колокол, струна, FM, орган — заготовки таблицы (music/waveRecipes.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArpMode,
  Instrument,
  Pattern,
  ScratchPoint,
  SoundingTrack,
  Track,
  WaveDef,
  WavePartial,
} from '../types';
import { ARP_MODE_LABELS, PARTIAL_TYPE_LABELS, canRouteWave, normalizeWave } from '../types';
import { parameterRange } from '../parameters';
import {
  instrumentNameOf,
  loadUserPresets,
  saveUserPreset,
} from '../music/instrumentPresets';
import { Knob } from './Knob';
import { MacroEditor } from './MacroEditor';
import { SampleZoneEditor } from './SampleZoneEditor';
import { SampleSliceEditor } from './SampleSliceEditor';
import { NumField } from './NumField';
import { WaveCanvas } from './WaveCanvas';
import { NoteGraph } from './EnvGraph';
import { confirmDialog, promptDialog } from './dialogs';
import { HelpHint } from '../onboarding/Onboarding';
import { cycleToPartials, sampleToPartials } from '../music/fft';
import { CYCLE_N, renderInstrumentCycle, renderOpCycle } from '../music/waveSnapshot';
import { RECIPE_LABELS, recipe } from '../music/waveRecipes';
import type { RecipeId } from '../music/waveRecipes';
import { tickDuration } from '../audio/timing';

export type InstEditorTab = 'snd' | 'env' | 'timbre';

const tabs = (): [InstEditorTab, string][] => [
  ['snd', msg("instrumentEditor.source")],
  ['env', msg("instrumentEditor.envelope")],
  ['timbre', msg("instrumentEditor.timbre")],
];

/** Последняя волна (таблица строк) инструмента: возврат с сэмпла на
 *  «волну» сегмента источника восстанавливает прежний тембр. Живёт
 *  в модуле — переживает перемонтирование редактора. */
const LAST_WAVE = new Map<string, WaveDef>();

export interface InstrumentEditorProps {
  /** Voice context reuses source controls without track-wide actions. */
  layerSource?: boolean;
  onEditLayer?: (id: string) => void;
  onPreviewSolo?: (i: Instrument) => void;
  track: Track;
  inst: Instrument;
  pattern: Pattern;
  bpm: number;
  tab: InstEditorTab;
  onTab: (t: InstEditorTab) => void;
  /** Частичный патч инструмента (копию при общем инструменте делает App). */
  onChangeInst: (patch: Partial<Instrument>, command?: boolean) => void;
  /** Правка дорожки — для арпеджиатора (свойство дорожки). */
  onChangeTrack: (patch: Partial<Track>) => void;
  onSlicePattern: () => void;
  onClose: () => void;
  /** Модалка выбора сэмпла — живёт в карточке трека. */
  onPickSample: () => void;
  /** Загрузить файл сэмпла с диска (положит в слот). */
  onLoadSampleFile: (f: File) => void;
  getPCM: (id?: string) => Promise<SamplePCM | null>;
  onPreviewRegion: (inst: Instrument, fromSec: number, toSec: number) => void;
  /** Превью ноты тембром (карточка сольёт с дорожкой). */
  onPreviewNote: (i: Instrument, audition?: boolean) => void;
  onTransformSample: (trackId: string, prompt: string, strength: number, duration?: number) => void;
  onGenerateSample: (trackId: string, prompt: string, seconds: number) => void;
  busy: boolean;
  onCancelSampleJob: () => void;
  onScratchBegin: (pos: number) => void;
  onScratchMove: (pos: number) => void;
  onScratchEnd: () => void;
  onScratchPreview: () => void;
  /** Заморозить жест сэмпла: оффлайн-рендер в библиотеку сэмплов.
   *  name — из поля у кнопки (нетронутое/пустое — App добавит штамп). */
  onScratchSave: (trackId: string, name?: string) => void | Promise<void>;
  onScratchPeaks: () => Promise<{ peaks: number[]; duration: number } | null>;
}

/** Микс в моно для канваса (рисуем один канал суммы). */
function monoOf(buf: SamplePCM): Float32Array {
  if (buf.channels.length === 1) return buf.channels[0];
  const a = buf.channels[0];
  const b = buf.channels[1];
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

function clampSec(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function InstrumentEditor({
  layerSource = false, onEditLayer, onPreviewSolo,
  track,
  inst,
  pattern,
  bpm,
  tab,
  onTab,
  onChangeInst,
  onChangeTrack,
  onSlicePattern,
  onClose,
  onPickSample,
  onLoadSampleFile,
  getPCM,
  onPreviewRegion,
  onPreviewNote,
  onTransformSample,
  onGenerateSample,
  busy,
  onCancelSampleJob,
  onScratchBegin,
  onScratchMove,
  onScratchEnd,
  onScratchPreview,
  onScratchSave,
  onScratchPeaks,
}: InstrumentEditorProps) {
  useLocale();
  // Слитый вид: дорожка + инструмент — для чтения звука и превью.
  const [envelopeTarget, setEnvelopeTarget] = useState<'amp' | 'pitch' | 'filter'>('amp');
  const [fileBusy, setFileBusy] = useState(false);
  const st: SoundingTrack = { ...inst, ...track };
  const scope = `[data-track-id="${track.id}"]`;

  // ---- Сэмпл: буфер, выделение, FFT, ИИ ----
  const [buffer, setBuffer] = useState<SamplePCM | null>(null);
  const [sampleError, setSampleError] = useState('');
  const [sampleRetry, setSampleRetry] = useState(0);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [fftK, setFftK] = useState(64);
  const [f0Manual, setF0Manual] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStrength, setAiStrength] = useState(0.5);
  // Генерация сэмпла по описанию.
  const [prompt, setPrompt] = useState('');
  const [genSeconds, setGenSeconds] = useState(3);

  useEffect(() => {
    setBuffer(null); setSampleError(''); setSel(null);
    if (tab !== 'snd' || !inst.sampleId) {
      return;
    }
    let alive = true;
    void getPCM(inst.sampleId).then((b) => {
      if (alive) { setBuffer(b); if (!b) setSampleError(msg("instrumentEditor.theRecordingIsMissingFromTheLibrary")); }
    }).catch(e => { if (alive) setSampleError(String(e)); });
    return () => {
      alive = false;
    };
  }, [tab, inst.sampleId, getPCM, sampleRetry]);

  // Память о последней волне — для возврата с сэмпла сегментом.
  useEffect(() => {
    if (inst.waveform !== 'sample' && inst.wave) LAST_WAVE.set(inst.id, inst.wave);
  }, [inst.id, inst.waveform, inst.wave]);

  const mono = useMemo(() => (buffer ? monoOf(buffer) : null), [buffer]);
  const dur = buffer?.duration ?? 0;
  const regStart = inst.sampleStart ?? 0;
  const regEnd = inst.sampleEnd ?? dur;
  const selSec: [number, number] | null =
    sel && sel[1] - sel[0] > 0.0005 && dur > 0
      ? [sel[0] * dur, sel[1] * dur]
      : null;
  // Длительность того, что реально играет (морфинг держится в её
  // рамках): кусок обрезки или весь сэмпл.
  const aiDuration =
    inst.sampleStart !== undefined || inst.sampleEnd !== undefined
      ? Math.max(0.2, regEnd - regStart)
      : dur > 0
        ? dur
        : undefined;

  // ---- Волна: таблица строк-операторов инструмента + черновик ----
  // Инструмент и есть таблица (v39): она всегда показывает звучащий
  // тембр. Правки ложатся в ЧЕРНОВИК: звучащий инструмент не меняется,
  // пока черновик не применён. Канвас рисует черновик яркой линией,
  // звучащий тембр — призраком; «▶ нота» слушает черновик.
  const applied = useMemo<WaveDef>(
    () => inst.wave ?? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] },
    [inst.wave],
  );
  const [draft, setDraft] = useState<WaveDef | null>(null);
  const wave = draft ?? applied;
  const soundingForm = useMemo(() => renderInstrumentCycle(inst), [inst]);
  const draftForm = useMemo(() => renderOpCycle(wave), [wave]);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(applied);
  const applyDraft = () => {
    if (draft) onChangeInst({ waveform: 'wave', wave: normalizeWave(draft) });
    setDraft(null);
  };

  // Режим точек: локальная таблица (в черновик уходит конвертацией
  // в строки).
  const [points, setPoints] = useState<Float32Array | null>(null);
  const pointsRef = useRef<Float32Array | null>(null);
  pointsRef.current = points;

  // Смена инструмента извне (пресет, загрузка патча, возврат с сэмпла)
  // обнуляет черновик: таблица всегда показывает то, что звучит.
  const appliedKey = JSON.stringify(applied);
  const prevAppliedKey = useRef(appliedKey);
  useEffect(() => {
    if (prevAppliedKey.current !== appliedKey) {
      prevAppliedKey.current = appliedKey;
      setDraft(null);
      pointsRef.current = null;
      setPoints(null);
    }
  }, [appliedKey]);

  const setPartial = (i: number, upd: Partial<WavePartial>) =>
    setDraft(normalizeWave({ ...wave, partials: wave.partials.map((p, j) => (j === i ? { ...p, ...upd } : p)) }) ?? null);
  /** Убрать строку i: её модуляторы теряют цель — снимаются тоже,
   *  маршруты на строки дальше i сдвигаются. */
  const removePartial = (i: number) => {
    const kept = wave.partials.filter((_, j) => j !== i && wave.partials[j].mod !== i);
    setDraft({
      ...wave,
      partials: kept.map((p) =>
        p.mod !== undefined && p.mod > i ? { ...p, mod: p.mod - 1 } : p,
      ),
    });
  };
  const addPartial = () => {
    const used = new Set(wave.partials.map((p) => p.ratio));
    let r = 1;
    while (used.has(r) && r < 64) r++;
    setDraft({ ...wave, partials: [...wave.partials, { ratio: r, amp: 0.5, type: 'sine' }] });
  };

  /** Штрих мышью: точка в таблице + перевод в гармоники черновика.
   *  Слушать — «▶ нота» (звучит черновик), применять — кнопкой. */
  const drawPoint = (x: number, y: number) => {
    const amp = Math.min(1, Math.max(-1, (y - 0.5) * 2));
    const pts = Float32Array.from(pointsRef.current ?? draftForm ?? new Float32Array(CYCLE_N));
    const idx = Math.min(CYCLE_N - 1, Math.max(0, Math.round(x * CYCLE_N)));
    pts[idx] = amp;
    pointsRef.current = pts;
    setPoints(pts);
    const partials = cycleToPartials(pts, 64);
    if (partials.length > 0) setDraft({ partials });
  };

  /** Сэмпл → огрублённый набор гармоник: тембровый слепок куска ложится
   *  черновиком в редактор волны ниже — сравни с звучащим и примени. */
  const decompose = () => {
    if (!mono || !buffer) return;
    const from = selSec?.[0] ?? 0;
    const to = selSec?.[1] ?? buffer.duration;
    const { partials, f0 } = sampleToPartials(mono, buffer.sampleRate, from, to, {
      maxPartials: fftK,
      f0: f0Manual > 20 ? f0Manual : undefined,
    });
    if (partials.length === 0) {
      void confirmDialog({
        title: msg("instrumentEditor.harmonicAnalysis"),
        text:
          msg("instrumentEditor.couldNotDetectTheFundamentalFrequency") +
          (f0Manual > 20 ? '' : msg("instrumentEditor.setF0HzManually")) +
          msg("instrumentEditor.forUnpitchedMaterialTryGranularSamplePlayback"),
        okLabel: msg("instrumentEditor.ok"),
        onlyOk: true,
      });
      return;
    }
    setDraft({ partials });
    setPoints(null);
    setF0Manual(Math.round(f0 * 10) / 10);
  };

  // ---- Сохранить как свой пресет ----
  const [, bumpInstruments] = useState(0);
  const saveInstrumentAs = async () => {
    const current = instrumentNameOf(st);
    const suggested = current === msg('preset.custom') ? track.name : current;
    const name = await promptDialog({
      title: msg("instrumentEditor.saveInstrument"),
      text: dirty && !isSample ? msg("instrumentEditor.saveTheAuditionedDraftToMyInstruments") : msg("instrumentEditor.thePresetWillAppearUnderMyInstruments"),
      okLabel: msg("instrumentEditor.save"),
      input: { value: suggested },
    });
    if (!name || !name.trim()) return;
    const n = name.trim();
    if (loadUserPresets().some((p) => p.name === n)) {
      const ok = await confirmDialog({
        title: msg("instrumentEditor.replacePreset"),
        text: msg("instrumentEditor.alreadyExistsInYourInstrumentsReplaceIt", {p0: n}),
        okLabel: msg("instrumentEditor.replace"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      saveUserPreset(n, dirty && !isSample ? { ...st, waveform: 'wave', wave: normalizeWave(wave) } : st);
      bumpInstruments((v) => v + 1);
    } catch (error) {
      await confirmDialog({ title: msg("instrumentEditor.couldNotSaveInstrument"), text: String(error), okLabel: msg("instrumentEditor.ok18"), onlyOk: true });
    }
  };

  // ---- Скрэтч ----
  const scratchRef = useRef<HTMLDivElement | null>(null);
  const scratchRec = useRef<{ t0: number; pts: { dt: number; pos: number }[] } | null>(null);
  const [scratchArmed, setScratchArmed] = useState(false);
  const [scratchLive, setScratchLive] = useState(false);
  const [scratchPlaying, setScratchPlaying] = useState(false);
  const [scratchMap, setScratchMap] = useState<{ peaks: number[]; duration: number } | null>(null);
  const [dragPts, setDragPts] = useState<ScratchPoint[] | null>(null);
  // Рендер «в сэмпл» идёт — кнопка занята.
  const [scratchSaving, setScratchSaving] = useState(false);
  // Имя для «в сэмпл»: поле появляется ПОСЛЕ клика по кнопке (справа от
  // неё), сохранение — по «ок»/Enter. Имя = ровно текст поля, файл
  // называется так же. Успех — галочкой на полторы секунды, без модалки.
  const [scratchNaming, setScratchNaming] = useState(false);
  const [scratchName, setScratchName] = useState('');
  const [scratchSavedTick, setScratchSavedTick] = useState(false);
  const saveScratchNamed = () => {
    setScratchSaving(true);
    void Promise.resolve(onScratchSave(track.id, scratchName)).finally(() => {
      setScratchSaving(false);
      setScratchNaming(false);
      setScratchSavedTick(true);
      window.setTimeout(() => setScratchSavedTick(false), 1600);
    });
  };
  const dragIdx = useRef<number | null>(null);
  const pendingAdd = useRef<{ t: number; pos: number } | null>(null);
  const downXY = useRef<{ x: number; y: number } | null>(null);

  // Мини-карта волны сэмпла для скрэтч-пэда.
  useEffect(() => {
    setScratchMap(null);
    if (st.waveform !== 'sample' || (st.sampleMode ?? 'plain') !== 'scratch') return;
    let alive = true;
    void onScratchPeaks().then((m) => {
      if (alive) setScratchMap(m);
    }).catch(e => { if (alive) setSampleError(String(e)); });
    return () => {
      alive = false;
    };
  }, [st.waveform, st.sampleMode, st.sampleId, onScratchPeaks, sampleRetry]);

  // Длительность ноты, с — как её посчитает triggerVoice: сетка
  // («нота», шагов × шаг эскиза) или огибающая (атака + спад).
  const noteGateSec =
    st.noteSteps && st.noteSteps > 0
      ? st.noteSteps * (pattern.rate ?? track.rate) * tickDuration(bpm)
      : st.ampMseg?.seconds ?? Math.max(st.attack, 0.0005) + st.decay;
  const noteSec = st.ampMseg ? msegDuration(st.ampMseg, noteGateSec) : noteGateSec;

  const hasNoise = wave.partials.some((p) => p.type === 'noise');
  const sampleFileRef = useRef<HTMLInputElement>(null);
  const isSample = st.waveform === 'sample';
  const scratchMode = isSample && (st.sampleMode ?? 'plain') === 'scratch';

  /** Закрытие с неприменённым черновиком волны — сперва спросить. */
  const settleDraft = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: msg("instrumentEditor.waveformNotApplied"),
        text: msg("instrumentEditor.theDraftDiffersFromTheCurrentWaveform"),
        okLabel: msg("instrumentEditor.apply"),
        cancelLabel: msg("instrumentEditor.discard"),
      });
      if (ok) applyDraft();
    }
    setPoints(null);
  };
  const tryClose = async () => { await settleDraft(); onClose(); };

  return (
    <div className="wave-editor inst-editor" data-ob="inst-panel" data-help-navigation-blocked={dirty || scratchArmed || scratchLive || fileBusy ? "true" : undefined}>
      {layerSource && <div className="layer-source-heading" data-help="layer-source-editor"><strong>{msg("instrumentEditor.layer")}{inst.name}</strong><span>{msg("instrumentEditor.voiceSource")}</span></div>}
      <div className="we-head">
        <span className="tabs we-tabs" data-ob="we-tabs">
          {tabs().map(([id, title]) => (
            <button
              key={id}
              className={tab === id ? 'tab on' : 'tab'}
              data-ob={id === 'snd' ? 'tab-snd' : id === 'env' ? 'tab-env' : id === 'timbre' ? 'tab-timbre' : undefined}
              onClick={() => onTab(id)}
            >
              {title}
            </button>
          ))}
        </span>
        {/* Имя инструмента не дублируем: оно уже в чипе заголовка трека.
            Осталась только пометка неприменённого черновика волны. */}
        {dirty && tab === 'snd' && !isSample && (
          <span className="we-title" title={msg("instrumentEditor.theDraftDiffersFromTheCurrentWaveform25")}>
            {msg("instrumentEditor.waveformDraftNotApplied")}</span>
        )}
        <span className="spacer" />
        <HelpHint guide="sound" scope={scope} label={msg("instrumentEditor.guideShapeATrackSSound")} />
        <button
          className="we-close"
          title={layerSource ? msg("instrumentEditor.backToInstrumentLayers") : msg("instrumentEditor.closeInstrumentEditor")}
          aria-label={layerSource ? msg("instrumentEditor.backToInstrument") : msg("instrumentEditor.closeInstrumentEditor31")}
          onClick={() => void tryClose()}
        >
          {layerSource ? msg("instrumentEditor.backToInstrument32") : '✕'}
        </button>
      </div>

      <div className="instrument-audition">
        <button
          className="env-listen"
          title={msg("instrumentEditor.auditionInThisTrackSRegisterAnd")} data-ob="preview-in-track"
          onClick={() => onPreviewNote(dirty && !isSample ? { ...inst, waveform: 'wave', wave } : inst)}
        >
          {layerSource ? msg("instrumentEditor.withLayers") : msg("instrumentEditor.inClip")}
        </button>
        {layerSource && <button data-help="layer-audition-solo" onClick={() => onPreviewSolo?.(dirty && !isSample ? { ...inst, waveform: 'wave', wave } : inst)}>{msg("instrumentEditor.soloLayer")}</button>}
        {!layerSource && <>
        <label data-ob="recommended-hz">{msg("instrumentEditor.audition")}<NumField value={recommendedHz(st)} min={20} max={9000} step={1} w={65} ariaLabel={msg("instrumentEditor.auditionFrequencyHz")} onChange={recommendedHz => onChangeInst({ recommendedHz })} /> {msg("instrumentEditor.hz")}</label>
        <button data-ob="preview-timbre" title={msg("instrumentEditor.auditionAtTheLibraryFrequencyIndependentlyOf")} onClick={() => onPreviewNote(dirty && !isSample ? { ...inst, waveform: 'wave', wave } : inst, true)}>{msg("instrumentEditor.sound")}</button>
        <button
          className="save-inst"
          data-ob="save-inst"
          title={msg("instrumentEditor.saveThisSoundIncludingTheWaveformDraft")}
          aria-label={msg("instrumentEditor.saveInstrument")}
          onClick={() => void saveInstrumentAs()}
        >
          {/* дискета: контур со срезом, жалюзи, окошко */}
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1.7 1.7h8.2l2.4 2.4v8.2H1.7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.2 1.7v3.6h4.6V1.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.2 12.3V8h4.6v4.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg> {msg("instrumentEditor.save")}</button>
        <button disabled={fileBusy} data-help="instrument-export" onClick={async () => {
          setFileBusy(true);
          const sound=structuredClone(dirty && !isSample ? {...st,waveform:'wave' as const,wave:normalizeWave(wave)} : st);
          try { const file=await exportInstrument({name:inst.name,category:'мои',track:sound});
            await saveInstrumentBlob(file,`${inst.name.replace(/[<>:"/\\|?*]/g,'-')}.barlow-instrument.zip`);
          } catch(error) { await confirmDialog({title:msg("instrumentEditor.couldNotSaveFile"),text:String(error),okLabel:msg("instrumentEditor.ok47"),onlyOk:true}); }
          finally { setFileBusy(false); }
        }}>{fileBusy?msg("instrumentEditor.saving"):msg("instrumentEditor.export")}</button>
        <HelpHint guide="audition" step={1} scope={scope} label={msg("instrumentEditor.guideAuditionAndSaveAnInstrument")} />
        </>}
      </div>
      {layerSource && <VoiceProcessing sound={inst} onChange={onChangeInst} />}
      {!layerSource && <LayerEditor inst={inst} onChange={onChangeInst} onEditSource={async id => { await settleDraft(); onEditLayer?.(id); }} />}
      <MacroEditor macros={inst.macros} onChange={(macros) => onChangeInst({ macros })} />
      {busy && <div role="status" className="inline">{msg("instrumentEditor.aiIsProcessingTheRecording")}<button onClick={onCancelSampleJob}
        title={msg("instrumentEditor.stopWaitingForAndApplyingTheResult")}>{msg("instrumentEditor.stopWaiting")}</button></div>}
      {tab === 'snd' && (
        <div className="we-body">
          <div className="group" data-ob="inst-group">
            {/* Источник — два мира: таблица строк-операторов или сэмпл
                из библиотеки. У сэмпла весь его инструментарий живёт
                здесь же — отдельной вкладки «сэмпл» больше нет. */}
            <div className="seg src-seg" data-ob="src-seg">
              <button
                className={!isSample ? 'on' : ''}
                title={msg("instrumentEditor.operatorRowsAdditiveSynthesisModulationAndResonant")}
                onClick={() =>
                  onChangeInst({
                    waveform: 'wave',
                    wave: LAST_WAVE.get(inst.id) ?? applied,
                  })
                }
              >
                {msg("instrumentEditor.waveform")}</button>
              <button
                className={isSample ? 'on' : ''}
                title={msg("instrumentEditor.librarySampleNoteGridRowsSetThe")}
                onClick={() => onChangeInst({ waveform: 'sample' })}
              >
                {msg("instrumentEditor.sample")}</button>
            </div>
            {isSample && (
              <label title={msg("instrumentEditor.mainRecordingUsedOutsideConfiguredZonesPitched")} data-ob="snd-sample">
                {msg("instrumentEditor.mainSample")}<span className="inline">
                  <span className="sample-name" title={st.sampleName ?? msg("instrumentEditor.noSampleSelected")}>
                    {st.sampleName ?? msg("instrumentEditor.notSelected")}
                  </span>
                  <button
                    onClick={onPickSample}
                    title={msg("instrumentEditor.browseStoredSamplesAuditionOneAndAssign")}
                  >
                    {msg("instrumentEditor.choose")}</button>
                  <button onClick={() => sampleFileRef.current?.click()}>{msg("instrumentEditor.import")}</button>
                  <input
                    ref={sampleFileRef} type="file" accept="audio/*" hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onLoadSampleFile(f);
                      e.target.value = '';
                    }}
                  />
                </span>
              </label>
            )}
          </div>

          {/* Волна (v39): инструмент = таблица строк-операторов. Большой
              канвас — сумма (модуляторы видны фазовой модуляцией целей),
              правки — в черновик; унисон, вибрато, форманты и заготовка —
              универсальные слои правой панелью, к строкам не привязаны. */}
          {!isSample && <div className="mseg-toolbar" data-ob="synthesis-mode"><label>{msg("instrumentEditor.synthesis")}<select aria-label={msg("instrumentEditor.synthesisMethod")} value={inst.wave?.wavetable ? 'table' : inst.wave?.va ? 'va' : 'operators'} onChange={e => onChangeInst({ wave: { ...(inst.wave ?? wave), wavetable: e.target.value === 'table' ? tableRecipe() : undefined, va: e.target.value === 'va' ? { shape: 'saw', pulseWidth: .5 } : undefined } }, true)}><option value="operators">{msg("instrumentEditor.operatorsFM")}</option><option value="table">{msg("instrumentEditor.wavetableFrames")}</option><option value="va">{msg("instrumentEditor.vaAnalogShapes")}</option></select></label></div>}
          {!isSample && inst.wave?.wavetable && <WavetableEditor value={inst.wave.wavetable} onChange={(wavetable, command) => onChangeInst({ wave: { ...inst.wave!, wavetable } }, command)} />}
          {!isSample && inst.wave?.va && <div className="mseg-toolbar" data-ob="va-oscillator"><label>{msg("instrumentEditor.shape")}<select aria-label={msg("instrumentEditor.vaWaveform")} value={inst.wave.va.shape} onChange={e => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, shape: e.target.value as 'saw' } } })}><option value="saw">{msg("instrumentEditor.sawtooth")}</option><option value="pulse">{msg("instrumentEditor.pulse")}</option><option value="triangle">{msg("instrumentEditor.triangle")}</option></select></label><label>{msg("instrumentEditor.pulseWidth")}<NumField ariaLabel={msg("instrumentEditor.vaPulseWidth")} disabled={inst.wave.va.shape !== 'pulse'} value={inst.wave.va.pulseWidth * 100} min={5} max={95} step={.1} onChange={v => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, pulseWidth: v / 100 } } })} /></label><Knob help="va-drift" label={msg("instrumentEditor.driftCents")} value={inst.wave.va.driftCents ?? 0} min={0} max={10} step={.1} onChange={driftCents => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, driftCents } } })} />{inst.wave.va.shape === 'pulse' && <><Knob help="va-pwm" label="PWM, %" value={(inst.wave.va.pwmDepth ?? 0) * 100} min={0} max={45} step={.5} onChange={v => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, pwmDepth: v / 100 } } })} /><Knob help="va-pwm" label={msg("instrumentEditor.pwmHz")} value={inst.wave.va.pwmRateHz ?? 1} min={.05} max={20} step={.01} log onChange={pwmRateHz => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, pwmRateHz } } })} /></>}</div>}
          {!isSample && (inst.wave?.wavetable || inst.wave?.va) && <div className="mseg-toolbar"><label>{msg("instrumentEditor.unison")}<NumField help="instrument.unisonVoices" ariaLabel={msg("instrumentEditor.synthUnisonVoices")} value={inst.unisonVoices ?? 1} min={1} max={8} step={1} onChange={unisonVoices => onChangeInst({ unisonVoices })} /></label><label>{msg("instrumentEditor.detuneCents")}<NumField help="instrument.unisonDetune" ariaLabel={msg("instrumentEditor.synthUnisonDetune")} value={inst.unisonDetune ?? 12} min={0} max={50} step={.5} onChange={unisonDetune => onChangeInst({ unisonDetune })} /></label><label>{msg("instrumentEditor.vibratoCents")}<NumField help="instrument.vibratoDepth" ariaLabel={msg("instrumentEditor.synthVibratoDepth")} value={inst.vibratoDepth ?? 0} min={0} max={1200} step={1} onChange={vibratoDepth => onChangeInst({ vibratoDepth })} /></label></div>}
          {!isSample && !inst.wave?.wavetable && !inst.wave?.va && (
            <div className="we-wave-layers">
              <div className="we-wave-left">
                <div className="we-canvas-stack" data-ob="we-wave-canvas">
                  {dirty && soundingForm && (
                    <div
                      className="we-ghost"
                      aria-hidden="true"
                      title={msg("instrumentEditor.dimLineCurrentSoundBrightLineDraft")}
                    >
                      <WaveCanvas data={soundingForm} sampleRate={CYCLE_N} cycles={4} />
                    </div>
                  )}
                  {points ? (
                    <WaveCanvas data={points} sampleRate={CYCLE_N} editable onDraw={drawPoint} />
                  ) : (
                    <WaveCanvas data={draftForm ?? soundingForm} sampleRate={CYCLE_N} cycles={4} />
                  )}
                </div>
                <div className="we-row" data-ob="we-draft-row">
                  {points ? (
                    <button
                      title={msg("instrumentEditor.yourDrawingHasAlreadyBeenConvertedTo")}
                      onClick={() => {
                        pointsRef.current = null;
                        setPoints(null);
                      }}
                    >
                      {msg("instrumentEditor.operatorRows")}</button>
                  ) : (
                    <button
                      title={msg("instrumentEditor.drawAWaveformWithTheMouseTo")}
                      onClick={() => {
                        const pts = Float32Array.from(
                          draftForm ?? soundingForm ?? new Float32Array(CYCLE_N),
                        );
                        pointsRef.current = pts;
                        setPoints(pts);
                      }}
                    >
                      {msg("instrumentEditor.drawWaveform")}</button>
                  )}
                  {dirty && (
                    <>
                      <button
                        className="we-apply"
                        title={msg("instrumentEditor.applyTheDraftOperatorSetupUntilThen")}
                        onClick={applyDraft}
                      >
                        {msg("instrumentEditor.apply")}</button>
                      <button
                        title={msg("instrumentEditor.discardTheDraftAndRestoreTheCurrent")}
                        onClick={() => setDraft(null)}
                      >
                        {msg("instrumentEditor.reset")}</button>
                      <span
                        className="mini-info"
                        title={msg("instrumentEditor.theDraftDiffersFromTheCurrentWaveform94")}
                      >
                        {msg("instrumentEditor.draftNotApplied")}</span>
                    </>
                  )}
                </div>

                <div className="we-partials" data-ob="we-partials">
                  <div className="partial-row head" aria-hidden="true">
                    <span />
                    <span className="ph-cap">{msg("instrumentEditor.ratio")}</span>
                    <span className="ph-cap">{msg("instrumentEditor.level")}</span>
                    <span className="ph-cap">{msg("instrumentEditor.shape")}</span>
                    <span className="ph-cap">{msg("instrumentEditor.tailS")}</span>
                    <span className="ph-cap">{msg("instrumentEditor.route")}</span>
                  </div>
                  {wave.partials.map((p, i) => (
                    <div
                      className={'partial-row' + (p.mod !== undefined ? ' mod-row' : '')}
                      key={i}
                    >
                      <button
                        className="remove"
                        title={
                          p.mod !== undefined
                            ? msg("instrumentEditor.removeThisRowAndItsModulators")
                            : msg("instrumentEditor.removeRow")
                        }
                        data-help="operator-delete" onClick={() => removePartial(i)}
                      >
                        ×
                      </button>
                      <label data-help="operator-ratio" title={msg("instrumentEditor.frequencyRatioToTheNote2Is")}>
                        ×
                        <NumField
                          value={Math.round(p.ratio * 100) / 100} min={0.25} max={64} step={0.25} narrow
                          onChange={(v) => setPartial(i, { ratio: Math.round(v * 100) / 100 })}
                        />
                      </label>
                      {p.mod === undefined ? (
                        <label data-help="operator-level" title={msg("instrumentEditor.operatorLevelInTheSum")}>
                          <NumField
                            value={Math.round(p.amp * 100)} min={0} max={100} step={5} narrow
                            onChange={(v) => setPartial(i, { amp: v / 100 })}
                          />%
                        </label>
                      ) : (
                        <label data-help="operator-level" title={msg("instrumentEditor.fmIndexTargetFrequencyDeviationIndexNote")}>
                          <NumField
                            value={Math.round(p.amp * 10) / 10} min={0} max={24} step={0.1} narrow
                            onChange={(v) => setPartial(i, { amp: v })}
                          />
                        </label>
                      )}
                      <select
                        value={p.type}
                        data-help="operator-shape" title={msg("instrumentEditor.operatorWaveform")}
                        onChange={(e) => setPartial(i, { type: e.target.value as WavePartial['type'] })}
                      >
                        {(Object.keys(PARTIAL_TYPE_LABELS) as WavePartial['type'][]).map((t) => (
                          <option key={t} value={t}>{PARTIAL_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <label title={msg("instrumentEditor.operatorTailT60DecaysIndependentlyAndMay")}>
                        <NumField help="operator-tail"
                          value={p.decay ?? 0} min={0} max={8} step={0.05} narrow
                          onChange={(v) => setPartial(i, v <= 0.001 ? { decay: undefined } : { decay: v })}
                        />
                      </label>
                      <select
                        value={p.mod === undefined ? 'sum' : String(p.mod)}
                        data-help="operator-route" title={msg("instrumentEditor.routeToTheOutputSumOrModulate")}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPartial(i, v === 'sum' ? { mod: undefined } : { mod: Number(v) });
                        }}
                      >
                        <option value="sum">{msg("instrumentEditor.toOutput")}</option>
                        {wave.partials.map((q, j) =>
                          j !== i ? (
                            <option key={j} value={j} disabled={!canRouteWave(wave.partials, i, j)}>
                              {msg("instrumentEditor.mod")}{Math.round(q.ratio * 100) / 100}
                            </option>
                          ) : null,
                        )}
                      </select>
                    </div>
                  ))}
                  <div className="we-row">
                    <button data-help="operator-add" onClick={addPartial} title={msg("instrumentEditor.addAnOperatorRow")}>{msg("instrumentEditor.operator")}</button>
                    {hasNoise && (
                      <label title={msg("instrumentEditor.noiseGrainSizeMs10ForDust")}>
                        {msg("instrumentEditor.noiseGrainMs")}<NumField
                          value={Math.round(wave.noiseGrainMs ?? 40)} min={5} max={500} step={5}
                          onChange={(v) => setDraft({ ...wave, noiseGrainMs: Math.round(v) })}
                        />
                      </label>
                    )}
                    <span className="mini-info">{wave.partials.length}{msg("instrumentEditor.64Operators")}</span>
                  </div>
                </div>
              </div>

              {/* Правая панель: слои тембра, не привязанные к строкам. */}
              <div className="we-layers" data-ob="we-layers">
                <div className="group sub" data-ob="unison-group">
                  <span className="sub-cap">{msg("instrumentEditor.unison")}</span>
                  {isSample && !scratchMode && (
                    <span
                      className="scope-cap"
                      title={msg("instrumentEditor.sampleUnisonDetunedPlaybackCopiesForA")}
                    >
                      {msg("instrumentEditor.sample")}</span>
                  )}
                  {scratchMode && (
                    <span className="scope-cap" title={msg("instrumentEditor.scratchPlaybackFollowsTheNeedleGestureAnd")}>
                      {msg("instrumentEditor.scratch")}</span>
                  )}
                  <span className={'knob-row' + (scratchMode ? ' dim' : '')}>
                    <Knob help="instrument.unisonVoices"
                      label={msg("instrumentEditor.voices")}
                      title={msg("instrumentEditor.detunedCopiesPerNote1IsA")}
                      value={st.unisonVoices ?? 1} min={1} max={8} step={1}
                      onChange={(unisonVoices) => onChangeInst({ unisonVoices })}
                    />
                    <Knob help="instrument.unisonDetune"
                      label={msg("instrumentEditor.detune")}
                      title={msg("instrumentEditor.detuneOfTheOutermostUnisonVoiceIn")}
                      value={st.unisonDetune ?? 12} min={0} max={50} step={1}
                      onChange={(unisonDetune) => onChangeInst({ unisonDetune })}
                    />
                    <Knob help="instrument.unisonSpread"
                      label={msg("instrumentEditor.width")}
                      title={msg("instrumentEditor.stereoSpreadOfUnisonVoices0Places")}
                      value={Math.round((st.unisonSpread ?? 0) * 100)} min={0} max={100} step={5}
                      onChange={(v) => onChangeInst({ unisonSpread: v / 100 })}
                    />
                  </span>
                </div>
                <div className="group sub knob-row">
                  <span className="sub-cap">{msg("instrumentEditor.vibrato")}</span>
                  <Knob help="instrument.vibratoRate"
                    label={msg("instrumentEditor.rate")}
                    title={msg("instrumentEditor.pitchOscillationRateHzTry56")}
                    value={st.vibratoRate ?? 5} min={0.1} max={30} step={0.1}
                    onChange={(vibratoRate) => onChangeInst({ vibratoRate })}
                  />
                  <Knob help="instrument.vibratoDepth"
                    label={msg("instrumentEditor.depth")}
                    title={msg("instrumentEditor.vibratoDepthInCents100CentsIs")}
                    value={st.vibratoDepth ?? 0} min={0} max={1200} step={5}
                    onChange={(vibratoDepth) => onChangeInst({ vibratoDepth })}
                  />
                  <Knob help="instrument.vibratoDelay"
                    label={msg("instrumentEditor.fadeIn")}
                    title={msg("instrumentEditor.vibratoDepthGraduallyRisesFromZeroOver")}
                    value={st.vibratoDelay ?? 0} min={0} max={2} step={0.05}
                    onChange={(vibratoDelay) => onChangeInst({ vibratoDelay })}
                  />
                </div>
                <div className="group sub" data-ob="formant-group">
                  <span className="sub-cap">{msg("instrumentEditor.formants")}</span>
                  <span
                    className="mini-info"
                    title={msg("instrumentEditor.resonantSpectralRegionsAtFixedFrequenciesAdd")}
                  >
                    {msg("instrumentEditor.frequenciesHz")}</span>
                  {(st.formants ?? []).map((b, i) => (
                    <div className="formant-row" key={i}>
                      <button
                        className="remove"
                        data-help="formant-delete" title={msg("instrumentEditor.removeFormant")}
                        onClick={() =>
                          onChangeInst({ formants: (st.formants ?? []).filter((_, j) => j !== i) })
                        }
                      >
                        ×
                      </button>
                      <label data-help="formant-frequency" title={msg("instrumentEditor.formantFrequencyHz")}>
                        <NumField help="formant-frequency"
                          value={Math.round(b.freq)} min={80} max={9000} step={10} narrow
                          onChange={(freq) =>
                            onChangeInst({
                              formants: (st.formants ?? []).map((x, j) => (j === i ? { ...x, freq } : x)),
                            })
                          }
                        />
                      </label>
                      <label data-help="formant-gain" title={msg("instrumentEditor.formantLevel")}>
                        <NumField
                          value={Math.round(b.gain * 100) / 100} min={0} max={2} step={0.05} narrow
                          onChange={(gain) =>
                            onChangeInst({
                              formants: (st.formants ?? []).map((x, j) => (j === i ? { ...x, gain } : x)),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  {(st.formants ?? []).length < 5 && (
                    <button
                      data-help="formant-add" title={msg("instrumentEditor.addAFormantPeakTheVocalRecipe")}
                      onClick={() => onChangeInst({ formants: [...(st.formants ?? []), { freq: 800, gain: 1 }] })}
                    >
                      {msg("instrumentEditor.formant")}</button>
                  )}
                </div>
                <div className="group sub" data-ob="recipe-pick">
                  <span className="sub-cap">{msg("instrumentEditor.waveformRecipe")}</span>
                  <select
                    value=""
                    title={msg("instrumentEditor.buildADraftOperatorSetupFromA")}
                    onChange={(e) => {
                      const id = e.target.value as RecipeId;
                      if (!id) return;
                      const r = recipe(id);
                      pointsRef.current = null;
                      setPoints(null);
                      setDraft(r.wave);
                      if (r.formants) onChangeInst({ formants: r.formants });
                      if (r.unison) {
                        onChangeInst({
                          unisonVoices: r.unison.voices,
                          unisonDetune: r.unison.detune,
                        });
                      }
                    }}
                  >
                    <option value="">{msg("instrumentEditor.choose")}</option>
                    {(Object.keys(RECIPE_LABELS) as RecipeId[]).map((id) => (
                      <option key={id} value={id}>{RECIPE_LABELS[id]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {isSample && sampleError && <div role="alert" className="sample-load-error">
            {msg("instrumentEditor.couldNotLoadSample")}{sampleError} <button onClick={() => setSampleRetry(v => v + 1)}>{msg("instrumentEditor.retry")}</button>
          </div>}
          {isSample && (!inst.sampleId || !buffer ? (
            <p className="empty">
              {inst.sampleId
                ? sampleError ? msg("instrumentEditor.waveformUnavailable") : msg("instrumentEditor.loadingSample")
                : inst.sampleZones?.length ? msg("instrumentEditor.noMainSampleSelectedNotesWithinConfigured") : msg("instrumentEditor.noMainSampleSelectedChooseOneFrom")}
            </p>
          ) : (
            <>
              <div data-ob="we-canvas">
                <WaveCanvas
                  data={mono}
                  sampleRate={buffer.sampleRate}
                  sel={sel}
                  onSel={(a, b) => setSel([a, b])}
                  region={
                    inst.sampleStart !== undefined || inst.sampleEnd !== undefined
                      ? [regStart / dur, regEnd / dur]
                      : null
                  }
                />
              </div>
              <div className="we-row">
                <button
                  disabled={!selSec}
                  title={msg("instrumentEditor.auditionTheSelectedRegion")}
                  onClick={() => selSec && onPreviewRegion(inst, selSec[0], selSec[1])}
                >
                  {msg("instrumentEditor.selection")}</button>
                <button
                  disabled={!selSec}
                  title={msg("instrumentEditor.notesAndScratchGesturesWillPlayOnly")}
                  onClick={() =>
                    selSec &&
                    onChangeInst({
                      sampleStart: +selSec[0].toFixed(4),
                      sampleEnd: +selSec[1].toFixed(4),
                    })
                  }
                >
                  {msg("instrumentEditor.useRegion")}</button>
                <button
                  disabled={inst.sampleStart === undefined && inst.sampleEnd === undefined}
                  title={msg("instrumentEditor.clearTheTrimAndPlayTheWhole")}
                  onClick={() => onChangeInst({ sampleStart: undefined, sampleEnd: undefined })}
                >
                  {msg("instrumentEditor.reset156")}</button>
                <span className="we-sep" />
                <label title={msg("instrumentEditor.regionStartS")}>
                  {msg("instrumentEditor.start")}<NumField help="instrument.sampleStart"
                    value={Math.round(regStart * 1000) / 1000} min={0} max={Math.max(0.001, dur - 0.001)} step={0.01} narrow
                    onChange={(v) => onChangeInst({ sampleStart: +v.toFixed(4) })}
                  />
                </label>
                <label title={msg("instrumentEditor.regionEndS")}>
                  {msg("instrumentEditor.end")}<NumField help="instrument.sampleEnd"
                    value={Math.round(regEnd * 1000) / 1000} min={0.001} max={dur} step={0.01} narrow
                    onChange={(v) => onChangeInst({ sampleEnd: +v.toFixed(4) })}
                  />
                </label>
                {selSec && (
                  <span className="mini-info">
                    {msg("instrumentEditor.selected")}{(selSec[1] - selSec[0]).toFixed(2)} {msg("instrumentEditor.s")}{selSec[0].toFixed(2)}–{selSec[1].toFixed(2)})
                  </span>
                )}
              </div>
              <div className="we-row" data-ob="we-fft">
                <button
                  title={msg("instrumentEditor.analyzeTheRegionSAverageSpectrumAnd")}
                  onClick={decompose}
                >
                  {msg("instrumentEditor.sampleWaveform")}</button>
                <label title={msg("instrumentEditor.maximumHarmonicCountMoreHarmonicsCanDescribe")}>
                  {msg("instrumentEditor.harmonics")}<NumField
                    value={fftK} min={8} max={256} step={8} narrow
                    onChange={(v) => setFftK(Math.round(v))}
                  />
                </label>
                <label title={msg("instrumentEditor.fundamentalFrequencyHz0UsesAutomaticDetection")}>
                  {msg("instrumentEditor.f0Hz")}<NumField
                    value={Math.round(f0Manual)} min={0} max={2000} step={5} narrow
                    onChange={(v) => setF0Manual(v)}
                  />
                </label>
              </div>
              {!layerSource && <div className="we-row ai-transform">
                <input
                  className="gen-prompt"
                  placeholder={msg("instrumentEditor.describeAChangeDarkerWithReverbSlower")}
                  title={msg("instrumentEditor.aiSampleTransformationAudioToAudioFal")}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) onTransformSample(track.id, aiPrompt.trim(), aiStrength, aiDuration);
                  }}
                />
                <label title={msg("instrumentEditor.transformationStrengthLowValuesFavorSubtleChanges")}>
                  {msg("instrumentEditor.strength")}<NumField
                    value={Math.round(aiStrength * 100)} min={5} max={100} step={5} narrow
                    onChange={(v) => setAiStrength(v / 100)}
                  />%
                </label>
                <button
                  disabled={!aiPrompt.trim() || busy}
                  onClick={() => onTransformSample(track.id, aiPrompt.trim(), aiStrength, aiDuration)}
                >
                  {busy ? msg("instrumentEditor.transforming") : msg("instrumentEditor.transform")}
                </button>
              </div>}
            </>
          ))}

          {isSample && (
            <div className="inline sampler-tuning">
              <label title={msg("instrumentEditor.pitchTrackRootFrequencyTuningRatioWhen")}>
                <input type="checkbox" checked={inst.keyTracking ?? false}
                  onChange={(e) => onChangeInst({ keyTracking: e.target.checked })} />
                {msg("instrumentEditor.pitchedSample")}</label>
              <label title={msg("instrumentEditor.fundamentalFrequencyOfTheRecordingUsedFor")}>
                {msg("instrumentEditor.sampleRootHz")}<NumField help="instrument.rootHz" value={inst.rootHz ?? 440} {...parameterRange('instrument.rootHz')}
                  onChange={(rootHz) => onChangeInst({ rootHz })} />
              </label>
            </div>
          )}
          {isSample && (
            <label title={msg("instrumentEditor.directPlaysTheRecordingAtTheNote")} data-ob="sample-mode">
              {msg("instrumentEditor.mode")}<select
                value={st.sampleMode ?? 'plain'}
                onChange={(e) => onChangeInst({ sampleMode: e.target.value as Instrument['sampleMode'] })}
              >
                <option value="plain">{msg("instrumentEditor.direct")}</option>
                <option value="grain">{msg("instrumentEditor.granular")}</option>
                <option value="scratch">{msg("instrumentEditor.scratch")}</option>
              </select>
            </label>
          )}
          {isSample && <SampleZoneEditor key={inst.sampleId ?? 'empty'} zones={inst.sampleZones} onChange={(sampleZones) => onChangeInst({sampleZones})} />}
          {isSample && <SampleSliceEditor inst={inst} duration={buffer?.duration ?? 0} selection={buffer ? selSec : null} onChange={(sampleSlices, command) => onChangeInst({ sampleSlices }, command)} onPreview={onPreviewRegion} onCreatePattern={onSlicePattern} canCreatePattern={!layerSource && track.patterns.length < 128} hidePatternAction={layerSource} />}
          {isSample && (st.sampleMode ?? 'plain') === 'plain' && (
            <div className="inline sampler-tuning">
              <label><input data-help="sample-reverse" type="checkbox" checked={inst.sampleReverse ?? false}
                onChange={(e) => onChangeInst({ sampleReverse: e.target.checked })} />{msg("instrumentEditor.reverseRegion")}</label>
              <label><input data-help="sample-loop" type="checkbox" checked={inst.sampleLoop ?? false}
                onChange={(e) => onChangeInst({ sampleLoop: e.target.checked })} />{msg("instrumentEditor.loopForNoteDuration")}</label>
              {inst.sampleLoop && <label title={msg("instrumentEditor.loopCrossfadeLimitedToHalfTheRegion")}>
                {msg("instrumentEditor.crossfadeMs")}<NumField help="instrument.loopCrossfadeMs" value={inst.loopCrossfadeMs ?? 10} {...parameterRange('instrument.loopCrossfadeMs')}
                  onChange={(loopCrossfadeMs) => onChangeInst({ loopCrossfadeMs })} />
              </label>}
            </div>
          )}
          {isSample && (st.sampleMode ?? 'plain') === 'grain' && (
            <>
              <span className="inline grain-presets">
                <button
                  title={msg("instrumentEditor.shortGrainsManyOverlapsAndWidePosition")}
                  onClick={() => onChangeInst({ grainSizeMs: 20, grainCount: 24, grainScatter: 0.6 })}
                >
                  {msg("instrumentEditor.dust")}</button>
                <button
                  title={msg("instrumentEditor.mediumGrainsAndADenseStreamFor")}
                  onClick={() => onChangeInst({ grainSizeMs: 180, grainCount: 12, grainScatter: 0.25 })}
                >
                  {msg("instrumentEditor.cloud")}</button>
                <button
                  title={msg("instrumentEditor.longGrainsFewerOverlapsAndAFixed")}
                  onClick={() => onChangeInst({ grainSizeMs: 400, grainCount: 4, grainScatter: 0.05 })}
                >
                  {msg("instrumentEditor.tape")}</button>
              </span>
              <label title={msg("instrumentEditor.grainDurationMsShortGrainsFragmentThe")}>
                {msg("instrumentEditor.grainMs")}<NumField help="instrument.grainSizeMs" value={st.grainSizeMs ?? 120} min={10} max={800} step={10} onChange={(grainSizeMs) => onChangeInst({ grainSizeMs })} />
              </label>
              <label title={msg("instrumentEditor.grainsEmittedPerNoteLowValuesCreate")}>
                {msg("instrumentEditor.grainsPerNote")}<NumField help="instrument.grainCount" value={st.grainCount ?? 10} min={1} max={32} onChange={(grainCount) => onChangeInst({ grainCount: Math.round(grainCount) })} />
              </label>
              <label title={msg("instrumentEditor.grainPositionInTheSample0Is")}>
                {msg("instrumentEditor.position")}<NumField help="instrument.grainPos" value={Math.round((st.grainPos ?? 0.3) * 100)} min={0} max={100} step={1} onChange={(v) => onChangeInst({ grainPos: v / 100 })} />
              </label>
              <label title={msg("instrumentEditor.spreadOfGrainPositionsAroundTheSelected")}>
                {msg("instrumentEditor.spread")}<NumField help="instrument.grainScatter" value={Math.round((st.grainScatter ?? 0.15) * 100)} min={0} max={100} step={1} onChange={(v) => onChangeInst({ grainScatter: v / 100 })} />
              </label>
            </>
          )}

          {isSample && !layerSource && (
            <div className="gen-bar" data-ob="gen-bar">
              <label
                className="gen-label"
                title={msg("instrumentEditor.describeASoundAndAIGeneratesA")}
              >
                {msg("instrumentEditor.description")}<input
                  className="gen-prompt"
                  placeholder={msg("instrumentEditor.eGADeepEarthyBassHit")}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && prompt.trim()) onGenerateSample(track.id, prompt.trim(), genSeconds);
                  }}
                />
              </label>
              <label title={msg("instrumentEditor.sampleDurationInSeconds")}>
                {msg("instrumentEditor.s206")}<NumField
                  value={genSeconds} min={0.5} max={20} step={0.5}
                  onChange={(v) => setGenSeconds(v)}
                />
              </label>
              <button
                disabled={busy || !prompt.trim()}
                title={msg("instrumentEditor.generateAndAssignToTheSlotEnter")}
                onClick={() => onGenerateSample(track.id, prompt.trim(), genSeconds)}
              >
                {busy ? msg("instrumentEditor.generating") : msg("instrumentEditor.generate")}
              </button>
              {st.sampleName && !busy && (
                <span className="mini-info" title={msg("instrumentEditor.currentSample")}>{msg("instrumentEditor.inSlot")}{st.sampleName}</span>
              )}
              <HelpHint guide="samples" step={3} scope={scope} label={msg("instrumentEditor.guideGenerateASample")} />
            </div>
          )}

          {scratchMode && (
            <div className={'scratch-bar' + (scratchArmed || scratchLive ? ' recording' : '')} data-ob="scratch-bar">
              <div className="scratch-actions">
                {!layerSource && <button
                  className={scratchArmed || scratchLive ? 'on' : ''}
                  data-ob="scratch-rec"
                  title={msg("instrumentEditor.pressAndDragAcrossThePadTo")}
                  onClick={() => setScratchArmed((v) => !v)}
                >
                  {scratchArmed || scratchLive ? msg("instrumentEditor.dragAcrossThePad") : msg("instrumentEditor.recordGesture")}
                </button>}
                {(st.scratchPoints ?? []).length > 0 && (
                  <button
                    title={msg("instrumentEditor.clearTheGestureWithoutChangingTheSample")}
                    onClick={() => onChangeInst({ scratchPoints: [] })}
                  >
                    {msg("instrumentEditor.clearGesture")}</button>
                )}
                <button
                  className={scratchPlaying ? 'on' : ''}
                  data-ob="scratch-play"
                  title={msg("instrumentEditor.auditionTheGestureAsASingleNote")}
                  onClick={() => {
                    onScratchPreview();
                    setScratchPlaying(true);
                    window.setTimeout(() => setScratchPlaying(false), (noteSec + 0.15) * 1000);
                  }}
                >
                  {scratchPlaying ? msg("instrumentEditor.playing") : msg("instrumentEditor.audition220")}
                </button>
                {!layerSource && <button
                  disabled={scratchSaving}
                  data-ob="scratch-save"
                  title={msg("instrumentEditor.nameAndRenderTheGestureAsA")}
                  onClick={() => {
                    setScratchName(msg("instrumentEditor.scratch222", {p0: track.name}));
                    setScratchNaming(true);
                  }}
                >
                  {scratchSaving ? msg("instrumentEditor.rendering") : msg("instrumentEditor.renderToSample")}
                </button>}
                {scratchNaming && !scratchSaving && (
                  <>
                    <input
                      className="scratch-name"
                      data-ob="scratch-name"
                      autoFocus
                      value={scratchName}
                      spellCheck={false}
                      title={msg("instrumentEditor.nameUsedInTheSampleLibraryAnd")}
                      onChange={(e) => setScratchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveScratchNamed();
                        if (e.key === 'Escape') setScratchNaming(false);
                      }}
                    />
                    <button
                      className="scratch-ok"
                      title={msg("instrumentEditor.saveTheGestureToTheLibraryWith")}
                      onClick={saveScratchNamed}
                    >
                      {msg("instrumentEditor.ok")}</button>
                    <button
                      className="scratch-cancel"
                      title={msg("instrumentEditor.cancelWithoutSavingTheGesture")}
                      onClick={() => setScratchNaming(false)}
                    >
                      ×
                    </button>
                  </>
                )}
                {scratchSavedTick && (
                  <span className="scratch-saved" title={msg("instrumentEditor.gestureSavedToTheSampleLibrary")}>
                    ✓
                  </span>
                )}
                <HelpHint guide="scratch" scope={scope} label={msg("instrumentEditor.guideScratchGestures")} />
                <span
                  className="mini-info"
                  title={msg("instrumentEditor.theGestureFollowsTheNoteDurationSet")}
                >
                  {msg("instrumentEditor.gesture")}{noteSec.toFixed(2)} {msg("instrumentEditor.s233")}</span>
              </div>
              <div className="scratch-row">
                <div
                  className="scratch-side"
                  title={msg("instrumentEditor.dragTheUpperOrLowerBoundaryTo")}
                >
                  <svg
                    className="scratch-map"
                    viewBox="0 0 10 100"
                    preserveAspectRatio="none"
                    onPointerDown={(e) => {
                      if (!scratchMap || e.button !== 0) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const pos = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
                      const durS = scratchMap.duration;
                      const rs = st.sampleStart ?? 0;
                      const re = st.sampleEnd ?? durS;
                      const edge =
                        Math.abs(pos - re / durS) < 0.06
                          ? 'end'
                          : Math.abs(pos - rs / durS) < 0.06
                            ? 'start'
                            : null;
                      if (!edge) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      (e.currentTarget as unknown as HTMLElement).dataset.edge = edge;
                    }}
                    onPointerMove={(e) => {
                      const edge = (e.currentTarget as unknown as HTMLElement).dataset.edge;
                      if (!edge || !scratchMap) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const pos = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
                      const durS = scratchMap.duration;
                      const rs = st.sampleStart ?? 0;
                      const re = st.sampleEnd ?? durS;
                      if (edge === 'end')
                        onChangeInst({ sampleEnd: clampSec(Math.max(rs + 0.01, pos * durS), 0.001, durS) });
                      else
                        onChangeInst({ sampleStart: clampSec(Math.min(re - 0.01, pos * durS), 0, durS) });
                    }}
                    onPointerUp={(e) => {
                      delete (e.currentTarget as unknown as HTMLElement).dataset.edge;
                    }}
                  >
                    {(scratchMap?.peaks ?? []).map((pk, i) => {
                      const y = 100 - ((i + 0.5) * 100) / 64;
                      const h = pk * 100;
                      return (
                        <rect
                          key={i}
                          x={1}
                          y={y - h / 2}
                          width={8}
                          height={Math.max(0.4, h)}
                          fill="var(--text-dim)"
                          opacity={0.55}
                        />
                      );
                    })}
                    {scratchMap &&
                      (() => {
                        const durS = scratchMap.duration;
                        const rsY = (1 - (st.sampleStart ?? 0) / durS) * 100;
                        const reY = (1 - Math.min(st.sampleEnd ?? durS, durS) / durS) * 100;
                        return (
                          <>
                            <rect x={0} y={0} width={10} height={Math.max(0, reY)} className="region-dim" />
                            <rect x={0} y={rsY} width={10} height={Math.max(0, 100 - rsY)} className="region-dim" />
                            <line x1={0} y1={reY} x2={10} y2={reY} className="region-line" />
                            <line x1={0} y1={rsY} x2={10} y2={rsY} className="region-line" />
                          </>
                        );
                      })()}
                  </svg>
                </div>
                <div className="scratch-main">
                  <div
                    className="scratch-track"
                    ref={scratchRef}
                    data-ob="scratch-pad"
                    title={msg("instrumentEditor.clickToAddANeedlePositionPoint")}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      const el = scratchRef.current;
                      if (!el) return;
                      const r = el.getBoundingClientRect();
                      const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                      const pos = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
                      const pts = st.scratchPoints ?? [];
                      const hit = pts.findIndex(
                        (pt) => Math.abs(pt.t - t) < 0.03 && Math.abs(pt.pos - pos) < 0.07,
                      );
                      e.currentTarget.setPointerCapture(e.pointerId);
                      downXY.current = { x: e.clientX, y: e.clientY };
                      if (hit >= 0) {
                        dragIdx.current = hit;
                        setDragPts([...pts]);
                      } else if (scratchArmed) {
                        setScratchLive(true);
                        scratchRec.current = { t0: performance.now(), pts: [{ dt: 0, pos }] };
                        onScratchBegin(pos);
                      } else {
                        pendingAdd.current = { t, pos };
                      }
                    }}
                    onPointerMove={(e) => {
                      const el = scratchRef.current;
                      if (!el) return;
                      const r = el.getBoundingClientRect();
                      const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                      const pos = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
                      if (dragIdx.current !== null && dragPts) {
                        setDragPts(dragPts.map((pt, i) => (i === dragIdx.current ? { t, pos } : pt)));
                        return;
                      }
                      const rec = scratchRec.current;
                      if (rec) {
                        onScratchMove(pos);
                        rec.pts.push({ dt: performance.now() - rec.t0, pos });
                        return;
                      }
                      const down = downXY.current;
                      if (down && pendingAdd.current) {
                        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
                          pendingAdd.current = null;
                        }
                      }
                    }}
                    onPointerUp={() => {
                      downXY.current = null;
                      if (dragIdx.current !== null && dragPts) {
                        const sorted = [...dragPts].sort((a, b) => a.t - b.t);
                        dragIdx.current = null;
                        setDragPts(null);
                        onChangeInst({ scratchPoints: sorted });
                        return;
                      }
                      const rec = scratchRec.current;
                      scratchRec.current = null;
                      if (rec) {
                        onScratchEnd();
                        setScratchLive(false);
                        setScratchArmed(false);
                        if (rec.pts.length >= 2) {
                          const durMs = Math.max(1, rec.pts[rec.pts.length - 1].dt);
                          const N = 48;
                          const raw = rec.pts;
                          const res: { t: number; pos: number }[] = [];
                          let j = 0;
                          for (let i = 0; i <= N; i++) {
                            const tt = (i / N) * durMs;
                            while (j < raw.length - 2 && raw[j + 1].dt < tt) j++;
                            const a1 = raw[j];
                            const a2 = raw[j + 1] ?? a1;
                            const f = a2.dt > a1.dt ? (tt - a1.dt) / (a2.dt - a1.dt) : 0;
                            res.push({
                              t: i / N,
                              pos: a1.pos + (a2.pos - a1.pos) * Math.max(0, Math.min(1, f)),
                            });
                          }
                          const smooth = res.map((x, i) => {
                            let sum = 0;
                            let c = 0;
                            for (let k = i - 1; k <= i + 1; k++) {
                              const y = res[Math.min(res.length - 1, Math.max(0, k))];
                              sum += y.pos;
                              c++;
                            }
                            return { t: x.t, pos: sum / c };
                          });
                          onChangeInst({ scratchPoints: smooth });
                        }
                        return;
                      }
                      const pending = pendingAdd.current;
                      pendingAdd.current = null;
                      if (pending) {
                        onChangeInst({
                          scratchPoints: [...(st.scratchPoints ?? []), pending].sort(
                            (a, b) => a.t - b.t,
                          ),
                        });
                      }
                    }}
                  >
                    <svg className="scratch-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polyline
                        fill="none"
                        stroke="var(--accent-2)"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                        points={(dragPts ?? st.scratchPoints ?? [])
                          .map((pt) => `${(pt.t * 100).toFixed(2)},${((1 - pt.pos) * 100).toFixed(2)}`)
                          .join(' ')}
                      />
                    </svg>
                    {(dragPts ?? st.scratchPoints ?? []).map((pt, i) => (
                      <span
                        key={i}
                        className="scratch-dot"
                        style={{ left: `${pt.t * 100}%`, top: `${(1 - pt.pos) * 100}%` }}
                        title={msg("instrumentEditor.positionTimeOfNoteDragToEdit", {p0: Math.round(pt.pos * 100), p1: Math.round(pt.t * 100)})}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onChangeInst({ scratchPoints: (st.scratchPoints ?? []).filter((_, j) => j !== i) });
                        }}
                      />
                    ))}
                    {(scratchArmed || scratchLive) && (
                      <span className="scratch-hint">{msg("instrumentEditor.recordingDragAcrossThePad")}</span>
                    )}
                    {(st.scratchPoints ?? []).length === 0 && !dragPts && !scratchArmed && (
                      <span className="scratch-hint" data-help="scratch-pad" title={msg("instrumentEditor.clickToAddAPointMultiplePoints")}>{msg("instrumentEditor.noGesture")}</span>
                    )}
                  </div>
                  <span className="scratch-axis">{msg("instrumentEditor.noteTime")}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'env' && (
        <div className="we-body">
          <div className="env-tab" data-ob="env-tab">
            <div className="mseg-targets" data-help="mseg-target">
              {(['amp', 'pitch', 'filter'] as const).map(target => <button key={target} aria-pressed={envelopeTarget === target} onClick={() => setEnvelopeTarget(target)}>{({amp:msg("instrumentEditor.amplitude"),pitch:msg("instrumentEditor.pitch"),filter:msg("instrumentEditor.localFilter")})[target]}{(target === 'pitch' ? st.pitchMseg : target === 'filter' ? st.filterMseg : st.ampMseg) ? ' ·' : ''}</button>)}
              <button onClick={() => onPreviewNote(inst)} data-help="mseg-listen">{msg("instrumentEditor.audition244")}</button>
            </div>
            {envelopeTarget !== 'amp' ? <ControlEnvelopeEditor key={envelopeTarget} target={envelopeTarget} inst={inst} onChange={onChangeInst} /> : <>

            <div className="mseg-toolbar" data-ob="envelope-mode"><span>{msg("instrumentEditor.noteAmplitude")}</span><select aria-label={msg("instrumentEditor.envelopeMode")} value={st.ampMseg ? 'points' : 'classic'} onChange={e => onChangeInst({ ampMseg: e.target.value === 'points' ? { seconds: .5, points: structuredClone(MSEG_SHAPES['удар']) } : undefined })}><option value="classic">{msg("instrumentEditor.attackHoldDecay")}</option><option value="points">{msg("instrumentEditor.breakpointsMSEG")}</option></select></div>
            {st.ampMseg ? <MsegEditor value={st.ampMseg} onChange={(ampMseg, command) => onChangeInst({ ampMseg }, command)} /> : <>
            <span className="sub-cap" data-help="tab-env" title={msg("instrumentEditor.amplitudeAndPitchDropOnOneTimeline")}>{msg("instrumentEditor.noteShape")}</span>
            <NoteGraph
              attack={st.attack}
              decay={st.decay}
              sustain={st.sustain ?? 0}
              pitchDrop={st.pitchDrop}
              pitchTime={st.pitchTime}
              voiceLen={noteSec}
              stepSec={tickDuration(bpm) * (pattern.rate ?? track.rate)}
              steps={st.noteSteps && st.noteSteps > 0 ? st.noteSteps : null}
              onEdit={(u) => onChangeInst(u)}
              onPitch={(u) => onChangeInst(u)}
              decayEditable={!st.noteSteps}
            />
            <div className="env-fields">
              <Knob help="instrument.attack"
                label={msg("instrumentEditor.attackMs")}
                title={msg("instrumentEditor.timeForAmplitudeToRiseToIts")}
                value={Math.round(Math.max(st.attack, 0.0005) * 1000)} min={0} max={500} step={1}
                onChange={(ms) => onChangeInst({ attack: Math.max(0.0005, ms / 1000) })}
              />
              <Knob help="instrument.sustain"
                label={msg("instrumentEditor.hold")}
                title={msg("instrumentEditor.proportionOfTimeAfterTheAttackHeld")}
                value={Math.round((st.sustain ?? 0) * 100)} min={0} max={100} step={5}
                onChange={(v) => onChangeInst({ sustain: v / 100 })}
              />
              <Knob help="instrument.decay"
                label={msg("instrumentEditor.decayS")}
                title={
                  st.waveform === 'sample'
                    ? msg("instrumentEditor.fadeOutTimeAfterThePeakHold")
                    : msg("instrumentEditor.fadeOutTimeAfterThePeakHold258")
                }
                value={st.decay} min={0.01} max={4} step={0.01}
                onChange={(decay) => onChangeInst({ decay })}
              />
            </div></>}
            <div className="env-fields">
              <Knob help="instrument.pitchDrop"
                label={msg("instrumentEditor.pitchDrop")}
                title={msg("instrumentEditor.theNoteStartsAtThisMultipleOf")}
                value={st.pitchDrop} min={1} max={16} step={0.5}
                onChange={(pitchDrop) => onChangeInst({ pitchDrop })}
              />
              <Knob help="instrument.pitchTime"
                label={msg("instrumentEditor.dropTimeS")}
                title={msg("instrumentEditor.timeForPitchToFallToIts")}
                value={st.pitchTime} min={0} max={2} step={0.01}
                onChange={(pitchTime) => onChangeInst({ pitchTime })}
              />
              <button
                className="env-listen"
                title={msg("instrumentEditor.auditionTheNoteWithThisEnvelopeFiltering")}
                onClick={() => onPreviewNote(inst)}
              >
                {msg("instrumentEditor.audition264")}</button>
            </div>
            </>}
          </div>
        </div>
      )}

      {tab === 'timbre' && (
        <div className="we-body">
          <div className="group sub" data-ob="voice-color">
                <span className="sub-cap" title={msg("instrumentEditor.voiceColorationBeforeTrackEffects")}>{msg("instrumentEditor.voiceColor")}</span>
            <div className="mseg-toolbar">
              <label>ring, % <NumField help="instrument.ringMix" ariaLabel={msg("instrumentEditor.ringModulationMix")} value={(inst.ringMix ?? 0) * 100} min={0} max={100} step={1} onChange={v => onChangeInst({ ringMix: v / 100 })} /></label>
              <label>{msg("instrumentEditor.frequency")}<NumField help="instrument.ringRatio" ariaLabel={msg("instrumentEditor.ringModulationFrequencyRatio")} value={inst.ringRatio ?? 1} min={.125} max={16} step={.01} onChange={ringRatio => onChangeInst({ ringRatio })} /></label>
              <label>wavefold <NumField help="instrument.foldDrive" ariaLabel="Wavefold" value={inst.foldDrive ?? 0} min={0} max={8} step={.1} onChange={foldDrive => onChangeInst({ foldDrive })} /></label>
              <select data-help="wave-quality" aria-label={msg("instrumentEditor.wavefolderOversampling")} value={inst.synthQuality ?? '4x'} onChange={e => onChangeInst({ synthQuality: e.target.value as '2x' | '4x' })}><option value="4x">{msg("instrumentEditor.quality4")}</option><option value="2x">{msg("instrumentEditor.economy2")}</option></select>
            </div>
            <div className="mseg-toolbar">
              <label>comb, % <NumField help="instrument.combMix" ariaLabel={msg("instrumentEditor.combFilterMix")} value={(inst.combMix ?? 0) * 100} min={0} max={100} step={1} onChange={v => onChangeInst({ combMix: v / 100 })} /></label>
              <label>{msg("instrumentEditor.frequencyHz")}<NumField help="instrument.combHz" ariaLabel={msg("instrumentEditor.combFilterFrequencyHz")} value={inst.combHz ?? 220} min={40} max={4000} step={1} onChange={combHz => onChangeInst({ combHz })} /></label>
              <label>{msg("instrumentEditor.feedback")}<NumField help="instrument.combFeedback" ariaLabel={msg("instrumentEditor.combFilterFeedback")} value={(inst.combFeedback ?? .5) * 100} min={0} max={85} step={1} onChange={v => onChangeInst({ combFeedback: v / 100 })} /></label>
            </div>
          </div>
          {/* Вибрато и унисон переехали на «источник» (v39): это слои
              тембра рядом с таблицей операторов, а не вкладка фильтров. */}
          <div className="group sub knob-row" data-ob="timbre-tab">
            <span className="sub-cap">{msg("instrumentEditor.filters")}</span>
            {!layerSource && <Knob help="instrument.filterLow"
              label={msg("instrumentEditor.lowCut")}
              title={msg("instrumentEditor.highPassCutoffAttenuatesFrequenciesBelowThis")}
              value={st.filterLow} min={20} max={4000} step={10} log
              onChange={(filterLow) => onChangeInst({ filterLow })}
            />}
            <Knob help={layerSource ? "layer-filter-base" : "instrument.filterFreq"}
              label={layerSource ? msg("instrumentEditor.envBaseHz") : msg("instrumentEditor.highCut")}
              title={layerSource ? msg("instrumentEditor.frequencyTheLayerSFilterEnvelopeSettles") : msg("instrumentEditor.lowPassCutoffAttenuatesFrequenciesAboveThis")}
              value={st.filterFreq} min={60} max={12000} step={10} log
              onChange={(filterFreq) => onChangeInst({ filterFreq })}
            />
            {!layerSource && <Knob help="instrument.filterQ"
              label={msg("instrumentEditor.resonance")}
              title={msg("instrumentEditor.filterResonanceQEmphasizesFrequenciesNearThe")}
              value={st.filterQ ?? 0.8} min={0.5} max={20} step={0.1}
              onChange={(filterQ) => onChangeInst({ filterQ })}
            />}
            {st.filterMseg ? <button data-help="mseg-filter" onClick={() => { setEnvelopeTarget('filter'); onTab('env'); }}>{msg("instrumentEditor.filterBreakpoints")}</button> : <><Knob help="instrument.filterEnvAmount"
              label={msg("instrumentEditor.envAmount")}
              bipolar
              title={msg("instrumentEditor.filterEnvelopeStartOffsetInSemitonesFrom")}
              value={st.filterEnvAmount ?? 0} min={-24} max={24} step={0.5}
              onChange={(filterEnvAmount) => onChangeInst({ filterEnvAmount })}
            />
            <Knob help="instrument.filterEnvTime"
              label={msg("instrumentEditor.time")}
              title={msg("instrumentEditor.timeForTheFilterEnvelopeToSettle")}
              value={st.filterEnvTime ?? 0.3} min={0.05} max={2} step={0.05}
              onChange={(filterEnvTime) => onChangeInst({ filterEnvTime })}
            /></>}
          </div>
          {!layerSource && <div className="group sub" data-ob="arp-group">
            <div className="sub-head">
              <span className="sub-cap">{msg("instrumentEditor.arpeggiator")}</span>
              <span className="scope-cap" title={msg("instrumentEditor.theArpeggiatorBelongsToTheTrackAnd")}>{msg("instrumentEditor.track")}</span>
              <span className="spacer" />
              <HelpHint guide="arp" scope={scope} label={msg("instrumentEditor.guideArpeggiator")} />
            </div>
            <label
              title={msg("instrumentEditor.playAStepSChordOneNote")}
              data-ob="arp"
            >
              <input
                type="checkbox"
                checked={!!track.arp}
                onChange={(e) =>
                  onChangeTrack({ arp: e.target.checked ? { mode: 'up', div: 1, octaves: 1 } : undefined })
                }
              />
              {msg("instrumentEditor.enable")}</label>
            {track.arp && (
              <>
                <label title={msg("instrumentEditor.noteOrderForTheArpeggioChordPlays")} data-ob="arp-mode">
                  {msg("instrumentEditor.order")}<select
                    value={track.arp.mode}
                    onChange={(e) => onChangeTrack({ arp: { ...track.arp!, mode: e.target.value as ArpMode } })}
                  >
                    {(Object.keys(ARP_MODE_LABELS) as ArpMode[]).map((m) => (
                      <option key={m} value={m}>{ARP_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </label>
                <label title={msg("instrumentEditor.numberOfEqualSubdivisionsPerNoteFor")} data-ob="arp-speed">
                  {msg("instrumentEditor.subdivision")}<NumField
                    value={track.arp.div} min={0.25} max={8} step={0.25} narrow
                    onChange={(div) => onChangeTrack({ arp: { ...track.arp!, div } })}
                  />
                </label>
                <label title={msg("instrumentEditor.repeatTheFigureAcrossOctaves")}>
                  {msg("instrumentEditor.octaves")}<NumField
                    value={track.arp.octaves} min={1} max={4} narrow
                    onChange={(octaves) => onChangeTrack({ arp: { ...track.arp!, octaves: Math.round(octaves) } })}
                  />
                </label>
              </>
            )}
          </div>}
        </div>
      )}


    </div>
  );
}
