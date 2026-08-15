// Визуализация огибающей ноты: атака-спад и падение тона (для бочки).
// Чистая функция от параметров — та же математика, что в triggerVoice.

interface Props {
  attack: number;
  decay: number;
  pitchDrop: number;
  pitchTime: number;
}

const W = 280;
const H = 84;

export function EnvGraph({ attack, decay, pitchDrop, pitchTime }: Props) {
  const attackClamped = Math.max(attack, 0.0005);
  const total = attackClamped + decay + 0.05;
  const x = (t: number) => (t / total) * W;

  // Амплитуда: линейный подъём за атаку, экспоненциальный спад.
  const amp = (t: number): number => {
    if (t <= attackClamped) return t / attackClamped;
    return Math.exp(-4 * ((t - attackClamped) / decay));
  };
  const pts: string[] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total;
    pts.push(`${x(t).toFixed(1)},${(H - 6 - amp(t) * (H - 18)).toFixed(1)}`);
  }

  // Питч: старт с pitchDrop× и слетает к 1× за pitchTime (пунктир сверху).
  const hasPitch = pitchDrop > 1 && pitchTime > 0;
  const pitchY = (r: number) => 4 + (1 - Math.min(r, 4) / 4) * 10; // 1× — ниже, выше — выше
  const pitchEnd = Math.min(pitchTime, total);
  const pitchPath = hasPitch
    ? `M0,${pitchY(pitchDrop)} ` +
      Array.from({ length: 24 }, (_, i) => {
        const t = (i / 24) * pitchEnd;
        const r = pitchDrop * Math.pow(1 / pitchDrop, t / pitchTime);
        return `L${x(t).toFixed(1)},${pitchY(r).toFixed(1)}`;
      }).join(' ') +
      ` L${x(pitchEnd).toFixed(1)},${pitchY(1).toFixed(1)}`
    : '';

  return (
    <svg className="env-graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
      <title>{`атака ${(attackClamped * 1000).toFixed(0)} мс, спад ${decay.toFixed(2)} с${hasPitch ? `, тон ×${pitchDrop} за ${(pitchTime * 1000).toFixed(0)} мс` : ''}`}</title>
      <line x1={0} y1={H - 6} x2={W} y2={H - 6} className="env-axis" />
      {hasPitch && <path d={pitchPath} className="env-pitch" />}
      <polyline points={pts.join(' ')} className="env-amp" />
    </svg>
  );
}
