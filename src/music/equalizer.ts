export type EqShape = 'peaking' | 'lowshelf' | 'highshelf' | 'highpass' | 'lowpass';
export interface EqBand { type: EqShape; frequency: number; gain: number; q: number; enabled: boolean }
export const EQ_LABELS: Record<EqShape,string> = {peaking:'колокол', lowshelf:'низкая полка', highshelf:'высокая полка', highpass:'срез низких', lowpass:'срез высоких'};
export const newEqBand = (): EqBand => ({type:'peaking',frequency:1000,gain:0,q:1,enabled:true});
const finite = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min,Math.min(max,v)) : fallback;
export function normalizeEqBands(raw: unknown): EqBand[] {
  if (!Array.isArray(raw)) return [newEqBand()];
  return raw.slice(0,6).filter(v=>v && typeof v==='object').map(v=>({
    type: Object.hasOwn(EQ_LABELS,v.type) ? v.type : 'peaking', frequency:finite(v.frequency,20,20000,1000),
    gain:finite(v.gain,-18,18,0),q:finite(v.q,.1,18,1),enabled:v.enabled!==false,
  }));
}
export function validEqBands(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length<=6 && raw.every(v=>v && typeof v==='object' && Object.hasOwn(EQ_LABELS,v.type)
    && typeof v.enabled==='boolean' && ['frequency','gain','q'].every(k=>Number.isFinite(v[k]))
    && v.frequency>=20 && v.frequency<=20000 && v.gain>=-18 && v.gain<=18 && v.q>=.1 && v.q<=18);
}
