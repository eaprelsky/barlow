export interface SceneEnvelope { start: number; end: number | null; fadeIn: number; fadeOut: number }
/** Scene gain is separate from fader/automation/modulation. Overlapping fades
 * shrink proportionally, so a short scene still has a continuous envelope. */
export function sceneEnvelopePoints(plan: SceneEnvelope): { at: number; value: number }[] {
  let entry = Math.max(.001, plan.fadeIn), exit = Math.max(.005, plan.fadeOut);
  if (plan.end !== null) {
    const scale = Math.min(1, (plan.end - plan.start) / (entry + exit));
    entry *= scale; exit *= scale;
  }
  const points = [{ at: plan.start, value: 0 }, { at: plan.start + entry, value: 1 }];
  if (plan.end !== null) points.push({ at: Math.max(plan.start + entry, plan.end - exit), value: 1 }, { at: plan.end, value: 0 });
  return points;
}
export function scheduleSceneEnvelope(param: AudioParam, plan: SceneEnvelope, now = 0): void {
  const points = sceneEnvelopePoints(plan), from = Math.max(now, plan.start);
  let value = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (from >= b.at) value = b.value;
    else if (from >= a.at) { value = a.value + (b.value - a.value) * (from - a.at) / Math.max(1e-9, b.at - a.at); break; }
  }
  param.cancelScheduledValues(from);
  param.setValueAtTime(value, from);
  for (const p of points) if (p.at > from) param.linearRampToValueAtTime(p.value, p.at);
}
