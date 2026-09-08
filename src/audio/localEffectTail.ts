import type { Effect } from '../types';
/** Local effects are not modulated. Serial tails add until -100 dB. */
export function localEffectTail(effects: Effect[]): number {
  if(!effects.length) return 0;
  return effects.reduce((sum,fx)=>{
    if(fx.mix<=0 || fx.type==='eq' && fx.bypass) return sum;
    if(fx.type==='reverb') return sum+fx.sizeSec;
    if(fx.type==='chorus') return sum+.031;
    if(fx.type==='delay') return sum+fx.timeSec*(fx.feedback<=0 ? 1 : Math.ceil(Math.log(1e-5)/Math.log(fx.feedback))+1);
    return sum;
  },.1);
}
