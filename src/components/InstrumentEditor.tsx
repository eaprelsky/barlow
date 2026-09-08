import { WavetableEditor } from './WavetableEditor';
import { tableRecipe } from '../music/wavetable';
import { LayerEditor } from './LayerEditor';
import { MsegEditor } from './MsegEditor';
import { MSEG_SHAPES } from '../music/mseg';
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

const TABS: [InstEditorTab, string][] = [
  ['snd', 'источник'],
  ['env', 'огибающая'],
  ['timbre', 'тембр'],
];

/** Последняя волна (таблица строк) инструмента: возврат с сэмпла на
 *  «волну» сегмента источника восстанавливает прежний тембр. Живёт
 *  в модуле — переживает перемонтирование редактора. */
const LAST_WAVE = new Map<string, WaveDef>();

interface Props {
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
}: Props) {
  // Слитый вид: дорожка + инструмент — для чтения звука и превью.
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
      if (alive) { setBuffer(b); if (!b) setSampleError('Запись отсутствует в библиотеке.'); }
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
        title: 'разложение в гармоники',
        text:
          'Не нашла основную частоту' +
          (f0Manual > 20 ? '' : ' — задай «f0, Гц» вручную') +
          '. Нетональный материал лучше играет гранулярным режимом сэмпла',
        okLabel: 'ок',
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
    const suggested = current === 'своя настройка' ? track.name : current;
    const name = await promptDialog({
      title: 'сохранить инструмент',
      text: dirty && !isSample ? 'Сохраним прослушанный черновик в «мои». Чтобы он зазвучал в партии, нажми «применить» в редакторе волны.' : 'Пресет появится в панели инструментов, категория «мои»',
      okLabel: 'сохранить',
      input: { value: suggested },
    });
    if (!name || !name.trim()) return;
    const n = name.trim();
    if (loadUserPresets().some((p) => p.name === n)) {
      const ok = await confirmDialog({
        title: 'заменить пресет?',
        text: `«${n}» уже есть среди твоих — перезаписать его звуком этой дорожки?`,
        okLabel: 'заменить',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      saveUserPreset(n, dirty && !isSample ? { ...st, waveform: 'wave', wave: normalizeWave(wave) } : st);
      bumpInstruments((v) => v + 1);
    } catch (error) {
      await confirmDialog({ title: 'не удалось сохранить инструмент', text: String(error), okLabel: 'понятно', onlyOk: true });
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
  const noteSec =
    st.noteSteps && st.noteSteps > 0
      ? st.noteSteps * (pattern.rate ?? track.rate) * tickDuration(bpm)
      : Math.max(st.attack, 0.0005) + st.decay;

  const hasNoise = wave.partials.some((p) => p.type === 'noise');
  const sampleFileRef = useRef<HTMLInputElement>(null);
  const isSample = st.waveform === 'sample';
  const scratchMode = isSample && (st.sampleMode ?? 'plain') === 'scratch';

  /** Закрытие с неприменённым черновиком волны — сперва спросить. */
  const tryClose = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'волна не применена',
        text: 'Черновик отличается от звучащей волны. Применить его перед закрытием?',
        okLabel: 'применить',
        cancelLabel: 'отбросить',
      });
      if (ok) applyDraft();
    }
    setPoints(null);
    onClose();
  };

  return (
    <div className="wave-editor inst-editor" data-ob="inst-panel">
      <div className="we-head">
        <span className="tabs we-tabs" data-ob="we-tabs">
          {TABS.map(([id, title]) => (
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
          <span className="we-title" title="Черновик волны отличается от звучащей — «применить» перенесёт его в инструмент">
            черновик волны не применён
          </span>
        )}
        <span className="spacer" />
        <HelpHint guide="sound" scope={scope} label="Гид: настроить звук дорожки" />
        <button
          className="we-close"
          title="Закрыть редактор инструмента"
          aria-label="закрыть редактор инструмента"
          onClick={() => void tryClose()}
        >
          ✕
        </button>
      </div>

      <div className="instrument-audition">
        <button
          className="env-listen"
          title="Проверить звук в регистре и строе этой дорожки" data-ob="preview-in-track"
          onClick={() => onPreviewNote(dirty && !isSample ? { ...inst, waveform: 'wave', wave } : inst)}
        >
          ▶ в партии
        </button>
        <label data-ob="recommended-hz">для библиотеки <NumField value={recommendedHz(st)} min={20} max={9000} step={1} w={65} ariaLabel="Частота прослушивания, Гц" onChange={recommendedHz => onChangeInst({ recommendedHz })} /> Гц</label>
        <button data-ob="preview-timbre" title="Послушать на частоте для библиотеки, без влияния строя дорожки" onClick={() => onPreviewNote(dirty && !isSample ? { ...inst, waveform: 'wave', wave } : inst, true)}>▶ тембр</button>
        <button
          className="save-inst"
          data-ob="save-inst"
          title="Сохранить текущий тембр, включая черновик волны, в категорию «мои»"
          aria-label="сохранить инструмент"
          onClick={() => void saveInstrumentAs()}
        >
          {/* дискета: контур со срезом, жалюзи, окошко */}
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1.7 1.7h8.2l2.4 2.4v8.2H1.7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.2 1.7v3.6h4.6V1.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.2 12.3V8h4.6v4.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg> сохранить
        </button>
        <HelpHint guide="audition" step={1} scope={scope} label="Гид: прослушивание и сохранение инструмента" />
      </div>
      <LayerEditor inst={inst} onChange={onChangeInst} />
      <MacroEditor macros={inst.macros} onChange={(macros) => onChangeInst({ macros })} />
      {busy && <div role="status" className="inline">ИИ обрабатывает запись… <button onClick={onCancelSampleJob}
        title="Остановить загрузку и применение результата. Уже отправленное задание провайдер может выполнить и списать оплату">прекратить ожидание</button></div>}
      {tab === 'snd' && (
        <div className="we-body">
          <div className="group" data-ob="inst-group">
            {/* Источник — два мира: таблица строк-операторов или сэмпл
                из библиотеки. У сэмпла весь его инструментарий живёт
                здесь же — отдельной вкладки «сэмпл» больше нет. */}
            <div className="seg src-seg" data-ob="src-seg">
              <button
                className={!isSample ? 'on' : ''}
                title="Таблица строк-операторов: сумма и модуляция, хвосты-звоны. Возврат со сэмпла восстановит прежнюю таблицу"
                onClick={() =>
                  onChangeInst({
                    waveform: 'wave',
                    wave: LAST_WAVE.get(inst.id) ?? applied,
                  })
                }
              >
                волна
              </button>
              <button
                className={isSample ? 'on' : ''}
                title="Сэмпл из библиотеки: строки нотного стана задают скорость воспроизведения; режимы — прямой, гранулярный, скрэтч"
                onClick={() => onChangeInst({ waveform: 'sample' })}
              >
                сэмпл
              </button>
            </div>
            {isSample && (
              <label title="Основная запись: звучит вне настроенных зон. Тональный режим учитывает частоту записи; без него строки шкалы задают отношение скоростей." data-ob="snd-sample">
                основной сэмпл
                <span className="inline">
                  <span className="sample-name" title={st.sampleName ?? 'сэмпл не выбран'}>
                    {st.sampleName ?? 'не выбран'}
                  </span>
                  <button
                    onClick={onPickSample}
                    title="Выбрать из хранилища: прослушать и положить в слот"
                  >
                    выбрать…
                  </button>
                  <button onClick={() => sampleFileRef.current?.click()}>загрузить</button>
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
          {!isSample && <div className="mseg-toolbar" data-ob="synthesis-mode"><label>синтез <select aria-label="Способ синтеза" value={inst.wave?.wavetable ? 'table' : inst.wave?.va ? 'va' : 'operators'} onChange={e => onChangeInst({ wave: { ...(inst.wave ?? wave), wavetable: e.target.value === 'table' ? tableRecipe() : undefined, va: e.target.value === 'va' ? { shape: 'saw', pulseWidth: .5 } : undefined } }, true)}><option value="operators">операторы · FM</option><option value="table">wavetable · кадры</option><option value="va">VA · аналоговые формы</option></select></label></div>}
          {!isSample && inst.wave?.wavetable && <WavetableEditor value={inst.wave.wavetable} onChange={wavetable => onChangeInst({ wave: { ...inst.wave!, wavetable } })} />}
          {!isSample && inst.wave?.va && <div className="mseg-toolbar" data-ob="va-oscillator"><label>форма <select aria-label="Форма VA" value={inst.wave.va.shape} onChange={e => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, shape: e.target.value as 'saw' } } })}><option value="saw">пила</option><option value="pulse">импульс</option><option value="triangle">треугольник</option></select></label><label>ширина импульса, % <NumField ariaLabel="Ширина импульса VA, %" disabled={inst.wave.va.shape !== 'pulse'} value={inst.wave.va.pulseWidth * 100} min={5} max={95} step={.1} onChange={v => onChangeInst({ wave: { ...inst.wave!, va: { ...inst.wave!.va!, pulseWidth: v / 100 } } })} /></label><span>Яркость и резонанс — во вкладке «тембр».</span></div>}
          {!isSample && (inst.wave?.wavetable || inst.wave?.va) && <div className="mseg-toolbar"><label>унисон <NumField ariaLabel="Унисон нового синтеза" value={inst.unisonVoices ?? 1} min={1} max={8} step={1} onChange={unisonVoices => onChangeInst({ unisonVoices })} /></label><label>расстройка, ц <NumField ariaLabel="Расстройка нового синтеза" value={inst.unisonDetune ?? 12} min={0} max={50} step={.5} onChange={unisonDetune => onChangeInst({ unisonDetune })} /></label><label>вибрато, ц <NumField ariaLabel="Вибрато нового синтеза" value={inst.vibratoDepth ?? 0} min={0} max={1200} step={1} onChange={vibratoDepth => onChangeInst({ vibratoDepth })} /></label></div>}
          {!isSample && !inst.wave?.wavetable && !inst.wave?.va && (
            <div className="we-wave-layers">
              <div className="we-wave-left">
                <div className="we-canvas-stack" data-ob="we-wave-canvas">
                  {dirty && soundingForm && (
                    <div
                      className="we-ghost"
                      aria-hidden="true"
                      title="Приглушённая линия — звучащий сейчас тембр; яркая — черновик"
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
                      title="Рисунок уже переведён в строки черновика — это возврат к их виду"
                      onClick={() => {
                        pointsRef.current = null;
                        setPoints(null);
                      }}
                    >
                      к строкам
                    </button>
                  ) : (
                    <button
                      title="Нарисовать форму мышью — рисунок разложится в строки черновика (маршруты модуляции при этом теряются), слушай «▶ нота»"
                      onClick={() => {
                        const pts = Float32Array.from(
                          draftForm ?? soundingForm ?? new Float32Array(CYCLE_N),
                        );
                        pointsRef.current = pts;
                        setPoints(pts);
                      }}
                    >
                      рисовать форму
                    </button>
                  )}
                  {dirty && (
                    <>
                      <button
                        className="we-apply"
                        title="Черновик становится таблицей инструмента; до этого звучит прежний тембр"
                        onClick={applyDraft}
                      >
                        применить
                      </button>
                      <button
                        title="Отбросить черновик: вернуться к звучащей таблице"
                        onClick={() => setDraft(null)}
                      >
                        сбросить
                      </button>
                      <span
                        className="mini-info"
                        title="Черновик отличается от звучащей волны — «применить» перенесёт его в инструмент"
                      >
                        черновик не применён
                      </span>
                    </>
                  )}
                </div>

                <div className="we-partials" data-ob="we-partials">
                  <div className="partial-row head" aria-hidden="true">
                    <span />
                    <span className="ph-cap">множитель</span>
                    <span className="ph-cap">громкость</span>
                    <span className="ph-cap">форма</span>
                    <span className="ph-cap">хвост, с</span>
                    <span className="ph-cap">куда</span>
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
                            ? 'Убрать строку (её модуляторы снимутся тоже)'
                            : 'Убрать строку'
                        }
                        onClick={() => removePartial(i)}
                      >
                        ×
                      </button>
                      <label title="Множитель к ноте: 2 — октава выше, 1.5 — квинта, дроби — микротюнинг тембра">
                        ×
                        <NumField
                          value={Math.round(p.ratio * 100) / 100} min={0.25} max={64} step={0.25} narrow
                          onChange={(v) => setPartial(i, { ratio: Math.round(v * 100) / 100 })}
                        />
                      </label>
                      {p.mod === undefined ? (
                        <label title="Громкость строки в сумме, %">
                          <NumField
                            value={Math.round(p.amp * 100)} min={0} max={100} step={5} narrow
                            onChange={(v) => setPartial(i, { amp: v / 100 })}
                          />%
                        </label>
                      ) : (
                        <label title="Глубина модуляции (индекс): девиация частоты цели = индекс × частота ноты × множитель строки. 1–3 — мягкие тембры, 5+ — ржа и металл">
                          <NumField
                            value={Math.round(p.amp * 10) / 10} min={0} max={24} step={0.1} narrow
                            onChange={(v) => setPartial(i, { amp: v })}
                          />
                        </label>
                      )}
                      <select
                        value={p.type}
                        title="Форма строки"
                        onChange={(e) => setPartial(i, { type: e.target.value as WavePartial['type'] })}
                      >
                        {(Object.keys(PARTIAL_TYPE_LABELS) as WavePartial['type'][]).map((t) => (
                          <option key={t} value={t}>{PARTIAL_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <label title="Собственный хвост строки (T60): гаснет сам и переживает релиз ноты — звон колокола, темнеющая струна. 0 — живёт под общей огибающей">
                        <NumField
                          value={p.decay ?? 0} min={0} max={8} step={0.05} narrow
                          onChange={(v) => setPartial(i, v <= 0.001 ? { decay: undefined } : { decay: v })}
                        />
                      </label>
                      <select
                        value={p.mod === undefined ? 'sum' : String(p.mod)}
                        title="Маршрут: в сумму или модулировать частоту другой строки (FM-оператор)"
                        onChange={(e) => {
                          const v = e.target.value;
                          setPartial(i, v === 'sum' ? { mod: undefined } : { mod: Number(v) });
                        }}
                      >
                        <option value="sum">в сумму</option>
                        {wave.partials.map((q, j) =>
                          j !== i ? (
                            <option key={j} value={j} disabled={!canRouteWave(wave.partials, i, j)}>
                              мод. ×{Math.round(q.ratio * 100) / 100}
                            </option>
                          ) : null,
                        )}
                      </select>
                    </div>
                  ))}
                  <div className="we-row">
                    <button onClick={addPartial} title="Добавить строку-оператор">+ строка</button>
                    {hasNoise && (
                      <label title="Размер зерна шумовых строк, мс: 10 — пыль, 100 — крупа, 300 — лоскуты">
                        зерно шума, мс
                        <NumField
                          value={Math.round(wave.noiseGrainMs ?? 40)} min={5} max={500} step={5}
                          onChange={(v) => setDraft({ ...wave, noiseGrainMs: Math.round(v) })}
                        />
                      </label>
                    )}
                    <span className="mini-info">{wave.partials.length}/64 строк</span>
                  </div>
                </div>
              </div>

              {/* Правая панель: слои тембра, не привязанные к строкам. */}
              <div className="we-layers" data-ob="we-layers">
                <div className="group sub" data-ob="unison-group">
                  <span className="sub-cap">унисон</span>
                  {isSample && !scratchMode && (
                    <span
                      className="scope-cap"
                      title="Унисон на сэмпле — N копий со скоростью ±детюн (хорус/стена из одного сэмпла); в гранулярном режиме — разброс зёрен"
                    >
                      сэмпл
                    </span>
                  )}
                  {scratchMode && (
                    <span className="scope-cap" title="Скрэтчу унисон не нужен: скорость задаёт жест иглы">
                      скрэтч
                    </span>
                  )}
                  <span className={'knob-row' + (scratchMode ? ' dim' : '')}>
                    <Knob
                      label="голоса"
                      title="Унисон: сколько расстроенных копий играет на ноту. 1 — обычный голос; 3–5 — жирнее и шире (супер-пила = пила + унисон). Двойной клик — точное число"
                      value={st.unisonVoices ?? 1} min={1} max={8} step={1}
                      onChange={(unisonVoices) => onChangeInst({ unisonVoices })}
                    />
                    <Knob
                      label="детюн"
                      title="Унисон: расстройка крайнего голоса в центах. 5–10 — лёгкий хорус; 20–40 — широкая стена. Двойной клик — точное число"
                      value={st.unisonDetune ?? 12} min={0} max={50} step={1}
                      onChange={(unisonDetune) => onChangeInst({ unisonDetune })}
                    />
                    <Knob
                      label="разброс"
                      title="Унисон: развод голосов по каналам (стерео-ширина), 0 — в центре. Двойной клик — точное число"
                      value={Math.round((st.unisonSpread ?? 0) * 100)} min={0} max={100} step={5}
                      onChange={(v) => onChangeInst({ unisonSpread: v / 100 })}
                    />
                  </span>
                </div>
                <div className="group sub knob-row">
                  <span className="sub-cap">вибрато</span>
                  <Knob
                    label="скорость"
                    title="Вибрато: частота качания высоты тона (Гц). 5–6 Гц — классическое певческое; 10–20 — нервное дрожание воббл-баса. Двойной клик — точное число"
                    value={st.vibratoRate ?? 5} min={0.1} max={30} step={0.1}
                    onChange={(vibratoRate) => onChangeInst({ vibratoRate })}
                  />
                  <Knob
                    label="глубина"
                    title="Вибрато: глубина в центах (1/100 полутона). 0 — выключено; 20–50 — заметное; 100 — широкий ук; 200–400 — воющий воббл; 1200 — октава. Двойной клик — точное число"
                    value={st.vibratoDepth ?? 0} min={0} max={1200} step={5}
                    onChange={(vibratoDepth) => onChangeInst({ vibratoDepth })}
                  />
                  <Knob
                    label="задержка"
                    title="Вибрато с задержкой: глубина нарастает от нуля за это время — голос «доплывает» до дрожания, как живое пение. Двойной клик — точное число"
                    value={st.vibratoDelay ?? 0} min={0} max={2} step={0.05}
                    onChange={(vibratoDelay) => onChangeInst({ vibratoDelay })}
                  />
                </div>
                <div className="group sub" data-ob="formant-group">
                  <span className="sub-cap">форманты</span>
                  <span
                    className="mini-info"
                    title="Бугры громкости на фиксированных герцах поверх любой волны и сэмпла: гласная не зависит от высоты ноты (как гортань у человека). Пусто — слой выключен"
                  >
                    бугры, Гц
                  </span>
                  {(st.formants ?? []).map((b, i) => (
                    <div className="formant-row" key={i}>
                      <button
                        className="remove"
                        title="Убрать формант"
                        onClick={() =>
                          onChangeInst({ formants: (st.formants ?? []).filter((_, j) => j !== i) })
                        }
                      >
                        ×
                      </button>
                      <label title="Частота бугра, Гц">
                        <NumField
                          value={Math.round(b.freq)} min={80} max={9000} step={10} narrow
                          onChange={(freq) =>
                            onChangeInst({
                              formants: (st.formants ?? []).map((x, j) => (j === i ? { ...x, freq } : x)),
                            })
                          }
                        />
                      </label>
                      <label title="Громкость бугра, ×">
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
                      title="Добавить формантный бугор (вокальная гласная — три бугра, заготовка «вокал» ставит их сама)"
                      onClick={() => onChangeInst({ formants: [...(st.formants ?? []), { freq: 800, gain: 1 }] })}
                    >
                      + формант
                    </button>
                  )}
                </div>
                <div className="group sub" data-ob="recipe-pick">
                  <span className="sub-cap">заготовка волны</span>
                  <select
                    value=""
                    title="Пересобрать таблицу строк из заготовки — ляжет черновиком, огибающая ноты остаётся. «Вокал» ставит форманты, «супер-пила» — унисон"
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
                    <option value="">выбрать…</option>
                    {(Object.keys(RECIPE_LABELS) as RecipeId[]).map((id) => (
                      <option key={id} value={id}>{RECIPE_LABELS[id]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {isSample && sampleError && <div role="alert" className="sample-load-error">
            Не удалось загрузить сэмпл: {sampleError} <button onClick={() => setSampleRetry(v => v + 1)}>повторить загрузку</button>
          </div>}
          {isSample && (!inst.sampleId || !buffer ? (
            <p className="empty">
              {inst.sampleId
                ? sampleError ? 'Волна недоступна.' : 'сэмпл ещё грузится…'
                : inst.sampleZones?.length ? 'Основной сэмпл не выбран; ноты внутри настроенных зон используют записи зон.' : 'Основной сэмпл не выбран — выбери из хранилища или загрузи файл.'}
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
                  title="Прослушать выделенный кусок"
                  onClick={() => selSec && onPreviewRegion(inst, selSec[0], selSec[1])}
                >
                  ▶ выделение
                </button>
                <button
                  disabled={!selSec}
                  title="Ноты (и скрэтч) будут играть только этот кусок сэмпла"
                  onClick={() =>
                    selSec &&
                    onChangeInst({
                      sampleStart: +selSec[0].toFixed(4),
                      sampleEnd: +selSec[1].toFixed(4),
                    })
                  }
                >
                  оставить кусок
                </button>
                <button
                  disabled={inst.sampleStart === undefined && inst.sampleEnd === undefined}
                  title="Убрать обрезку — играть сэмпл целиком"
                  onClick={() => onChangeInst({ sampleStart: undefined, sampleEnd: undefined })}
                >
                  сброс
                </button>
                <span className="we-sep" />
                <label title="Начало куска, с">
                  старт
                  <NumField
                    value={Math.round(regStart * 1000) / 1000} min={0} max={Math.max(0.001, dur - 0.001)} step={0.01} narrow
                    onChange={(v) => onChangeInst({ sampleStart: +v.toFixed(4) })}
                  />
                </label>
                <label title="Конец куска, с">
                  конец
                  <NumField
                    value={Math.round(regEnd * 1000) / 1000} min={0.001} max={dur} step={0.01} narrow
                    onChange={(v) => onChangeInst({ sampleEnd: +v.toFixed(4) })}
                  />
                </label>
                {selSec && (
                  <span className="mini-info">
                    выделено {(selSec[1] - selSec[0]).toFixed(2)} с ({selSec[0].toFixed(2)}–{selSec[1].toFixed(2)})
                  </span>
                )}
              </div>
              <div className="we-row" data-ob="we-fft">
                <button
                  title="Тембровый слепок куска (или всего сэмпла): усреднённый спектр → гармоники, инструмент станет «своей волной» — уйдёт черновиком на вкладку «волна», сравни и примени"
                  onClick={decompose}
                >
                  сэмпл → в волну
                </button>
                <label title="Максимум гармоник: 64 — на слух почти оригинал и копеечная нагрузка, 128–256 — точнее, дороже">
                  точность
                  <NumField
                    value={fftK} min={8} max={256} step={8} narrow
                    onChange={(v) => setFftK(Math.round(v))}
                  />
                </label>
                <label title="Основная частота, Гц: 0 — определить автоматически (автокорреляция). Нетональному материалу задай сам">
                  f0, Гц
                  <NumField
                    value={Math.round(f0Manual)} min={0} max={2000} step={5} narrow
                    onChange={(v) => setF0Manual(v)}
                  />
                </label>
              </div>
              <div className="we-row ai-transform">
                <input
                  className="gen-prompt"
                  placeholder="преобразовать по описанию: темнее, с реверберацией, замедленно…"
                  title="ИИ-морфинг сэмпла (audio-to-audio, fal.ai): опиши, что сделать с этим звуком — результат ляжет в слот новым сэмпла, исходник останется в библиотеке"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) onTransformSample(track.id, aiPrompt.trim(), aiStrength, aiDuration);
                  }}
                />
                <label title="Сила морфинга: 20% — лёгкая приправа, 80% — почти новый звук">
                  сила
                  <NumField
                    value={Math.round(aiStrength * 100)} min={5} max={100} step={5} narrow
                    onChange={(v) => setAiStrength(v / 100)}
                  />%
                </label>
                <button
                  disabled={!aiPrompt.trim() || busy}
                  onClick={() => onTransformSample(track.id, aiPrompt.trim(), aiStrength, aiDuration)}
                >
                  {busy ? 'преобразую…' : 'преобразовать'}
                </button>
              </div>
            </>
          ))}

          {isSample && (
            <div className="inline sampler-tuning">
              <label title="Высота = тоника дорожки × отношение шкалы. Выключено — прежнее воспроизведение по отношениям шкалы">
                <input type="checkbox" checked={inst.keyTracking ?? false}
                  onChange={(e) => onChangeInst({ keyTracking: e.target.checked })} />
                тональный сэмпл
              </label>
              <label title="Частота исходной записи; используется только для тонального сэмпла">
                тоника записи, Гц
                <NumField value={inst.rootHz ?? 440} {...parameterRange('instrument.rootHz')}
                  onChange={(rootHz) => onChangeInst({ rootHz })} />
              </label>
            </div>
          )}
          {isSample && (
            <label title="Как сэмплер играет буфер: напрямую (нота = сэмпл целиком с новой скоростью), гранулярно (нота = облако коротких осколков) или скрэтчем (нота = жест иглы)" data-ob="sample-mode">
              режим
              <select
                value={st.sampleMode ?? 'plain'}
                onChange={(e) => onChangeInst({ sampleMode: e.target.value as Instrument['sampleMode'] })}
              >
                <option value="plain">прямой</option>
                <option value="grain">гранулярный</option>
                <option value="scratch">скрэтч</option>
              </select>
            </label>
          )}
          {isSample && <SampleZoneEditor key={inst.sampleId ?? 'empty'} zones={inst.sampleZones} onChange={(sampleZones) => onChangeInst({sampleZones})} />}
          {isSample && <SampleSliceEditor inst={inst} duration={buffer?.duration ?? 0} selection={buffer ? selSec : null} onChange={(sampleSlices, command) => onChangeInst({ sampleSlices }, command)} onPreview={onPreviewRegion} onCreatePattern={onSlicePattern} canCreatePattern={track.patterns.length < 128} />}
          {isSample && (st.sampleMode ?? 'plain') === 'plain' && (
            <div className="inline sampler-tuning">
              <label><input type="checkbox" checked={inst.sampleReverse ?? false}
                onChange={(e) => onChangeInst({ sampleReverse: e.target.checked })} />реверс фрагмента</label>
              <label><input type="checkbox" checked={inst.sampleLoop ?? false}
                onChange={(e) => onChangeInst({ sampleLoop: e.target.checked })} />петля на длину ноты</label>
              {inst.sampleLoop && <label title="Сглаживание стыка; ограничено половиной фрагмента. Первая атака сохраняется">
                стык, мс <NumField value={inst.loopCrossfadeMs ?? 10} {...parameterRange('instrument.loopCrossfadeMs')}
                  onChange={(loopCrossfadeMs) => onChangeInst({ loopCrossfadeMs })} />
              </label>}
            </div>
          )}
          {isSample && (st.sampleMode ?? 'plain') === 'grain' && (
            <>
              <span className="inline grain-presets">
                <button
                  title="Мелкая крошка: короткие зёрна, много, широкий разброс — шершавая пыль"
                  onClick={() => onChangeInst({ grainSizeMs: 20, grainCount: 24, grainScatter: 0.6 })}
                >
                  пыль
                </button>
                <button
                  title="Тёплое облако: средние зёрна, плотный поток"
                  onClick={() => onChangeInst({ grainSizeMs: 180, grainCount: 12, grainScatter: 0.25 })}
                >
                  облако
                </button>
                <button
                  title="Почти цельные куски: длинные зёрна, мало, из одного места — лента"
                  onClick={() => onChangeInst({ grainSizeMs: 400, grainCount: 4, grainScatter: 0.05 })}
                >
                  лента
                </button>
              </span>
              <label title="Длина осколка (зерна) в миллисекундах: 20–60 — почти крап, 100–300 — тёплое облако, 400+ — почти слышимый сэмпл">
                зерно, мс
                <NumField value={st.grainSizeMs ?? 120} min={10} max={800} step={10} onChange={(grainSizeMs) => onChangeInst({ grainSizeMs })} />
              </label>
              <label title="Сколько зёрен выпускает одна нота — плотность облака. 1–3 — редкие брызги, 15+ — сплошной поток">
                зёрен на ноту
                <NumField value={st.grainCount ?? 10} min={1} max={32} onChange={(grainCount) => onChangeInst({ grainCount: Math.round(grainCount) })} />
              </label>
              <label title="Откуда в сэмпле брать осколки: 0 — начало, 0.5 — середина, 1 — конец">
                позиция
                <NumField value={Math.round((st.grainPos ?? 0.3) * 100)} min={0} max={100} step={1} onChange={(v) => onChangeInst({ grainPos: v / 100 })} />
              </label>
              <label title="Разброс позиций зёрен вокруг заданной точки: 0 — все из одного места, 1 — по всему сэмпла">
                разброс
                <NumField value={Math.round((st.grainScatter ?? 0.15) * 100)} min={0} max={100} step={1} onChange={(v) => onChangeInst({ grainScatter: v / 100 })} />
              </label>
            </>
          )}

          {isSample && (
            <div className="gen-bar" data-ob="gen-bar">
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
                disabled={busy || !prompt.trim()}
                title="Сгенерировать и положить в слот (Enter в поле тоже работает)"
                onClick={() => onGenerateSample(track.id, prompt.trim(), genSeconds)}
              >
                {busy ? 'генерирую…' : 'сгенерировать'}
              </button>
              {st.sampleName && !busy && (
                <span className="mini-info" title="Сейчас в слоте">в слоте: {st.sampleName}</span>
              )}
              <HelpHint guide="samples" step={3} scope={scope} label="Гид: сгенерировать сэмпл" />
            </div>
          )}

          {scratchMode && (
            <div className={'scratch-bar' + (scratchArmed || scratchLive ? ' recording' : '')} data-ob="scratch-bar">
              <div className="scratch-actions">
                <button
                  className={scratchArmed || scratchLive ? 'on' : ''}
                  data-ob="scratch-rec"
                  title="Нажми — и проведи мышью по пэду: путь запишется жестом (до 48 сглаженных точек). Отпустишь — запись закончится сама"
                  onClick={() => setScratchArmed((v) => !v)}
                >
                  {scratchArmed || scratchLive ? '● веди по пэду…' : '● записать жест'}
                </button>
                {(st.scratchPoints ?? []).length > 0 && (
                  <button
                    title="Стереть жест: пэд станет пустым (границы куска не трогаются)"
                    onClick={() => onChangeInst({ scratchPoints: [] })}
                  >
                    очистить жест
                  </button>
                )}
                <button
                  className={scratchPlaying ? 'on' : ''}
                  data-ob="scratch-play"
                  title="Проиграть жест одной нотой — проверить, как он звучит в нотах"
                  onClick={() => {
                    onScratchPreview();
                    setScratchPlaying(true);
                    window.setTimeout(() => setScratchPlaying(false), (noteSec + 0.15) * 1000);
                  }}
                >
                  {scratchPlaying ? '▶ играет…' : '▶ послушать'}
                </button>
                <button
                  disabled={scratchSaving}
                  data-ob="scratch-save"
                  title="Назвать и заморозить жест: справа появится поле имени — «ок» отрендерит WAV в библиотеку сэмплов, готовый скрэтч без пэда и точек"
                  onClick={() => {
                    setScratchName(`${track.name} скрэтч`);
                    setScratchNaming(true);
                  }}
                >
                  {scratchSaving ? 'рендер…' : 'в сэмпл'}
                </button>
                {scratchNaming && !scratchSaving && (
                  <>
                    <input
                      className="scratch-name"
                      data-ob="scratch-name"
                      autoFocus
                      value={scratchName}
                      spellCheck={false}
                      title="Имя, под которым жест ляжет в библиотеку — файл будет называться ровно так. Одинаковые имена различай сам: например, дописывай номер"
                      onChange={(e) => setScratchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveScratchNamed();
                        if (e.key === 'Escape') setScratchNaming(false);
                      }}
                    />
                    <button
                      className="scratch-ok"
                      title="Сохранить жест в библиотеку под этим именем"
                      onClick={saveScratchNamed}
                    >
                      ок
                    </button>
                    <button
                      className="scratch-cancel"
                      title="Отменить — жест не сохранится"
                      onClick={() => setScratchNaming(false)}
                    >
                      ×
                    </button>
                  </>
                )}
                {scratchSavedTick && (
                  <span className="scratch-saved" title="Жест в библиотеке сэмплов">
                    ✓
                  </span>
                )}
                <HelpHint guide="scratch" scope={scope} label="Гид: скрэтч жестом" />
                <span
                  className="mini-info"
                  title="Длительность жеста = длина ноты: «нота» в тулбаре стана (шаги) или атака+спад во вкладке «огибающая»"
                >
                  жест ≈ {noteSec.toFixed(2)} с
                </span>
              </div>
              <div className="scratch-row">
                <div
                  className="scratch-side"
                  title="Кусок сэмпла: тяни верхнюю или нижнюю границу — подвинешь конец/начало куска. Полоски — громкость"
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
                    title="Жест иглы. Клик — добавить точку, тянуть точку — править, правый клик — удалить. Наклон = скорость иглы: круче — быстрее"
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
                        title={`место ${Math.round(pt.pos * 100)}% · момент ${Math.round(pt.t * 100)}% ноты · тянуть — править, правый клик — удалить`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onChangeInst({ scratchPoints: (st.scratchPoints ?? []).filter((_, j) => j !== i) });
                        }}
                      />
                    ))}
                    {(scratchArmed || scratchLive) && (
                      <span className="scratch-hint">идёт запись — веди мышью по пэду</span>
                    )}
                    {(st.scratchPoints ?? []).length === 0 && !dragPts && !scratchArmed && (
                      <span className="scratch-hint">кликни — появится точка; несколько точек — жест</span>
                    )}
                  </div>
                  <span className="scratch-axis">время ноты →</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'env' && (
        <div className="we-body">
          <div className="env-tab" data-ob="env-tab">
            <div className="mseg-toolbar" data-ob="envelope-mode"><span>громкость ноты</span><select aria-label="Режим огибающей" value={st.ampMseg ? 'points' : 'classic'} onChange={e => onChangeInst({ ampMseg: e.target.value === 'points' ? { seconds: .5, points: structuredClone(MSEG_SHAPES['удар']) } : undefined })}><option value="classic">атака · плато · спад</option><option value="points">по точкам (MSEG)</option></select></div>
            {st.ampMseg ? <MsegEditor value={st.ampMseg} onChange={ampMseg => onChangeInst({ ampMseg })} /> : <>
            <span className="sub-cap">форма ноты — громкость и падение тона на одной оси времени</span>
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
              <Knob
                label="атака, мс"
                title="За сколько миллисекунд нота достигает полной громкости. Быстрые — удар, медленные — мягкие. Двойной клик — точное число"
                value={Math.round(Math.max(st.attack, 0.0005) * 1000)} min={0} max={500} step={1}
                onChange={(ms) => onChangeInst({ attack: Math.max(0.0005, ms / 1000) })}
              />
              <Knob
                label="плато, %"
                title="Плато (sustain): доля ноты на полной громкости после атаки, остаток — спад. 0% — сразу спад после атаки (перкуссионный хвост); 50–90% — тянущиеся ноты с мягким затуханием; 100% — тянется до перебоя (до 16 с), пока следующая нота не перехватит. Двойной клик — точное число"
                value={Math.round((st.sustain ?? 0) * 100)} min={0} max={100} step={5}
                onChange={(v) => onChangeInst({ sustain: v / 100 })}
              />
              <Knob
                label="спад, с"
                title={
                  st.waveform === 'sample'
                    ? 'Сколько секунд звучит нота — сэмпл длиннее обрезается. Для длинных сэмплов ставь больше'
                    : 'Сколько секунд звучит нота после удара'
                }
                value={st.decay} min={0.01} max={4} step={0.01}
                onChange={(decay) => onChangeInst({ decay })}
              />
            </div></>}
            <div className="env-fields">
              <Knob
                label="падение, ×"
                title="Нота стартует во столько раз выше тоники и слетает вниз за время падения — так делается бочка («вумп»). 1 — выключено. Не работает на шуме и струне; на сэмпле (прямом и гранулярном) рампит скорость воспроизведения. Двойной клик — точное число"
                value={st.pitchDrop} min={1} max={16} step={0.5}
                onChange={(pitchDrop) => onChangeInst({ pitchDrop })}
              />
              <Knob
                label="время падения, с"
                title="За сколько секунд тон падает от верха до тоники. Бочке обычно 0.05–0.12. Двойной клик — точное число"
                value={st.pitchTime} min={0} max={2} step={0.01}
                onChange={(pitchTime) => onChangeInst({ pitchTime })}
              />
              <button
                className="env-listen"
                title="Прослушать ноту с этой огибающей, фильтрами и падением тона"
                onClick={() => onPreviewNote(inst)}
              >
                ▶ послушать
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'timbre' && (
        <div className="we-body">
          <div className="group sub" data-ob="voice-color">
            <span className="sub-cap">характер голоса — до эффектов дорожки</span>
            <div className="mseg-toolbar">
              <label>ring, % <NumField ariaLabel="Доля ring, %" value={(inst.ringMix ?? 0) * 100} min={0} max={100} step={1} onChange={v => onChangeInst({ ringMix: v / 100 })} /></label>
              <label>частота × <NumField ariaLabel="Частота ring, ×" value={inst.ringRatio ?? 1} min={.125} max={16} step={.01} onChange={ringRatio => onChangeInst({ ringRatio })} /></label>
              <label>wavefold <NumField ariaLabel="Wavefold" value={inst.foldDrive ?? 0} min={0} max={8} step={.1} onChange={foldDrive => onChangeInst({ foldDrive })} /></label>
              <select aria-label="Качество wavefold" value={inst.synthQuality ?? '4x'} onChange={e => onChangeInst({ synthQuality: e.target.value as '2x' | '4x' })}><option value="4x">качество 4×</option><option value="2x">экономия 2×</option></select>
            </div>
            <div className="mseg-toolbar">
              <label>comb, % <NumField ariaLabel="Доля comb, %" value={(inst.combMix ?? 0) * 100} min={0} max={100} step={1} onChange={v => onChangeInst({ combMix: v / 100 })} /></label>
              <label>резонанс, Гц <NumField ariaLabel="Резонанс comb, Гц" value={inst.combHz ?? 220} min={40} max={4000} step={1} onChange={combHz => onChangeInst({ combHz })} /></label>
              <label>звонкость, % <NumField ariaLabel="Звонкость comb, %" value={(inst.combFeedback ?? .5) * 100} min={0} max={85} step={1} onChange={v => onChangeInst({ combFeedback: v / 100 })} /></label>
            </div>
          </div>
          {/* Вибрато и унисон переехали на «источник» (v39): это слои
              тембра рядом с таблицей операторов, а не вкладка фильтров. */}
          <div className="group sub knob-row" data-ob="timbre-tab">
            <span className="sub-cap">фильтры</span>
            <Knob
              label="низ"
              title="Обрезка низа (highpass): убирает гул и рокот ниже этой частоты. У басов аккуратно (не выше 30–40), у хэтов смело поднимай. Двойной клик — точное число"
              value={st.filterLow} min={20} max={4000} step={10} log
              onChange={(filterLow) => onChangeInst({ filterLow })}
            />
            <Knob
              label="верх"
              title="Обрезка верха (lowpass): всё выше частоты приглушается. Меньше — глуше и мягче, больше — ярче и звонче. У баса 200–500, у хэтов 6000+. Двойной клик — точное число"
              value={st.filterFreq} min={60} max={12000} step={10} log
              onChange={(filterFreq) => onChangeInst({ filterFreq })}
            />
            <Knob
              label="резонанс"
              title="Резонанс фильтра (Q): подъём на частоте среза. 0.8 — ровный обрез; 4–10 — звонкое «горло» (воббл, сквелч); выше 15 — фильтр звенит сам по себе. Двойной клик — точное число"
              value={st.filterQ ?? 0.8} min={0.5} max={20} step={0.1}
              onChange={(filterQ) => onChangeInst({ filterQ })}
            />
            <Knob
              label="огиб. ↑↓"
              bipolar
              title="Огибающая фильтра: старт в полутонах от ручки «верх». Плюс — яркая атака-плак, минус — тёмный свелл; за «время» фильтр съезжает к базе. Двойной клик — точное число"
              value={st.filterEnvAmount ?? 0} min={-24} max={24} step={0.5}
              onChange={(filterEnvAmount) => onChangeInst({ filterEnvAmount })}
            />
            <Knob
              label="время"
              title="Огибающая фильтра: за сколько секунд фильтр съезжает к базе. 0.05–0.2 — щипок, 1+ — плавный свелл. Двойной клик — точное число"
              value={st.filterEnvTime ?? 0.3} min={0.05} max={2} step={0.05}
              onChange={(filterEnvTime) => onChangeInst({ filterEnvTime })}
            />
          </div>
          <div className="group sub" data-ob="arp-group">
            <div className="sub-head">
              <span className="sub-cap">арпеджиатор</span>
              <span className="scope-cap" title="Арпеджиатор — свойство дорожки: общий для всех её инструментов и эскизов">дорожка</span>
              <span className="spacer" />
              <HelpHint guide="arp" scope={scope} label="Гид: арпеджиатор" />
            </div>
            <label
              title="Арпеджиатор: аккорд шага играет по нотке — вверх, вниз, вверх-вниз, как сыграно, случайно. Работает и для сэмплов, и для нот"
              data-ob="arp"
            >
              <input
                type="checkbox"
                checked={!!track.arp}
                onChange={(e) =>
                  onChangeTrack({ arp: e.target.checked ? { mode: 'up', div: 1, octaves: 1 } : undefined })
                }
              />
              включить
            </label>
            {track.arp && (
              <>
                <label title="Форма фигуры: типы как в Ableton Live. «аккорд» — все ноты разом (как без арпеджиатора)" data-ob="arp-mode">
                  тип
                  <select
                    value={track.arp.mode}
                    onChange={(e) => onChangeTrack({ arp: { ...track.arp!, mode: e.target.value as ArpMode } })}
                  >
                    {(Object.keys(ARP_MODE_LABELS) as ArpMode[]).map((m) => (
                      <option key={m} value={m}>{ARP_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </label>
                <label title="На сколько долей дробится шаг: нота делится на равные доли, по ним идёт фигура — перелив умещается внутри ноты. 2 — восьмые внутри ноты, 4 — шестнадцатые" data-ob="arp-speed">
                  дробление
                  <NumField
                    value={track.arp.div} min={0.25} max={8} step={0.25} narrow
                    onChange={(div) => onChangeTrack({ arp: { ...track.arp!, div } })}
                  />
                </label>
                <label title="Повтор фигуры по октавам — классика арпеджио">
                  октавы
                  <NumField
                    value={track.arp.octaves} min={1} max={4} narrow
                    onChange={(octaves) => onChangeTrack({ arp: { ...track.arp!, octaves: Math.round(octaves) } })}
                  />
                </label>
              </>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
