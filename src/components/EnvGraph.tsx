// Визуализации огибающей ноты: амплитуда (атака-спад) и падение тона
// (для бочки). Чистые функции от параметров — та же математика, что в
// triggerVoice. Сетка — доли (1/16) текущего темпа.

interface EnvProps {
  attack: number;
  decay: number;
  sustain: number; // доля плато (0..1) звуковой части после атаки
  gridSec: number | null; // длительность 1/16 при текущем темпе; null — без сетки
}

interface PitchProps {
  pitchDrop: number;
  pitchTime: number;
  total: number;
}

const W = 280;
const H = 84;

export function EnvGraph({ attack, decay, sustain, gridSec }: EnvProps) {
  const attackClamped = Math.max(attack, 0.0005);
  const total = attackClamped + decay + 0.05;
  const x = (t: number) => (t / total) * W;
  const sus = Math.min(1, Math.max(0, sustain));
  const holdEnd = attackClamped + decay * sus;

  const amp = (t: number): number => {
    if (t <= attackClamped) return t / attackClamped;
    if (t <= holdEnd) return 1;
    return Math.exp(-4 * ((t - holdEnd) / Math.max(0.01, decay * (1 - sus))));
  };
  const pts: string[] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total;
    pts.push(`${x(t).toFixed(1)},${(H - 6 - amp(t) * (H - 18)).toFixed(1)}`);
  }

  // Сетка долей: каждая 1/16; если плотно — каждая 1/4.
  const lines: number[] = [];
  if (gridSec && gridSec > 0) {
    let step = gridSec;
    if (total / step > 20) step = gridSec * 4;
    if (total / step <= 20) {
      for (let t = step; t < total; t += step) lines.push(t);
    }
  }

  return (
    <svg className="env-graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
      <title>{`атака ${(attackClamped * 1000).toFixed(0)} мс, плато ${Math.round(sus * 100)}%, спад ${decay.toFixed(2)} с`}</title>
      {lines.map((t, i) => (
        <line key={i} x1={x(t)} y1={4} x2={x(t)} y2={H - 6} className="env-grid" />
      ))}
      <line x1={0} y1={H - 6} x2={W} y2={H - 6} className="env-axis" />
      <polyline points={pts.join(' ')} className="env-amp" />
    </svg>
  );
}

export function PitchGraph({ pitchDrop, pitchTime, total }: PitchProps) {
  const hasPitch = pitchDrop > 1 && pitchTime > 0;
  const span = Math.max(Math.min(pitchTime, total), 0.001);
  const x = (t: number) => (t / total) * W;
  // Экспоненциальная рампа частоты — линейна в лог-домене.
  const y = (r: number) => {
    const lo = Math.log(1);
    const hi = Math.log(Math.max(pitchDrop, 1.0001));
    const k = (Math.log(Math.max(r, 1)) - lo) / (hi - lo);
    return H - 8 - k * (H - 20);
  };
  const pts: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * span;
    const r = pitchDrop * Math.pow(1 / pitchDrop, t / pitchTime);
    pts.push(`${x(t).toFixed(1)},${y(r).toFixed(1)}`);
  }
  // После падения — прямая на базовой частоте.
  const endX = x(span);
  const totalX = x(total);

  return (
    <svg className="env-graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
      <title>{hasPitch ? `тон ×${pitchDrop} → ×1 за ${(pitchTime * 1000).toFixed(0)} мс` : 'падение тона выключено (×1)'}</title>
      <line x1={0} y1={y(1)} x2={W} y2={y(1)} className="env-grid" />
      <text x={4} y={Math.max(y(1) - 4, 12)} className="env-text">×1</text>
      {hasPitch && <text x={4} y={Math.min(y(pitchDrop) + 12, H - 4)} className="env-text">×{pitchDrop}</text>}
      {hasPitch && <polyline points={pts.join(' ')} className="env-pitch" />}
      {hasPitch && endX < totalX && (
        <line x1={endX} y1={y(1)} x2={totalX} y2={y(1)} className="env-pitch" />
      )}
    </svg>
  );
}
