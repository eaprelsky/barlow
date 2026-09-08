import type { SamplePCM } from '../audio/pcm';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  AutoTarget,
  Effect,
  Instrument,
  Mod,
  Note,
  NoteLocks,
  Pattern,
  SoundingTrack,
  Step,
  Track,
} from '../types';
import {
  AUTO_TARGET_LABELS,
  EFFECT_LABELS,
  makeNote,
  makeStep,
  scaleOf,
  uid,
} from '../types';
import type { MutateModes } from '../music/mutate';
import { instrumentNameOf } from '../music/instrumentPresets';
import { bakeModToPoints } from '../music/modCurve';
import { effectId, effectIndex, sameAddress } from '../music/effectAddress';
import { modRateHz } from '../types';
import { parseRatio } from '../parameters';
import { soundForAudition } from '../music/audition';
import { PatternChips } from './PatternChips';
import { RollTools } from './RollTools';
import { LevelBar } from './LevelBar';
import { NumField } from './NumField';
import { NoteLocksEditor } from './NoteLocksEditor';
import { SliderField } from './SliderField';
import { Knob } from './Knob';
import type { InstEditorTab } from './InstrumentEditor';
import { InstrumentWorkspace } from './InstrumentWorkspace';
import { AutoLane } from './AutoLane';
import { alertDialog } from './dialogs';
import { SamplePicker } from './SamplePicker';
import { putSample } from '../audio/library';
import { tickDuration, stepDuration } from '../audio/timing';
import { clip } from '../music/clip';
import { copySelection, moveSelection, pasteNotes } from '../music/noteEdits';
import { HelpHint } from '../onboarding/Onboarding';

const LFO_SHAPES: Mod['shape'][] = ['sine', 'triangle', 'square', 'sawtooth'];
// Подписи форм LFO — свои: типов волны с тех пор всего два (v39).
const LFO_SHAPE_LABELS: Record<Mod['shape'], string> = {
  sine: 'синус',
  triangle: 'треугольник',
  square: 'прямоугольник',
  sawtooth: 'пила',
};
const MOD_SOURCE_LABELS: Record<string, string> = {
  lfo: 'LFO',
  sah: 'ступени (S&H)',
  perlin: 'перлин',
};

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

/** Заняты ли ноты в добавленной октаве (удалять нельзя). Дельта строк —
 *  фактическая: шкала с отношением 2 схлопывается с новой октавой,
 *  строк добавляется меньше длины шкалы. */
function octaveBusy(track: Track, dir: 'up' | 'down', delta: number): boolean {
  const rows = scaleOf(track).length;
  const from = dir === 'up' ? rows - delta : 0;
  const to = dir === 'up' ? rows : delta;
  return track.patterns.some((pt) =>
    pt.steps.some((s) => s.notes.some((nt) => nt.n >= from && nt.n < to)),
  );
}

/** Срезать октаву из самой шкалы: счётчики добавленных октав на нуле,
 *  а диапазон шире одной октавы (пелог, гармоники 8–16). Сверху уходят
 *  отношения от 2^⌊log2(max)⌋, снизу — ниже 2×min. Частоты нот
 *  сохраняются: тоника не трогается, срезается только край шкалы.
 *  null — срезать нечего. delta — сколько строк стана уйдёт (по факту:
 *  схлопнувшиеся с добавленными октавами строки учтены scaleOf). */
function trimScaleOctave(
  track: Track,
  dir: 'up' | 'down',
): { scale: number[]; delta: number } | null {
  const scale = [...track.scale].sort((a, b) => a - b);
  const min = scale[0];
  const max = scale[scale.length - 1];
  if (!(min > 0) || !(max > min)) return null;
  const next =
    dir === 'up'
      ? scale.filter((r) => r < 2 ** Math.floor(Math.log2(max)))
      : scale.filter((r) => r >= min * 2);
  if (next.length === 0 || next.length === scale.length) return null;
  const delta = scaleOf(track).length - scaleOf({ ...track, scale: next }).length;
  return delta > 0 ? { scale: next, delta } : null;
}

interface Props {
  track: Track;
  /** Инструмент дорожки: тембр, огибающая ноты, фильтры (v34). */
  inst: Instrument;
  /** Правка инструмента этой дорожки (App отвяжет копией, если он общий). */
  onChangeInst: (trackId: string, inst: Instrument, command?: boolean) => void;
  pattern: Pattern;
  bpm: number;
  activeStep: number;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onChange: (id: string, t: Track) => void;
  // структурные правки трека (октавы/шкала — правят ноты) — отдельный шаг undo
  onTrackCommand: (id: string, t: Track) => void;
  onPatternChange: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
  // steps-правки (клики, перенос, вставка, удаление) — отдельный шаг undo
  onPatternCommand: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
  onSelectPattern: (trackId: string, patternId: string) => void;
  /** Мьют слота текущей сцены (v38): тишина в этой сцене при живых часах. */
  slotMuted: boolean;
  onToggleSlotMute: (trackId: string) => void;
  onAddPattern: (trackId: string, fromSlices?: boolean) => void;
  onForkPattern: (trackId: string, patternId: string) => void;
  onRemovePattern: (trackId: string, patternId: string) => void;
  /** Заполнение одной оси стана; клик по кнопке оси применяет её сразу. */
  onFillAxis: (
    id: string,
    axis: 'time' | 'height',
    mode: 'even' | 'random' | 'ladder' | 'one',
    pulses: number,
  ) => void;
  onMutate: (id: string, modes: MutateModes, edits: number) => void;
  getLevel: (id: string) => number;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (fromId: string, toId: string, place: 'before' | 'after') => void;
  soloActive: boolean;
  onSolo: (trackId: string) => void;
  /** Дорожка — цель открытой панели инструментов: пресеты лягут сюда. */
  libTarget?: boolean;
  onScratchBegin: (pos: number) => void;
  onScratchMove: (pos: number) => void;
  onScratchEnd: () => void;
  onScratchPreview: () => void;
  /** Заморозить жест сэмпла: рендер в библиотеку сэмплов. name — из поля
   *  у кнопки (нетронутое/пустое — App добавит штамп даты-времени). */
  onScratchSave: (trackId: string, name?: string) => void | Promise<void>;
  onScratchPeaks: () => Promise<{ peaks: number[]; duration: number } | null>;
  patternSceneCounts: Record<string, number>;
  /** В скольких сценах дорожка в мьюте — счётчик чипа M. */
  muteSceneCount: number;
  // Для сайдчейна и связки инструментов: все дорожки патча.
  allTracks: { id: string; name: string; instrumentId: string }[];
  onGenerateSample: (trackId: string, prompt: string, seconds: number) => void;
  onTransformSample: (trackId: string, prompt: string, strength: number, duration?: number) => void;
  genBusy: boolean;
  onCancelSampleJob: () => void;
  // Редактор инструмента: раздвижной режим карточки — остальной
  // интерфейс трека съёживается, редактор занимает его место.
  editorOpen: boolean;
  editorTab: InstEditorTab;
  onEditorTab: (t: InstEditorTab) => void;
  onOpenEditor: (id: string, tab?: InstEditorTab) => void;
  onCloseEditor: () => void;
  onGetSamplePCM: (id?: string) => Promise<SamplePCM | null>;
  onPreviewSampleRegion: (track: SoundingTrack, fromSec: number, toSec: number) => void;
  onPreviewNote: (track: Track) => void;
  /** Открыть панель инструментов с применением к этой дорожке. */
  onOpenBrowser: (trackId: string, tab?: 'inst' | 'smp') => void;
}

