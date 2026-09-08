import { CARDS, type HelpCard } from './cards';
import { EXPLANATIONS } from './explanations';
import { PARAMETERS, type ParameterId } from '../parameters';
import { parameterHelp } from './parameterHelp';
import { GUIDES } from './guides';

export interface HelpLocation { panel: 'track' | 'snd' | 'env' | 'timbre' | 'chain' | 'mix' | 'lib'; selector: string; fallback: string; path: string }
export interface HelpEntry { id: string; card: HelpCard; location?: HelpLocation; aliases: string; words: string[]; heading: string[]; guideId?: string }
const location = (panel: HelpLocation['panel'], key: string, fallback: string, path: string): HelpLocation => ({panel, selector:`[data-help="${key}"], [data-ob="${key}"]`, fallback, path});
const LOCATIONS: Record<string, HelpLocation> = {
  portamento: location('track','portamento','[data-help="mono"]','Дорожка → трек → «новая нота глушит предыдущую» → «скольжение, мс». Поле появляется при включённом глушении.'),
  mono: location('track','mono','[data-ob="track-voicing"]','Дорожка → трек → «новая нота глушит предыдущую».'),
  'choke-group': location('track','choke-group','[data-ob="track-voicing"]','Дорожка → трек → группа глушения.'),
  'va-pwm': location('snd','va-pwm','[data-ob="synthesis-mode"]','Инструмент → источник → VA → импульс → PWM. Способ синтеза и форму выбери сам: они меняют звук.'),
  'va-drift': location('snd','va-drift','[data-ob="synthesis-mode"]','Инструмент → источник → VA → дрейф, центы.'),
  'wave-import': location('snd','wave-import','[data-ob="synthesis-mode"]','Инструмент → источник → wavetable → «Импорт WAV». Способ синтеза выбери сам.'),
  'equalizer': location('track','equalizer','[data-ob="sound-panel"]','Дорожка → трек → эффекты → добавь EQ.'),
  'voice-processing': location('snd','voice-processing','[data-ob="instrument-layers"]','Инструмент → слои → обработка и диапазон выбранного голоса.'),
  wavetable: location('snd','wavetable','[data-ob="synthesis-mode"]','Инструмент → источник → синтез «wavetable · кадры». Выбор способа синтеза меняет звук — выбери его сам.'),
  mseg: location('env','mseg','[data-ob="env-tab"]','Инструмент → огибающая → громкость → «по точкам».'),
  'instrument-layers': location('snd','instrument-layers','[data-ob="synthesis-mode"]','Инструмент → слои. Раскрой группу, чтобы редактировать состав.'),
  'formant-group': location('snd','formant-group','[data-ob="synthesis-mode"]','Инструмент → источник → форманты (для операторного синтеза).'),
  'chain-panel': location('chain','chain-panel','[data-ob="chain-panel"]','Кнопка «цепочка» рядом со сценами.'),
};
const aliases: Record<string,string> = {
  portamento:'portamento glide глайд скольжение скользящий скользить слайд плавный переход высоты',
  mono:'моно монофония monophonic', 'formant-group':'форманты formant гласные',
  wavetable:'wave table волновая таблица вейвтейбл кадры', mseg:'огибающая envelope sustain loop атака плато спад',
  'wave-position-lfo':'LFO лфо покачивание модуляция позиции',
  'choke-group':'choke чок заглушить прерывание',
};
export const normalizeHelpQuery = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
const words = (s: string) => [...new Set(normalizeHelpQuery(s).split(/ +/).filter(Boolean))];
function locate(id: string): HelpLocation | undefined {
  if (LOCATIONS[id]) return LOCATIONS[id];
  if (id.startsWith('wave-')) return {...LOCATIONS.wavetable, selector:`[data-help="${id}"]`};
  if (id.startsWith('mseg-') || id==='envelope-mode') return {...LOCATIONS.mseg, selector:`[data-help="${id}"]`, path:'Инструмент → огибающая → выбери громкость, высоту или локальный фильтр. Нужную огибающую включи сам.'};
  if (id.startsWith('chain-') || id==='scene-tempo') return {...LOCATIONS['chain-panel'],selector:`[data-help="${id}"]`};
  if (id.startsWith('instrument.')) {
    const panel=/attack|decay|sustain|pitchDrop|pitchTime/.test(id)?'env':/filter|ring|fold|comb/.test(id)?'timbre':'snd';
    return location(panel,id,panel==='snd'?'[data-ob="synthesis-mode"]':`[data-ob="${panel==='env'?'env-tab':'timbre-tab'}"]`,`Инструмент → ${panel==='env'?'огибающая':panel==='timbre'?'тембр':'источник'}. Некоторые настройки доступны только для соответствующего источника.`);
  }
  if (id.startsWith('effect.')) return location('track',id,'[data-ob="sound-panel"]','Дорожка → трек → эффекты. Параметр появляется после добавления соответствующего эффекта.');
  if (id==='track.volume'||id==='track.pan') return location('track',id,'[data-ob="sound-panel"]','Дорожка → трек → громкость и панорама.');
  return undefined;
}
const cards: Record<string,HelpCard> = {...Object.fromEntries((Object.keys(PARAMETERS) as ParameterId[]).map(id=>[id,parameterHelp(id)])),...CARDS,...EXPLANATIONS};
delete cards['track.portamentoSec'];
export const HELP_INDEX: HelpEntry[] = Object.entries(cards).map(([id,card])=>({id,card,location:locate(id),aliases:aliases[id]??'',heading:words(card.title+' '+(aliases[id]??'')),words:words([card.title,card.text,card.how,card.example,aliases[id]].join(' '))}));
for(const guide of GUIDES) HELP_INDEX.push({id:'guide:'+guide.id,guideId:guide.id,card:{title:'Гид: '+guide.title,text:guide.goal,how:guide.steps.map(s=>s.say).join(' ')},aliases:'',heading:words(guide.title),words:words([guide.title,guide.goal,...guide.steps.map(s=>s.say+' '+(s.hint??''))].join(' '))});
// Adjacent transposition counts as one typo. Only headings/aliases use fuzzy matching.
function distance(a:string,b:string):number {
  const d=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}
export function searchHelp(query:string):HelpEntry[] {
  const tokens=words(query.slice(0,160)).filter(w=>!['как','что','такое','где','это','в','и','на','для','мне','сделать','найти','хочу','нужно','покажи','объясни','про'].includes(w)).slice(0,8);
  if(!tokens.length)return ['portamento','wavetable','mseg','instrument-layers','chain-panel','wave-position-lfo'].map(id=>HELP_INDEX.find(e=>e.id===id)!).filter(Boolean);
  return HELP_INDEX.map(entry=>{
    let score=0;
    for(const token of tokens){
      if(entry.heading.includes(token)){score+=100;continue;}
      if(entry.heading.some(w=>w.startsWith(token))){score+=70;continue;}
      if(entry.words.some(w=>w===token||token.length>=3&&w.startsWith(token))){score+=25;continue;}
      const max=token.length>=8?3:token.length>=5?2:token.length>=3?1:0;
      const near=max?Math.min(...entry.heading.filter(w=>Math.abs(w.length-token.length)<=max).map(w=>distance(token,w))):Infinity;
      if(near>max){score=-1;break;}score+=35-near*7;
    }
    return {entry,score};
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.entry.card.title.localeCompare(b.entry.card.title,'ru')).map(r=>r.entry).slice(0,60);
}
