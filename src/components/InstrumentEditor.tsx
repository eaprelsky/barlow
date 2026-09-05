// Большой редактор инструмента дорожки: «раздвинутый» режим карточки
// (остальные треки съёживаются). Пресет из панели инструментов
// переставляет именно эти ручки — здесь тембр крутят и дотюнивают.
// Вкладки: источник | огибающая | тембр | волна | сэмпл.
// Вкладка «волна» работает с черновиком: правки меняют проект, а не
// звучащий тембр, — «применить» пишет в инструмент, тонкая линия на
// канвасе показывает звучащую волну, пока черновик отличается.
// Вкладка «сэмпл» — обрезка куска, FFT-разложение в гармоники (уходит
// черновиком на «волну»), ИИ-преобразование, генерация и скрэтч.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArpMode,
  Instrument,
  Pattern,
  ScratchPoint,
  SoundingTrack,
  Track,
  WaveDef,
  Waveform,
  WavePartial,
} from '../types';
import {
  ARP_MODE_LABELS,
  MORPH_LABELS,
  PARTIAL_TYPE_LABELS,
  WAVEFORM_LABELS,
} from '../types';
import {
  instrumentNameOf,
  loadUserPresets,
  saveUserPreset,
} from '../music/instrumentPresets';
import { Knob } from './Knob';
import { NumField } from './NumField';
import { WaveIcon } from './WaveIcon';
import { WaveCanvas } from './WaveCanvas';
import { NoteGraph } from './EnvGraph';
import { confirmDialog, promptDialog } from './dialogs';
import { HelpHint } from '../onboarding/Onboarding';
import { cycleToPartials, renderWaveCycle, sampleToPartials } from '../music/fft';
import { tickDuration } from '../audio/timing';

const WAVEFORMS = Object.keys(WAVEFORM_LABELS) as Waveform[];
const CYCLE_N = 2048;

export type InstEditorTab = 'snd' | 'env' | 'timbre' | 'wave' | 'sample';

const TABS: [InstEditorTab, string][] = [
  ['snd', 'источник'],
  ['env', 'огибающая'],
  ['timbre', 'тембр'],
  ['wave', 'волна'],
  ['sample', 'сэмпл'],
];

interface Props {
  track: Track;
  inst: Instrument;
  pattern: Pattern;
  bpm: number;
  tab: InstEditorTab;
  onTab: (t: InstEditorTab) => void;
  /** Частичный патч инструмента (копию при общем инструменте делает App). */
  onChangeInst: (patch: Partial<Instrument>) => void;
  /** Правка дорожки — для арпеджиатора (свойство дорожки). */
  onChangeTrack: (patch: Partial<Track>) => void;
  onClose: () => void;
  /** Модалка выбора сэмпла — живёт в карточке трека. */
  onPickSample: () => void;
  /** Загрузить файл сэмпла с диска (положит в слот). */
  onLoadSampleFile: (f: File) => void;
  getBuffer: (id?: string) => Promise<AudioBuffer | null>;
  onPreviewRegion: (inst: Instrument, fromSec: number, toSec: number) => void;
  /** Превью ноты тембром (карточка сольёт с дорожкой). */
  onPreviewNote: (i: Instrument) => void;
  onTransformSample: (trackId: string, prompt: string, strength: number) => void;
  onGenerateSample: (trackId: string, prompt: string, seconds: number) => void;
  busy: boolean;
  onScratchBegin: (pos: number) => void;
  onScratchMove: (pos: number) => void;
  onScratchEnd: () => void;
  onScratchPreview: () => void;
  onScratchPeaks: () => Promise<{ peaks: number[]; duration: number } | null>;
}

/** Микс в моно для канваса (рисуем один канал суммы). */
function monoOf(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

function clampSec(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const genPartials = (kind: 'sine' | 'saw' | 'square' | 'noise'): WaveDef =>
  kind === 'sine'
    ? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] }
    : kind === 'noise'
      ? { partials: [{ ratio: 1, amp: 0.8, type: 'noise' }], noiseGrainMs: 40 }
      : kind === 'saw'
        ? {
            partials: Array.from({ length: 16 }, (_, i) => ({
              ratio: i + 1,
              amp: Math.pow(i + 1, -1),
              type: 'sine' as const,
            })),
          }
        : {
            // Меандр: нечётные гармоники 1/k.
            partials: Array.from({ length: 8 }, (_, i) => ({
              ratio: i * 2 + 1,
              amp: 1 / (i * 2 + 1),
              type: 'sine' as const,
            })),
          };

