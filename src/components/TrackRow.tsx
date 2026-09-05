import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  AutoTarget,
  Effect,
  Instrument,
  Mod,
  Note,
  Pattern,
  SoundingTrack,
  Step,
  Track,
} from '../types';
import {
  AUTO_TARGET_LABELS,
  EFFECT_LABELS,
  MOD_TARGET_LABELS,
  WAVEFORM_LABELS,
  makeNote,
  makeStep,
  scaleOf,
} from '../types';
import type { MutateModes } from '../music/mutate';
import { instrumentNameOf } from '../music/instrumentPresets';
import { ScalePicker } from './ScalePicker';
import { PatternChips } from './PatternChips';
import { RollTools } from './RollTools';
import { LevelBar } from './LevelBar';
import { NumField } from './NumField';
import { SliderField } from './SliderField';
import { InstrumentEditor, type InstEditorTab } from './InstrumentEditor';
import { AutoLane } from './AutoLane';
import { alertDialog } from './dialogs';
import { SamplePicker } from './SamplePicker';
import { putSample } from '../audio/library';
import { tickDuration, stepDuration } from '../audio/timing';
import { clip } from '../music/clip';
import { HelpHint } from '../onboarding/Onboarding';

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
  // Редактор инструмента: раздвижной режим карточки — остальной
  // интерфейс трека съёживается, редактор занимает его место.
  editorOpen: boolean;
  editorTab: InstEditorTab;
  onEditorTab: (t: InstEditorTab) => void;
  onOpenEditor: (id: string, tab?: InstEditorTab) => void;
  onCloseEditor: () => void;
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
  editorOpen,
  editorTab,
  onEditorTab,
  onOpenEditor,
  onCloseEditor,
  onGetSampleBuffer,
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
  const [showScales, setShowScales] = useState(false);
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
  const [showMods, setShowMods] = useState(false);
  // Кривые партии: какая цель рисуется.
  const [autoTarget, setAutoTarget] = useState<AutoTarget>('volume');
  // Дорожка автоматизации под станом — открыта/закрыта (UI-состояние).
  const [autoLane, setAutoLane] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);

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
        {/* Переключатель сущности карточки: партия (эскиз), общий звук
            (трек) или тембр (инструмент — большой редактор). Слева, у
            имени — основная работа идёт здесь. */}
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
            className={view === 'track' && !editorOpen ? 'on' : ''}
            data-ob="mode-track"
            aria-label="настройка трека"
            title="Трек — общее и комната: громкость/пан, фаза, тоника, эффекты, сайдчейн"
            onClick={() => switchView('track')}
          >
            трек
          </button>
          <button
            className={editorOpen ? 'on' : ''}
            data-ob="mode-inst"
            aria-label="инструмент"
            title="Инструмент — большой редактор тембра: источник (волна/сэмпл), огибающая ноты, фильтры, вибрато, унисон; вкладки «волна» и «сэмпл» — своя волна и работа с сэмплом"
            onClick={() => (editorOpen ? onCloseEditor() : onOpenEditor(track.id))}
          >
            инструмент
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
        <InstrumentEditor
          track={track}
          inst={inst}
          pattern={pattern}
          bpm={bpm}
          tab={editorTab}
          onTab={onEditorTab}
          onChangeInst={changeInst}
          onChangeTrack={(patch) => change(patch)}
          onClose={onCloseEditor}
          onPickSample={() => setShowPicker(true)}
          onLoadSampleFile={loadSampleFile}
          getBuffer={onGetSampleBuffer}
          onPreviewRegion={(i, a, b) => onPreviewSampleRegion({ ...st, ...i }, a, b)}
          onPreviewNote={(i) => onPreviewNote({ ...st, ...i })}
          onTransformSample={onTransformSample}
          onGenerateSample={onGenerateSample}
          busy={genBusy}
          onScratchBegin={onScratchBegin}
          onScratchMove={onScratchMove}
          onScratchEnd={onScratchEnd}
          onScratchPreview={onScratchPreview}
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
