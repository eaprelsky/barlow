import type { EqBand } from '../music/equalizer';
/** Six permanent stages: edits do not rebuild or truncate a playing track. */
export function updateEq(nodes: BiquadFilterNode[], bands: EqBand[], time: number, smooth = true) {
  nodes.forEach((node,i)=>{
    const band=bands[i], enabled=band?.enabled;
    node.type=enabled ? band.type : 'peaking';
    const values = {frequency:Math.min(band?.frequency??1000,node.context.sampleRate*.499),Q:enabled && (band.type==='highpass'||band.type==='lowpass') ? 20*Math.log10(band.q) : band?.q??1,gain:enabled ? band.gain : 0};
    for(const key of ['frequency','Q','gain'] as const) {
      if(smooth) node[key].setTargetAtTime(values[key],time,.015); else node[key].value=values[key];
    }
  });
}
export function makeEq(ctx: BaseAudioContext,bands: EqBand[]) {
  const nodes=Array.from({length:6},()=>ctx.createBiquadFilter());
  nodes.forEach((node,i)=>{if(i) nodes[i-1].connect(node);});
  updateEq(nodes,bands,0,false);return nodes;
}
