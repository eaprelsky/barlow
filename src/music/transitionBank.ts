import type { InstrumentPreset } from './instrumentPresets';
import type { Mseg } from './mseg';
import { tableFrame } from './wavetable';

type Recipe = {id:string;name:string;seconds:number;hz:number;pitch:number;filter:number;brightness:number;sound:InstrumentPreset['track'];tags:string[]};
const recipes:Recipe[] = [
  {id:'air',name:'воздушный шум',seconds:4,hz:220,pitch:0,filter:650,brightness:4,
    sound:{wave:{partials:[{type:'noise',ratio:1,amp:.65}]},filterLow:120},tags:['noise','шум','воздух']},
  {id:'hiss',name:'короткий свист',seconds:2,hz:330,pitch:2,filter:1800,brightness:2,
    sound:{wave:{partials:[{type:'sine',ratio:1,amp:.65},{type:'noise',ratio:1,amp:.08}]}},tags:['свист','тональный','короткий']},
  {id:'metal',name:'металлический шлейф',seconds:4,hz:110,pitch:2.5,filter:500,brightness:4,
    sound:{wave:{partials:[{type:'sine',ratio:1,amp:.36},{type:'sine',ratio:1.414,amp:.24},{type:'sine',ratio:2.76,amp:.18},{type:'sine',ratio:4.13,amp:.12}]}},tags:['metal','металл','негармонический']},
  {id:'reactor',name:'разгон реактора',seconds:8,hz:55,pitch:2,filter:180,brightness:4,
    sound:{wave:{partials:[],va:{shape:'saw',pulseWidth:.5,driftCents:1.5}},unisonVoices:3,unisonDetune:12,unisonSpread:.35,foldDrive:.6,synthQuality:'2x'},tags:['neurofunk','нейрофанк','тяжёлый','длинный']},
  {id:'orbit',name:'космическая спираль',seconds:8,hz:110,pitch:3,filter:700,brightness:3,
    sound:{wave:{partials:[],wavetable:{frames:[tableFrame('sine'),tableFrame('triangle'),tableFrame('pulse',.18)],position:0,sweep:1}},unisonVoices:2,unisonDetune:7,unisonSpread:.65,
      effects:[{type:'delay',timeSec:.1875,feedback:.23,mix:.12}]},tags:['космос','wavetable','длинный']},
  {id:'pulse',name:'пульсирующий импульс',seconds:4,hz:110,pitch:1.5,filter:350,brightness:4,
    sound:{wave:{partials:[],va:{shape:'pulse',pulseWidth:.4,pwmDepth:.22,pwmRateHz:5}},filterQ:1.2},tags:['PWM','пульс','электроника']},
];
function amplitude(seconds:number,reverse:boolean):Mseg {
  return {seconds,points:reverse
    ? [{t:0,v:0},{t:.015,v:1},{t:.3,v:.35},{t:.75,v:.06},{t:1,v:0}]
    : [{t:0,v:0},{t:.25,v:.06},{t:.7,v:.35},{t:.985,v:1},{t:1,v:0}]};
}
/** Stable IDs; reverse partners reverse the musical trajectory, not a PCM file. */
export const TRANSITION_BANK:InstrumentPreset[] = recipes.flatMap(r=>[false,true].map(reverse=>{
  const motion:Mseg={seconds:r.seconds,points:[{t:0,v:reverse?1:0},{t:1,v:reverse?0:1}]};
  const sound=structuredClone(r.sound);
  if(reverse&&sound.wave?.wavetable){sound.wave.wavetable.position=1;sound.wave.wavetable.sweep=-1;}
  return {id:`transitions-01-${r.id}-${reverse?'down':'up'}`,packId:'transitions-01',
    name:`${reverse?'обратный райзер':'райзер'}: ${r.name} · ${r.seconds} с`,category:'прочее',
    tags:['переходы',reverse?'downlifter':'riser',reverse?'спад':'подъём',...r.tags],
    hint:`${reverse?'Яркое начало, затем спад громкости и движения':'Плавное нарастание громкости и яркости к концу'}. Предпрослушивание ${r.seconds} с. В партии задай длинную ноту: при 120 BPM и шаге 1/16 ${r.seconds*8} шагов дают ${r.seconds} с. Длина ноты растягивает огибающие. Обратная версия — нисходящий синтез, не разворот записи.`,
    track:{waveform:'wave',freq:r.hz,recommendedHz:r.hz,attack:.005,decay:.1,sustain:0,pitchDrop:1,pitchTime:.05,
      filterLow:30,filterFreq:14000,filterQ:.7,volume:.65,...sound,ampMseg:amplitude(r.seconds,reverse),
      pitchMseg:r.pitch?{envelope:structuredClone(motion),depthOctaves:r.pitch}:undefined,
      filterMseg:{envelope:structuredClone(motion),baseHz:r.filter,depthOctaves:r.brightness}}};
}));
