import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  ArpMode,
  AutoTarget,
  Effect,
  Instrument,
  Mod,
  Note,
  Pattern,
  SoundingTrack,
  ScratchPoint,
  Step,
  Track,
  Waveform,
} from '../types';
import {
  ARP_MODE_LABELS,
  AUTO_TARGET_LABELS,
  EFFECT_LABELS,
  MOD_TARGET_LABELS,
  MORPH_LABELS,
  WAVEFORM_LABELS,
  makeNote,
  makeStep,
  scaleOf,
} from '../types';
import type { MutateModes } from '../music/mutate';
import {
  instrumentNameOf,
  loadUserPresets,
  saveUserPreset,
} from '../music/instrumentPresets';
import { ScalePicker } from './ScalePicker';
import { PatternChips } from './PatternChips';
import { RollTools } from './RollTools';
import { LevelBar } from './LevelBar';
import { NumField } from './NumField';
import { Knob } from './Knob';
import { WaveIcon } from './WaveIcon';
import { SliderField } from './SliderField';
import { WaveEditor } from './WaveEditor';
import { NoteGraph } from './EnvGraph';
import { AutoLane } from './AutoLane';
import { alertDialog, confirmDialog, promptDialog } from './dialogs';
import { SamplePicker } from './SamplePicker';
import { putSample } from '../audio/library';
import { tickDuration, stepDuration } from '../audio/timing';
import { clip } from '../music/clip';
import { HelpHint } from '../onboarding/Onboarding';

const WAVEFORMS = Object.keys(WAVEFORM_LABELS) as Waveform[];
const LFO_SHAPES: Mod['shape'][] = ['sine', 'triangle', 'square', 'sawtooth'];
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

