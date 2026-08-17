import { memo, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  Effect,
  Mod,
  Note,
  Pattern,
  ScratchPoint,
  Step,
  Track,
  Waveform,
} from '../types';
import {
  EFFECT_LABELS,
  MOD_TARGET_LABELS,
  MORPH_LABELS,
  WAVEFORM_LABELS,
  makeNote,
  makeStep,
  scaleOf,
} from '../types';
import { presetName } from '../music/scales';
import { instrumentNameOf } from '../music/instrumentPresets';
import type { InstrumentPreset } from '../music/instrumentPresets';
import { InstrumentBrowser } from './InstrumentBrowser';
import { ScalePicker } from './ScalePicker';
import { NumField } from './NumField';
import { EnvGraph, PitchGraph } from './EnvGraph';
import { alertDialog } from './dialogs';
import { SamplePicker } from './SamplePicker';
import { putSample } from '../audio/library';
import { tickDuration } from '../audio/engine';
import { clip } from '../music/clip';

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
  // steps-правки (клики, перенос, вставка, удаление) — отдельный шаг undo
  onPatternCommand: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
  onSelectPattern: (trackId: string, patternId: string) => void;
  onAddPattern: (trackId: string) => void;
  onForkPattern: (trackId: string, patternId: string) => void;
  onRemovePattern: (trackId: string, patternId: string) => void;
  onEuclid: (id: string, pulses: number) => void;
  onMutate: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (fromId: string, toId: string, place: 'before' | 'after') => void;
  soloActive: boolean;
  onSolo: (trackId: string) => void;
  onScratchBegin: (pos: number) => void;
  onScratchMove: (pos: number) => void;
  onScratchEnd: () => void;
  onScratchPreview: () => void;
  onScratchPeaks: () => Promise<number[] | null>;
  patternSceneCounts: Record<string, number>;
  // Для сайдчейна: все дорожки патча (id + имя).
  allTracks: { id: string; name: string }[];
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
  onPatternCommand,
  onSelectPattern,
  onAddPattern,
  onForkPattern,
  onRemovePattern,
  onEuclid,
  onMutate,
  onRemove,
  onDuplicate,
  onReorder,
  soloActive,
  onSolo,
  onScratchBegin,
  onScratchMove,
  onScratchEnd,
  onScratchPreview,
  onScratchPeaks,
  patternSceneCounts,
  allTracks,
  onGenerateSample,
  genBusy,
}: Props) {
  const [pulses, setPulses] = useState(3);
  const [prompt, setPrompt] = useState('');
  const [genSeconds, setGenSeconds] = useState(3);
  const [showInstruments, setShowInstruments] = useState(false);

  /** Сменить инструмент трека: тембр/огибающая/фильтры/эффекты — из пресета,
   *  партии (ноты), громкость и ритм — остаются пользователю. */
  const applyInstrumentPreset = (preset: InstrumentPreset) => {
    if (!preset) return;
    const t = preset.track;
    const scale = t.scale && t.scale.length > 0 ? t.scale : [1];
    const upd: Partial<Track> = {
      waveform: t.waveform,
      freq: t.freq ?? track.freq,
      scale,
      scaleOctUp: 0,
      scaleOctDown: 0,
      attack: t.attack ?? track.attack,
      decay: t.decay ?? track.decay,
      pitchDrop: t.pitchDrop ?? 1,
      pitchTime: t.pitchTime ?? 0.08,
      filterLow: t.filterLow ?? 20,
      filterFreq: t.filterFreq ?? 8000,
      effects: t.effects ?? [],
      mono: t.mono,
      fmRatio: t.fmRatio ?? 2,
      fmIndex: t.fmIndex ?? 3,
      voiceMorph: t.voiceMorph ?? 0.5,
      ksLife: t.ksLife ?? 2.5,
      sampleMode: t.sampleMode ?? 'plain',
      grainSizeMs: t.grainSizeMs ?? 120,
      grainCount: t.grainCount ?? 10,
      grainPos: t.grainPos ?? 0.3,
      grainScatter: t.grainScatter ?? 0.15,
      patterns: clampAllNotes(scale.length - 1),
    };
    if (t.mods) upd.mods = t.mods.map((m) => ({ ...m }));
    change(upd);
  };

  /** Парсер своей шкалы живёт в music/scales (parseRatios) — используется
   *  модалкой выбора шкалы вместе с N-ET и пресетами. */

  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [showRoll, setShowRoll] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showScales, setShowScales] = useState(false);
  const scratchRef = useRef<HTMLDivElement | null>(null);
  const scratchRec = useRef<{ t0: number; pts: { dt: number; pos: number }[] } | null>(null);
  const [scratchArmed, setScratchArmed] = useState(false);
  const [scratchLive, setScratchLive] = useState(false);
  const [scratchPlaying, setScratchPlaying] = useState(false);
  const [scratchPeaks, setScratchPeaks] = useState<number[] | null>(null);
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
  const [tab, setTab] = useState<'snd' | 'env' | 'timbre' | 'fx' | 'mods'>('snd');
  const rollRef = useRef<HTMLDivElement>(null);
  const sampleFileRef = useRef<HTMLInputElement>(null);

  const rows = scaleOf(track).map((ratio, i) => ({ ratio, i })).reverse();
  const baseLen = track.scale.length;

  const change = (patch: Partial<Track>) => onChange(track.id, { ...track, ...patch });
  const changeSteps = (steps: Step[]) => onPatternCommand(track.id, pattern.id, { steps });

  const loadSampleFile = (f: File) => {
    void putSample(f, f.name)
      .then((meta) => change({ sampleId: meta.id, sampleName: meta.name }))
      .catch(() => void alertDialog('Не удалось сохранить сэмпл в библиотеку', 'сэмпл'));
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
    change({
      scale,
      scaleOctUp: 0,
      scaleOctDown: 0,
      patterns: clampAllNotes(scale.length - 1),
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

  // Слайдер панели шага — коалесцируется (движение = один шаг undo),
  // в отличие от командных правок нот.
  const setNoteField = (col: number, row: number, field: 'vel' | 'prob' | 'gate', v: number) => {
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
    if (track.waveform !== 'sample' || (track.sampleMode ?? 'plain') !== 'scratch') return;
    let alive = true;
    void onScratchPeaks().then((p) => {
      if (alive) setScratchPeaks(p ?? []);
    });
    return () => {
      alive = false;
    };
  }, [track.waveform, track.sampleMode, track.sampleId, onScratchPeaks]);

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
    const taken: { c: number; n: number; vel: number; prob: number }[] = [];
    const out = steps.map((st, c) => ({
      ...st,
      notes: st.notes.filter((nt) => {
        if (sel.has(`${c}:${nt.n}`)) {
          taken.push({ c, n: nt.n, vel: nt.vel, prob: nt.prob });
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
      out[nc].notes = [...out[nc].notes, { n: nn, vel: t.vel, prob: t.prob }];
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
      steps[c].notes = [...steps[c].notes, { n, vel: cn.vel, prob: cn.prob }];
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
      steps[c].notes = [...steps[c].notes, { n: en.n, vel: nt.vel, prob: nt.prob }];
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
          return { col: c, n, vel: nt?.vel ?? 0.8, prob: nt?.prob ?? 1 };
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
  const stateRef = useRef({ track, pattern, onPatternChange, sel });
  stateRef.current = { track, pattern, onPatternChange, sel };
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
      // Alt — длина ноты (шаг 0.1), Shift — вероятность, просто колесо — громкость.
      const step = e.altKey ? 0.1 : 0.05;
      const d = e.deltaY < 0 ? step : -step;
      const field = (x: Note) =>
        e.altKey
          ? { ...x, gate: Math.min(4, Math.max(0.1, +((x.gate ?? 1) + d).toFixed(2))) }
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

  const modTargets: string[] = ['pan', 'volume', 'filterFreq'];
  if (effects.length > 0) modTargets.push('fxMix');
  if (effects.some((e) => e.type === 'delay')) modTargets.push('fxTime', 'fxFeedback');

  const patternChips = (
    <div className="pattern-chips">
      {track.patterns.map((pt) => {
        const scenes = patternSceneCounts[pt.id] ?? 0;
        return (
          <button
            key={pt.id}
            className={pt.id === pattern.id ? 'chip on' : 'chip'}
            title={
              (pt.forkedFrom
                ? 'вариация (форк). Клик — играть в этой сцене, правый клик — новая вариация от этого'
                : 'эскиз дорожки — общий для всех сцен, где играет. Клик — играть, правый клик — независимая копия (форк)') +
              (scenes > 1 ? `. Играет в ${scenes} сценах — правка эскиза меняет его во всех них` : '')
            }
            onClick={() => onSelectPattern(track.id, pt.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onForkPattern(track.id, pt.id);
            }}
          >
            {pt.name}
            {scenes > 1 && <sup className="scene-cnt">{scenes}</sup>}
          </button>
        );
      })}
      <button className="chip add" title="Новый пустой эскиз" onClick={() => onAddPattern(track.id)}>
        +
      </button>
      {track.patterns.length > 1 && (
        <button
          className="chip del"
          title={`Удалить эскиз «${pattern.name}» — сцены, где он играл, перейдут на первый оставшийся`}
          onClick={() => onRemovePattern(track.id, pattern.id)}
        >
          ×
        </button>
      )}
    </div>
  );

  if (collapsed) {
    return (
      <div
      className={
        'track collapsed' +
        (track.enabled === false ? ' off' : '') +
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
              className={pattern.muted ? 'ms on-m' : 'ms'}
              title="Мьют этой партии (эскиз молчит во всех сценах, где играет)"
              onClick={() => onPatternChange(track.id, pattern.id, { muted: !pattern.muted })}
            >M</button>
            <button
              className={soloActive ? 'ms on-s' : 'ms'}
              title="Соло в этой сцене: слышна только эта дорожка. Повторный клик — снять"
              onClick={() => onSolo(track.id)}
            >S</button>
          </span>
          <span className="mini-wave">{WAVEFORM_LABELS[track.waveform]}</span>
          {patternChips}
          <input
            className="mini-vol"
            type="range" min={0} max={1} step={0.05} value={track.volume}
            title={`громкость ${Math.round(track.volume * 100)}%`}
            onChange={(e) => change({ volume: Number(e.target.value) })}
          />
          <input
            className="mini-vol pan"
            type="range" min={0} max={1} step={0.05} value={track.pan}
            title={`панорама дорожки: ${panLabel(track.pan)} — разнос инструментов по комнате`}
            onChange={(e) => change({ pan: Number(e.target.value) })}
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
    <div
      className={
        'track' +
        (track.enabled === false ? ' off' : '') +
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
        <button className="fold" title="Свернуть трек" onClick={() => onToggleCollapse(track.id)}>▾</button>
        <input className="track-name" value={track.name} onChange={(e) => change({ name: e.target.value })} />
        <span className="ms-btns">
          <button
            className={pattern.muted ? 'ms on-m' : 'ms'}
            title="Мьют этой партии: эскиз молчит во всех сценах, где играет. Часы идут — сняв мьют, войдёшь в фазе"
            onClick={() => onPatternChange(track.id, pattern.id, { muted: !pattern.muted })}
          >M</button>
          <button
            className={soloActive ? 'ms on-s' : 'ms'}
            title="Соло в этой сцене: слышна только эта дорожка (любой её эскиз). С других сцен не переносится. Повторный клик — снять"
            onClick={() => onSolo(track.id)}
          >S</button>
        </span>
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
          <label
            title={
              track.waveform === 'sample'
                ? 'Шкала = набор скоростей воспроизведения сэмпла (питч). Октавы добавляются кнопками у стана'
                : 'Набор высот нотного стана: мировые строи (гамелан, 22 шрути, макам), чистый строй, N-ET и свои дроби. Октавы — кнопками у стана'
            }
          >
            шкала
            <button
              className="scale-btn"
              title="Выбрать шкалу: поиск по названию, пресеты мировых строёв, N равных ступеней, своя дробями"
              onClick={() => setShowScales(true)}
            >
              {presetName(track.scale)}
            </button>
          </label>
          <label title="Громкость трека — общая для всех эскизов. Свою на эскиз можно задать во вкладке «тембр»">
            громкость
            <NumField value={track.volume} min={0} max={1} step={0.05} onChange={(volume) => change({ volume })} />
          </label>
          <label
            title="Панорама дорожки — разнос инструментов по комнате. База для эскизов: у конкретной партии может быть своя (вкладка «тембр»), LFO на панораму — пинг-понг"
          >
            пан
            <span className="inline">
              <input
                type="range" min={0} max={1} step={0.05} value={track.pan}
                onChange={(e) => change({ pan: Number(e.target.value) })}
              />
              <span className="pan-label">{panLabel(track.pan)}</span>
            </span>
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
            <label title="Сменить инструмент: тембр, огибающая, фильтры и эффекты — из пресета; ноты, громкость и ритм останутся твоими">
              инструмент
              <span className="inline">
                <span className="sample-name" title="Текущий инструмент: вычислен по параметрам трека — покрутил ручки, стал «свой»">
                  {instrumentNameOf(track)}
                </span>
                <button onClick={() => setShowInstruments(true)}>выбрать…</button>
              </span>
            </label>
            <label title="Форма волны осциллятора — основа тембра">
              волна
              <select value={track.waveform} onChange={(e) => change({ waveform: e.target.value as Waveform })}>
                {WAVEFORMS.map((w) => (
                  <option key={w} value={w}>{WAVEFORM_LABELS[w]}</option>
                ))}
              </select>
            </label>
            {track.waveform === 'fm' && (
              <>
                <label title="Отношение частоты модулятора к ноте. Целые (1, 2, 3) — гармоничные тембры; иррациональные (1.41 ≈ √2) — колокольный негармоничный звон">
                  FM-отношение, ×
                  <NumField value={track.fmRatio ?? 2} min={0.25} max={16} step={0.01} onChange={(fmRatio) => change({ fmRatio })} />
                </label>
                <label title="Глубина модуляции: 0 — чистый синус, 1–3 — мягкие электронные тембры, 5+ — ржа и металл. Индекс тает к хвосту ноты">
                  FM-глубина
                  <NumField value={track.fmIndex ?? 3} min={0} max={16} step={0.1} onChange={(fmIndex) => change({ fmIndex })} />
                </label>
              </>
            )}
            {MORPH_LABELS[track.waveform] && (
              <label
                title={`Морф модели «${WAVEFORM_LABELS[track.waveform]}»: ${MORPH_LABELS[track.waveform]}`}
              >
                морф
                <NumField
                  value={Math.round((track.voiceMorph ?? 0.5) * 100)}
                  min={0} max={100} step={5}
                  onChange={(v) => change({ voiceMorph: v / 100 })}
                />
              </label>
            )}
            {track.waveform === 'karplus' && (
              <label title="Сколько секунд струна звенит до полной тишины — собственное затухание струны, поверх обычной огибающей ноты">
                затухание струны, с
                <NumField value={track.ksLife ?? 2.5} min={0.2} max={8} step={0.1} onChange={(ksLife) => change({ ksLife })} />
              </label>
            )}
            {track.waveform === 'sample' ? (
              <>
                <label title="Сэмпл из библиотеки. Строки нотного стана = скорость воспроизведения (×1 — как есть)">
                  сэмпл
                  <span className="inline">
                    <span className="sample-name" title={track.sampleName ?? 'сэмпл не выбран'}>
                      {track.sampleName ?? 'не выбран'}
                    </span>
                    <button
                      onClick={() => setShowPicker(true)}
                      title="Выбрать из библиотеки: прослушать и положить в слот"
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
                <label title="Как сэмплер играет буфер: напрямую (нота = сэмпл целиком с новой скоростью) или гранулярно (нота = облако коротких осколков)">
                  режим
                  <select
                    value={track.sampleMode ?? 'plain'}
                    onChange={(e) => change({ sampleMode: e.target.value as Track['sampleMode'] })}
                  >
                    <option value="plain">прямой</option>
                    <option value="grain">гранулярный</option>
                    <option value="scratch">скрэтч</option>
                  </select>
                </label>
                {(track.sampleMode ?? 'plain') === 'grain' && (
                  <>
                    <label title="Длина осколка (зерна) в миллисекундах: 20–60 — почти крап, 100–300 — тёплое облако, 400+ — почти слышимый сэмпл">
                      зерно, мс
                      <NumField value={track.grainSizeMs ?? 120} min={10} max={800} step={10} onChange={(grainSizeMs) => change({ grainSizeMs })} />
                    </label>
                    <label title="Сколько зёрен выпускает одна нота — плотность облака. 1–3 — редкие брызги, 15+ — сплошной поток">
                      зёрен на ноту
                      <NumField value={track.grainCount ?? 10} min={1} max={32} onChange={(grainCount) => change({ grainCount: Math.round(grainCount) })} />
                    </label>
                    <label title="Откуда в сэмпле брать осколки: 0 — начало, 0.5 — середина, 1 — конец">
                      позиция
                      <NumField value={Math.round((track.grainPos ?? 0.3) * 100)} min={0} max={100} step={1} onChange={(v) => change({ grainPos: v / 100 })} />
                    </label>
                    <label title="Разброс позиций зёрен вокруг заданной точки: 0 — все из одного места, 1 — по всему сэмплу">
                      разброс
                      <NumField value={Math.round((track.grainScatter ?? 0.15) * 100)} min={0} max={100} step={1} onChange={(v) => change({ grainScatter: v / 100 })} />
                    </label>
                  </>
                )}

              </>
            ) : (
              <>
                <label title="Базовая частота шкалы. Бас — 30–90 Гц, обычные ноты — 100–500, верхушки — выше">
                  тоника, Гц
                  <NumField value={track.freq} min={20} max={9000} step={0.1} onChange={(freq) => change({ freq })} />
                </label>
              </>
            )}
          </div>
          )}
          {tab === 'env' && (
          <div className="group env-tab">
            <div className="env-block">
              <EnvGraph
                attack={track.attack}
                decay={track.decay}
                sustain={track.sustain ?? 0}
                gridSec={tickDuration(bpm)}
              />
              <span className="env-info">
                {track.noteSteps && track.noteSteps > 0
                  ? `нота ≈ ${(track.noteSteps * track.rate * tickDuration(bpm)).toFixed(2)} с · ${track.noteSteps} шаг(ов) — по сетке`
                  : `нота ≈ ${(Math.max(track.attack, 0.0005) + track.decay).toFixed(2)} с · ${((Math.max(track.attack, 0.0005) + track.decay) / tickDuration(bpm)).toFixed(1)} шестнадцатых`}
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
              <label
                title="Плато (sustain): доля ноты на полной громкости после атаки, остаток — спад. 0% — сразу спад после атаки (перкуссионный хвост); 50–90% — тянущиеся ноты с мягким затуханием в конце"
              >
                плато, %
                <NumField
                  value={Math.round((track.sustain ?? 0) * 100)} min={0} max={100} step={5}
                  onChange={(v) => change({ sustain: v / 100 })}
                />
              </label>
              <label title="Нота стартует во столько раз выше тоники и слетает вниз за время падения — так делается бочка («вумп»). 1 — выключено. Не работает на шуме и струне; на сэмпле (прямом и гранулярном) рампит скорость воспроизведения">
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
              <label
                title={
                  track.noteSteps && track.noteSteps > 0
                    ? 'Длина ноты в шагах — привязана к сетке инструмента (шаг эскиза × темп): меняешь темп, тягучесть остаётся той же. 0.9 — стаккато-щель, 1 — встык, 2–4 — подтяжки поверх соседних'
                    : '0 — длина по огибающей (атака + спад). Задай число шагов — и длина привяжется к сетке инструмента: при смене темпа и шага тягучесть не поедет'
                }
              >
                длина ноты, шагов
                <NumField
                  value={track.noteSteps ?? 0} min={0} max={16} step={0.1}
                  onChange={(v) => change({ noteSteps: v > 0 ? +v.toFixed(2) : undefined })}
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
            <label title="Вибрато: частота качания высоты тона (Гц). 5–6 Гц — классическое певческое">
              вибрато, Гц
              <NumField
                value={track.vibratoRate ?? 5} min={0.1} max={12} step={0.1}
                onChange={(vibratoRate) => change({ vibratoRate })}
              />
            </label>
            <label title="Вибрато: глубина в центах (1/100 полутона). 0 — выключено; 20–50 центов — заметное; 100 — широкий ук">
              вибрато, центы
              <NumField
                value={track.vibratoDepth ?? 0} min={0} max={100} step={1}
                onChange={(vibratoDepth) => change({ vibratoDepth })}
              />
            </label>
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
                  сайдчейн, %
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
            <label
              title={
                pattern.rate === undefined
                  ? `Скорость шагов этой партии. Сейчас — как у трека (×${track.rate}); выбор переопределит только для этого эскиза`
                  : 'Скорость шагов этой партии — своя, пока играет эскиз. «с трека» вернёт общий шаг'
              }
            >
              шаг эскиза
              <span className="inline">
                <select
                  value={
                    RATE_OPTIONS.some((o) => o.v === (pattern.rate ?? track.rate))
                      ? String(pattern.rate ?? track.rate)
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'reset') onPatternChange(track.id, pattern.id, { rate: undefined });
                    else if (e.target.value !== 'custom')
                      onPatternChange(track.id, pattern.id, { rate: Number(e.target.value) });
                  }}
                >
                  {RATE_OPTIONS.map((o) => (
                    <option key={o.v} value={String(o.v)}>{o.label}</option>
                  ))}
                  {pattern.rate !== undefined && (
                    <option value="reset">как у трека (×{track.rate})</option>
                  )}
                  {!RATE_OPTIONS.some((o) => o.v === (pattern.rate ?? track.rate)) && (
                    <option value="custom">своя ×{pattern.rate ?? track.rate}</option>
                  )}
                </select>
                {pattern.rate !== undefined && (
                  <button
                    title="Убрать переопределение: этот эскиз будет играть с шагом трека"
                    onClick={() => onPatternChange(track.id, pattern.id, { rate: undefined })}
                  >
                    с трека
                  </button>
                )}
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
                <span className="mr" title="Сколько эффекта подмешать к чистому звуку">
                  <input
                    type="range" min={0} max={1} step={0.05} value={fx.mix}
                    onChange={(e) => {
                      const mix = Number(e.target.value);
                      if (fx.type === 'delay') updateDelay(i, { mix });
                      else if (fx.type === 'reverb') updateReverb(i, { mix });
                      else if (fx.type === 'dist') updateEffect(i, 'dist', { mix });
                      else if (fx.type === 'chorus') updateEffect(i, 'chorus', { mix });
                      else updateEffect(i, 'lofi', { mix });
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
          </div>
          )}
        </div>
      )}

      {track.waveform === 'sample' && (track.sampleMode ?? 'plain') === 'scratch' && (
        <div className={'scratch-bar' + (scratchArmed || scratchLive ? ' recording' : '')}>
          <div className="scratch-actions">
            <button
              className={scratchArmed || scratchLive ? 'on' : ''}
              title="Нажми — и проведи мышью по пэду: путь запишется жестом (до 48 сглаженных точек). Отпустишь — запись закончится сама"
              onClick={() => setScratchArmed((v) => !v)}
            >
              {scratchArmed || scratchLive ? '● веди по пэду…' : '● записать жест'}
            </button>
            <button
              className={scratchPlaying ? 'on' : ''}
              title="Проиграть жест одной нотой — проверить, как он звучит в нотах"
              onClick={() => {
                onScratchPreview();
                const len =
                  track.noteSteps && track.noteSteps > 0
                    ? track.noteSteps * track.rate * tickDuration(bpm)
                    : Math.max(track.attack, 0.0005) + track.decay;
                setScratchPlaying(true);
                window.setTimeout(() => setScratchPlaying(false), (len + 0.15) * 1000);
              }}
            >
              {scratchPlaying ? '▶ играет…' : '▶ послушать'}
            </button>
            <span
              className="mini-info"
              title="Длительность жеста = длина ноты. Меняется во вкладке «огибающая»: «длина ноты, шагов» или атака+спад"
            >
              жест ≈{' '}
              {(
                (track.noteSteps && track.noteSteps > 0
                  ? track.noteSteps * track.rate * tickDuration(bpm)
                  : Math.max(track.attack, 0.0005) + track.decay)
              ).toFixed(2)}
              с
            </span>
          </div>
          <div className="scratch-row">
            <div
              className="scratch-side"
              title="Место в сэмпле: низ — начало, верх — конец. Полоски — громкость сэмпла в этом месте"
            >
              <svg className="scratch-map" viewBox="0 0 10 100" preserveAspectRatio="none">
                {(scratchPeaks ?? []).map((pk, i) => {
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
              </svg>
            </div>
            <div className="scratch-main">
              <div
                className="scratch-track"
                ref={scratchRef}
                title="Жест иглы. Клик — добавить точку, тянуть точку — править, правый клик — удалить. Наклон = скорость иглы: круче — быстрее"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const el = scratchRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                  const pos = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
                  const pts = track.scratchPoints ?? [];
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
                    change({ scratchPoints: sorted });
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
                      change({ scratchPoints: smooth });
                    }
                    return;
                  }
                  const pending = pendingAdd.current;
                  pendingAdd.current = null;
                  if (pending) {
                    change({
                      scratchPoints: [...(track.scratchPoints ?? []), pending].sort(
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
                    points={(dragPts ?? track.scratchPoints ?? [])
                      .map((pt) => `${(pt.t * 100).toFixed(2)},${((1 - pt.pos) * 100).toFixed(2)}`)
                      .join(' ')}
                  />
                </svg>
                {(dragPts ?? track.scratchPoints ?? []).map((pt, i) => (
                  <span
                    key={i}
                    className="scratch-dot"
                    style={{ left: `${pt.t * 100}%`, top: `${(1 - pt.pos) * 100}%` }}
                    title={`место ${Math.round(pt.pos * 100)}% · момент ${Math.round(pt.t * 100)}% ноты · тянуть — править, правый клик — удалить`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      change({ scratchPoints: (track.scratchPoints ?? []).filter((_, j) => j !== i) });
                    }}
                  />
                ))}
                {(scratchArmed || scratchLive) && (
                  <span className="scratch-hint">идёт запись — веди мышью по пэду</span>
                )}
                {(track.scratchPoints ?? []).length === 0 && !dragPts && !scratchArmed && (
                  <span className="scratch-hint">кликни — появится точка; несколько точек — жест</span>
                )}
              </div>
              <span className="scratch-axis">время ноты →</span>
            </div>
          </div>
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
          {rows.map(({ ratio, i }) => (
            <div key={i} className="scale-cell" title={`отношение ${fmtRatio(ratio)} к тонике`}>
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
                        sel.has(`${col}:${i}`) ? 'sel' : '',
                        box &&
                        col >= Math.min(box.c0, box.c1) && col <= Math.max(box.c0, box.c1) &&
                        i >= Math.min(box.r0, box.r1) && i <= Math.max(box.r0, box.r1)
                          ? 'boxsel'
                          : '',
                        ghost && sel.has(`${col - ghost.dc}:${i - ghost.dr}`) ? 'ghost' : '',
                      ].join(' ')}
                      style={
                        on
                          ? { opacity: sel.has(`${col}:${i}`) ? '1' : String(0.55 + 0.45 * nt!.vel) }
                          : undefined
                      }
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
                      {on && nt!.prob < 1 && (
                        <span className="pbar" style={{ width: `${Math.round(nt!.prob * 100)}%` }} />
                      )}
                      {on && Math.abs((nt!.gate ?? 1) - 1) > 1e-6 && (
                        <span
                          className="gbar"
                          style={{ height: `${Math.min(100, Math.round(((nt!.gate ?? 1) / 4) * 100))}%` }}
                        />
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
              <label
                className="sp-field"
                title="Длина ноты: множитель от огибающей трека (атака + спад). 1 — как у трека; 0.2–0.5 — короткие тычки; 2–4 — подтяжки поверх соседних шагов. Alt+колесо над нотой тоже крутит"
              >
                длина ×
                <NumField
                  value={nt.gate ?? 1} min={0.1} max={4} step={0.1}
                  onChange={(v) => setNoteField(selectedCol, nt.n, 'gate', Math.max(0.1, Math.round(v * 10) / 10))}
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

      {showInstruments && (
        <InstrumentBrowser
          title="сменить инструмент трека"
          onPick={(preset) => {
            applyInstrumentPreset(preset);
            setShowInstruments(false);
          }}
          onClose={() => setShowInstruments(false)}
        />
      )}

      {showScales && (
        <ScalePicker
          current={track.scale}
          onPick={applyScale}
          onClose={() => setShowScales(false)}
        />
      )}

      {showPicker && (
        <SamplePicker
          currentId={track.sampleId}
          onPick={(meta) => {
            change({ sampleId: meta.id, sampleName: meta.name });
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
});
