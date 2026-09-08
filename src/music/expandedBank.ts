import type { InstrumentPreset } from './instrumentPresets';
import type { Instrument } from '../types';
import { tableFrame } from './wavetable';
import { MSEG_SHAPES } from './mseg';

const bank: InstrumentPreset[] = [];
const wave = { partials: [{ type: 'sine' as const, ratio: 1, amp: 1 }] };
function add(id: string, name: string, category: string, hz: number, brief: string, sound: Partial<Instrument>, tags: string[]) {
  bank.push({ id: `idm-02-${id}`, packId: 'idm-02', name, category, tags: ['IDM', 'электроника', ...tags], hint: brief,
    track: { waveform: 'wave', wave, freq: hz, recommendedHz: hz, attack: .003, decay: .5, sustain: .3,
      filterLow: 20, filterFreq: 8000, pitchDrop: 1, pitchTime: .08, ...sound } });
}
const basses: [string, number, number, number, number][] = [
  ['текучий саб',45,.15,.6,.4], ['полая пружина',55,.8,-.6,.3], ['цифровой резиновый бас',62,.2,.8,.22],
  ['ползущий низ',38,0,1,1.2], ['хрустящий короткий бас',73,.65,.3,.12], ['двойной басовый укол',52,.1,.7,.6],
  ['басовая гласная',65,.3,.6,.7], ['стеклянный субтон',49,.9,-.8,.45], ['шершавый квадратный бас',58,.75,0,.3], ['медный низ',82,.25,.4,.5],
];
basses.forEach(([name,hz,position,sweep,seconds], i) => add(`table-bass-${i+1}`,name,'бас',hz,
  `Wavetable-бас: ${hz} Гц, проход ${sweep>0?'вперёд':'назад'} через синус, треугольник и узкий импульс за ${seconds} с. Для коротких синкопированных партий.`,
  { wave:{...wave,wavetable:{frames:[tableFrame('sine'),tableFrame('triangle'),tableFrame('pulse',.15+i*.025)],position,sweep}},
    ampMseg:{seconds,points:MSEG_SHAPES[i===5?'две атаки':'удар']},filterFreq:1200+i*230,filterQ:1+i*.25,
    ...(i===6?{formants:[{freq:420,gain:.7},{freq:1250,gain:.5}]}:{}) },['bass','wavetable','низ']));

const pads: [string,number,number,number][] = [
  ['ледяная завеса',220,0,1], ['дышащий треугольник',165,.3,.4], ['обратный цифровой хор',196,1,-1],
  ['медленно раскрывающийся шёлк',110,0,.6], ['рябь на стекле',330,.6,-.4], ['северное сияние',147,.1,.9],
  ['тонкая пульсирующая дымка',440,.7,-.6], ['тёмный цифровой орган',98,.4,.1], ['светлое облако',262,.2,.5], ['ломаный двухтактный вдох',185,.1,.8],
];
pads.forEach(([name,hz,position,sweep],i)=>add(`table-pad-${i+1}`,name,'фоны',hz,
  `Движущийся фон на ${hz} Гц: ${2+i%2} расстроенных голоса, ${i===9?'две волны громкости':'плавное раскрытие'}, ${2+i*.15} с без заданной длины ноты.`,
  {wave:{...wave,wavetable:{frames:[tableFrame('sine'),tableFrame('triangle'),tableFrame('saw')],position,sweep}},
    ampMseg:{seconds:2+i*.15,points:i===9?MSEG_SHAPES['две атаки']:[{t:0,v:0},{t:.3,v:.7},{t:.7,v:1},{t:1,v:0}]},
    unisonVoices:2+i%2,unisonDetune:5+i*1.5,unisonSpread:.6,filterFreq:1600+i*500},['pad','wavetable','фон']));