export const TrackRow = memo(function TrackRow({
  track,
  inst,
  onChangeInst,
  pattern,
  bpm,
  activeStep,
  collapsed,
  onToggleCollapse,
  onChange,
  onTrackCommand,
  onPatternChange,
  onPatternCommand,
  onSelectPattern,
  slotMuted,
  onToggleSlotMute,
  onAddPattern,
  onForkPattern,
  onRemovePattern,
  onFillAxis,
  onMutate,
  getLevel,
  onRemove,
  onDuplicate,
  onReorder,
  soloActive,
  onSolo,
  libTarget,
  onScratchBegin,
  onScratchMove,
  onScratchEnd,
  onScratchPreview,
  onScratchSave,
  onScratchPeaks,
  patternSceneCounts,
  muteSceneCount,
  allTracks,
  onGenerateSample,
  onTransformSample,
  genBusy,
  onCancelSampleJob,
  editorOpen,
  editorTab,
  onEditorTab,
  onOpenEditor,
  onCloseEditor,
  onGetSamplePCM,
  onPreviewSampleRegion,
  onPreviewNote,
  onOpenBrowser,
}: Props) {
  // Панель заполнения (пульсы, оси мутации, уровень) живёт в RollTools.
  const readLevel = useCallback(() => getLevel(track.id), [getLevel, track.id]);

  /** Парсер своей шкалы живёт в music/scales (parseRatios) — используется
   *  модалкой выбора шкалы вместе с N-ET и пресетами. */

  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  // Нотка/звук — вкладки трека: открыта максимум одна. Редактор
  // инструмента живёт в App (он съёживает остальные треки), отсюда
  // только открывается. Две сущности карточки: «эскиз» — партия (ноты и
  // её ручки, вид по умолчанию), «трек» — общее и комната.
  const [view, setView] = useState<'sketch' | 'track'>('sketch');
  // Смена вида закрывает редактор инструмента.
  const switchView = (v: 'sketch' | 'track') => {
    if (editorOpen) onCloseEditor();
    setView(v);
  };
  const [showPicker, setShowPicker] = useState(false);
  const [customRate, setCustomRate] = useState(false);
  const [rateDraft, setRateDraft] = useState<string | null>(null);
  const [focusCell, setFocusCell] = useState({ col: 0, row: 0 });
  // Перетаскивание трека за ручку слева: линия вставки сверху/снизу карточки.
  const [dropSide, setDropSide] = useState<'above' | 'below' | null>(null);
  const dragProps = {
    onDragOver: (e: ReactDragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes('text/plain')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = e.currentTarget.getBoundingClientRect();
      setDropSide(e.clientY - r.top < r.height / 2 ? 'above' : 'below');
    },
    onDragLeave: (e: ReactDragEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropSide(null);
    },
    onDrop: (e: ReactDragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDropSide(null);
      const fromId = e.dataTransfer.getData('text/plain');
      if (!fromId || fromId === track.id) return;
      onReorder(fromId, track.id, dropSide === 'below' ? 'after' : 'before');
    },
  };
  const grip = (
    <span
      className="track-grip"
      title="Перетащи вверх или вниз — треки поменяются местами"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', track.id);
      }}
    >
      ⠿
    </span>
  );
  // Вкладки внутри «трека»; модуляции — раздел автоматизации эскиза.
  // Кривые партии: какая цель рисуется.
  const [autoTarget, setAutoTarget] = useState<AutoTarget>('volume');
  const [autoFxId, setAutoFxId] = useState<string>();
  // Дорожка автоматизации под станом — открыта/закрыта (UI-состояние).
  const [autoLane, setAutoLane] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);

  // Диапазон стана (мир): базовая шкала + добавленные октавы. Окно — какие
  // строки мира видны; по умолчанию (null) — весь диапазон. Листалка ▲/▼
  // сдвигает окно на октаву: строк столько же, ноты не меняются — ушедшие
  // за край строки играют, но не видны. UI-состояние, а не патч:
  // перезагрузка снова показывает весь диапазон, музыка не зависит.
  const scaleRows = scaleOf(track);
  const up = track.scaleOctUp ?? 0;
  const down = track.scaleOctDown ?? 0;
  const [rollView, setRollView] = useState<{ lo: number; rows: number } | null>(null);
  const rollWin = rollView ?? { lo: 0, rows: scaleRows.length };
  const viewLo = Math.max(0, Math.min(rollWin.lo, scaleRows.length - 1));
  const viewHi = Math.max(viewLo + 1, Math.min(rollWin.lo + rollWin.rows, scaleRows.length));
  const rows = scaleRows.map((ratio, i) => ({ ratio, i })).slice(viewLo, viewHi).reverse();
  const focusedRow = rows.some(r => r.i === focusCell.row) ? focusCell.row : rows[rows.length - 1]?.i;
  const focusedCol = Math.min(focusCell.col, pattern.length - 1);

  // Мир сжался (undo, правки снаружи) — окно могло выйти за диапазон.
  useEffect(() => {
    setRollView((v) => {
      if (!v) return v;
      const l = scaleRows.length;
      const lo = Math.min(v.lo, Math.max(0, l - v.rows));
      const n = Math.min(v.rows, l - lo);
      return lo === v.lo && n === v.rows ? v : { lo, rows: n };
    });
  }, [scaleRows.length]);

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeInst = (patch: Partial<Instrument>, command?: boolean) =>
    onChangeInst(track.id, { ...inst, ...patch }, command);
  // Слитый вид: дорожка + инструмент — для чтения звука и вызовов синтеза.
  const st: SoundingTrack = { ...inst, ...track };
  // Истинная длительность НОВОЙ ноты в клетках стана: по сетке (noteSteps)
  // или по огибающей (атака + спад), в шагах эффективного темпа. Ноты со
  // своей длиной (len, v37) от этой базы не зависят. Объявлено рано:
  // нужно и колесу над станом (stateRef), и рисовалке.
  const noteCellsBase =
    st.noteSteps && st.noteSteps > 0
      ? st.noteSteps
      : (Math.max(st.attack, 0.0005) + st.decay) /
        ((pattern.rate ?? track.rate) * tickDuration(bpm));
  const changeSteps = (steps: Step[]) => onPatternCommand(track.id, pattern.id, { steps });

  const loadSampleFile = (f: File) => {
    void putSample(f, f.name)
      .then((meta) => changeInst({ sampleId: meta.id, sampleName: meta.name }))
      .catch(() => void alertDialog('Не удалось сохранить сэмпл в хранилище', 'сэмпл'));
  };

  const setLength = (length: number) => {
    const clamped = Math.max(1, Math.min(64, Math.round(length) || 1));
    const steps = pattern.steps.slice(0, clamped);
    while (steps.length < clamped) steps.push(makeStep());
    setSelectedCol((c) => (c !== null && c >= clamped ? null : c));
    onPatternCommand(track.id, pattern.id, { length: clamped, steps });
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

  /** Применить шкалу (пресет, N-ET или своя): сбрасывает октавные сдвиги
   *  и клампит ноты всех эскизов под новую длину стана. */
  const applyScale = (scale: number[]) => {
    setRollView(null); // мир другой формы — окно на весь диапазон
    onTrackCommand(track.id, {
      ...track,
      scale,
      scaleOctUp: 0,
      scaleOctDown: 0,
      patterns: clampAllNotes(scale.length - 1),
    });
  };

  // Добавление/удаление октавы: ноты остаются на своих высотах. Индекс
  // ноты — позиция в отсортированном массиве строк, октава снизу
  // вставляет строки в начало и сдвигает индексы — компенсируем дельтой
  // фактического числа новых строк (шкалы с отношением 2 схлопываются).
  const addOctave = (dir: 'up' | 'down') => {
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    const now = (track[key] ?? 0) + 1;
    if (now > 4) return;
    const delta = scaleOf({ ...track, [key]: now }).length - scaleOf(track).length;
    const patterns =
      dir === 'down' && delta > 0
        ? track.patterns.map((pt) => ({
            ...pt,
            steps: pt.steps.map((s) => ({
              ...s,
              notes: s.notes.map((nt) => ({ ...nt, n: nt.n + delta })),
            })),
          }))
        : track.patterns;
    onTrackCommand(track.id, { ...track, [key]: now, patterns } as Track);
    // Окно: «+окт» обязан показать новую октаву. Окно у края диапазона
    // (или весь диапазон) — прирастает новой октавой; листанное окно —
    // прижимается к новому краю, высота окна не меняется.
    setRollView((v) => {
      if (!v) return null;
      if (dir === 'up')
        return v.lo + v.rows === scaleRows.length
          ? { ...v, rows: v.rows + delta }
          : { lo: scaleRows.length + delta - v.rows, rows: v.rows };
      return v.lo === 0 ? { ...v, rows: v.rows + delta } : { lo: 0, rows: v.rows };
    });
  };

  /** Мир стана ужался с края (удаление октавы, срез из шкалы): окно едет
   *  за контентом, чтобы видимые ноты остались на своих высотах. */
  const shrinkView = (dir: 'up' | 'down', delta: number) => {
    setRollView((v) => {
      if (!v || delta <= 0) return v;
      if (dir === 'up')
        return { ...v, rows: Math.max(1, Math.min(v.rows, scaleRows.length - delta - v.lo)) };
      const lo = Math.max(0, v.lo - delta);
      return { lo, rows: Math.max(1, v.rows - (v.lo - lo)) };
    });
  };

  const removeOctave = (dir: 'up' | 'down') => {
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    const now = (track[key] ?? 0) - 1;
    if (now >= 0) {
      const delta = scaleOf(track).length - scaleOf({ ...track, [key]: now }).length;
      if (octaveBusy(track, dir, delta)) return;
      const patterns =
        dir === 'down' && delta > 0
          ? track.patterns.map((pt) => ({
              ...pt,
              steps: pt.steps.map((s) => ({
                ...s,
                notes: s.notes
                  .map((nt) => ({ ...nt, n: nt.n - delta }))
                  .filter((nt) => nt.n >= 0),
              })),
            }))
          : track.patterns;
      onTrackCommand(track.id, { ...track, [key]: now, patterns } as Track);
      shrinkView(dir, delta);
      return;
    }
    // Счётчики на нуле — срезаем октаву из самой шкалы (широкие пресеты:
    // пелог, гармоники 8–16 несут несколько октав в отношениях). Частоты
    // нот сохраняются: сверху пропадают верхние строки, снизу тоника
    // остаётся — шкала теряет нижний блок отношений.
    const cut = trimScaleOctave(track, dir);
    if (!cut) return;
    if (octaveBusy(track, dir, cut.delta)) return;
    const patterns =
      dir === 'down'
        ? track.patterns.map((pt) => ({
            ...pt,
            steps: pt.steps.map((s) => ({
              ...s,
              notes: s.notes
                .map((nt) => ({ ...nt, n: nt.n - cut.delta }))
                .filter((nt) => nt.n >= 0),
            })),
          }))
        : track.patterns;
    onTrackCommand(track.id, { ...track, scale: cut.scale, patterns });
    shrinkView(dir, cut.delta);
  };

  /** Строк в крайней октаве диапазона: счётчик добавленных октав больше
   *  нуля — сколько строк занимает крайняя, ноль — сколько добавит новая. */
  const edgeOctRows = (dir: 'up' | 'down'): number => {
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    const cnt = dir === 'up' ? up : down;
    return cnt > 0
      ? scaleRows.length - scaleOf({ ...track, [key]: cnt - 1 }).length
      : scaleOf({ ...track, [key]: 1 }).length - scaleRows.length;
  };

  /** Листалка окна стана (▲/▼ между «+окт» и «−»): окно уезжает на октаву,
   *  строк столько же, ноты не меняются — ушедшие строки прячутся за край,
   *  но играют. Внутри диапазона — чистый сдвиг вида (истории не касается);
   *  у края — доращивает октаву, это правка патча (один шаг undo). */
  const flipOct = (dir: 'up' | 'down') => {
    const d = edgeOctRows(dir);
    if (d <= 0) return;
    if (dir === 'up') {
      if (scaleRows.length - (rollWin.lo + rollWin.rows) >= d) {
        setRollView({ lo: rollWin.lo + d, rows: rollWin.rows });
        return;
      }
      if (up + 1 > 4) return;
      onTrackCommand(track.id, { ...track, scaleOctUp: up + 1 } as Track);
      setRollView({ lo: rollWin.lo + d, rows: rollWin.rows });
    } else {
      if (rollWin.lo >= d) {
        setRollView({ lo: rollWin.lo - d, rows: rollWin.rows });
        return;
      }
      if (down + 1 > 4) return;
      // Дорастить снизу — с компенсацией нот, как «+окт вниз» (частоты те
      // же). Окно закрепляем на месте (и фиксируем его высоту, если видели
      // весь диапазон): контент уезжает над окном, снизу входит новая октава.
      const patterns = track.patterns.map((pt) => ({
        ...pt,
        steps: pt.steps.map((s) => ({
          ...s,
          notes: s.notes.map((nt) => ({ ...nt, n: nt.n + d })),
        })),
      }));
      onTrackCommand(track.id, { ...track, scaleOctDown: down + 1, patterns } as Track);
      setRollView({ lo: rollWin.lo, rows: rollWin.rows });
    }
  };

  /** Листать можно, пока есть куда: скрытые строки за краем окна или
   *  запас счётчика октав (лимит 4, как у «+окт»). */
  const canFlip = (dir: 'up' | 'down'): boolean => {
    const cnt = dir === 'up' ? up : down;
    const hidden = dir === 'up' ? scaleRows.length - (rollWin.lo + rollWin.rows) : rollWin.lo;
    return hidden > 0 || cnt < 4;
  };

  // Клик по ячейке: добавить/убрать ноту на этой высоте. Несколько нот в
  // колонке — аккорд; когда нот не остаётся — пауза. Новая нота фиксирует
  // текущую длину рисовалки (len) — смена «ноты» трека её уже не тронет.
  const clickCell = (col: number, row: number) => {
    changeSteps(
      pattern.steps.map((s, j) => {
        if (j !== col) return s;
        const has = s.notes.some((nt) => nt.n === row);
        const notes = has
          ? s.notes.filter((nt) => nt.n !== row)
          : [...s.notes, makeNote(row, 0.8, 1, +noteCellsBase.toFixed(2))];
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

  // Слайдер панели шага — коалесцируется (движение = один шаг undo),
  // в отличие от командных правок нот.
  const setNoteField = (col: number, row: number, field: 'vel' | 'prob' | 'len' | 'ratchet' | 'microTimingMs', v: number) => {
    onPatternChange(
      track.id,
      pattern.id,
      {
        steps: pattern.steps.map((s, j) =>
          j === col
            ? { ...s, notes: s.notes.map((nt) => (nt.n === row ? { ...nt, [field]: v } : nt)) }
            : s,
        ),
      },
    );
  };

  const clearCell = (col: number) => {
    changeSteps(pattern.steps.map((s, j) => (j === col ? { ...s, notes: [] } : s)));
  };
  const setNoteLocks = (col: number, row: number, locks: NoteLocks | undefined, command: boolean) => {
    const change = command ? onPatternCommand : onPatternChange;
    change(track.id, pattern.id, { steps: pattern.steps.map((step, i) => i === col
      ? { ...step, notes: step.notes.map(note => note.n === row ? { ...note, locks } : note) } : step) });
  };

  // ---- Мультиселект нот: рамка, перенос группы, копипаст, удаление ----

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [noteEditMessage, setNoteEditMessage] = useState('');
  const [box, setBox] = useState<{ c0: number; r0: number; c1: number; r1: number } | null>(null);
  const [ghost, setGhost] = useState<{ dc: number; dr: number } | null>(null);
  // Растяжение ноты за правый край бара: стартовая длина в клетках.
  // Если тянут выделенную ноту — дельту длины получают все выделенные.
  const grabRef = useRef<null | {
    col: number;
    row: number;
    pointerId: number;
    startX: number;
    startCells: number;
    startLens: Map<string, number>;
  }>(null);
  const dragRef = useRef<null | {
    mode: 'pending' | 'box' | 'move';
    col: number;
    row: number;
    pointerId: number;
  }>(null);

  // Смена эскиза — прежнее выделение не про эти ноты.
  useEffect(() => {
    setSel(new Set());
  }, [pattern.id]);

  const cellFromPoint = (x: number, y: number): { col: number; row: number } | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('.cell') as HTMLElement | null;
    if (!el || !rollRef.current?.contains(el)) return null;
    const col = Number(el.dataset.col);
    const row = Number(el.dataset.row);
    return Number.isFinite(col) && Number.isFinite(row) ? { col, row } : null;
  };

  const cellDown = (e: ReactPointerEvent<HTMLButtonElement>, col: number, row: number, onNote: boolean) => {
    if (e.button !== 0) return;
    e.currentTarget.focus();
    clip.activeTrackId = track.id;
    if (e.shiftKey) {
      // Shift-клик: по ноте — toggle её, по пустой клетке — toggle колонки.
      const key = `${col}:${row}`;
      setSel((prev) => {
        const next = new Set(prev);
        if (onNote) {
          if (next.has(key)) next.delete(key);
          else next.add(key);
        } else {
          const notes = pattern.steps[col]?.notes ?? [];
          const allSel = notes.length > 0 && notes.every((nt) => next.has(`${col}:${nt.n}`));
          for (const nt of notes) {
            const k = `${col}:${nt.n}`;
            if (allSel) next.delete(k);
            else next.add(k);
          }
        }
        return next;
      });
      return;
    }
    dragRef.current = { mode: 'pending', col, row, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const cellMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (d.mode === 'pending') {
      if (cell.col === d.col && cell.row === d.row) return;
      const onNote = pattern.steps[d.col]?.notes.some((x) => x.n === d.row) ?? false;
      const key = `${d.col}:${d.row}`;
      if (sel.has(key)) d.mode = 'move';
      else if (onNote) {
        // Тянут ноту сразу, без предварительного выделения: нота сама
        // становится выделением и едет. Клик без движения — как раньше,
        // ставит/убирает ноту.
        d.mode = 'move';
        setSel(new Set([key]));
      } else d.mode = 'box';
    }
    if (d.mode === 'box') setBox({ c0: d.col, r0: d.row, c1: cell.col, r1: cell.row });
    else setGhost({ dc: cell.col - d.col, dr: cell.row - d.row });
  };

  const cellUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.mode === 'pending') {
      // Клик без движения: по выделенной ноте (или в пустоту при активном
      // выделении) — снять выделение; иначе — нота туда/обратно, как всегда.
      const onNote = pattern.steps[d.col]?.notes.some((x) => x.n === d.row) ?? false;
      if ((onNote && sel.has(`${d.col}:${d.row}`)) || (!onNote && sel.size > 0)) {
        setSel(new Set());
        return;
      }
      if (onNote) removeNoteAt(d.col, d.row);
      else clickCell(d.col, d.row);
      return;
    }
    if (d.mode === 'box') {
      const cell = cellFromPoint(e.clientX, e.clientY);
      const b = box;
      setBox(null);
      if (!b && !cell) return;
      // Финальная точка — из события: последнее pointermove могло не дойти
      // (браузер коалесцирует быстрые движения).
      const c1 = cell?.col ?? b!.c1;
      const r1 = cell?.row ?? b!.r1;
      const [c0, c1s] = d.col <= c1 ? [d.col, c1] : [c1, d.col];
      const [r0, r1s] = d.row <= r1 ? [d.row, r1] : [r1, d.row];
      const next = new Set<string>();
      for (let c = c0; c <= c1s; c++) {
        for (const nt of pattern.steps[c]?.notes ?? []) {
          if (nt.n >= r0 && nt.n <= r1s) next.add(`${c}:${nt.n}`);
        }
      }
      setSel(next);
      return;
    }
    setGhost(null);
    const cell = cellFromPoint(e.clientX, e.clientY);
    const dc = cell ? cell.col - d.col : ghost?.dc ?? 0;
    const dr = cell ? cell.row - d.row : ghost?.dr ?? 0;
    if (dc || dr) applyMove(dc, dr);
  };

  /** Перенос выделенной группы: общий сдвиг клампится краями стана и цикла. */
  const applyMove = (dc: number, dr: number) => {
    const result = moveSelection(pattern.steps, sel, dc, dr, scaleOf(track).length);
    setNoteEditMessage(result.blocked ? 'Перенос отменён: место занято другой нотой. Исходные ноты сохранены.' : '');
    if (result.steps !== pattern.steps) { changeSteps(result.steps); setSel(result.selection); }
  };

  const pasteClip = () => {
    if (!clip.notes.length) return;
    const result = pasteNotes(pattern.steps, clip.notes, selectedCol ?? 0, scaleOf(track).length);
    changeSteps(result.steps); setSel(result.selection);
    setNoteEditMessage(result.skipped ? `Не вставлено ${result.skipped} нот: место занято или находится за границей цикла.` : '');
  };

  const duplicateSel = () => {
    const notes = copySelection(pattern.steps, sel);
    if (!notes.length) return;
    const target = notes.reduce((max, note) => Math.max(max, note.col), -1) + 1;
    const result = pasteNotes(pattern.steps, notes, target, scaleOf(track).length);
    changeSteps(result.steps); setSel(result.selection);
    setNoteEditMessage(result.skipped ? `Не скопировано ${result.skipped} нот: место занято или находится за границей цикла.` : '');
  };

  // Клавиатура — только у стана, работавшего последним.
  // e.code (физическая клавиша): буквы не зависят от раскладки —
  // Ctrl+C работает и на русской (e.key дал бы кириллическую «с»).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (clip.activeTrackId !== track.id) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.code === 'KeyC' && sel.size > 0) {
        e.preventDefault();
        clip.notes = copySelection(pattern.steps, sel);
      } else if (meta && e.code === 'KeyV' && clip.notes.length > 0) {
        e.preventDefault();
        pasteClip();
      } else if (meta && e.code === 'KeyD' && sel.size > 0) {
        e.preventDefault();
        duplicateSel();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size > 0) {
        e.preventDefault();
        changeSteps(
          pattern.steps.map((st, c) => ({
            ...st,
            notes: st.notes.filter((nt) => !sel.has(`${c}:${nt.n}`)),
          })),
        );
        setSel(new Set());
      } else if (e.key === 'Escape' && sel.size > 0) {
        setSel(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Колесо над нотой — шорткат громкости/вероятности (как в панели шага).
  // Нативный слушатель с passive:false — React-овый onWheel пассивный.
  const stateRef = useRef({ track, pattern, onPatternChange, sel, noteCellsBase });
  stateRef.current = { track, pattern, onPatternChange, sel, noteCellsBase };
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (!cell) return;
      const col = Number(cell.dataset.col);
      const row = Number(cell.dataset.row);
      const { pattern: pt, onPatternChange: changeOne, sel: selSet } = stateRef.current;
      const s = pt.steps[col];
      const nt = s?.notes.find((x) => x.n === row);
      if (!nt) return;
      e.preventDefault();
      // Alt — длина ноты в шагах (шаг 0.1), Shift — вероятность, просто колесо — громкость.
      const step = e.altKey ? 0.1 : 0.05;
      const d = e.deltaY < 0 ? step : -step;
      const field = (x: Note) =>
        e.altKey
          ? {
              ...x,
              len: Math.min(
                64,
                Math.max(
                  0.1,
                  +((x.len ?? stateRef.current.noteCellsBase * (x.gate ?? 1)) + d).toFixed(2),
                ),
              ),
            }
          : e.shiftKey
            ? { ...x, prob: Math.min(1, Math.max(0, x.prob + d)) }
            : { ...x, vel: Math.min(1, Math.max(0.05, x.vel + d)) };
      // Колесо над выделенной нотой крутит поле сразу у всей группы.
      if (selSet.has(`${col}:${row}`)) {
        changeOne(stateRef.current.track.id, pt.id, {
          steps: pt.steps.map((st, j) => ({
            ...st,
            notes: st.notes.map((x) => {
              if (!selSet.has(`${j}:${x.n}`)) return x;
              return field(x);
            }),
          })),
        });
        return;
      }
      changeOne(stateRef.current.track.id, pt.id, {
        steps: pt.steps.map((st, j) =>
          j !== col
            ? st
            : {
                ...st,
                notes: st.notes.map((x) => (x.n === row ? field(x) : x)),
              },
        ),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Эффекты — на треке: фильтр → эффекты → панорама.
  const effects = track.effects ?? [];
  const fxOptions = effects.map((e, i) => ({ id: effectId(e, i), label: `${i + 1}. ${EFFECT_LABELS[e.type]}` }));
  for (const m of [...(pattern.automation ?? []), ...(pattern.mods ?? track.mods)]) {
    if (m.target.startsWith('fx') && m.fxId && !fxOptions.some(o => o.id === m.fxId)) fxOptions.push({ id: m.fxId, label: 'Удалённый эффект' });
  }
  const laneFxId = fxOptions.some(o => o.id === autoFxId) ? autoFxId : fxOptions[0]?.id;
  const laneFx = effects[effectIndex(effects, laneFxId)];

  // Вкладка автоматизации = цель: кривая на дорожке и модуляции одной
  // цели живут вместе, цель задаётся здесь и только здесь. Цели fx*
  // появляются при наличии эффектов (адресуются по стабильному ID).
  const autoTargets: AutoTarget[] = ['volume', 'filterFreq', 'pan'];
  if (fxOptions.length > 0) autoTargets.push('fxMix');
  if (laneFx?.type === 'delay' || (!laneFx && fxOptions.length)
    || [...(pattern.automation ?? []), ...(pattern.mods ?? track.mods)].some(m => (m.target === 'fxTime' || m.target === 'fxFeedback') && sameAddress(m, m.target, laneFxId, effects))) autoTargets.push('fxTime', 'fxFeedback');
  // Активная fx-вкладка пропала (эффекты сняли) — рисуем громкость.
  const laneTarget: AutoTarget = autoTargets.includes(autoTarget) ? autoTarget : 'volume';
  const laneMatches = (m: { target: string; fxId?: string }) => sameAddress(m, laneTarget, laneFxId, effects);
  const laneSupported = !laneTarget.startsWith('fx') || !!laneFx && (laneTarget === 'fxMix' || laneFx.type === 'delay');

  // Модуляции живут на эскизе: первая правка переносит наследованный
  // с трека список в этот эскиз (правки дальше — только здесь).
  const changePatternMods = (mods: Mod[]) => onPatternChange(track.id, pattern.id, { mods });

  const updateMod = (i: number, upd: Partial<Mod>) => {
    const base = pattern.mods ?? track.mods;
    changePatternMods(base.map((m, j) => (j === i ? { ...m, ...upd } : m)));
  };

  const addMod = () => {
    const base = pattern.mods ?? track.mods;
    if (base.length >= 16 || !laneSupported) return;
    changePatternMods([...base, { target: laneTarget, fxId: laneTarget.startsWith('fx') ? laneFxId : undefined, shape: 'sine', rate: 0.2, depth: 0.5 }]);
  };

  const removeMod = (i: number) =>
    changePatternMods((pattern.mods ?? track.mods).filter((_, j) => j !== i));

  const updateDelay = (i: number, upd: Partial<Extract<Effect, { type: 'delay' }>>) =>
    change({ effects: effects.map((e, j) => (j === i && e.type === 'delay' ? { ...e, ...upd } : e)) });
  const updateReverb = (i: number, upd: Partial<Extract<Effect, { type: 'reverb' }>>) =>
    change({ effects: effects.map((e, j) => (j === i && e.type === 'reverb' ? { ...e, ...upd } : e)) });
  const updateEffect = <T extends Effect['type']>(i: number, type: T, upd: Partial<Extract<Effect, { type: T }>>) =>
    change({
      effects: effects.map((e, j) => (j === i && e.type === type ? ({ ...e, ...upd } as Effect) : e)),
    });
  const setEffectType = (i: number, type: Effect['type']) =>
    change({
      effects: effects.map((e, j) => {
        if (j !== i) return e;
        const mix = e.mix;
        const id = effectId(e, j);
        if (type === 'delay') return { id, type: 'delay', timeSec: 0.28, feedback: 0.35, mix };
        if (type === 'reverb') return { id, type: 'reverb', sizeSec: 1.8, mix };
        if (type === 'dist') return { id, type: 'dist', drive: 6, mix };
        if (type === 'chorus') return { id, type: 'chorus', rate: 0.6, mix };
        return { id, type: 'lofi', bits: 6, mix };
      }),
    });
  const removeEffect = (i: number) => change({ effects: effects.filter((_, j) => j !== i) });
  const addEffect = () =>
    effects.length < 16 && change({ effects: [...effects, { id: uid('fx'), type: 'delay', timeSec: 0.28, feedback: 0.35, mix: 0.3 }] });

  // Перенос эффектов и модуляций драг-н-дропом: порядок эффектов — это
  // порядок цепочки, порядок модуляций — просто удобство.
  const moveEffect = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= effects.length || to >= effects.length) return;
    const list = [...effects];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    change({ effects: list });
  };
  const moveMod = (from: number, to: number) => {
    const base = [...(pattern.mods ?? track.mods)];
    const [item] = base.splice(from, 1);
    base.splice(to, 0, item);
    changePatternMods(base);
  };

  /** База цели автоматизации: фильтр — частота «верха» инструмента,
   *  fx* — текущее значение выбранного эффекта. Вокруг базы рисуется штрих
   *  модуляции и запекается кривая (modCurve). */
  const autoBaseOf = (target: AutoTarget, fxId = laneFxId): number => {
    const fx = effects[effectIndex(effects, fxId)];
    return (
    target === 'fxMix'
      ? fx?.mix ?? 0.3
      : target === 'fxTime'
        ? fx?.type === 'delay'
          ? fx.timeSec
          : 0.25
        : target === 'fxFeedback'
          ? fx?.type === 'delay'
            ? fx.feedback
            : 0.3
          : st.filterFreq);
  };

  /** Запечь модуляцию в кривую партии: ход станет точками по границам
   *  шагов (перестанет плыть — правится вручную, как нарисованная),
   *  модуляция снимается. Один шаг undo. */
  const bakeMod = (i: number) => {
    const base = pattern.mods ?? track.mods;
    const m = base[i];
    if (!m) return;
    const target = m.target as AutoTarget;
    const cycleSec = stepDuration(st, bpm, pattern) * pattern.length;
    const points = bakeModToPoints({ ...m, rate: modRateHz(m, bpm) }, target, pattern.length, cycleSec, autoBaseOf(target, m.fxId), i);
    onPatternCommand(track.id, pattern.id, {
      automation: [
        ...(pattern.automation ?? []).filter(c => !sameAddress(c, m.target, m.fxId, effects)),
        { target, fxId: m.fxId, points },
      ],
      mods: base.filter((_, j) => j !== i),
    });
  };
  const rowGrip = (kind: 'fx' | 'mod', i: number) => (
    <span
      className="row-grip"
      title="Перетащи — строка поменяется местами"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${kind}:${i}`);
      }}
    >
      ⠿
    </span>
  );
  const rowDropProps = (kind: 'fx' | 'mod', i: number, move: (from: number, to: number) => void) => ({
    onDragOver: (e: ReactDragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes('text/plain')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('drop-target');
    },
    onDragLeave: (e: ReactDragEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      e.currentTarget.classList.remove('drop-target');
    },
    onDrop: (e: ReactDragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.classList.remove('drop-target');
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw.startsWith(`${kind}:`)) return;
      const from = Number(raw.slice(kind.length + 1));
      if (Number.isInteger(from) && from !== i) move(from, i);
    },
  });

  // Строки модуляций активной вкладки: i — индекс в полном списке эскиза
  // (правки/удаление/запечка адресуются по нему).
  const laneMods = (pattern.mods ?? track.mods)
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => laneMatches(m));

  const patternChips = (
    <PatternChips
      track={track}
      pattern={pattern}
      patternSceneCounts={patternSceneCounts}
      muteSceneCount={muteSceneCount}
      slotMuted={slotMuted}
      onToggleSlotMute={onToggleSlotMute}
      onSelectPattern={onSelectPattern}
      onAddPattern={onAddPattern}
      onForkPattern={onForkPattern}
      onRemovePattern={onRemovePattern}
    />
  );

  // Зона-скоуп для гидов: их шаги ищут якоря внутри этой карточки.
  const scope = `[data-track-id="${track.id}"]`;

  if (collapsed) {
    return (
      <div
        data-track-id={track.id}
        className={
          'track collapsed' +
          (track.enabled === false ? ' off' : '') +
          (libTarget ? ' lib-target' : '') +
          (dropSide ? ` drop-${dropSide}` : '')
        }
        {...dragProps}
      >
      {grip}
        <button className="track-dup" title="Дублировать трек: тот же рисунок, эскизы и звук — база для подложки или вариации" onClick={() => onDuplicate(track.id)}>
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <rect x="4.2" y="0.8" width="7" height="9.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 13H1.6V4.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <button className="track-del" data-help="track-delete" title="Удалить трек" onClick={() => onRemove(track.id)}>
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <path d="M1 3h10M4 3V1h4v2M2.5 3l1 10h5l1-10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <div className="collapsed-row">
          <button className="fold" data-help="fold-open" title="Развернуть трек" onClick={() => onToggleCollapse(track.id)}>▸</button>
          <span className={activeStep >= 0 ? 'live-dot on' : 'live-dot'}>●</span>
          <input className="track-name" data-help="track-name" value={track.name} onChange={(e) => change({ name: e.target.value })} />
          <button
            className="inst-chip"
            data-ob="inst-chip"
            title={`Инструмент дорожки: ${instrumentNameOf(st)}. Клик — панель инструментов (и редактор инструмента, если он открыт): пресеты и сэмплы, подсветит текущий`}
            onClick={() => onOpenBrowser(track.id)}
          >
            {instrumentNameOf(st)}
          </button>
          <span className="ms-btns">
            <button
              className={soloActive ? 'ms on-s' : 'ms'}
              title="Соло в этой сцене: слышна только эта дорожка. Повторный клик — снять"
              onClick={() => onSolo(track.id)}
            >S</button>
          </span>
          {patternChips}
          <SliderField
            variant="bare"
            className="mini-vol"
            title={`громкость ${Math.round(track.volume * 100)}% — двойной клик: точное число`}
            value={Math.round(track.volume * 100)}
            min={0} max={100} step={5}
            display={`${Math.round(track.volume * 100)}%`}
            unit="%"
            onChange={(v) => change({ volume: v / 100 })}
          />
          <SliderField
            variant="bare"
            className="mini-vol pan"
            title={`панорама дорожки: ${panLabel(track.pan)} — разнос инструментов по комнате. Двойной клик: точное число`}
            value={Math.round(track.pan * 100)}
            min={0} max={100} step={5}
            display={panLabel(track.pan)}
            onChange={(v) => change({ pan: v / 100 })}
          />
          <span className="mini-info">{pattern.length} шагов</span>
        </div>
        <LevelBar className="track-level" read={readLevel} />
      </div>
    );
  }

  const selectedStep = selectedCol !== null ? (pattern.steps[selectedCol] ?? null) : null;
  /** Сколько строк стана уйдёт при удалении октавы: откат добавленной
   *  (счётчик) либо срез из самой шкалы (0 — срезать нечего). */
  const octRows = (dir: 'up' | 'down') => {
    const cnt = dir === 'up' ? up : down;
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    if (cnt > 0) {
      return scaleRows.length - scaleOf({ ...track, [key]: cnt - 1 }).length;
    }
    return trimScaleOctave(track, dir)?.delta ?? 0;
  };
  const cutUpRows = octRows('up');
  const cutDownRows = octRows('down');
  // Истинная длительность НОВОЙ ноты в клетках стана: по сетке (noteSteps)
  // или по огибающей (атака + спад), в шагах эффективного темпа. Ноты со
  // своей длиной (len, v37) от этой базы не зависят.
  /** Длина ноты в клетках: своя (v37), иначе база (легаси-гейт множит). */
  const noteCellsOf = (nt: Note): number =>
    typeof nt.len === 'number' && nt.len > 0
      ? Math.min(64, Math.max(0.05, nt.len))
      : noteCellsBase * Math.min(4, Math.max(0.1, nt.gate ?? 1));
  /** Начинается ли нота (col, row) поверх ещё звучащего хвоста предыдущей
   *  ноты той же высоты — только в этом случае рисуем тёмную головку. */
  const overlapsTail = (col: number, row: number): boolean => {
    for (let c = col - 1; c >= 0; c--) {
      const prev = pattern.steps[c]?.notes.find((x) => x.n === row);
      if (!prev) continue;
      if (c + noteCellsOf(prev) > col + 0.08) return true;
    }
    return false;
  };

  // ---- Растяжение ноты мышкой: тянуть за правый край бара — меняется
  // длина (шагов, абсолютная, v37). Тянут выделенную — дельта применяется
  // ко всему выделению (как Alt+колесо). Правка коалесцируется как
  // слайдер: весь драг — один шаг undo. 27px = --pitch, видимая ширина
  // клетки с гэпом.
  const PITCH_PX = 27;
  const grabDown = (e: ReactPointerEvent<HTMLSpanElement>, col: number, row: number) => {
    if (e.button !== 0 || e.shiftKey) return;
    e.stopPropagation(); // это не клик по клетке и не рамка выделения
    e.currentTarget.setPointerCapture(e.pointerId);
    clip.activeTrackId = track.id;
    // Стартовые длины всех затронутых нот: драг считает дельту от них,
    // а не от текущих — иначе каждое движение наращивало бы их повторно.
    const startLens = new Map<string, number>();
    const key = `${col}:${row}`;
    const keys = sel.has(key) ? [...sel] : [key];
    for (const k of keys) {
      const [c, n] = k.split(':').map(Number);
      const nt = pattern.steps[c]?.notes.find((x) => x.n === n);
      startLens.set(k, nt ? noteCellsOf(nt) : noteCellsBase);
    }
    grabRef.current = {
      col,
      row,
      pointerId: e.pointerId,
      startX: e.clientX,
      startCells: startLens.get(key) ?? noteCellsBase,
      startLens,
    };
  };
  const grabMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const g = grabRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const cells = g.startCells + (e.clientX - g.startX) / PITCH_PX;
    const newLen = Math.min(64, Math.max(0.1, Math.round(cells * 10) / 10));
    const delta = newLen - (g.startLens.get(`${g.col}:${g.row}`) ?? noteCellsBase);
    // Раскладываем целевые длины и проверяем, есть ли реальное изменение.
    const targets = new Map<string, number>();
    let dirty = false;
    for (const [k, sl] of g.startLens) {
      const target = Math.min(64, Math.max(0.1, Math.round((sl + delta) * 10) / 10));
      targets.set(k, target);
      const [c, n] = k.split(':').map(Number);
      const cur = pattern.steps[c]?.notes.find((x) => x.n === n);
      if (!cur || noteCellsOf(cur) !== target) dirty = true;
    }
    if (!dirty) return;
    onPatternChange(track.id, pattern.id, {
      steps: pattern.steps.map((s, j) => ({
        ...s,
        notes: s.notes.map((x) => {
          const t = targets.get(`${j}:${x.n}`);
          return t === undefined ? x : { ...x, len: t };
        }),
      })),
    });
  };
  const grabUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (grabRef.current?.pointerId === e.pointerId) grabRef.current = null;
  };

  return (
    <div
      data-track-id={track.id}
      className={
        'track' +
        (track.enabled === false ? ' off' : '') +
        (libTarget ? ' lib-target' : '') +
        (dropSide ? ` drop-${dropSide}` : '')
      }
      {...dragProps}
    >
      {grip}
      <button className="track-dup" title="Дублировать трек: тот же рисунок, эскизы и звук — база для подложки или вариации" onClick={() => onDuplicate(track.id)}>
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <rect x="4.2" y="0.8" width="7" height="9.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 13H1.6V4.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <button className="track-del" data-help="track-delete" title="Удалить трек" onClick={() => onRemove(track.id)}>
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M1 3h10M4 3V1h4v2M2.5 3l1 10h5l1-10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      <div className="track-head">
        <button className="fold" data-ob="fold" title="Свернуть трек" onClick={() => onToggleCollapse(track.id)}>▾</button>
        <input className="track-name" data-ob="track-name" value={track.name} onChange={(e) => change({ name: e.target.value })} />
        <span className="ms-btns" data-ob="solo">
          <button
            className={soloActive ? 'ms on-s' : 'ms'}
            title="Соло в этой сцене: слышна только эта дорожка (любой её эскиз). С других сцен не переносится. Повторный клик — снять"
            onClick={() => onSolo(track.id)}
          >S</button>
        </span>
        {/* Переключатель сущности карточки: партия (эскиз), тембр
            (инструмент — большой редактор) или общий звук (трек).
            Порядок — как в работе: партия → звук партии → общее. */}
        <div className="seg mode-seg" data-ob="mode">
          <button
            className={view === 'sketch' && !editorOpen ? 'on' : ''}
            data-ob="mode-sketch"
            aria-label="эскиз"
            title="Эскиз — партия: ноты и её ручки (длина, шаг, громкость/пан, вход/выход, модуляции)"
            onClick={() => switchView('sketch')}
          >
            эскиз
          </button>
          <button
            className={editorOpen ? 'on' : ''}
            data-ob="mode-inst"
            aria-label="инструмент"
            title="Инструмент — большой редактор тембра: источник (волна/сэмпл), огибающая ноты, фильтры, вибрато, унисон; вкладка «волна» — своя волна"
            onClick={() => (editorOpen ? onCloseEditor() : onOpenEditor(track.id))}
          >
            инструмент
          </button>
          <button
            className={view === 'track' && !editorOpen ? 'on' : ''}
            data-ob="mode-track"
            aria-label="настройка трека"
            title="Трек — сведение и комната: громкость/пан, эффекты, сайдчейн (строй и время партии — в тулбаре стана)"
            onClick={() => switchView('track')}
          >
            трек
          </button>
        </div>
        {/* Чип инструмента — лицо тембра дорожки, виден и в свёрнутой
            карточке. Клик — панель инструментов (та же точка входа, что
            «выбрать…» в настройке инструмента). */}
        <button
          className="inst-chip"
          data-ob="inst-chip"
          title={`Инструмент дорожки: ${instrumentNameOf(st)}. Клик — панель инструментов: пресеты и сэмплы, подсветит текущий`}
          onClick={() => onOpenBrowser(track.id)}
        >
          {instrumentNameOf(st)}
        </button>
      </div>

      {editorOpen && (
        <InstrumentWorkspace
          track={track}
          inst={inst}
          pattern={pattern}
          bpm={bpm}
          tab={editorTab}
          onTab={onEditorTab}
          onChangeInst={changeInst}
          onChangeTrack={(patch) => change(patch)}
          onSlicePattern={() => onAddPattern(track.id, true)}
          onClose={onCloseEditor}
          onPickSample={() => setShowPicker(true)}
          onLoadSampleFile={loadSampleFile}
          getPCM={onGetSamplePCM}
          onPreviewRegion={(i, a, b) => onPreviewSampleRegion({ ...st, ...i, id: track.id }, a, b)}
          onPreviewNote={(i, audition) => onPreviewNote(audition
            ? soundForAudition(track, { name: i.name, category: 'мои', track: { ...i, freq: track.freq, effects: track.effects, mods: track.mods, mono: track.mono, portamentoSec: track.portamentoSec } })
            : { ...st, ...i })}
          onTransformSample={onTransformSample}
          onGenerateSample={onGenerateSample}
          busy={genBusy}
          onCancelSampleJob={onCancelSampleJob}
          onScratchBegin={onScratchBegin}
          onScratchMove={onScratchMove}
          onScratchEnd={onScratchEnd}
          onScratchPreview={onScratchPreview}
          onScratchSave={onScratchSave}
          onScratchPeaks={onScratchPeaks}
        />
      )}

      {!editorOpen && view === 'track' && (
        <div className="track-head more-row panel" data-ob="sound-panel">
          <div className="panel-row">
            <span className="sub-cap">общее</span>
            <div className="group" data-ob="common-row">
              <SliderField
                variant="inline"
                label="громкость"
                title="Громкость трека — общая для всех эскизов; у конкретной партии может быть своя (в блоке эскиза). Двойной клик по подписи — точное число"
                value={Math.round(track.volume * 100)}
                min={0} max={100} step={5}
                display={`${Math.round(track.volume * 100)}%`}
                unit="%"
                onChange={(v) => change({ volume: v / 100 })}
              />
              <SliderField
                variant="inline"
                label="пан"
                title="Панорама дорожки — разнос инструментов по комнате. База для эскизов: у конкретной партии может быть своя (в блоке эскиза). Двойной клик по подписи — точное число (0 — лево, 50 — центр, 100 — право)"
                value={Math.round(track.pan * 100)}
                min={0} max={100} step={5}
                display={panLabel(track.pan)}
                onChange={(v) => change({ pan: v / 100 })}
              />
              {/* Фаза и тоника переехали в тулбар стана — к шкале (строй)
                  и к «ноте» (время партии); здесь только микс-общее. */}
            </div>
          </div>
          <div className="track-voicing" data-ob="track-voicing">
            <label data-help="mono"><input type="checkbox" checked={!!track.mono} onChange={e => onTrackCommand(track.id, { ...track, mono: e.target.checked })} /> новая нота глушит предыдущую</label>
            {track.mono && <label data-ob="portamento" title="Плавное скольжение между одиночными нотами. 0 — выключено; первая нота и аккорды без скольжения.">скольжение, мс <NumField help="portamento" value={Math.round((track.portamentoSec ?? 0) * 1000)} min={0} max={4000} step={10} onChange={v => change({ portamentoSec: v / 1000 })} /></label>}
            <label data-help="choke-group">группа глушения <select aria-label="Группа глушения" value={track.chokeGroup ?? 0} onChange={e => onTrackCommand(track.id, { ...track, chokeGroup: Number(e.target.value) || undefined })}>
              <option value={0}>нет</option>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select></label>
            {track.chokeGroup && <label data-help="choke-priority">приоритет <NumField value={track.chokePriority ?? 0} min={0} max={16} step={1} onChange={v => change({ chokePriority: Math.round(v) })} /></label>}
            {track.mono && (track.portamentoSec ?? 0) > 0 && <span>{inst.waveform === 'sample' && inst.sampleMode === 'scratch' ? 'Portamento не действует на скрэтч: высоту задаёт жест.' : 'Одиночные ноты скользят от предыдущей высоты, в том числе после паузы. Атака огибающей повторяется.'}</span>}
            <span>В группе новая атака глушит прежние. Одновременно: больший приоритет, затем нижний трек.</span>
          </div>
          <div className="panel-row">
            <div className="sub-head">
              <span className="sub-cap">комната — эффекты, одни для всех эскизов</span>
              <button data-ob="fx-add" onClick={addEffect} disabled={effects.length >= 16} title="Добавить эффект в цепочку (до 16)">+ эффект</button>
              <span className="spacer" />
              <HelpHint guide="effects" step={1} scope={scope} label="Гид: эффекты и модуляции" />
            </div>
            <div className="group mods-group" data-ob="fx-list">
                          {effects.map((fx, i) => (
              <div className="mod-row" key={effectId(fx, i)} data-fx-id={effectId(fx, i)} {...rowDropProps('fx', i, moveEffect)}>
                {rowGrip('fx', i)}
                <button aria-label={`Эффект ${i + 1} вверх`} disabled={i === 0} onClick={() => moveEffect(i, i - 1)}>↑</button>
                <button aria-label={`Эффект ${i + 1} вниз`} disabled={i === effects.length - 1} onClick={() => moveEffect(i, i + 1)}>↓</button>
                {/* Удаление — первым слева: крестики строк в одну колонку,
                    ряды не выглядят лесенкой */}
                <button className="remove" title="Убрать эффект" onClick={() => removeEffect(i)}>×</button>
                <select value={fx.type} title="Тип эффекта: фильтр → эффекты → панорама" onChange={(e) => setEffectType(i, e.target.value as Effect['type'])}>
                  {(Object.keys(EFFECT_LABELS) as Effect['type'][]).map((t) => (
                    <option key={t} value={t}>{EFFECT_LABELS[t]}</option>
                  ))}
                </select>
                {pattern.automation?.some(c => c.target.startsWith('fx') && sameAddress(c, c.target, effectId(fx, i), effects)) &&
                  <span className="auto-hint" title="Кривые активного эскиза управляют параметрами во время игры; ручки задают базу для остальных эскизов">автоматизация</span>}
                {fx.type === 'delay' ? (
                  <>
                    <Knob help="effect.timeSec"
                      label="время, мс"
                      title="Через сколько миллисекунд повтор (при темпе 118: восьмая ≈ 254 мс). Двойной клик — точное число"
                      value={Math.round(fx.timeSec * 1000)} min={10} max={2000} step={10} log
                      onChange={(ms) => updateDelay(i, { timeSec: ms / 1000 })}
                    />
                    <Knob help="effect.feedback"
                      label="фидбек"
                      title="Затухание повторов: 0% — один повтор, 80% — длинное эхо. Двойной клик — точное число"
                      value={Math.round(fx.feedback * 100)} min={0} max={90} step={5}
                      onChange={(v) => updateDelay(i, { feedback: v / 100 })}
                    />
                  </>
                ) : fx.type === 'reverb' ? (
                  <Knob
                    label="размер, с"
                    title="Размер пространства: 0.5 — комната, 2 — зал, 5 — собор. Двойной клик — точное число"
                    value={fx.sizeSec} min={0.2} max={8} step={0.1}
                    onChange={(sizeSec) => updateReverb(i, { sizeSec })}
                  />
                ) : fx.type === 'dist' ? (
                  <Knob
                    label="драйв"
                    title="Сила перегруза: 2 — тёплое насыщение, 10 — рваная шерсть, 30 — стена. Двойной клик — точное число"
                    value={fx.drive} min={1} max={40} step={0.5}
                    onChange={(drive) => updateEffect(i, 'dist', { drive })}
                  />
                ) : fx.type === 'chorus' ? (
                  <Knob help="mod-rate"
                    label="скорость, Гц"
                    title="Скорость разжижения: 0.2–0.8 Гц — мягкое течение, выше 3 — рыскающий. Двойной клик — точное число"
                    value={fx.rate} min={0.05} max={8} step={0.05} log
                    onChange={(rate) => updateEffect(i, 'chorus', { rate })}
                  />
                ) : (
                  <Knob
                    label="биты"
                    title="Битовая глубина: 2–4 — развалившийся цифровой хлам, 6–8 — ретро-семплер, 12 — едва заметно. Двойной клик — точное число"
                    value={fx.bits} min={2} max={12} step={1}
                    onChange={(bits) => updateEffect(i, 'lofi', { bits: Math.round(bits) })}
                  />
                )}
                <Knob help="effect.mix"
                  label="микс"
                  title="Сколько эффекта подмешать к чистому звуку. Двойной клик — точное число"
                  value={Math.round(fx.mix * 100)} min={0} max={100} step={5}
                  onChange={(mix) => {
                    if (fx.type === 'delay') updateDelay(i, { mix: mix / 100 });
                    else if (fx.type === 'reverb') updateReverb(i, { mix: mix / 100 });
                    else if (fx.type === 'dist') updateEffect(i, 'dist', { mix: mix / 100 });
                    else if (fx.type === 'chorus') updateEffect(i, 'chorus', { mix: mix / 100 });
                    else updateEffect(i, 'lofi', { mix: mix / 100 });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
          <div className="panel-row">
            <div className="sub-head">
              <span className="sub-cap">сайдчейн</span>
            </div>
            <div className="group">
              <label title="Сайдчейн: ноты выбранной дорожки приглушают эту («бас качается под бочку»). Дак живёт поверх громкости эскиза">
                качается от
                <select
                  value={track.sidechain?.sourceId ?? ''}
                  onChange={(e) =>
                    change({
                      sidechain: e.target.value
                        ? {
                            sourceId: e.target.value,
                            amount: track.sidechain?.amount ?? 0.5,
                            releaseSec: track.sidechain?.releaseSec ?? 0.25,
                          }
                        : undefined,
                    })
                  }
                >
                  <option value="">—</option>
                  {allTracks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              {track.sidechain && (
                <>
                  <Knob
                    label="глубина"
                    title="Глубина приглушения при ударе источника. Двойной клик — точное число"
                    value={Math.round((track.sidechain.amount ?? 0.5) * 100)} min={0} max={100} step={5}
                    onChange={(v) =>
                      change({ sidechain: { ...track.sidechain!, amount: v / 100 } })
                    }
                  />
                  <Knob
                    label="восстановление, с"
                    title="Время восстановления после удара: 0.1 — резкий памп, 0.5 — мягкое выпускание. Двойной клик — точное число"
                    value={track.sidechain.releaseSec ?? 0.25} min={0.05} max={2} step={0.05}
                    onChange={(v) =>
                      change({ sidechain: { ...track.sidechain!, releaseSec: v } })
                    }
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!editorOpen && view === 'sketch' && (
        <div className="sketch-box" data-ob="sketch-box">
          {/* Чипы эскизов — шапка плашки: выбор эскиза и настройка эскиза
              в одном блоке, активный чип называет то, что правишь */}
          <div className="sketch-head">
            <span className="mini-info" title="Эскизы дорожки: партии. Какой играет — решает сцена. Правый клик по эскизу — вариация (форк)">
              эскизы
            </span>
            {patternChips}
          </div>
          {/* Слот сцены в мьюте — играет «эскиз тишины»: стан и ручки
              партии спрятаны до снятия M, иначе правишь невидимое. */}
          {!slotMuted ? (
            <>
          <div className="sketch-bar">
            <label title="Сколько шагов в цикле эскиза. Разные длины образуют полиритмию; рациональные отношения дают общий период повторения" data-ob="length">
              длина
              <NumField help="pattern.length" narrow value={pattern.length} min={1} max={64} onChange={(length) => setLength(length)} />
            </label>
            <label title="Длительность шага этого эскиза. «Точёные» (1/8 точ.) — шаги плывут относительно других треков: полиметрия" data-ob="rate">
              шаг
              <select
                className="rate-sel"
                value={
                  !customRate && RATE_OPTIONS.some((o) => o.v === (pattern.rate ?? track.rate))
                    ? String(pattern.rate ?? track.rate)
                    : 'custom'
                }
                onChange={(e) => {
                  setCustomRate(e.target.value === 'custom');
                  setRateDraft(null);
                  if (e.target.value !== 'custom')
                    onPatternChange(track.id, pattern.id, { rate: Number(e.target.value) });
                }}
              >
                {RATE_OPTIONS.map((o) => (
                  <option key={o.v} value={String(o.v)}>{o.label}</option>
                ))}
                <option value="custom">своё отношение…</option>
              </select>
            </label>
            {(customRate || !RATE_OPTIONS.some(o => o.v === (pattern.rate ?? track.rate))) && <label title="Множитель базовой 1/16: число или дробь, например 7/5. Допустимо 0.25…32">
              ×<input className="custom-rate" aria-label="своё отношение шага" type="text"
                value={rateDraft ?? String(pattern.rate ?? track.rate)}
                aria-invalid={rateDraft !== null && parseRatio(rateDraft) === null}
                onChange={e => setRateDraft(e.target.value)}
                onBlur={() => {
                  if (rateDraft !== null) { const rate = parseRatio(rateDraft); if (rate !== null) onPatternCommand(track.id, pattern.id, { rate }); }
                  setRateDraft(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { e.preventDefault(); setRateDraft(null); }
                }} />
            </label>}
            <SliderField
              variant="inline"
              label="громкость"
              title="Уровень партии относительно громкости дорожки: 100% сохраняет её уровень, 50% вдвое тише. Фейдер дорожки действует на все партии. Двойной клик — точное число"
              value={Math.round((pattern.volume ?? 1) * 100)}
              min={0} max={100} step={5}
              display={`${Math.round((pattern.volume ?? 1) * 100)}%`}
              unit="%"
              onChange={(volume) => onPatternChange(track.id, pattern.id, { volume: volume / 100 })}
            />
            <SliderField
              variant="inline"
              label="пан"
              title="Панорама этой партии: слева — центр — справа. Синус-LFO 0.2 Гц на панораме (вкладка «модуляции») — пинг-понг. Двойной клик по подписи — точное число"
              value={Math.round((pattern.pan ?? track.pan) * 100)}
              min={0} max={100} step={5}
              display={panLabel(pattern.pan ?? track.pan)}
              onChange={(pan) => onPatternChange(track.id, pattern.id, { pan: pan / 100 })}
            />
            {/* Вход/выход сцены (fadeIn/fadeOut) живут на дорожке кривых
                громкости: рампы по краям, тянутся за вершину. */}
            {st.waveform === 'sample' && (
              <button
                className={(st.sampleMode ?? 'plain') === 'scratch' ? 'scratch-quick on' : 'scratch-quick'}
                title="Скрэтч: нота играет жест иглы по сэмплу — записать жест можно в пэде ниже. Клик — включить/выключить режим"
                onClick={() =>
                  changeInst({
                    sampleMode: (st.sampleMode ?? 'plain') === 'scratch' ? 'plain' : 'scratch',
                  })
                }
              >
                скрэтч
              </button>
            )}
          </div>
          <RollTools
            track={st}
            pattern={pattern}
            noteSteps={track.noteSteps ?? 0}
            onNoteSteps={(v) => change({ noteSteps: v > 0 ? +v.toFixed(2) : undefined })}
            onTrack={change}
            onApplyScale={applyScale}
            onFillAxis={onFillAxis}
            onMutate={onMutate}
            onPatternCommand={onPatternCommand}
          />
          {noteEditMessage && <p className="note-edit-status" role="status">{noteEditMessage}</p>}
          <div className="roll" ref={rollRef} data-ob="roll">        <div className="roll-side" data-ob="scale-rows">
          <div className="col-num-spacer oct-row" data-ob="octaves">
            <button className="oct-btn" title="Добавить октаву вверх" onClick={() => addOctave('up')}>+окт</button>
            <button
              className={'oct-btn oct-flip' + (viewHi < scaleRows.length ? ' more' : '')}
              title={
                canFlip('up')
                  ? 'Листать стан на октаву вверх: строк столько же, диапазон выше. Ноты не меняются — ушедшие вниз строки прячутся за окно, но играют; у края диапазона октава дорастает'
                  : 'Выше листать некуда: предел добавленных октав сверху (4) — убери лишнюю «−»'
              }
              disabled={!canFlip('up')}
              onClick={() => flipOct('up')}
            >▲</button>
            <button
              className="oct-btn"
              title={
                cutUpRows <= 0
                  ? 'Верх срезать нечего: шкала уже в одну октаву'
                  : octaveBusy(track, 'up', cutUpRows)
                    ? 'В верхней октаве есть ноты — сначала убери их'
                    : up > 0
                      ? 'Убрать верхнюю октаву (вернуть добавленную)'
                      : 'Срезать верхнюю октаву самой шкалы — диапазон стана ужмётся к низу'
              }
              disabled={cutUpRows <= 0 || octaveBusy(track, 'up', cutUpRows)}
              onClick={() => removeOctave('up')}
            >−</button>
          </div>
          {rows.map(({ ratio, i }) => (
            <div key={i} className="scale-cell" title={`отношение ${fmtRatio(ratio)} к тонике`}>
              ×{fmtRatio(ratio)}
            </div>
          ))}
          <div className="col-num-spacer oct-row">
            <button className="oct-btn" title="Добавить октаву вниз" onClick={() => addOctave('down')}>+окт</button>
            <button
              className={'oct-btn oct-flip' + (viewLo > 0 ? ' more' : '')}
              title={
                canFlip('down')
                  ? 'Листать стан на октаву вниз: строк столько же, диапазон ниже. Ноты не меняются — ушедшие вверх строки прячутся за окно, но играют; у края диапазона октава дорастает'
                  : 'Ниже листать некуда: предел добавленных октав снизу (4) — убери лишнюю «−»'
              }
              disabled={!canFlip('down')}
              onClick={() => flipOct('down')}
            >▼</button>
            <button
              className="oct-btn"
              title={
                cutDownRows <= 0
                  ? 'Низ срезать нечего: шкала уже в одну октаву'
                  : octaveBusy(track, 'down', cutDownRows)
                    ? 'В нижней октаве есть ноты — сначала убери их'
                    : down > 0
                      ? 'Убрать нижнюю октаву (вернуть добавленную)'
                      : 'Срезать нижнюю октаву самой шкалы — диапазон стана ужмётся к верху'
              }
              disabled={cutDownRows <= 0 || octaveBusy(track, 'down', cutDownRows)}
              onClick={() => removeOctave('down')}
            >−</button>
          </div>
        </div>
        <div className="roll-body">
        <div className="roll-cols" role="group" aria-label={`Ноты дорожки ${track.name}`}>
          {pattern.steps.map((s, col) => (
            <div key={col} className={'col-wrap' + (col === selectedCol ? ' sel' : '')}>
              <button
                className={'col-num' + (col === selectedCol ? ' sel' : '')}
                tabIndex={-1}
                aria-label={`Настройки шага ${col + 1}; F2 на клетке`}
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
                      tabIndex={col === focusedCol && i === focusedRow ? 0 : -1}
                      aria-label={`Шаг ${col + 1}, ${(track.freq * ratio).toFixed(1)} Гц${on ? ', нота' : ', пусто'}${nt?.locks ? ', свой тембр ноты' : ''}. Enter — переключить, стрелки — переместить фокус, F2 — параметры`}
                      aria-pressed={on}
                      onFocus={() => { setFocusCell({ col, row: i }); clip.activeTrackId = track.id; }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault(); e.stopPropagation();
                          if (e.shiftKey && on) setSel(prev => { const next = new Set(prev); const key = `${col}:${i}`; if (next.has(key)) next.delete(key); else next.add(key); return next; });
                          else clickCell(col, i);
                          return;
                        }
                        if (e.key === 'F2') { e.preventDefault(); setSelectedCol(col); return; }
                        if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size === 0) { e.preventDefault(); e.stopPropagation(); if (on) removeNoteAt(col, i); return; }
                        const rowIndex = rows.findIndex(r => r.i === i);
                        let nextCol = col, nextRow = rowIndex;
                        if (e.key === 'ArrowLeft') nextCol--;
                        else if (e.key === 'ArrowRight') nextCol++;
                        else if (e.key === 'ArrowUp') nextRow--;
                        else if (e.key === 'ArrowDown') nextRow++;
                        else if (e.key === 'Home') { nextCol = 0; if (e.ctrlKey) nextRow = 0; }
                        else if (e.key === 'End') { nextCol = pattern.length - 1; if (e.ctrlKey) nextRow = rows.length - 1; }
                        else return;
                        e.preventDefault(); e.stopPropagation();
                        nextCol = Math.max(0, Math.min(pattern.length - 1, nextCol));
                        const row = rows[Math.max(0, Math.min(rows.length - 1, nextRow))].i;
                        e.currentTarget.closest('.roll-cols')?.querySelector<HTMLButtonElement>(`.cell[data-col="${nextCol}"][data-row="${row}"]`)?.focus();
                      }}
                      className={[
                        'cell',
                        on ? 'on' : '',
                        ratio === 1 ? 'tonic-row' : '',
                        col === activeStep ? 'ph' : '',
                        sel.has(`${col}:${i}`) ? 'sel' : '',
                        box &&
                        col >= Math.min(box.c0, box.c1) && col <= Math.max(box.c0, box.c1) &&
                        i >= Math.min(box.r0, box.r1) && i <= Math.max(box.r0, box.r1)
                          ? 'boxsel'
                          : '',
                        ghost && sel.has(`${col - ghost.dc}:${i - ghost.dr}`) ? 'ghost' : '',
                      ].join(' ')}
                      style={undefined}
                      title={
                        on
                          ? `${(track.freq * ratio).toFixed(1)} Гц${chord ? ` · аккорд из ${s.notes.length} нот` : ''} · громкость ${Math.round(nt!.vel * 100)}% · вероятность ${Math.round(nt!.prob * 100)}%${Math.abs((nt!.gate ?? 1) - 1) > 1e-6 ? ` · длина ×${(nt!.gate ?? 1).toFixed(1)}` : ''}\nтянуть — перенести · клик по другой строке — добавить ноту (аккорд) · правый клик — убрать ноту`
                          : `${(track.freq * ratio).toFixed(1)} Гц — поставить ноту`
                      }
                      onPointerDown={(e) => cellDown(e, col, i, on)}
                      onPointerMove={cellMove}
                      onPointerUp={cellUp}
                      onPointerCancel={() => {
                        dragRef.current = null;
                        setBox(null);
                        setGhost(null);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (on) removeNoteAt(col, i);
                        else clearCell(col);
                      }}
                    >
                      {on &&
                        (() => {
                          // Нота — это бар: растянут на истинную длительность
                          // (сетка/огибающая × гейт), поверх сетки. Ретриггер
                          // рисуется позже по DOM — виден поверх хвоста.
                          // Линия вероятности и цифра масштабируются к длине
                          // бара: 100% — вся нота, без цифры.
                          // Пенёк в ~1 шаг занимает клетку целиком: длина
                          // ближе 0.2 клетки к единице — визуальный квант сетки.
                          const cells = noteCellsOf(nt!);
                          const snapped = Math.abs(cells - 1) <= 0.2 ? 1 : cells;
                          const shown = Math.max(0.12, Math.min(snapped, pattern.length - col));
                          const ret = overlapsTail(col, i);
                          return (
                            <>
                              {/* Короче шага — серая подложка клетки: видно,
                                  что нота есть и где она стоит; оранжевым —
                                  настоящая длительность. */}
                              {snapped < 1 && (
                                <span
                                  className="note-stub"
                                  style={{ width: `calc(var(--pitch, 27px) - 3px)` }}
                                />
                              )}
                              <span
                                className={'note-bar' + (ret ? ' ret' : '')}
                                style={{
                                  width: `calc(${shown.toFixed(2)} * var(--pitch, 27px) - 3px)`,
                                  opacity: sel.has(`${col}:${i}`) ? '1' : String(0.55 + 0.45 * nt!.vel),
                                }}
                              >
                                <span
                                  className="note-grab"
                                  onPointerDown={(e) => grabDown(e, col, i)}
                                  onPointerMove={grabMove}
                                  onPointerUp={grabUp}
                                  onPointerCancel={grabUp}
                                />
                              </span>
                              {(nt!.locks || nt!.sliceId) && <span className="note-lock-marker" aria-hidden="true">◆</span>}
                              {nt!.prob < 0.995 && (
                                <span
                                  className="pbar"
                                  style={{
                                    width: `max(3px, calc(${shown.toFixed(2)} * var(--pitch, 27px) * ${nt!.prob} - 7px))`,
                                  }}
                                />
                              )}
                              {nt!.prob < 0.995 && (
                                <span className="pnum">{Math.round(nt!.prob * 100)}</span>
                              )}
                            </>
                          );
                        })()}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {autoLane && (
          <AutoLane
            curves={pattern.automation ?? []}
            target={laneTarget}
            fxId={laneFxId}
            effects={effects}
            length={pattern.length}
            activeStep={activeStep}
            fadeIn={pattern.fadeIn ?? 0.005}
            fadeOut={pattern.fadeOut ?? 0.05}
            stepSec={stepDuration(st, bpm, pattern)}
            mods={(pattern.mods ?? track.mods).map(m => ({ ...m, rate: modRateHz(m, bpm) }))}
            base={autoBaseOf(laneTarget)}
            onCurves={(cs) =>
              onPatternChange(track.id, pattern.id, { automation: cs.length > 0 ? cs : undefined })
            }
            onFade={(which, sec) =>
              onPatternChange(track.id, pattern.id, which === 'in' ? { fadeIn: sec } : { fadeOut: sec })
            }
          />
        )}
        </div>
      </div>

      {selectedStep && selectedCol !== null && !slotMuted && (
        <div className="step-panel" data-ob="step-panel">
          <span className="sp-label">шаг {selectedCol + 1}</span>
          {selectedStep.notes.length === 0 && (
            <span className="none">пусто — поставь ноты кликом по стану</span>
          )}
          {selectedStep.notes.map((nt) => (
            <div className="note-panel" key={nt.n}>
              <span className="np-label" title="Высота ноты">
                ×{fmtRatio(scaleRows[nt.n] ?? 1)}
              </span>
              <SliderField
                className="sp-field"
                variant="label"
                label="громкость"
                title="Громкость этой ноты. Колесо мыши над нотой крутит её же. Двойной клик — точное число"
                value={Math.round(nt.vel * 100)}
                min={5} max={100} step={5}
                display={`${Math.round(nt.vel * 100)}%`}
                unit="%"
                onChange={(v) => setNoteField(selectedCol, nt.n, 'vel', v / 100)}
              />
              <SliderField
                className="sp-field"
                variant="label"
                label="вероятность"
                title="Шанс, что нота прозвучит при каждом проходе цикла — у каждой ноты свой. Двойной клик — точное число"
                value={Math.round(nt.prob * 100)}
                min={0} max={100} step={5}
                display={`${Math.round(nt.prob * 100)}%`}
                unit="%"
                onChange={(v) => setNoteField(selectedCol, nt.n, 'prob', v / 100)}
              />
              <label
                className="sp-field"
                title="Длина ноты в шагах — своя у каждой ноты. 0.5 — тычок, 1 — встык, 4+ — подтяжки поверх соседних. Alt+колесо над нотой крутит её же"
              >
                длина
                <NumField
                  value={nt.len ?? noteCellsBase} min={0.1} max={64} step={0.1} wheel
                  onChange={(v) => setNoteField(selectedCol, nt.n, 'len', Math.max(0.1, Math.round(v * 10) / 10))}
                />
              </label>
              <label title="Повторные атаки внутри первого шага ноты (или доли арпеджиатора)">повторы
                <NumField value={nt.ratchet ?? 1} min={1} max={8} step={1} narrow
                  onChange={v => setNoteField(selectedCol,nt.n,'ratchet',Math.round(v))} />
              </label>
              <label title="Раньше/позже сетки; на первой ноте сцены отрицательный сдвиг ограничен её началом">сдвиг, мс
                <NumField value={nt.microTimingMs ?? 0} min={-50} max={50} step={1} w={55}
                  onChange={v => setNoteField(selectedCol,nt.n,'microTimingMs',v)} />
              </label>
              <button className="remove" title="Убрать эту ноту" onClick={() => removeNoteAt(selectedCol, nt.n)}>
                ×
              </button>
              {inst.waveform === 'sample' && (!!inst.sampleSlices?.length || !!nt.sliceId) && <label>фрагмент <select aria-label={`Фрагмент ноты ${nt.n + 1}`} value={nt.sliceId ?? ''}
                onChange={e => onPatternCommand(track.id, pattern.id, { steps: pattern.steps.map((step, i) => i === selectedCol
                  ? { ...step, notes: step.notes.map(n => n.n === nt.n ? { ...n, sliceId: e.target.value || undefined } : n) } : step) })}>
                <option value="">обычный источник</option>
                {nt.sliceId && !inst.sampleSlices?.some(s => s.id === nt.sliceId) && <option value={nt.sliceId}>фрагмент удалён — нота молчит</option>}
                {inst.sampleSlices?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start.toFixed(3)}–{s.end.toFixed(3)} с)</option>)}
              </select></label>}
              <NoteLocksEditor note={nt} sounding={{ ...track, ...inst }} onChange={(locks, command) => setNoteLocks(selectedCol, nt.n, locks, command)} />
            </div>
          ))}
          {selectedStep.notes.length > 0 && (
            <button onClick={() => clearCell(selectedCol)}>стереть шаг</button>
          )}
        </div>
      )}

          {/* Автоматизация партии — один интерфейс для двух способов
              задать ход параметра: точками (кривая на дорожке под
              станом) или «формулой» (модуляции: LFO, ступени S&H,
              перлин). Вкладка = цель: кривая и модуляции одного
              параметра живут вместе, «+ модуляция» добавляет модуляцию
              выбранной цели. Кнопка — на отдельной строке под станом. */}
          <div className="auto-panel">
            <div className="sub-head">
              <button
                className={'mods-toggle' + (autoLane ? ' on' : '')}
                data-ob="auto-toggle"
                title="Автоматизация партии: кривая по шагам цикла (точками на дорожке под станом) и модуляции — LFO, ступени S&H, перлин. Живут на эскизе: у каждой партии свои"
                onClick={() => setAutoLane((v) => !v)}
              >
                {autoLane ? '▾' : '▸'} автоматизация
              </button>
              <span className="spacer" />
              {autoLane && (
                <HelpHint guide="auto" scope={scope} label="Гид: автоматизация партии" />
              )}
            </div>
            {autoLane && (
              <>
                <div className="panel-row auto-box">
                  <span className="rt-label" title="Вкладка выбирает параметр: его кривая рисуется на дорожке под станом, его же качают модуляции">параметр</span>
                  <div className="seg">
                    {autoTargets.map((t) => (
                      <button
                        key={t}
                        className={laneTarget === t ? 'on' : ''}
                        onClick={() => setAutoTarget(t)}
                        title="Кривая и модуляции выбранного параметра; эффект выбирается отдельно"
                      >
                        {AUTO_TARGET_LABELS[t]}
                      </button>
                    ))}
                  </div>
                  {laneTarget.startsWith('fx') && <label>эффект <select aria-label="Эффект автоматизации" value={laneFxId ?? ''} onChange={e => setAutoFxId(e.target.value)}>
                    {fxOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select></label>}
                  {laneTarget.startsWith('fx') && !laneFx && <span role="status">Цель удалена — назначения не звучат.</span>}
                  {laneTarget.startsWith('fx') && laneFx && !laneSupported && <span role="status">Этот эффект не поддерживает параметр — назначения не звучат.</span>}
                  {(pattern.automation?.some(laneMatches)) && (
                    <button
                      title="Убрать кривую: параметр вернётся к своей ручке"
                      onClick={() =>
                        onPatternChange(track.id, pattern.id, {
                          automation: (pattern.automation ?? []).filter(c => !laneMatches(c)),
                        })
                      }
                    >
                      убрать кривую
                    </button>
                  )}
                  <button
                    data-ob="mods-add"
                    disabled={(pattern.mods ?? track.mods).length >= 16 || !laneSupported}
                    onClick={addMod}
                    title="Новая модуляция выбранного параметра: источник (LFO, ступени, перлин) качает его сам"
                  >
                    + модуляция
                  </button>

                </div>
                <div className="group mods-group" data-ob="mods-list" data-help="automation-mods">
                  {laneMods.map(({ m, i }) => (
                    <div className="mod-row" key={i} {...rowDropProps('mod', i, moveMod)}>
                      {rowGrip('mod', i)}
                      <button className="remove" title="Убрать модуляцию" onClick={() => removeMod(i)}>×</button>
                      <select
                        value={m.source ?? 'lfo'}
                        data-ob="mod-source"
                        title="Источник: LFO — периодическая волна (синус, пила, квадрат, треугольник); ступени S&H (sample & hold) — случайное значение держится несколько мгновений и прыгает скачком, «лестница»; перлин — плавно блуждающий шум, случайные холмы без скачков"
                        onChange={(e) => updateMod(i, { source: e.target.value as Mod['source'] })}
                      >
                        {Object.entries(MOD_SOURCE_LABELS).map(([id, title]) => (
                          <option key={id} value={id}>{title}</option>
                        ))}
                      </select>
                      {(m.source ?? 'lfo') === 'lfo' && (
                        <select
                          value={m.shape}
                          title="Форма колебания"
                          onChange={(e) => updateMod(i, { shape: e.target.value as Mod['shape'] })}
                        >
                          {LFO_SHAPES.map((sh) => (
                            <option key={sh} value={sh}>{LFO_SHAPE_LABELS[sh]}</option>
                          ))}
                        </select>
                      )}
                      <Knob help="mod-rate"
                        label="скорость"
                        title="Скорость колебаний, Гц: 0.2 — период 5 секунд; 4–8 — вибрато. Двойной клик — точное число"
                        value={modRateHz(m, bpm)} min={0.01} max={40} step={0.05} log
                        onChange={(rate) => updateMod(i, { rate, beatsPerCycle: undefined })}
                      />
                      <select
                        className="sync-select"
                        value={m.beatsPerCycle ?? ''}
                        title="Синхронизировать с темпом: вобблеру и пульсациям нужна доля, а не свободные Гц"
                        onChange={(e) => {
                          const k = Number(e.target.value);
                          updateMod(i, { beatsPerCycle: k || undefined, rate: modRateHz(m, bpm) });
                        }}
                      >
                        <option value="">свободно, Гц</option>
                        <option value="0.25">1/16</option>
                        <option value="0.375">1/16 точ</option>
                        <option value="0.5">1/8</option>
                        <option value="0.75">1/8 точ</option>
                        <option value="1">1/4</option>
                        <option value="1.5">1/4 точ</option>
                        <option value="2">1/2</option>
                        <option value="4">1/1</option>
                      </select>
                      <Knob
                        label="глубина"
                        title="Глубина: насколько сильно модуляция отклоняет параметр. Двойной клик — точное число"
                        value={Math.round(m.depth * 100)} min={0} max={100} step={5}
                        onChange={(v) => updateMod(i, { depth: v / 100 })}
                      />
                      <button
                        className="mod-bake"
                        title="Запечь в кривую: ход модуляции станет точками на дорожке под станом — перестанет плыть, можно править вручную. Модуляция снимется"
                        onClick={() => bakeMod(i)}
                      >
                        → в кривую
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
            </>
          ) : (
            <div className="sketch-muted" data-ob="sketch-muted">
              <span className="skm-m">M</span>
              <span className="skm-text">
                тишина в этой сцене
                <span className="mini-info">
                  дорожка молчит, но часы партии идут — сними M, и эскиз «{pattern.name}» продолжится с той же фазы
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <LevelBar className="track-level" read={readLevel} />

      {showPicker && (
        <SamplePicker
          currentId={st.sampleId}
          onPick={(meta) => {
            changeInst({ sampleId: meta.id, sampleName: meta.name });
            setShowPicker(false);
          }}
          onOpenLibrary={() => {
            setShowPicker(false);
            onOpenBrowser(track.id, 'smp');
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
});