/** Источники, которым положен унисон (ручки в группе «унисон» тембра):
 *  базовые волны — копии осциллятора, сэмпл — копии скорости (кроме
 *  скрэтча: там питч задаёт жест). Остальным моделям ручки не звучат —
 *  группа приглушается с пояснением. */
const UNISON_SOURCES = new Set(['sine', 'square', 'triangle', 'sawtooth']);

/** Честная форма звучащего тембра — не только парциалов «своей волны»:
 *  базовые волны рисуются формулой (супер-пила — копиями с детюном),
 *  FM — своим уравнением, шум — сглаженным псевдошумом. Модели (струна,
 *  форманты, модальный, орган) одной формой не рисуются — null, вкладка
 *  покажет пояснение. Чистый визуал: живой синтез — в triggerVoice. */
function renderInstrumentCycle(inst: Instrument): Float32Array | null {
  const N = CYCLE_N;
  const out = new Float32Array(N);
  const wf = inst.waveform;
  if (wf === 'wave')
    return renderWaveCycle(
      inst.wave ?? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] },
      N,
    );
  if (wf === 'sine' || wf === 'triangle' || wf === 'square' || wf === 'sawtooth') {
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const ph = ((t % 1) + 1) % 1;
      let s: number;
      if (wf === 'sine') s = Math.sin(ph * Math.PI * 2);
      else if (wf === 'triangle') s = 1 - Math.abs(ph - 0.5) * 4;
      else if (wf === 'square') s = ph < 0.5 ? 1 : -1;
      else s = ph * 2 - 1; // пила
      out[i] = s;
    }
    return out;
  }
  if (wf === 'supersaw') {
    // По формуле звука (triggerVoice): 7 пил, расстройка и гейны — из
    // «морф»; унисон-ручки на супер-пилу не действуют, и рисовалка
    // больше не врёт, будто действуют.
    const detune = 4 + (inst.voiceMorph ?? 0.5) * 36;
    const gains = [1, 0.7, 0.7, 0.5, 0.5, 0.32, 0.32];
    const offs = [0, -0.33, 0.33, -0.66, 0.66, -1, 1];
    const norm = gains.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N; i++) {
      const t = i / N;
      let v = 0;
      for (let k = 0; k < gains.length; k++) {
        const ph = ((t * (1 + (offs[k] * detune) / 1200)) % 1 + 1) % 1;
        v += (ph * 2 - 1) * gains[k];
      }
      out[i] = v / norm;
    }
    return out;
  }
  if (wf === 'fm') {
    const ratio = inst.fmRatio ?? 2;
    const index = inst.fmIndex ?? 3;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      out[i] = Math.sin(2 * Math.PI * t + index * Math.sin(2 * Math.PI * ratio * t));
    }
    return out;
  }
  if (wf === 'noise') {
    // Сглаженный псевдошум: «пыль» той же природы, что audible шум.
    let v = 0;
    for (let i = 0; i < N; i++) {
      if (i % 24 === 0) v = Math.random() * 2 - 1;
      out[i] = v;
    }
    return out;
  }
  return null; // karplus / formant / modal / organ / additive / sample
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
  onClose,
  onPickSample,
  onLoadSampleFile,
  getBuffer,
  onPreviewRegion,
  onPreviewNote,
  onTransformSample,
  onGenerateSample,
  busy,
  onScratchBegin,
  onScratchMove,
  onScratchEnd,
  onScratchPreview,
  onScratchPeaks,
}: Props) {
  // Слитый вид: дорожка + инструмент — для чтения звука и превью.
  const st: SoundingTrack = { ...inst, ...track };
  const scope = `[data-track-id="${track.id}"]`;

  // ---- Сэмпл: буфер, выделение, FFT, ИИ ----
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [fftK, setFftK] = useState(64);
  const [f0Manual, setF0Manual] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStrength, setAiStrength] = useState(0.5);
  // Генерация сэмпла по описанию.
  const [prompt, setPrompt] = useState('');
  const [genSeconds, setGenSeconds] = useState(3);

  useEffect(() => {
    if (tab !== 'sample' || !inst.sampleId) {
      if (tab === 'sample') setBuffer(null);
      return;
    }
    let alive = true;
    void getBuffer(inst.sampleId).then((b) => {
      if (alive) setBuffer(b);
    });
    return () => {
      alive = false;
    };
  }, [tab, inst.sampleId, getBuffer]);

  const mono = useMemo(() => (buffer ? monoOf(buffer) : null), [buffer]);
  const dur = buffer?.duration ?? 0;
  const regStart = inst.sampleStart ?? 0;
  const regEnd = inst.sampleEnd ?? dur;
  const selSec: [number, number] | null =
    sel && sel[1] - sel[0] > 0.0005 && dur > 0
      ? [sel[0] * dur, sel[1] * dur]
      : null;

  // ---- Черновик волны ----
  // Правки вкладки «волна» (и FFT-разложение) пишутся сюда; звучащий
  // инструмент не меняется, пока черновик не применён.
  const applied: WaveDef = inst.wave ?? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] };
  const [draft, setDraft] = useState<WaveDef | null>(null);
  const wave = draft ?? applied;
  const cycle = useMemo(() => renderWaveCycle(wave, CYCLE_N), [wave]);
  // Форма звучащего тембра: пила/FM/шум — формулой, «своя волна» —
  // парциалами; модели без одной формы (струна, форманты…) — null.
  const soundingForm = useMemo(() => renderInstrumentCycle(inst), [inst]);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(applied);
  const applyDraft = () => {
    if (draft) onChangeInst({ waveform: 'wave', wave: draft });
    setDraft(null);
  };

  // Режим точек: локальная таблица (в черновик уходит конвертацией
  // в гармоники).
  const [points, setPoints] = useState<Float32Array | null>(null);
  const pointsRef = useRef<Float32Array | null>(null);
  pointsRef.current = points;

  // Главная линия канваса: рисунок → черновик → форма звучащего тембра.
  // Формы нет (модели без одной кривой) — заглушка-пояснение.
  const visibleData: Float32Array | null = points ?? (draft ? cycle : soundingForm);
  const formless = !points && !draft && soundingForm === null;

  const setPartial = (i: number, upd: Partial<WavePartial>) =>
    setDraft({ ...wave, partials: wave.partials.map((p, j) => (j === i ? { ...p, ...upd } : p)) });
  const removePartial = (i: number) =>
    setDraft({ ...wave, partials: wave.partials.filter((_, j) => j !== i) });
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
    const pts = Float32Array.from(pointsRef.current ?? visibleData ?? new Float32Array(CYCLE_N));
    const idx = Math.min(CYCLE_N - 1, Math.max(0, Math.round(x * CYCLE_N)));
    pts[idx] = amp;
    pointsRef.current = pts;
    setPoints(pts);
    const partials = cycleToPartials(pts, 64);
    if (partials.length > 0) setDraft({ partials });
  };

  /** Сэмпл → огрублённый набор гармоник: тембровый слепок куска.
   *  Уходит черновиком на вкладку «волна» — сравни с звучащим и примени. */
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
    onTab('wave');
  };

  // ---- Сохранить как свой пресет ----
  const [, bumpInstruments] = useState(0);
  const saveInstrumentAs = async () => {
    const current = instrumentNameOf(st);
    const suggested = current === 'своя настройка' ? track.name : current;
    const name = await promptDialog({
      title: 'сохранить инструмент',
      text: 'Пресет появится в панели инструментов, категория «мои»',
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
    saveUserPreset(n, st);
    bumpInstruments((v) => v + 1);
  };

  // ---- Скрэтч ----
  const scratchRef = useRef<HTMLDivElement | null>(null);
  const scratchRec = useRef<{ t0: number; pts: { dt: number; pos: number }[] } | null>(null);
  const [scratchArmed, setScratchArmed] = useState(false);
  const [scratchLive, setScratchLive] = useState(false);
  const [scratchPlaying, setScratchPlaying] = useState(false);
  const [scratchMap, setScratchMap] = useState<{ peaks: number[]; duration: number } | null>(null);
  const [dragPts, setDragPts] = useState<ScratchPoint[] | null>(null);
  const dragIdx = useRef<number | null>(null);
  const pendingAdd = useRef<{ t: number; pos: number } | null>(null);
  const downXY = useRef<{ x: number; y: number } | null>(null);

  // Мини-карта волны сэмпла для скрэтч-пэда.
  useEffect(() => {
    if (st.waveform !== 'sample' || (st.sampleMode ?? 'plain') !== 'scratch') return;
    let alive = true;
    void onScratchPeaks().then((m) => {
      if (alive) setScratchMap(m);
    });
    return () => {
      alive = false;
    };
  }, [st.waveform, st.sampleMode, st.sampleId, onScratchPeaks]);

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
  const unisonOk = UNISON_SOURCES.has(st.waveform) || (isSample && !scratchMode);

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
        <span className="we-title" title="Текущий инструмент: вычислен по параметрам — покрутил ручки, стал «свой»">
          {instrumentNameOf(st)}
          {dirty && tab === 'wave' ? ' · черновик волны не применён' : ''}
        </span>
        <span className="spacer" />
        <button
          className="env-listen"
          title="Прослушать ноту тоники текущим тембром"
          onClick={() => onPreviewNote(inst)}
        >
          ▶ нота
        </button>
        <button
          className="save-inst"
          data-ob="save-inst"
          title="Сохранить звук дорожки как свой пресет — появится в панели инструментов, категория «мои»"
          aria-label="сохранить инструмент"
          onClick={() => void saveInstrumentAs()}
        >
          {/* дискета: контур со срезом, жалюзи, окошко */}
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1.7 1.7h8.2l2.4 2.4v8.2H1.7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.2 1.7v3.6h4.6V1.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.2 12.3V8h4.6v4.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
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

      {tab === 'snd' && (
        <div className="we-body">
          <div className="group" data-ob="inst-group">
            {/* Волна — иконками, «как на приборе»: одна форма — один глиф. */}
            <div className="lbl" title="Форма волны осциллятора — основа тембра">
              волна
              <span className="wave-pick" data-ob="wave-pick">
                {WAVEFORMS.map((w) => (
                  <button
                    key={w}
                    className={st.waveform === w ? 'on' : ''}
                    title={WAVEFORM_LABELS[w]}
                    aria-label={WAVEFORM_LABELS[w]}
                    onClick={() => onChangeInst({ waveform: w })}
                  >
                    <WaveIcon wave={w} />
                  </button>
                ))}
              </span>
            </div>
            {st.waveform === 'fm' && (
              <>
                <label title="Отношение частоты модулятора к ноте. Целые (1, 2, 3) — гармоничные тембры; иррациональные (1.41 ≈ √2) — колокольный негармоничный звон">
                  FM-отношение, ×
                  <NumField value={st.fmRatio ?? 2} min={0.25} max={16} step={0.01} onChange={(fmRatio) => onChangeInst({ fmRatio })} />
                </label>
                <label title="Глубина модуляции: 0 — чистый синус, 1–3 — мягкие электронные тембры, 5+ — ржа и металл. Индекс тает к хвосту ноты">
                  FM-глубина
                  <NumField value={st.fmIndex ?? 3} min={0} max={16} step={0.1} onChange={(fmIndex) => onChangeInst({ fmIndex })} />
                </label>
              </>
            )}
            {MORPH_LABELS[st.waveform] && (
              <Knob
                label="морф"
                title={`Морф модели «${WAVEFORM_LABELS[st.waveform]}»: ${MORPH_LABELS[st.waveform]}. Двойной клик — точное число`}
                value={Math.round((st.voiceMorph ?? 0.5) * 100)}
                min={0} max={100} step={1}
                onChange={(v) => onChangeInst({ voiceMorph: v / 100 })}
              />
            )}
            {st.waveform === 'karplus' && (
              <label title="Сколько секунд струна звенит до полной тишины — собственное затухание струны, поверх обычной огибающей ноты">
                затухание струны, с
                <NumField value={st.ksLife ?? 2.5} min={0.2} max={8} step={0.1} onChange={(ksLife) => onChangeInst({ ksLife })} />
              </label>
            )}
            {isSample && (
              <label title="Сэмпл из хранилища. Строки нотного стана = скорость воспроизведения (×1 — как есть)" data-ob="snd-sample">
                сэмпл
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
            <button
              className="we-open"
              data-ob="we-open"
              aria-label="редактор волны"
              title="Вкладки «волна» и «сэмпл»: нарисовать свою волну или разложить сэмпл в гармоники"
              onClick={() => onTab(st.waveform === 'sample' ? 'sample' : 'wave')}
            >
              править волну…
            </button>
          </div>
        </div>
      )}

      {tab === 'env' && (
        <div className="we-body">
          <div className="env-tab" data-ob="env-tab">
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
          <div className="group sub" data-ob="unison-group">
            <span className="sub-cap">унисон</span>
            {unisonOk ? (
              isSample && (
                <span
                  className="scope-cap"
                  title="Унисон на сэмпле — N копий со скоростью ±детюн (хорус/стена из одного сэмпла); в гранулярном режиме — разброс зёрен"
                >
                  сэмпл
                </span>
              )
            ) : (
              <span
                className="scope-cap"
                title={
                  st.waveform === 'supersaw'
                    ? 'Супер-пила — уже унисон из семи пил: ширина задаётся ручкой «морф» на вкладке «источник»'
                    : 'Этот источник не играет унисоном — ручки молчат. Переключись на базовую волну или сэмпл'
                }
              >
                {st.waveform === 'supersaw' ? 'уже унисон — морф' : 'не для этого источника'}
              </span>
            )}
            <span className={'knob-row' + (unisonOk ? '' : ' dim')}>
              <Knob
                label="голоса"
                title="Унисон: сколько расстроенных копий играет на ноту. 1 — обычный голос; 3–5 — жирнее и шире. Двойной клик — точное число"
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

      {tab === 'wave' && (
        <div className="we-body">
          <div className="we-canvas-stack" data-ob="we-wave-canvas">
            {/* Призрак звучащего тембра — пока черновик не применён */}
            {dirty && soundingForm && (
              <div className="we-ghost" aria-hidden="true" title="Тонкая линия — звучащий сейчас тембр">
                <WaveCanvas data={soundingForm} sampleRate={CYCLE_N} cycles={4} />
              </div>
            )}
            {formless ? (
              <p className="empty">
                {st.waveform === 'sample'
                  ? 'Волна дорожки — «сэмпл»: её кусок, разложение в гармоники и скрэтч — на вкладке «сэмпл»'
                  : `Тембр «${WAVEFORM_LABELS[st.waveform]}» не рисуется одной формой — это модель: слушай «▶ нота» и крути ручки на вкладках «огибающая» и «тембр». Заготовка или «рисовать форму» соберут свою волну из гармоник — она ляжет черновиком`}
              </p>
            ) : visibleData ? (
              points ? (
                <WaveCanvas data={points} sampleRate={CYCLE_N} editable onDraw={drawPoint} />
              ) : (
                <WaveCanvas data={visibleData} sampleRate={CYCLE_N} cycles={4} />
              )
            ) : null}
          </div>
          <div className="we-row" data-ob="we-wave-tools">
            <span className="we-cap" title="Что звучит сейчас — меняется пресетами из панели инструментов">
              звучит: {WAVEFORM_LABELS[st.waveform]}
            </span>
            <span className="we-sep" />
            <span className="we-cap">заготовка:</span>
            {(['sine', 'saw', 'square', 'noise'] as const).map((k) => (
              <button
                key={k}
                title={`Пересобрать тембр: ${PARTIAL_TYPE_LABELS[k]}${k === 'noise' ? ' (зерно — размер крупы)' : ''} — ляжет в черновик`}
                onClick={() => {
                  pointsRef.current = null;
                  setPoints(null);
                  setDraft(genPartials(k));
                }}
              >
                {PARTIAL_TYPE_LABELS[k]}
              </button>
            ))}
            <span className="we-sep" />
            {points ? (
              <button
                title="Рисунок уже переведён в гармоники черновика — это возврат к их виду"
                onClick={() => {
                  pointsRef.current = null;
                  setPoints(null);
                }}
              >
                к гармоникам
              </button>
            ) : (
              <button
                title="Нарисовать форму мышью — черновик меняется прямо при рисовании, слушай «▶ нота»"
                onClick={() => {
                  const pts = Float32Array.from(visibleData ?? new Float32Array(CYCLE_N));
                  pointsRef.current = pts;
                  setPoints(pts);
                }}
              >
                рисовать форму
              </button>
            )}
            <span className="we-sep" />
            <button
              title="Прослушать одну ноту черновиком (тоника шкалы дорожки)"
              onClick={() => onPreviewNote({ ...inst, waveform: 'wave', wave })}
            >
              ▶ нота
            </button>
            <button
              className={dirty ? 'we-apply' : ''}
              disabled={!dirty}
              title="Черновик становится волной инструмента (тип волны — «своя волна»); до этого звучит прежний тембр"
              onClick={applyDraft}
            >
              применить
            </button>
            <button
              disabled={!dirty}
              title="Отбросить черновик: вернуться к звучащей волне"
              onClick={() => setDraft(null)}
            >
              сбросить
            </button>
          </div>

          <div className="we-partials" data-ob="we-partials">
            {wave.partials.length > 0 && (
              <div className="partial-row head" aria-hidden="true">
                <span />
                <span className="ph-cap">номер</span>
                <span className="ph-cap">громкость</span>
                <span className="ph-cap">форма</span>
              </div>
            )}
            {wave.partials.map((p, i) => (
              <div className="partial-row" key={i}>
                <button className="remove" title="Убрать гармонику" onClick={() => removePartial(i)}>×</button>
                <label title="Множитель к ноте: 2 — октава выше, 1.5 — квинта, дроби — микротюнинг тембра">
                  ×
                  <NumField
                    value={Math.round(p.ratio * 100) / 100} min={0.25} max={64} step={0.25} narrow
                    onChange={(v) => setPartial(i, { ratio: Math.round(v * 100) / 100 })}
                  />
                </label>
                <label title="Амплитуда гармоники, %">
                  <NumField
                    value={Math.round(p.amp * 100)} min={0} max={100} step={5} narrow
                    onChange={(v) => setPartial(i, { amp: v / 100 })}
                  />%
                </label>
                <select
                  value={p.type}
                  title="Форма гармоники"
                  onChange={(e) => setPartial(i, { type: e.target.value as WavePartial['type'] })}
                >
                  {(Object.keys(PARTIAL_TYPE_LABELS) as WavePartial['type'][]).map((t) => (
                    <option key={t} value={t}>{PARTIAL_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="we-row">
              <button onClick={addPartial} title="Добавить гармонику">+ гармоника</button>
              {hasNoise && (
                <label title="Размер зерна шумовых гармоник, мс: 10 — пыль, 100 — крупа, 300 — лоскуты">
                  зерно шума, мс
                  <NumField
                    value={Math.round(wave.noiseGrainMs ?? 40)} min={5} max={500} step={5}
                    onChange={(v) => setDraft({ ...wave, noiseGrainMs: Math.round(v) })}
                  />
                </label>
              )}
              <span className="mini-info">{wave.partials.length}/64 гармоник</span>
              {dirty && (
                <span className="mini-info" title="Черновик отличается от звучащей волны — «применить» перенесёт его в инструмент">
                  черновик не применён
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'sample' && (
        <div className="we-body">
          {!isSample && (
            <p className="empty">
              Волна дорожки — не «сэмпл». Переключи источник на вкладке «источник», и сэмпл
              появится в слоте
            </p>
          )}
          {isSample && (!inst.sampleId || !buffer ? (
            <p className="empty">
              {inst.sampleId
                ? 'сэмпл ещё грузится…'
                : 'в слоте нет сэмпла — выбери его на вкладке «источник»'}
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
                  title="Тембровый слепок куска (или всего сэмпла): усреднённый спектр → гармоники. Уйдёт черновиком на вкладку «волна» — сравни и примени"
                  onClick={decompose}
                >
                  разложить в гармоники
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
                  title="ИИ-преобразование сэмпла (audio-to-audio): опиши, что сделать с этим звуком — результат ляжет в слот новым сэмпла"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) onTransformSample(track.id, aiPrompt.trim(), aiStrength);
                  }}
                />
                <label title="Сила преобразования: 20% — лёгкая приправа, 80% — почти новый звук">
                  сила
                  <NumField
                    value={Math.round(aiStrength * 100)} min={5} max={100} step={5} narrow
                    onChange={(v) => setAiStrength(v / 100)}
                  />%
                </label>
                <button
                  disabled={!aiPrompt.trim() || busy}
                  onClick={() => onTransformSample(track.id, aiPrompt.trim(), aiStrength)}
                >
                  {busy ? 'преобразую…' : 'преобразовать'}
                </button>
              </div>
            </>
          ))}

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
    </div>
  );
}
