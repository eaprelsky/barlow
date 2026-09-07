import type { InstrumentPreset } from './instrumentPresets';
import type { Instrument, WavePartial } from '../types';
import { recipe } from './waveRecipes';
import { DEFAULT_MACROS } from './macros';

// Authored recipes, immutable IDs. Names are not storage keys. These sounds use
// the existing operator engine; no recorded assets or paid plugins are needed.
const sine = (ratio = 1, amp = 1, decay?: number): WavePartial => ({ type: 'sine', ratio, amp, ...(decay ? { decay } : {}) });
const noise = (amp: number, decay: number): WavePartial => ({ type: 'noise', ratio: 1, amp, decay });
const fm = (ratio: number, depth: number, decay?: number): WavePartial[] => [sine(), { ...sine(ratio, depth, decay), mod: 0 }];
const bank: InstrumentPreset[] = [];
function add(id: string, name: string, category: string, tags: string[], brief: string, freq: number, sound: Partial<Instrument>) {
  bank.push({ id: `idm-01-${id}`, name, category, tags: ['IDM', ...tags], hint: brief,
    track: { waveform: 'wave', freq, attack: 0.002, decay: 0.3, sustain: 0, filterFreq: 8000,
      macros: structuredClone(DEFAULT_MACROS.filter((m) => m.id !== 'space' || (sound.unisonVoices ?? 1) > 1)),
      ...sound } });
}

// Kicks: body, attack transient and pitch contour vary independently.
const kicks: [string, string, number, number, number, number, number][] = [
  ['soft-sub','мягкое ядро',45,0.7,2.2,0.08,0], ['dry-punch','сухой толчок',58,0.18,4.5,0.035,0.04],
  ['click','игла и саб',48,0.42,7,0.014,0.25], ['rubber','резиновая бочка',65,0.3,3,0.14,0.02],
  ['long','длинная бочка',42,1.3,2,0.1,0.01], ['micro','микробочка',82,0.075,6,0.018,0.12],
  ['fm','металлическая бочка',52,0.4,3.2,0.06,0.08], ['wood','деревянный удар',110,0.11,1.8,0.025,0.2],
];
kicks.forEach(([id,name,freq,decay,pitchDrop,pitchTime,click]) => add(id,name,'перкуссия',['kick','бочка','низ'],
  `Бочка: синус ${freq} Гц, спад ${decay} с, падение ×${pitchDrop}; короткая шумовая атака.`,freq,
  { decay, pitchDrop, pitchTime, filterFreq: 6500, wave: { partials: [sine(), ...(click ? [noise(click,0.012)] : []), ...(id === 'fm' ? [{ ...sine(1.41,1.8,0.035), mod: 0 }] : [])] } }));

const snares: [string,string,number,number,number,number][] = [
  ['paper','бумажный снейр',185,0.08,0.8,3200], ['wire','пружинный снейр',170,0.24,0.9,9000],
  ['rim','обод',390,0.045,0.08,7000], ['box','коробка',240,0.13,0.3,2600],
  ['brush','щётка',220,0.32,1,5500], ['crack','щелчок снейра',260,0.065,0.65,11000],
  ['electro','электроснейр',155,0.18,0.55,7800], ['ghost','призрачный снейр',200,0.055,0.25,3800],
];
snares.forEach(([id,name,freq,decay,air,filterFreq]) => add(id,name,'перкуссия',['snare','снейр','rim','удар'],
  `Корпус ${freq} Гц и негармоничная мода ×1.47; шум ${Math.round(air*100)}%, спад ${decay} с.`,freq,
  { decay, filterFreq, filterLow: id==='brush'?700:100, pitchDrop: id==='electro'?2:1,
    wave: { partials: [sine(1,0.6,decay*0.55),sine(1.47,0.3,decay*0.35),noise(air,decay)] } }));

