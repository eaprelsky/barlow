// Визуализации ноты: амплитуда (атака-плато-спад) и падение тона.
// Математика та же, что в triggerVoice: длина ноты — сетка (noteSteps ×
// шаг эскиза) или огибающая; падение — экспонента в лог-домене.
// Разметка (шаги сетки, длительность, множитель тона) — прямо на графике,
// отдельного текста читать не надо. График тона интерактивный: тяни —
// меняются падение и его время.

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface EnvProps {
  attack: number;
  decay: number;
  sustain: number; // доля плато (0..1) звуковой части после атаки
  // Полная длина ноты, с — как её посчитает triggerVoice (без гейта).
  voiceLen: number;
  // Длительность шага эскиза, с — вертикали сетки; null — без сетки.
  stepSec: number | null;
  // Длина ноты в шагах (нота по сетке); null — «авто» по огибающей.
  steps: number | null;
}

interface PitchProps {
  pitchDrop: number;
  pitchTime: number;
  // Длина ноты, с — падение не бывает длиннее.
  total: number;
  onChange?: (upd: { pitchDrop: number; pitchTime: number }) => void;
}

const W = 280;
const H = 84;

/** «1 шаг», «2 шага», «5 шагов», дробное — «1.5 шага». */
function stepsLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Number.isInteger(rounded)) {
    const mod100 = Math.abs(rounded) % 100;
    const mod10 = mod100 % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${rounded} шагов`;
    if (mod10 === 1) return `${rounded} шаг`;
    if (mod10 >= 2 && mod10 <= 4) return `${rounded} шага`;
    return `${rounded} шагов`;
  }
  return `${rounded} шага`;
}

export function EnvGraph({ attack, decay, sustain, voiceLen, stepSec, steps }: EnvProps) {
  const attackClamped = Math.max(attack, 0.0005);
  const total = Math.max(voiceLen, attackClamped + 0.02) * 1.04;
  const x = (t: number) => (t / total) * W;
  const sus = Math.min(1, Math.max(0, sustain));
  // Та же форма, что в triggerVoice: атака → плато (sus доли звуковой
  // части) → экспоненциальный спад к концу ноты.
  const holdEnd = attackClamped + (voiceLen - attackClamped) * sus;
  const amp = (t: number): number => {
    if (t <= attackClamped) return t / attackClamped;
    if (t <= holdEnd) return 1;
    const tail = Math.max(0.01, voiceLen - holdEnd);
    return Math.exp(-4 * ((t - holdEnd) / tail));
  };
  const pts: string[] = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * total;
    pts.push(`${x(t).toFixed(1)},${(H - 6 - amp(t) * (H - 22)).toFixed(1)}`);
  }

  // Сетка шагов эскиза: каждая; если плотно (>20 линий) — через 4.
  const lines: number[] = [];
  if (stepSec && stepSec > 0) {
    let step = stepSec;
    if (voiceLen / step > 20) step *= 4;
    for (let t = step; t < total - 0.001; t += step) lines.push(t);
  }

  // Подпись ноты — на графике, в свободном углу (спад уходит вниз-вправо).
  const cap =
    steps !== null
      ? `${stepsLabel(steps)} ≈ ${voiceLen.toFixed(2)} с`
      : `≈ ${voiceLen.toFixed(2)} с`;

  return (
    <svg className="env-graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
      <title>{`нота ${cap}, атака ${(attackClamped * 1000).toFixed(0)} мс, плато ${Math.round(sus * 100)}%, спад ${decay.toFixed(2)} с`}</title>
      {lines.map((t, i) => (
        <line key={i} x1={x(t)} y1={4} x2={x(t)} y2={H - 6} className="env-grid" />
      ))}
      <line x1={0} y1={H - 6} x2={W} y2={H - 6} className="env-axis" />
      {/* конец ноты: огибающая доигрывает здесь */}
      <line x1={x(voiceLen)} y1={4} x2={x(voiceLen)} y2={H - 6} className="env-note-end" />
      <polyline points={pts.join(' ')} className="env-amp" />
      <text x={5} y={14} className="env-text">{cap}</text>
    </svg>
  );
}

const DROPS = [2, 4, 8, 16];

export function PitchGraph({ pitchDrop, pitchTime, total, onChange }: PitchProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const apply = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el || !onChange) return;
    const r = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    // Низ графика = ×1 (выключено), верх = ×16, лог-шкала по октавам.
    const drop = Math.max(1, Math.round(Math.pow(2, (1 - fy) * 4) * 10) / 10);
    const time = Math.min(Math.max(fx * total, 0.01), Math.max(total, 0.01));
    onChange({ pitchDrop: drop, pitchTime: +time.toFixed(3) });
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onChange) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(e.clientX, e.clientY);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging.current) apply(e.clientX, e.clientY);
  };
  const up = () => {
    dragging.current = false;
  };

  const hasPitch = pitchDrop > 1 && pitchTime > 0;
  const span = Math.max(Math.min(pitchTime, total), 0.001);
  const x = (t: number) => (t / total) * W;
  // Экспоненциальная рампа частоты — линейна в лог-домене.
  const y = (r: number) => {
    const k = Math.log(Math.max(r, 1)) / Math.log(Math.max(pitchDrop, 1.0001));
    return H - 10 - k * (H - 24);
  };
  const yOct = (o: number) => {
    const k = Math.log(o) / Math.log(Math.max(pitchDrop, 1.0001));
    return H - 10 - k * (H - 24);
  };
  const pts: string[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * span;
    const r = pitchDrop * Math.pow(1 / pitchDrop, t / pitchTime);
    pts.push(`${x(t).toFixed(1)},${y(r).toFixed(1)}`);
  }
  const endX = x(span);
  const totalX = x(total);

  return (
    <svg
      className={'env-graph pitch-graph' + (onChange ? ' editable' : '')}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <title>
        {hasPitch
          ? `тон ×${pitchDrop} → ×1 за ${(pitchTime * 1000).toFixed(0)} мс. Тяни график: вверх-вниз — глубина падения, влево-вправо — время`
          : 'Падение тона выключено. Потяни график вверх — нота стартует выше и слетает вниз (бочка: «вумп»)'}
      </title>
      {/* октавные уровни — с чем сравнивать падение */}
      {DROPS.filter((o) => pitchDrop >= o && hasPitch).map((o) => (
        <line key={o} x1={0} y1={yOct(o)} x2={W} y2={yOct(o)} className="env-grid" />
      ))}
      <line x1={0} y1={y(1)} x2={W} y2={y(1)} className="env-axis" />
      <text x={4} y={Math.max(y(1) - 4, 12)} className="env-text">×1</text>
      {hasPitch && <polyline points={pts.join(' ')} className="env-pitch" />}
      {hasPitch && endX < totalX && (
        <line x1={endX} y1={y(1)} x2={totalX} y2={y(1)} className="env-pitch" />
      )}
      {hasPitch && (
        <>
          <text x={4} y={Math.min(yOct(DROPS[0]) + 12, H - 4)} className="env-text">×2</text>
          <text
            x={Math.min(endX + 4, W - 58)}
            y={Math.max(y(pitchDrop) - 5, 12)}
            className="env-text strong"
          >
            {`×${pitchDrop} · ${(pitchTime * 1000).toFixed(0)} мс`}
          </text>
        </>
      )}
      {!hasPitch && (
        <text x={W / 2} y={H / 2} textAnchor="middle" className="env-text dim">
          тяни вверх — включишь падение
        </text>
      )}
    </svg>
  );
}