function clampSec(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
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

interface Props {
  track: Track;
  /** Инструмент дорожки: тембр, огибающая ноты, фильтры (v34). */
  inst: Instrument;
  /** Правка инструмента этой дорожки (App отвяжет копией, если он общий). */
  onChangeInst: (trackId: string, inst: Instrument) => void;
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
  onAddPattern: (trackId: string) => void;
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
  onScratchPeaks: () => Promise<{ peaks: number[]; duration: number } | null>;
  patternSceneCounts: Record<string, number>;
  // Для сайдчейна и связки инструментов: все дорожки патча.
  allTracks: { id: string; name: string; instrumentId: string }[];
  onGenerateSample: (trackId: string, prompt: string, seconds: number) => void;
  onTransformSample: (trackId: string, prompt: string, strength: number) => void;
  genBusy: boolean;
  // Редактор волны: раздвижной режим карточки — остальной интерфейс
  // трека съёживается, редактор занимает его место.
  waveEditor: boolean;
  onToggleWaveEditor: (id: string) => void;
  onGetSampleBuffer: (id?: string) => Promise<AudioBuffer | null>;
  onPreviewSampleRegion: (track: Track, fromSec: number, toSec: number) => void;
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
  onScratchPeaks,
  patternSceneCounts,
  allTracks,
  onGenerateSample,
  onTransformSample,
  genBusy,
  waveEditor,
  onToggleWaveEditor,
  onGetSampleBuffer,
  onPreviewSampleRegion,
  onPreviewNote,
  onOpenBrowser,
}: Props) {
  // Панель заполнения (пульсы, оси мутации, уровень) живёт в RollTools.
  const readLevel = useCallback(() => getLevel(track.id), [getLevel, track.id]);
  const [prompt, setPrompt] = useState('');
  const [genSeconds, setGenSeconds] = useState(3);

  /** Сохранить звук дорожки как свой пресет: категория «мои» в браузере
   *  инструментов, применение — как у встроенных. Триггер перерисовки
   *  обновляет имя инструмента на панели сразу после сохранения. */
  const [, bumpInstruments] = useState(0);
  const saveInstrumentAs = async () => {
    const current = instrumentNameOf(st);
    const suggested = current === 'своя настройка' ? track.name : current;
    const name = await promptDialog({
      title: 'сохранить инструмент',
      text: 'Пресет появится в браузере инструментов, категория «мои»',
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

  /** Парсер своей шкалы живёт в music/scales (parseRatios) — используется
   *  модалкой выбора шкалы вместе с N-ET и пресетами. */

  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  // Нотка/звук/редактор — вкладки трека: открыта максимум одна.
  // Редактор живёт в App (он съёживает остальные треки), остальные две — здесь.
  // Три сущности карточки: «эскиз» — партия (ноты и её ручки, вид по
  // умолчанию), «трек» — общее и комната, «инструмент» — тембр.
  const [view, setView] = useState<'sketch' | 'track' | 'inst'>('sketch');
  // Редактор волны живёт поверх содержимого вида: смена вида закрывает его.
  const switchView = (v: 'sketch' | 'track' | 'inst') => {
    if (waveEditor) onToggleWaveEditor(track.id);
    setView(v);
  };
  const [showPicker, setShowPicker] = useState(false);
  const [showScales, setShowScales] = useState(false);
  const scratchRef = useRef<HTMLDivElement | null>(null);
  const scratchRec = useRef<{ t0: number; pts: { dt: number; pos: number }[] } | null>(null);
  const [scratchArmed, setScratchArmed] = useState(false);
  const [scratchLive, setScratchLive] = useState(false);
  const [scratchPlaying, setScratchPlaying] = useState(false);
  const [scratchMap, setScratchMap] = useState<{ peaks: number[]; duration: number } | null>(null);
  // Редактирование: во время драга точки/записи живём в локальном состоянии,
  // в патч пишем на отпускании (один undo-шаг на правку).
  const [dragPts, setDragPts] = useState<ScratchPoint[] | null>(null);
  const dragIdx = useRef<number | null>(null);
  const pendingAdd = useRef<{ t: number; pos: number } | null>(null);
  const downXY = useRef<{ x: number; y: number } | null>(null);
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
  // Вкладки внутри «трека»; модуляции — раздел эскиза, свёрнут по умолчанию.
  const [tab, setTab] = useState<'snd' | 'env' | 'timbre' | 'fx'>('snd');
  const [showMods, setShowMods] = useState(false);
  // Кривые партии: какая цель рисуется.
  const [autoTarget, setAutoTarget] = useState<AutoTarget>('volume');
  // Дорожка автоматизации под станом — открыта/закрыта (UI-состояние).
  const [autoLane, setAutoLane] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);
  const sampleFileRef = useRef<HTMLInputElement>(null);

  const rows = scaleOf(track).map((ratio, i) => ({ ratio, i })).reverse();

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeInst = (patch: Partial<Instrument>) =>
    onChangeInst(track.id, { ...inst, ...patch });
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
  };

  const removeOctave = (dir: 'up' | 'down') => {
    const key = dir === 'up' ? 'scaleOctUp' : 'scaleOctDown';
    const now = (track[key] ?? 0) - 1;
    if (now < 0) return;
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
  const setNoteField = (col: number, row: number, field: 'vel' | 'prob' | 'len', v: number) => {
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

  // ---- Мультиселект нот: рамка, перенос группы, копипаст, удаление ----

  const [sel, setSel] = useState<Set<string>>(new Set());
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

  const cellFromPoint = (x: number, y: number): { col: number; row: number } | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('.cell') as HTMLElement | null;
    if (!el || !rollRef.current?.contains(el)) return null;
    const col = Number(el.dataset.col);
    const row = Number(el.dataset.row);
    return Number.isFinite(col) && Number.isFinite(row) ? { col, row } : null;
  };

  const cellDown = (e: ReactPointerEvent<HTMLButtonElement>, col: number, row: number, onNote: boolean) => {
    if (e.button !== 0) return;
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
      if (sel.has(`${d.col}:${d.row}`)) d.mode = 'move';
      else if (!onNote) d.mode = 'box';
      else return; // нота вне выделения — обычный клик
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
      const b = box;
      setBox(null);
      if (!b) return;
      const [c0, c1] = b.c0 <= b.c1 ? [b.c0, b.c1] : [b.c1, b.c0];
      const [r0, r1] = b.r0 <= b.r1 ? [b.r0, b.r1] : [b.r1, b.r0];
      const next = new Set<string>();
      for (let c = c0; c <= c1; c++) {
        for (const nt of pattern.steps[c]?.notes ?? []) {
          if (nt.n >= r0 && nt.n <= r1) next.add(`${c}:${nt.n}`);
        }
      }
      setSel(next);
      return;
    }
    const g = ghost;
    setGhost(null);
    if (g) applyMove(g.dc, g.dr);
  };

  /** Перенос выделенной группы: общий сдвиг клампится краями стана и цикла. */
  const applyMove = (dc: number, dr: number) => {
    const entries = [...sel].map((k) => {
      const [c, n] = k.split(':').map(Number);
      return { c, n };
    });
    if (entries.length === 0 || (!dc && !dr)) return;
    const rowsN = scaleOf(track).length;
    const minC = Math.min(...entries.map((en) => en.c));
    const maxC = Math.max(...entries.map((en) => en.c));
    const minN = Math.min(...entries.map((en) => en.n));
    const maxN = Math.max(...entries.map((en) => en.n));
    const steps = pattern.steps;
    const ddc = Math.max(-minC, Math.min(steps.length - 1 - maxC, dc));
    const ddr = Math.max(-minN, Math.min(rowsN - 1 - maxN, dr));
    if (!ddc && !ddr) return;
    const taken: { c: number; n: number; vel: number; prob: number; len?: number }[] = [];
    const out = steps.map((st, c) => ({
      ...st,
      notes: st.notes.filter((nt) => {
        if (sel.has(`${c}:${nt.n}`)) {
          taken.push({ c, n: nt.n, vel: nt.vel, prob: nt.prob, len: nt.len });
          return false;
        }
        return true;
      }),
    }));
    const moved = new Set<string>();
    for (const t of taken) {
      const nc = t.c + ddc;
      const nn = t.n + ddr;
      if (out[nc].notes.some((x) => x.n === nn)) continue;
      out[nc].notes = [...out[nc].notes, { n: nn, vel: t.vel, prob: t.prob, len: t.len }];
      moved.add(`${nc}:${nn}`);
    }
    changeSteps(out);
    setSel(moved);
  };

  /** Вставка буфера в выделенную колонку (или в первый шаг); высоты
   *  клампятся под стан получателя — копипаст работает и между треками. */
  const pasteClip = () => {
    if (clip.notes.length === 0) return;
    const minCol = Math.min(...clip.notes.map((cn) => cn.col));
    const target = selectedCol ?? 0;
    const maxN = scaleOf(track).length - 1;
    const steps = pattern.steps.map((st) => ({ ...st, notes: st.notes.map((nt) => ({ ...nt })) }));
    const added = new Set<string>();
    for (const cn of clip.notes) {
      const c = cn.col - minCol + target;
      if (c < 0 || c >= steps.length) continue;
      const n = Math.min(Math.max(cn.n, 0), maxN);
      if (steps[c].notes.some((x) => x.n === n)) continue;
      steps[c].notes = [...steps[c].notes, { n, vel: cn.vel, prob: cn.prob, len: cn.len }];
      added.add(`${c}:${n}`);
    }
    changeSteps(steps);
    setSel(added);
  };

  /** Дублировать выделение: копия справа от выделенного блока,
   *  сдвиг на ширину блока; не влезающие в цикл ноты отбрасываются. */
  const duplicateSel = () => {
    if (sel.size === 0) return;
    const entries = [...sel].map((k) => {
      const [c, n] = k.split(':').map(Number);
      return { c, n };
    });
    const minC = Math.min(...entries.map((en) => en.c));
    const maxC = Math.max(...entries.map((en) => en.c));
    const shift = maxC - minC + 1;
    const steps = pattern.steps.map((st) => ({ ...st, notes: st.notes.map((nt) => ({ ...nt })) }));
    const added = new Set<string>();
    for (const en of entries) {
      const nt = pattern.steps[en.c]?.notes.find((x) => x.n === en.n);
      if (!nt) continue;
      const c = en.c + shift;
      if (c >= steps.length) continue;
      if (steps[c].notes.some((x) => x.n === en.n)) continue;
      steps[c].notes = [...steps[c].notes, { n: en.n, vel: nt.vel, prob: nt.prob, len: nt.len }];
      added.add(`${c}:${en.n}`);
    }
    changeSteps(steps);
    setSel(added);
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
        clip.notes = [...sel].map((k) => {
          const [c, n] = k.split(':').map(Number);
          const nt = pattern.steps[c]?.notes.find((x) => x.n === n);
          return { col: c, n, vel: nt?.vel ?? 0.8, prob: nt?.prob ?? 1, len: nt?.len };
        });
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
  const updateEffect = <T extends Effect['type']>(i: number, type: T, upd: Partial<Extract<Effect, { type: T }>>) =>
    change({
      effects: effects.map((e, j) => (j === i && e.type === type ? ({ ...e, ...upd } as Effect) : e)),
    });
  const setEffectType = (i: number, type: Effect['type']) =>
    change({
      effects: effects.map((e, j) => {
        if (j !== i) return e;
        const mix = e.mix;
        if (type === 'delay') return { type: 'delay', timeSec: 0.28, feedback: 0.35, mix };
        if (type === 'reverb') return { type: 'reverb', sizeSec: 1.8, mix };
        if (type === 'dist') return { type: 'dist', drive: 6, mix };
        if (type === 'chorus') return { type: 'chorus', rate: 0.6, mix };
        return { type: 'lofi', bits: 6, mix };
      }),
    });
  const removeEffect = (i: number) => change({ effects: effects.filter((_, j) => j !== i) });
  const addEffect = () =>
    change({ effects: [...effects, { type: 'delay', timeSec: 0.28, feedback: 0.35, mix: 0.3 }] });

  // Перенос эффектов и модуляций драг-н-дропом: порядок эффектов — это
  // порядок цепочки, порядок модуляций — просто удобство.
  const moveEffect = (from: number, to: number) => {
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

  const modTargets: string[] = ['pan', 'volume', 'filterFreq'];
  if (effects.length > 0) modTargets.push('fxMix');
  if (effects.some((e) => e.type === 'delay')) modTargets.push('fxTime', 'fxFeedback');

  const patternChips = (
    <PatternChips
      track={track}
      pattern={pattern}
      patternSceneCounts={patternSceneCounts}
      onPatternChange={onPatternChange}
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
        <button className="track-del" title="Удалить трек" onClick={() => onRemove(track.id)}>
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <path d="M1 3h10M4 3V1h4v2M2.5 3l1 10h5l1-10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <div className="collapsed-row">
          <button className="fold" title="Развернуть трек" onClick={() => onToggleCollapse(track.id)}>▸</button>
          <span className={activeStep >= 0 ? 'live-dot on' : 'live-dot'}>●</span>
          <input className="track-name" value={track.name} onChange={(e) => change({ name: e.target.value })} />
          <span className="ms-btns">
            <button
              className={soloActive ? 'ms on-s' : 'ms'}
              title="Соло в этой сцене: слышна только эта дорожка. Повторный клик — снять"
              onClick={() => onSolo(track.id)}
            >S</button>
          </span>
          <span className="mini-wave">{WAVEFORM_LABELS[st.waveform]}</span>
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
  const up = track.scaleOctUp ?? 0;
  const down = track.scaleOctDown ?? 0;
  const scaleRows = scaleOf(track);
  /** Сколько строк стана уйдёт при удалении октавы (шкала с отношением 2
   *  схлопывается с новой октавой — дельта меньше длины шкалы). */
  const octRows = (dir: 'up' | 'down') =>
    scaleRows.length -
    scaleOf({ ...track, [dir === 'up' ? 'scaleOctUp' : 'scaleOctDown']: (dir === 'up' ? up : down) - 1 }).length;
  // Истинная длительность НОВОЙ ноты в клетках стана: по сетке (noteSteps)
  // или по огибающей (атака + спад), в шагах эффективного темпа. Ноты со
  // своей длиной (len, v37) от этой базы не зависят.
  /** Длина ноты в клетках: своя (v37), иначе база (легаси-гейт множит). */
  const noteCellsOf = (nt: Note): number =>
    typeof nt.len === 'number' && nt.len > 0
      ? Math.min(64, Math.max(0.05, nt.len))
      : noteCellsBase * Math.min(4, Math.max(0.1, nt.gate ?? 1));
  // Длина ноты в секундах (без гейта) — как её посчитает triggerVoice:
  // сетка («нота», шагов × шаг эскиза) или огибающая (атака + спад).
  const noteSec =
    st.noteSteps && st.noteSteps > 0
      ? st.noteSteps * (pattern.rate ?? track.rate) * tickDuration(bpm)
      : Math.max(st.attack, 0.0005) + st.decay;
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
        <button className="track-del" title="Удалить трек" onClick={() => onRemove(track.id)}>
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
        {/* Переключатель сущности карточки: партия (эскиз) или общий звук
            (трек). Слева, у имени — основная работа идёт здесь. Работает
            и при открытом редакторе волны: тот закрывается сам. */}
        <div className="seg mode-seg" data-ob="mode">
          <button
            className={view === 'sketch' ? 'on' : ''}
            data-ob="mode-sketch"
            aria-label="эскиз"
            title="Эскиз — партия: ноты и её ручки (длина, шаг, громкость/пан, вход/выход, модуляции)"
            onClick={() => switchView('sketch')}
          >
            эскиз
          </button>
          <button
            className={view === 'track' ? 'on' : ''}
            data-ob="mode-track"
            aria-label="настройка трека"
            title="Трек — общее и комната: громкость/пан, фаза, тоника, эффекты, сайдчейн"
            onClick={() => switchView('track')}
          >
            трек
          </button>
          <button
            className={view === 'inst' ? 'on' : ''}
            data-ob="mode-inst"
            aria-label="инструмент"
            title="Инструмент — тембр: волна/сэмпл, огибающая ноты, падение тона, фильтры, вибрато"
            onClick={() => switchView('inst')}
          >
            инструмент
          </button>
        </div>
        {/* Чип инструмента — лицо тембра дорожки, виден и в свёрнутой
            карточке. Клик — браузер звуков (та же точка входа, что
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

      {waveEditor && (
        <WaveEditor
          trackId={track.id}
          inst={inst}
          onChangeInst={changeInst}
          onClose={() => onToggleWaveEditor(track.id)}
          getBuffer={onGetSampleBuffer}
          onPreviewRegion={(i, a, b) => onPreviewSampleRegion({ ...st, ...i }, a, b)}
          onPreviewNote={(i) => onPreviewNote({ ...st, ...i })}
          onTransformSample={onTransformSample}
          busy={genBusy}
        />
      )}

      {!waveEditor && view === 'track' && (
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
              <label title="Сдвиг цикла в шагах: тот же рисунок, но стартует на N шагов позже">
                фаза, шагов
                <NumField
                  value={track.phase} min={-64} max={64}
                  onChange={(phase) => change({ phase: Math.round(phase) })}
                />
              </label>
              <label title="Базовая частота шкалы. Бас — 30–90 Гц, обычные ноты — 100–500, верхушки — выше">
                тоника, Гц
                <NumField value={track.freq} min={20} max={9000} step={0.1} onChange={(freq) => change({ freq })} />
              </label>
            </div>
          </div>
          <div className="panel-row">
            <div className="sub-head">
              <span className="sub-cap">комната — эффекты, одни для всех эскизов</span>
              <button data-ob="fx-add" onClick={addEffect} title="Добавить эффект в цепочку">+ эффект</button>
              <span className="spacer" />
              <HelpHint guide="effects" step={1} scope={scope} label="Гид: эффекты и модуляции" />
            </div>
            <div className="group mods-group" data-ob="fx-list">
                          {effects.map((fx, i) => (
              <div className="mod-row" key={i} {...rowDropProps('fx', i, moveEffect)}>
                {rowGrip('fx', i)}
                {/* Удаление — первым слева: крестики строк в одну колонку,
                    ряды не выглядят лесенкой */}
                <button className="remove" title="Убрать эффект" onClick={() => removeEffect(i)}>×</button>
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
                    <SliderField
                      variant="mr"
                      title="Затухание повторов: 0% — один повтор, 80% — длинное эхо"
                      value={Math.round(fx.feedback * 100)}
                      min={0} max={90} step={5}
                      display={`${Math.round(fx.feedback * 100)}%`}
                      unit="%"
                      onChange={(v) => updateDelay(i, { feedback: v / 100 })}
                    />
                  </>
                ) : fx.type === 'reverb' ? (
                  <span className="mr" title="Размер пространства: 0.5 — комната, 2 — зал, 5 — собор">
                    <NumField
                      value={fx.sizeSec} min={0.2} max={8} step={0.1}
                      onChange={(sizeSec) => updateReverb(i, { sizeSec })}
                    />
                    <i>с</i>
                  </span>
                ) : fx.type === 'dist' ? (
                  <span className="mr" title="Сила перегруза: 2 — тёплое насыщение, 10 — рваная шерсть, 30 — стена">
                    <NumField
                      value={fx.drive} min={1} max={40} step={0.5}
                      onChange={(drive) => updateEffect(i, 'dist', { drive })}
                    />
                  </span>
                ) : fx.type === 'chorus' ? (
                  <span className="mr" title="Скорость разжижения: 0.2–0.8 Гц — мягкое течение, выше 3 — рыскающий">
                    <NumField
                      value={fx.rate} min={0.05} max={8} step={0.05}
                      onChange={(rate) => updateEffect(i, 'chorus', { rate })}
                    />
                    <i>Гц</i>
                  </span>
                ) : (
                  <span className="mr" title="Битовая глубина: 2–4 — развалившийся цифровой хлам, 6–8 — ретро-семплер, 12 — едва заметно">
                    <NumField
                      value={fx.bits} min={2} max={12} step={1}
                      onChange={(bits) => updateEffect(i, 'lofi', { bits: Math.round(bits) })}
                    />
                    <i>бит</i>
                  </span>
                )}
                <SliderField
                  variant="mr"
                  title="Сколько эффекта подмешать к чистому звуку"
                  value={Math.round(fx.mix * 100)}
                  min={0} max={100} step={5}
                  display={`${Math.round(fx.mix * 100)}%`}
                  unit="%"
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
                  <label title="Глубина приглушения при ударе источника">
                    глубина, %
                    <NumField
                      value={Math.round((track.sidechain.amount ?? 0.5) * 100)} min={0} max={100} step={5}
                      onChange={(v) =>
                        change({ sidechain: { ...track.sidechain!, amount: v / 100 } })
                      }
                    />
                  </label>
                  <label title="Время восстановления после удара: 0.1 — резкий памп, 0.5 — мягкое выпускание">
                    восстановление, с
                    <NumField
                      value={track.sidechain.releaseSec ?? 0.25} min={0.05} max={2} step={0.05}
                      onChange={(v) =>
                        change({ sidechain: { ...track.sidechain!, releaseSec: v } })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!waveEditor && view === 'inst' && (
        <div className="track-head more-row panel" data-ob="inst-panel">
          <div className="tabs inst-tabs">
            {(
              [
                ['snd', 'источник'],
                ['env', 'огибающая'],
                ['timbre', 'тембр'],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? 'tab on' : 'tab'}
                data-ob={`tab-${id}`}
                onClick={() => setTab(id)}
              >
                {title}
              </button>
            ))}
            <span className="spacer" />
            <HelpHint guide="sound" scope={scope} label="Гид: настроить звук дорожки" />
                    {tab === 'snd' && (
              <button
                className="save-inst"
                data-ob="save-inst"
                title="Сохранить звук дорожки как свой пресет — появится в браузере инструментов, категория «мои»"
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
            )}
          </div>
          {tab === 'snd' && (
          <div className="group" data-ob="inst-group">
            {/* div, не label: label переносит hover/клики на первый
                вложенный контрол — «выбрать…» подсвечивался при наведении
                на соседей */}
            {/* Имя инструмента — для контекста; смена — чипом в шапке
                дорожки или кнопкой «инструменты»: обе точки открывают
                панель с применением к этой дорожке. */}
            <div className="lbl" title="Текущий инструмент: вычислен по параметрам — покрутил ручки, стал «свой». Сменить — чип инструмента в шапке дорожки или «инструменты» в шапке приложения">
              инструмент
              <span className="inline">
                <span className="sample-name" title="Текущий инструмент: вычислен по параметрам трека — покрутил ручки, стал «свой»">
                  {instrumentNameOf(st)}
                </span>
              </span>
            </div>
            {/* Волна — иконками, «как на приборе»: одна форма — один глиф.
                Подпись-подсказка на каждой. */}
            <div className="lbl" title="Форма волны осциллятора — основа тембра">
              волна
              <span className="wave-pick" data-ob="wave-pick">
                {WAVEFORMS.map((w) => (
                  <button
                    key={w}
                    className={st.waveform === w ? 'on' : ''}
                    title={WAVEFORM_LABELS[w]}
                    aria-label={WAVEFORM_LABELS[w]}
                    onClick={() => changeInst({ waveform: w })}
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
                  <NumField value={st.fmRatio ?? 2} min={0.25} max={16} step={0.01} onChange={(fmRatio) => changeInst({ fmRatio })} />
                </label>
                <label title="Глубина модуляции: 0 — чистый синус, 1–3 — мягкие электронные тембры, 5+ — ржа и металл. Индекс тает к хвосту ноты">
                  FM-глубина
                  <NumField value={st.fmIndex ?? 3} min={0} max={16} step={0.1} onChange={(fmIndex) => changeInst({ fmIndex })} />
                </label>
              </>
            )}
            {MORPH_LABELS[st.waveform] && (
              <Knob
                label="морф"
                title={`Морф модели «${WAVEFORM_LABELS[st.waveform]}»: ${MORPH_LABELS[st.waveform]}. Двойной клик — точное число`}
                value={Math.round((st.voiceMorph ?? 0.5) * 100)}
                min={0} max={100} step={1}
                onChange={(v) => changeInst({ voiceMorph: v / 100 })}
              />
            )}
            {st.waveform === 'karplus' && (
              <label title="Сколько секунд струна звенит до полной тишины — собственное затухание струны, поверх обычной огибающей ноты">
                затухание струны, с
                <NumField value={st.ksLife ?? 2.5} min={0.2} max={8} step={0.1} onChange={(ksLife) => changeInst({ ksLife })} />
              </label>
            )}
            {st.waveform === 'sample' ? (
              <>
                <label title="Сэмпл из хранилища. Строки нотного стана = скорость воспроизведения (×1 — как есть)" data-ob="snd-sample">
                  сэмпл
                  <span className="inline">
                    <span className="sample-name" title={st.sampleName ?? 'сэмпл не выбран'}>
                      {st.sampleName ?? 'не выбран'}
                    </span>
                    <button
                      onClick={() => setShowPicker(true)}
                      title="Выбрать из хранилища: прослушать и положить в слот"
                    >
                      выбрать…
                    </button>
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
                <label title="Как сэмплер играет буфер: напрямую (нота = сэмпл целиком с новой скоростью), гранулярно (нота = облако коротких осколков) или скрэтчем (нота = жест иглы)" data-ob="sample-mode">
                  режим
                  <select
                    value={st.sampleMode ?? 'plain'}
                    onChange={(e) => changeInst({ sampleMode: e.target.value as Instrument['sampleMode'] })}
                  >
                    <option value="plain">прямой</option>
                    <option value="grain">гранулярный</option>
                    <option value="scratch">скрэтч</option>
                  </select>
                </label>
                {(st.sampleMode ?? 'plain') === 'grain' && (
                  <>
                    <span className="inline grain-presets">
                      <button
                        title="Мелкая крошка: короткие зёрна, много, широкий разброс — шершавая пыль"
                        onClick={() => changeInst({ grainSizeMs: 20, grainCount: 24, grainScatter: 0.6 })}
                      >
                        пыль
                      </button>
                      <button
                        title="Тёплое облако: средние зёрна, плотный поток"
                        onClick={() => changeInst({ grainSizeMs: 180, grainCount: 12, grainScatter: 0.25 })}
                      >
                        облако
                      </button>
                      <button
                        title="Почти цельные куски: длинные зёрна, мало, из одного места — лента"
                        onClick={() => changeInst({ grainSizeMs: 400, grainCount: 4, grainScatter: 0.05 })}
                      >
                        лента
                      </button>
                    </span>
                    <label title="Длина осколка (зерна) в миллисекундах: 20–60 — почти крап, 100–300 — тёплое облако, 400+ — почти слышимый сэмпл">
                      зерно, мс
                      <NumField value={st.grainSizeMs ?? 120} min={10} max={800} step={10} onChange={(grainSizeMs) => changeInst({ grainSizeMs })} />
                    </label>
                    <label title="Сколько зёрен выпускает одна нота — плотность облака. 1–3 — редкие брызги, 15+ — сплошной поток">
                      зёрен на ноту
                      <NumField value={st.grainCount ?? 10} min={1} max={32} onChange={(grainCount) => changeInst({ grainCount: Math.round(grainCount) })} />
                    </label>
                    <label title="Откуда в сэмпле брать осколки: 0 — начало, 0.5 — середина, 1 — конец">
                      позиция
                      <NumField value={Math.round((st.grainPos ?? 0.3) * 100)} min={0} max={100} step={1} onChange={(v) => changeInst({ grainPos: v / 100 })} />
                    </label>
                    <label title="Разброс позиций зёрен вокруг заданной точки: 0 — все из одного места, 1 — по всему сэмплу">
                      разброс
                      <NumField value={Math.round((st.grainScatter ?? 0.15) * 100)} min={0} max={100} step={1} onChange={(v) => changeInst({ grainScatter: v / 100 })} />
                    </label>
                  </>
                )}

              </>
            ) : null}
            <button
              className="we-open"
              data-ob="we-open"
              aria-label="редактор волны"
              title="Редактор волны: обрезать сэмпл, разложить его в гармоники, нарисовать или дообогатить свою волну"
              onClick={() => onToggleWaveEditor(track.id)}
            >
              править волну…
            </button>
          </div>
          )}
                    {tab === 'env' && (
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
              onEdit={(u) => changeInst(u)}
              onPitch={(u) => changeInst(u)}
              decayEditable={!st.noteSteps}
            />
            <div className="env-fields">
              <label title="За сколько миллисекунд нота достигает полной громкости. Быстрые — удар, медленные — мягкие">
                атака, мс
                <NumField
                  value={Math.round(Math.max(st.attack, 0.0005) * 1000)} min={0} max={500} step={1}
                  onChange={(ms) => changeInst({ attack: Math.max(0.0005, ms / 1000) })}
                />
              </label>
              <label
                title="Плато (sustain): доля ноты на полной громкости после атаки, остаток — спад. 0% — сразу спад после атаки (перкуссионный хвост); 50–90% — тянущиеся ноты с мягким затуханием; 100% — тянется до перебоя (до 16 с), пока следующая нота не перехватит"
              >
                плато, %
                <NumField
                  value={Math.round((st.sustain ?? 0) * 100)} min={0} max={100} step={5}
                  onChange={(v) => changeInst({ sustain: v / 100 })}
                />
              </label>
              <label
                title={
                  st.waveform === 'sample'
                    ? 'Сколько секунд звучит нота — сэмпл длиннее обрезается. Для длинных сэмплов ставь больше'
                    : 'Сколько секунд звучит нота после удара'
                }
              >
                спад, с
                <NumField value={st.decay} min={0.01} max={4} step={0.01} onChange={(decay) => changeInst({ decay })} />
              </label>
              <label title="Нота стартует во столько раз выше тоники и слетает вниз за время падения — так делается бочка («вумп»). 1 — выключено. Не работает на шуме и струне; на сэмпле (прямом и гранулярном) рампит скорость воспроизведения">
                падение, ×
                <NumField
                  value={st.pitchDrop} min={1} max={16} step={0.5}
                  onChange={(pitchDrop) => changeInst({ pitchDrop })}
                />
              </label>
              <label title="За сколько секунд тон падает от верха до тоники. Бочке обычно 0.05–0.12">
                время падения, с
                <NumField
                  value={st.pitchTime} min={0} max={2} step={0.01}
                  onChange={(pitchTime) => changeInst({ pitchTime })}
                />
              </label>
              <button
                className="env-listen"
                title="Прослушать ноту с этой огибающей, фильтрами и падением тона"
                onClick={() => onPreviewNote(st)}
              >
                ▶ послушать
              </button>
            </div>
          </div>
          )}
                    {tab === 'timbre' && (
          <>
          <div className="group sub knob-row" data-ob="timbre-tab">
            <span className="sub-cap">фильтры</span>
            <Knob
              label="низ"
              title="Обрезка низа (highpass): убирает гул и рокот ниже этой частоты. У басов аккуратно (не выше 30–40), у хэтов смело поднимай. Двойной клик — точное число"
              value={st.filterLow} min={20} max={4000} step={10} log
              onChange={(filterLow) => changeInst({ filterLow })}
            />
            <Knob
              label="верх"
              title="Обрезка верха (lowpass): всё выше частоты приглушается. Меньше — глуше и мягче, больше — ярче и звонче. У баса 200–500, у хэтов 6000+. Двойной клик — точное число"
              value={st.filterFreq} min={60} max={12000} step={10} log
              onChange={(filterFreq) => changeInst({ filterFreq })}
            />
            <Knob
              label="резонанс"
              title="Резонанс фильтра (Q): подъём на частоте среза. 0.8 — ровный обрез; 4–10 — звонкое «горло» (воббл, сквелч); выше 15 — фильтр звенит сам по себе. Двойной клик — точное число"
              value={st.filterQ ?? 0.8} min={0.5} max={20} step={0.1}
              onChange={(filterQ) => changeInst({ filterQ })}
            />
            <Knob
              label="огиб. ↑↓"
              bipolar
              title="Огибающая фильтра: старт в полутонах от ручки «верх». Плюс — яркая атака-плак, минус — тёмный свелл; за «время» фильтр съезжает к базе. Двойной клик — точное число"
              value={st.filterEnvAmount ?? 0} min={-24} max={24} step={0.5}
              onChange={(filterEnvAmount) => changeInst({ filterEnvAmount })}
            />
            <Knob
              label="время"
              title="Огибающая фильтра: за сколько секунд фильтр съезжает к базе. 0.05–0.2 — щипок, 1+ — плавный свелл. Двойной клик — точное число"
              value={st.filterEnvTime ?? 0.3} min={0.05} max={2} step={0.05}
              onChange={(filterEnvTime) => changeInst({ filterEnvTime })}
            />
          </div>
          <div className="group sub knob-row">
            <span className="sub-cap">вибрато</span>
            <Knob
              label="скорость"
              title="Вибрато: частота качания высоты тона (Гц). 5–6 Гц — классическое певческое; 10–20 — нервное дрожание воббл-баса. Двойной клик — точное число"
              value={st.vibratoRate ?? 5} min={0.1} max={30} step={0.1}
              onChange={(vibratoRate) => changeInst({ vibratoRate })}
            />
            <Knob
              label="глубина"
              title="Вибрато: глубина в центах (1/100 полутона). 0 — выключено; 20–50 — заметное; 100 — широкий ук; 200–400 — воющий воббл; 1200 — октава. Двойной клик — точное число"
              value={st.vibratoDepth ?? 0} min={0} max={1200} step={5}
              onChange={(vibratoDepth) => changeInst({ vibratoDepth })}
            />
            <Knob
              label="задержка"
              title="Вибрато с задержкой: глубина нарастает от нуля за это время — голос «доплывает» до дрожания, как живое пение. Двойной клик — точное число"
              value={st.vibratoDelay ?? 0} min={0} max={2} step={0.05}
              onChange={(vibratoDelay) => changeInst({ vibratoDelay })}
            />
          </div>
          <div className="group sub knob-row" data-ob="unison-group">
            <span className="sub-cap">унисон</span>
            <span className="scope-cap" title="Унисон — для базовых волн (синус/пила/квадрат/треугольник)">базовые волны</span>
            <Knob
              label="голоса"
              title="Унисон: сколько расстроенных копий осциллятора играет на ноту. 1 — обычный голос; 3–5 — жирнее и шире. Двойной клик — точное число"
              value={st.unisonVoices ?? 1} min={1} max={8} step={1}
              onChange={(unisonVoices) => changeInst({ unisonVoices })}
            />
            <Knob
              label="детюн"
              title="Унисон: расстройка крайнего голоса в центах. 5–10 — лёгкий хорус; 20–40 — широкая стена. Двойной клик — точное число"
              value={st.unisonDetune ?? 12} min={0} max={50} step={1}
              onChange={(unisonDetune) => changeInst({ unisonDetune })}
            />
            <Knob
              label="разброс"
              title="Унисон: развод голосов по каналам (стерео-ширина), 0 — в центре. Двойной клик — точное число"
              value={Math.round((st.unisonSpread ?? 0) * 100)} min={0} max={100} step={5}
              onChange={(v) => changeInst({ unisonSpread: v / 100 })}
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
                  change({ arp: e.target.checked ? { mode: 'up', div: 1, octaves: 1 } : undefined })
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
                    onChange={(e) => change({ arp: { ...track.arp!, mode: e.target.value as ArpMode } })}
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
                    onChange={(div) => change({ arp: { ...track.arp!, div } })}
                  />
                </label>
                <label title="Повтор фигуры по октавам — классика арпеджио">
                  октавы
                  <NumField
                    value={track.arp.octaves} min={1} max={4} narrow
                    onChange={(octaves) => change({ arp: { ...track.arp!, octaves: Math.round(octaves) } })}
                  />
                </label>
              </>
            )}
          </div>
          </>
          )}
        </div>
      )}

      {!waveEditor && st.waveform === 'sample' && (st.sampleMode ?? 'plain') === 'scratch' && (
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
                onClick={() => changeInst({ scratchPoints: [] })}
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
                const len =
                  track.noteSteps && track.noteSteps > 0
                    ? track.noteSteps * track.rate * tickDuration(bpm)
                    : Math.max(st.attack, 0.0005) + st.decay;
                setScratchPlaying(true);
                window.setTimeout(() => setScratchPlaying(false), (len + 0.15) * 1000);
              }}
            >
              {scratchPlaying ? '▶ играет…' : '▶ послушать'}
            </button>
            <HelpHint guide="scratch" scope={scope} label="Гид: скрэтч жестом" />
            <span
              className="mini-info"
              title="Длительность жеста = длина ноты: «нота» в тулбаре стана (шаги) или атака+спад во вкладке «огибающая»"
            >
              жест ≈{' '}
              {(
                (track.noteSteps && track.noteSteps > 0
                  ? track.noteSteps * track.rate * tickDuration(bpm)
                  : Math.max(st.attack, 0.0005) + st.decay)
              ).toFixed(2)}
              с
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
                  const dur = scratchMap.duration;
                  const rs = st.sampleStart ?? 0;
                  const re = st.sampleEnd ?? dur;
                  const edge =
                    Math.abs(pos - re / dur) < 0.06
                      ? 'end'
                      : Math.abs(pos - rs / dur) < 0.06
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
                  const dur = scratchMap.duration;
                  const rs = st.sampleStart ?? 0;
                  const re = st.sampleEnd ?? dur;
                  if (edge === 'end')
                    changeInst({ sampleEnd: clampSec(Math.max(rs + 0.01, pos * dur), 0.001, dur) });
                  else
                    changeInst({ sampleStart: clampSec(Math.min(re - 0.01, pos * dur), 0, dur) });
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
                    const dur = scratchMap.duration;
                    const rsY = (1 - (st.sampleStart ?? 0) / dur) * 100;
                    const reY = (1 - Math.min(st.sampleEnd ?? dur, dur) / dur) * 100;
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
                    changeInst({ scratchPoints: sorted });
                    return;
                  }
                  const rec = scratchRec.current;
                  scratchRec.current = null;
                  if (rec) {
                    onScratchEnd();
                    setScratchLive(false);
                    setScratchArmed(false);
                    if (rec.pts.length >= 2) {
                      const dur = Math.max(1, rec.pts[rec.pts.length - 1].dt);
                      const N = 48;
                      const raw = rec.pts;
                      const res: { t: number; pos: number }[] = [];
                      let j = 0;
                      for (let i = 0; i <= N; i++) {
                        const tt = (i / N) * dur;
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
                      changeInst({ scratchPoints: smooth });
                    }
                    return;
                  }
                  const pending = pendingAdd.current;
                  pendingAdd.current = null;
                  if (pending) {
                    changeInst({
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
                      changeInst({ scratchPoints: (st.scratchPoints ?? []).filter((_, j) => j !== i) });
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

      {!waveEditor && st.waveform === 'sample' && (
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
            disabled={genBusy || !prompt.trim()}
            title="Сгенерировать и положить в слот (Enter в поле тоже работает)"
            onClick={() => onGenerateSample(track.id, prompt.trim(), genSeconds)}
          >
            {genBusy ? 'генерирую…' : 'сгенерировать'}
          </button>
          {st.sampleName && genBusy === false && (
            <span className="mini-info" title="Сейчас в слоте">в слоте: {st.sampleName}</span>
          )}
          <HelpHint guide="samples" step={3} scope={scope} label="Гид: сгенерировать сэмпл" />
        </div>
      )}

      {!waveEditor && view === 'sketch' && (
        <div className="sketch-box" data-ob="sketch-box">
          {/* Чипы эскизов — шапка плашки: выбор эскиза и настройка эскиза
              в одном блоке, активный чип называет то, что правишь */}
          <div className="sketch-head">
            <span className="mini-info" title="Эскизы дорожки: партии. Какой играет — решает сцена. Правый клик по эскизу — вариация (форк)">
              эскизы
            </span>
            {patternChips}
          </div>
          <div className="sketch-bar">
            <label title="Сколько шагов в цикле эскиза. Разные длины у треков = полиритмия: узоры сдвигаются друг относительно друга и никогда не повторяются" data-ob="length">
              длина
              <NumField narrow value={pattern.length} min={1} max={64} onChange={(length) => setLength(length)} />
            </label>
            <label title="Длительность шага этого эскиза. «Точёные» (1/8 точ.) — шаги плывут относительно других треков: полиметрия" data-ob="rate">
              шаг
              <select
                className="rate-sel"
                value={
                  RATE_OPTIONS.some((o) => o.v === (pattern.rate ?? track.rate))
                    ? String(pattern.rate ?? track.rate)
                    : 'custom'
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom')
                    onPatternChange(track.id, pattern.id, { rate: Number(e.target.value) });
                }}
              >
                {RATE_OPTIONS.map((o) => (
                  <option key={o.v} value={String(o.v)}>{o.label}</option>
                ))}
                {!RATE_OPTIONS.some((o) => o.v === (pattern.rate ?? track.rate)) && (
                  <option value="custom">своя ×{(pattern.rate ?? track.rate).toFixed(2)}</option>
                )}
              </select>
            </label>
            <SliderField
              variant="inline"
              label="громкость"
              title="Громкость этой партии — пока играет эскиз, в любой сцене с ним. База — громкость трека; здесь задаётся своя. Двойной клик по подписи — точное число"
              value={Math.round((pattern.volume ?? track.volume) * 100)}
              min={0} max={100} step={5}
              display={`${Math.round((pattern.volume ?? track.volume) * 100)}%`}
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
            onFillAxis={onFillAxis}
            onMutate={onMutate}
            onPatternCommand={onPatternCommand}
            onPickScale={() => setShowScales(true)}
            autoOn={autoLane}
            onAutoToggle={() => setAutoLane((v) => !v)}
          />
          <div className="roll" ref={rollRef} data-ob="roll">        <div className="roll-side" data-ob="scale-rows">
          <div className="col-num-spacer oct-row" data-ob="octaves">
            <button className="oct-btn" title="Добавить октаву вверх" onClick={() => addOctave('up')}>+окт</button>
            <button
              className="oct-btn"
              title={octaveBusy(track, 'up', octRows('up')) ? 'В верхней октаве есть ноты — сначала убери их' : 'Убрать верхнюю октаву'}
              disabled={up === 0 || octaveBusy(track, 'up', octRows('up'))}
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
              className="oct-btn"
              title={octaveBusy(track, 'down', octRows('down')) ? 'В нижней октаве есть ноты — сначала убери их' : 'Убрать нижнюю октаву'}
              disabled={down === 0 || octaveBusy(track, 'down', octRows('down'))}
              onClick={() => removeOctave('down')}
            >−</button>
          </div>
        </div>
        <div className="roll-body">
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
                          ? `${(track.freq * ratio).toFixed(1)} Гц${chord ? ` · аккорд из ${s.notes.length} нот` : ''} · громкость ${Math.round(nt!.vel * 100)}% · вероятность ${Math.round(nt!.prob * 100)}%${Math.abs((nt!.gate ?? 1) - 1) > 1e-6 ? ` · длина ×${(nt!.gate ?? 1).toFixed(1)}` : ''}\nклик по другой строке — добавить ноту (аккорд) · правый клик — убрать ноту`
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
            target={autoTarget}
            length={pattern.length}
            activeStep={activeStep}
            fadeIn={pattern.fadeIn ?? 0.005}
            fadeOut={pattern.fadeOut ?? 0.05}
            stepSec={stepDuration(st, bpm, pattern)}
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

      {selectedStep && selectedCol !== null && (
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

          {/* Кривые партии: цель рисуется на дорожке под станом (кнопка
              «кривые» в тулбаре стана); здесь — только выбор цели. */}
          {autoLane && (
          <div className="panel-row auto-box">
            <div className="sub-head">
              <span className="sub-cap">кривые партии</span>
              <div className="seg">
                {(Object.keys(AUTO_TARGET_LABELS) as AutoTarget[]).map((t) => (
                  <button
                    key={t}
                    className={autoTarget === t ? 'on' : ''}
                    onClick={() => setAutoTarget(t)}
                  >
                    {AUTO_TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
              <span className="spacer" />
              {(pattern.automation?.some((c) => c.target === autoTarget)) && (
                <button
                  title="Убрать кривую: параметр вернётся к своей ручке"
                  onClick={() =>
                    onPatternChange(track.id, pattern.id, {
                      automation: (pattern.automation ?? []).filter((c) => c.target !== autoTarget),
                    })
                  }
                >
                  убрать кривую
                </button>
              )}
            </div>
          </div>
          )}

          {/* Модуляции — свойство партии: от эскиза к эскизу свои */}
          <div className="mods-box">
            <div className="sub-head">
              <button
                className={'mods-toggle' + (showMods ? ' on' : '')}
                data-ob="mods-toggle"
                title="Модуляции — авторучки-LFO. Живут на эскизе: у каждой партии свои. Первая правка скопирует набор трека в этот эскиз"
                onClick={() => setShowMods((v) => !v)}
              >
                {showMods ? '▾' : '▸'} модуляции
              </button>
              {showMods && (
                <button data-ob="mods-add" onClick={addMod} title="Добавить LFO">
                  + модуляция
                </button>
              )}
              <span className="spacer" />
              <HelpHint guide="effects" step={6} scope={scope} label="Гид: модуляции" />
            </div>
            {showMods && (
            <div className="group mods-group" data-ob="mods-list">
              {(pattern.mods ?? track.mods).map((m, i) => (
                <div className="mod-row" key={i} {...rowDropProps('mod', i, moveMod)}>
                  {rowGrip('mod', i)}
                  <button className="remove" title="Убрать модуляцию" onClick={() => removeMod(i)}>×</button>
                  <select
                    value={m.source ?? 'lfo'}
                    title="Источник: LFO — периодическая волна; ступени (S&H) — случайные значения с заданным темпом; перлин — плавные случайные холмы"
                    onChange={(e) => updateMod(i, { source: e.target.value as Mod['source'] })}
                  >
                    {Object.entries(MOD_SOURCE_LABELS).map(([id, title]) => (
                      <option key={id} value={id}>{title}</option>
                    ))}
                  </select>
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
                  {(m.source ?? 'lfo') === 'lfo' && (
                  <select
                    value={m.shape}
                    title="Форма колебания"
                    onChange={(e) => updateMod(i, { shape: e.target.value as Mod['shape'] })}
                  >
                    {LFO_SHAPES.map((sh) => (
                      <option key={sh} value={sh}>{WAVEFORM_LABELS[sh]}</option>
                    ))}
                  </select>
                  )}
                  <span className="mr" title="Скорость колебаний: 0.2 Гц — период 5 секунд; 4–8 Гц — вибрато">
                    <NumField
                      value={m.rate} min={0.01} max={40} step={0.05}
                      onChange={(rate) => updateMod(i, { rate })}
                    />
                    <i>Гц</i>
                    <select
                      className="sync-select"
                      value=""
                      title="Синхронизировать с темпом: вобблеру и пульсациям нужна доля, а не свободные Гц"
                      onChange={(e) => {
                        const k = Number(e.target.value);
                        if (k) updateMod(i, { rate: +((bpm / 60) * k).toFixed(3) });
                        e.currentTarget.value = '';
                      }}
                    >
                      <option value="">синхр</option>
                      <option value="0.25">1/16</option>
                      <option value="0.375">1/16 точ</option>
                      <option value="0.5">1/8</option>
                      <option value="0.75">1/8 точ</option>
                      <option value="1">1/4</option>
                      <option value="1.5">1/4 точ</option>
                      <option value="2">1/2</option>
                      <option value="4">1/1</option>
                    </select>
                  </span>
                  <SliderField
                    variant="mr"
                    title="Глубина: насколько сильно LFO отклоняет параметр"
                    value={Math.round(m.depth * 100)}
                    min={0} max={100} step={5}
                    display={`${Math.round(m.depth * 100)}%`}
                    unit="%"
                    onChange={(v) => updateMod(i, { depth: v / 100 })}
                  />
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {showScales && (
        <ScalePicker
          current={track.scale}
          onPick={applyScale}
          onClose={() => setShowScales(false)}
        />
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