const hats: [string,string,number,number,number,number][] = [
  ['closed','песочный хэт',0.025,6000,12000,1], ['open','открытый песок',0.42,5000,11500,1],
  ['shaker','зернистый шейкер',0.11,2800,8000,0.8], ['tick','цифровой тик',0.012,3500,11000,0.2],
  ['metal-hat','металлический хэт',0.07,4000,12000,0.15], ['ride','сухой райд',0.9,2000,10500,0.08],
  ['dark-hat','тёмный хэт',0.05,1800,4700,0.75], ['air','воздушный выдох',0.3,3800,10000,1],
];
hats.forEach(([id,name,decay,filterLow,filterFreq,air]) => add(id,name,'перкуссия',['hat','хэт','shaker','верх'],
  `Шум и металлические частоты; полоса ${Math.min(filterLow,4000)}–${filterFreq} Гц, спад ${decay} с.`,730,
  { attack:id==='air'?0.035:0.001, decay, filterLow:Math.min(filterLow,4000), filterFreq,
    wave:{ partials:[noise(air,decay),sine(1,0.2,decay),sine(1.342,0.2,decay*0.7),sine(1.819,0.15,decay*0.5),sine(2.713,0.1,decay*0.4)] } }));

const objects: [string,string,number,number,number][] = [
  ['tin','жестяная банка',310,2.71,0.3], ['glass','стеклянная бусина',980,3.76,0.45],
  ['clay','глиняный горшок',240,2.32,0.18], ['bolt','падающий болт',1400,1.41,0.08],
  ['drop','водяная капля',620,2,0.13], ['log','полый брусок',185,3.91,0.11],
  ['spring','ломаная пружина',170,1.618,0.55], ['zap','лазерный укол',290,3.5,0.16],
];
objects.forEach(([id,name,freq,ratio,decay])=>add(id,name,'перкуссия',['object','объект','glitch','найденный звук'],
  `Синтетический объект: моды 1, ${ratio}, ${Number((ratio*1.53).toFixed(3))}; высокие моды затухают быстрее.`,freq,
  { decay, pitchDrop:id==='zap'?6:id==='drop'?2.7:1, pitchTime:0.055,
    wave:{partials:[sine(1,1,decay),sine(ratio,0.5,decay*0.55),sine(ratio*1.53,0.22,decay*0.25)]} }));

const basses: [string,string,number,number,number,number][] = [
  ['pure-sub','саб без атаки',1,0,0.55,450], ['sine-pluck','щипковый саб',2,0.3,0.15,1300],
  ['hollow-fm','полый FM-бас',2,2.5,0.35,2500], ['growl','гортанный бас',1.5,5,0.7,1800],
  ['acid','кислотный укус',1,0,0.22,1400], ['reese','узкий Reese',1,0,0.9,2200],
  ['metal-bass','металлический бас',3.17,3.7,0.26,4200], ['woody-bass','деревянный бас',4,1.6,0.2,3000],
];
basses.forEach(([id,name,ratio,depth,decay,filterFreq])=>add(id,name,'бас',['bass','бас',id.includes('fm')||depth>0?'FM':'sub'],
  `Бас от 55 Гц; ${depth?`FM ×${ratio}, индекс ${depth}`:id==='acid'||id==='reese'?'пила':'синус'}; фильтр ${filterFreq} Гц.`,55,
  { decay,sustain:id==='pure-sub'||id==='reese'?0.8:0.15,filterFreq,filterQ:id==='acid'?6:0.8,
    filterEnvAmount:id==='acid'?18:0,filterEnvTime:0.16,
    unisonVoices:id==='reese'?3:1,unisonDetune:9,unisonSpread:0.25,
    wave:depth?{partials:fm(ratio,depth,decay*0.5)}:id==='acid'||id==='reese'?recipe('saw').wave:{partials:[sine()]} }));

const leads: [string,string,number,number,number][] = [
  ['rubber-lead','резиновый лид',1,2.2,0.4], ['glass-lead','стеклянный лид',2.76,1.7,0.7],
  ['radio','радиосигнал',7,0.5,0.2], ['game','квадратный писк',0,0,0.18],
  ['reed','электронный язычок',3,0.7,0.8], ['chirp','киберптица',1.41,4,0.12],
  ['dual','двойная пила',0,1,0.5], ['vowel','гласный импульс',1,4,0.35],
];
leads.forEach(([id,name,ratio,depth,decay])=>add(id,name,'тоны и лиды',['lead','лид',ratio?'FM':'VA'],
  `Сольный голос: ${ratio?`FM с отношением ${ratio}`:id==='game'?'нечётные гармоники':'расстроенные пилы'}; рассчитан на короткие фразы.`,220,
  { decay,sustain:0.45,filterFreq:7000,unisonVoices:id==='dual'?2:1,unisonDetune:7,unisonSpread:0.65,
    pitchDrop:id==='chirp'?3:1,pitchTime:0.08,
    formants:id==='vowel'?[{freq:550,gain:10},{freq:950,gain:7},{freq:2400,gain:5}]:undefined,
    wave:ratio?{partials:fm(ratio,depth,decay)}:recipe(id==='game'?'square':'saw').wave }));

