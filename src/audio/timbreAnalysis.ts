import type { Instrument } from '../types';
/** Bounded harmonic model for a predominantly monophonic fragment. */
export function analyzeTimbre(samples: Float32Array, sampleRate: number, rootHz: number): Partial<Instrument> {
  if (!Number.isFinite(rootHz) || rootHz < 30 || rootHz > 2000 || samples.length < sampleRate * .03 || samples.length > sampleRate * 30) throw Error('Нужен фрагмент 0,03–30 с и основная частота 30–2000 Гц.');
  const frames: number[][] = [], levels: number[] = [];
  const windowSize = Math.min(samples.length, Math.round(sampleRate / rootHz * 16));
  for (let frame = 0; frame < 8; frame++) {
    const offset = Math.round((samples.length - windowSize) * frame / 7), amps = new Float64Array(64);
    let energy = 0;
    for (let n = 0; n < windowSize; n++) energy += samples[offset + n] ** 2;
    levels.push(Math.sqrt(energy / windowSize));
    for (let k = 1; k < 64 && k * rootHz < sampleRate / 2; k++) {
      let re = 0, im = 0, weight = 0;
      for (let n = 0; n < windowSize; n++) { const w = .5 - .5 * Math.cos(2 * Math.PI * n / (windowSize - 1)), a = 2 * Math.PI * k * rootHz * n / sampleRate; re += samples[offset+n]*w*Math.cos(a); im += samples[offset+n]*w*Math.sin(a); weight += w; }
      amps[k] = 2 * Math.hypot(re,im) / weight;
    }
    const sum = amps.reduce((a,b) => a+b,0);
    frames.push(Array.from({length:128},(_,n) => { let x=0; for(let k=1;k<64;k++)x+=amps[k]*Math.sin(2*Math.PI*k*n/128); return sum > 1e-8 ? x/sum : 0; }));
  }
  const peak = Math.max(...levels); if(peak<1e-6)throw Error('Фрагмент слишком тихий.');
  return {waveform:'wave',wave:{partials:[],wavetable:{frames,position:0,sweep:1}},recommendedHz:rootHz,attack:.003,decay:.2,sustain:0,
    ampMseg:{seconds:Math.min(16,samples.length/sampleRate),points:[{t:0,v:0},...levels.map((v,i)=>({t:.02+i*.96/7,v:v/peak})),{t:1,v:0}]}};
}

export function estimateRoot(samples: Float32Array, sampleRate: number): { hz: number; confidence: number } {
  const stride = Math.max(1,Math.floor(sampleRate/12000)), rate=sampleRate/stride;
  const n=Math.min(4096,Math.floor(samples.length/stride)), offset=Math.floor(Math.max(0,samples.length-n*stride)/2);
  const x=Float64Array.from({length:n},(_,i)=>samples[offset+i*stride]);
  const mean=x.reduce((a,b)=>a+b,0)/n;for(let i=0;i<n;i++)x[i]-=mean;
  const scores: number[]=[];let best=0,bestLag=0;
  const lo=Math.max(2,Math.floor(rate/2000)),hi=Math.min(Math.floor(rate/30),Math.floor(n/2));
  for(let lag=lo;lag<=hi;lag++){let a=0,b=0,c=0;for(let i=0;i<n-lag;i++){a+=x[i]*x[i+lag];b+=x[i]**2;c+=x[i+lag]**2;}scores[lag]=a/Math.sqrt(b*c+1e-20);best=Math.max(best,scores[lag]);}
  for(let lag=lo+1;lag<hi;lag++)if(scores[lag]>=Math.max(.6,best*.94)&&scores[lag]>scores[lag-1]&&scores[lag]>=scores[lag+1]){bestLag=lag;break;}
  return {hz:bestLag?Math.round(rate/bestLag*10)/10:110,confidence:bestLag?scores[bestLag]:0};
}