const analog: [string,number,'saw'|'pulse'|'triangle',number,number][] = [
  ['узкий кислотный импульс',110,'pulse',.12,8], ['широкий аналоговый бас',55,'saw',.5,2], ['мягкая треугольная клавиша',262,'triangle',.5,1],
  ['носовой лид',330,'pulse',.28,3], ['пилообразный щипок',196,'saw',.5,5], ['полый квадратный аккорд',220,'pulse',.5,1],
  ['сухой ретро-бас',65,'pulse',.38,4], ['медная аналоговая атака',147,'saw',.5,2], ['тонкая телефонная клавиша',440,'pulse',.07,6], ['расстроенный широкий лид',247,'saw',.5,1],
];
analog.forEach(([name,hz,shape,pulseWidth,q],i)=>add(`va-${i+1}`,name,i===1||i===6?'бас':'клавишные',hz,
  `VA ${shape}, ${hz} Гц, резонанс ${q}. ${shape==='pulse'?`Ширина импульса ${Math.round(pulseWidth*100)}%. `:''}Огибающая фильтра добавляет выразительную атаку.`,
  {wave:{...wave,va:{shape,pulseWidth}},filterFreq:600+i*420,filterQ:q,filterEnvAmount:8+i,filterEnvTime:.07+i*.025,
    attack:i===7?.05:.002,decay:.2+i*.07,sustain:i===2||i===5?.7:.1,unisonVoices:i===9?3:1,unisonDetune:14},['VA',shape,'аналог']));

const metals: [string,number,number,number][] = [
  ['несимметричный металлический тик',880,1.37,.07], ['низкий кольцевой гонг',110,2.71,1.5], ['фарфоровый щелчок',660,1.5,.15],
  ['двойной металлический удар',330,3.14,.6], ['короткий роботизированный том',147,1.17,.23], ['стеклянная россыпь',1047,2.4,.35],
  ['ломаная металлическая палочка',523,4.13,.12], ['тусклый колокол',196,.73,1.1], ['искрящийся импульс',1320,1.91,.09], ['радиочастотный бип',440,.25,.3],
];
metals.forEach(([name,hz,ratio,seconds],i)=>add(`ring-${i+1}`,name,'перкуссия',hz,
  `Ring-перкуссия: несущая ${hz} Гц × модулятор ${ratio}. ${i===3?'Двойная атака':'Короткий удар'}; негармонические боковые полосы без записи сэмпла.`,
  {ringMix:.65+(i%3)*.15,ringRatio:ratio,ampMseg:{seconds,points:MSEG_SHAPES[i===3?'две атаки':'удар']},filterFreq:11000},['ring','metal','перкуссия']));

const folded: [string,number,number,number][] = [
  ['складчатый моно-лид',220,2,.5], ['вельветовый бас',65,.7,.6], ['агрессивная цифровая труба',294,5,.7],
  ['хриплый импульс',392,3,.15], ['скрученный басовый укол',82,6,.2], ['перегнутый синус',185,1,.4],
  ['плавящийся лид',330,4,1], ['сухой электрический клик',740,7,.07], ['мягко насыщенная клавиша',262,.35,.8], ['двойной жужжащий акцент',130,3.5,.45],
];
folded.forEach(([name,hz,drive,seconds],i)=>add(`fold-${i+1}`,name,i===1||i===4?'бас':'тоны и лиды',hz,
  `Синус ${hz} Гц с wavefold ${drive}, огибающая ${seconds} с. ${drive>3?'Насыщенная':'Умеренная'} нелинейная окраска; качество 4×.`,
  {foldDrive:drive,synthQuality:'4x',ampMseg:{seconds,points:MSEG_SHAPES[i===9?'две атаки':'удар']},filterFreq:i===1?1800:8000},['wavefold','lead','синтез']));

const combs: [string,number,number,number][] = [
  ['деревянная гребёнка',196,440,.6], ['стеклянная щипковая струна',330,330,.78], ['пружинный низ',65,82,.7],
  ['резонансная пыль',440,1200,.5], ['бумажная коробочка',220,780,.4], ['металлическая калимба',392,523,.8],
  ['полая трубка',147,196,.65], ['частый зернистый треск',880,2400,.45], ['тёмная пружина',98,55,.82], ['тёплый резонансный щипок',262,294,.7],
];
combs.forEach(([name,hz,combHz,feedback],i)=>add(`comb-${i+1}`,name,i===2?'бас':'перкуссия',hz,
  `Короткое возбуждение + comb ${combHz} Гц, обратная связь ${feedback}. Для ${i===2||i===8?'низких пружинных акцентов':'щипковой резонансной перкуссии'}; конечный контролируемый хвост.`,
  {wave:{partials:[{type:i===3||i===7?'noise':'triangle',ratio:1,amp:1}]},attack:.001,decay:.03+i*.008,sustain:0,combMix:.7,combHz,combFeedback:feedback,filterFreq:7500},['comb','pluck','резонанс']));
export const EXPANDED_BANK = bank;