const keys: [string,string,number,number,number][] = [
  ['tine','мягкий язычок EP',1,1.4,1.2], ['hard-tine','жёсткий язычок EP',1,4,0.8],
  ['marimba','цифровая маримба',3.9,0.5,0.32], ['vibes','цифровой вибрафон',4,1.5,1.8],
  ['kalimba','электрокалимба',5.4,0.7,0.6], ['celesta','хрупкая челеста',2.76,1.2,1.3],
  ['organ-key','камерный электроорган',0,0,0.25], ['muted-key','приглушённый клавишный',2,1.2,0.2],
];
keys.forEach(([id,name,ratio,depth,decay])=>add(id,name,'клавишные',['keys','клавиши',id.includes('tine')?'EP':'mallet'],
  `Синтетический клавишный: ${ratio?`FM ×${ratio}, короткий яркий транзиент`:'аддитивные регистры'}; спад ${decay} с.`,id==='celesta'?523.25:261.63,
  { decay,filterFreq:id==='muted-key'?2400:9000,sustain:id==='organ-key'?0.9:0,
    vibratoDepth:id==='vibes'?9:0,vibratoRate:5,
    wave:ratio?{partials:fm(ratio,depth,decay*0.25)}:recipe('organ').wave }));

const pads: [string,string,number,number,number][] = [
  ['warm','тёплая ткань',0,0.7,1700], ['ice','ледяная ткань',2.71,0.45,9500],
  ['hollow-pad','полый фон',2,0.9,3500], ['drone','низкий дрон',1.41,1,2200],
  ['choir-pad','далёкая гласная',1,0.6,5000], ['dust-pad','пыльный фон',0,1.2,4200],
  ['fifth-pad','открытая квинта',1.5,0.5,6200], ['dark-pad','тёмный свелл',3,1,1200],
];
pads.forEach(([id,name,ratio,attack,filterFreq])=>add(id,name,'фоны',['pad','фон','drone','texture'],
  `Длинная подложка, атака ${attack} с; ${id==='dust-pad'?'шумовая примесь':ratio?`негармоничная окраска ×${ratio}`:'мягкие гармоники'}.`,id==='drone'?55:110,
  { attack,decay:3.5,sustain:0.85,filterFreq,unisonVoices:3,unisonDetune:id==='ice'?17:8,unisonSpread:0.8,
    filterEnvAmount:id==='dark-pad'?-12:0,filterEnvTime:2,
    formants:id==='choir-pad'?[{freq:350,gain:8},{freq:800,gain:6},{freq:2300,gain:5}]:undefined,
    wave:{partials:[sine(),sine(2,0.3),sine(3,0.12),...(ratio?[sine(ratio,0.2)]:[]),...(id==='dust-pad'?[noise(0.15,3)]:[])]} }));

add('data-rain','дождь данных','прочее',['FX','glitch','цифровой'],'Короткий негармоничный FM-сигнал; для редких россыпей на верхних рядах.',880,{decay:0.055,wave:{partials:fm(7.13,4,0.025)}});
add('power-down','отключение питания','прочее',['FX','fall','падение'],'Падение тона на две октавы за 1.2 с; растянутый хвост FM.',90,{decay:1.5,pitchDrop:4,pitchTime:1.2,wave:{partials:fm(1.41,2,0.8)}});
add('alarm','сломанная тревога','прочее',['FX','alarm','сигнал'],'Прямоугольный сигнал с глубоким вибрато; короткие предупреждения.',440,{decay:0.6,sustain:0.7,vibratoRate:12,vibratoDepth:300,wave:recipe('square').wave});
add('air-swell','воздушный свелл','прочее',['FX','swell','шум'],'Шум медленно набирает уровень; фильтр открывается от затемнённого старта.',220,{attack:0.8,decay:2.5,sustain:0.7,filterLow:700,filterFreq:11000,filterEnvAmount:-24,filterEnvTime:2,wave:{partials:[noise(1,3)]}});

export const IDM_BANK: readonly InstrumentPreset[] = bank;
