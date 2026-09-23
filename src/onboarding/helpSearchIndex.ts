import { bilingualSearchText } from '../i18n/searchText';
import { t as msg, getLocale } from '../i18n/runtime.ts';
import { CARDS, type HelpCard } from './cards';
import { EXPLANATIONS } from './explanations';
import { PARAMETERS, type ParameterId } from '../parameters';
import { parameterHelp } from './parameterHelp';
import { GUIDES } from './guides';

export interface HelpLocation { panel: 'track' | 'snd' | 'env' | 'timbre' | 'chain' | 'mix' | 'lib'; selector: string; fallback: string; path: string }
export interface HelpEntry { id: string; card: HelpCard; location?: HelpLocation; aliases: string; words: string[]; heading: string[]; guideId?: string }
const location = (panel: HelpLocation['panel'], key: string, fallback: string, path: string): HelpLocation => ({panel, selector:`[data-help="${key}"], [data-ob="${key}"]`, fallback, path});
const makeLocations = (): Record<string, HelpLocation> => ({
  portamento: location('track','portamento','[data-help="mono"]',msg("helpSearchIndex.trackTrackTabNewNoteCutsOff")),
  mono: location('track','mono','[data-ob="track-voicing"]',msg("helpSearchIndex.trackTrackTabNewNoteCutsOff1")),
  'choke-group': location('track','choke-group','[data-ob="track-voicing"]',msg("helpSearchIndex.trackTrackTabChokeGroup")),
  'va-pwm': location('snd','va-pwm','[data-ob="synthesis-mode"]',msg("helpSearchIndex.instrumentSourceVAPulsePWMChooseThe")),
  'va-drift': location('snd','va-drift','[data-ob="synthesis-mode"]',msg("helpSearchIndex.instrumentSourceVADriftCents")),
  'wave-import': location('snd','wave-import','[data-ob="synthesis-mode"]',msg("helpSearchIndex.instrumentSourceWavetableImportWAVChooseThe")),
  'equalizer': location('track','equalizer','[data-ob="sound-panel"]',msg("helpSearchIndex.trackTrackTabEffectsAddEQ")),
  'voice-processing': location('snd','voice-processing','[data-ob="instrument-layers"]',msg("helpSearchIndex.instrumentLayersProcessingAndRangeForThe")),
  wavetable: location('snd','wavetable','[data-ob="synthesis-mode"]',msg("helpSearchIndex.instrumentSourceSynthesisWavetableFramesChooseThe")),
  mseg: location('env','mseg','[data-ob="env-tab"]',msg("helpSearchIndex.instrumentEnvelopeAmplitudeBreakpoints")),
  'instrument-layers': location('snd','instrument-layers','[data-ob="synthesis-mode"]',msg("helpSearchIndex.instrumentLayersExpandTheGroupToEdit")),
  'formant-group': location('snd','formant-group','[data-ob="synthesis-mode"]',msg("helpSearchIndex.instrumentSourceFormantsForOperatorSynthesis")),
  'chain-panel': location('chain','chain-panel','[data-ob="chain-panel"]',msg("helpSearchIndex.sequenceButtonBesideTheScenes")),
});
const aliases: Record<string,string> = {
  'drum-rack':'drum rack kit pad драм рэк пэд установка ударные перкуссия объединить',
  'playback-range':'loop region A B луп петля участок метки от сих до сих',
  'playback-variations':'random probability fixed variations случайность вероятность одинаковые варианты',
  portamento:'portamento glide глайд скольжение скользящий скользить слайд плавный переход высоты',
  mono:'моно монофония monophonic', 'formant-group':'форманты formant гласные',
  wavetable:'wave table волновая таблица вейвтейбл кадры', mseg:'огибающая envelope sustain loop атака плато спад',
  'wave-position-lfo':'LFO лфо покачивание модуляция позиции',
  'choke-group':'choke чок заглушить прерывание',
};
export const normalizeHelpQuery = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
const words = (s: string) => [...new Set(normalizeHelpQuery(s).split(/ +/).filter(Boolean))];
function locate(id: string): HelpLocation | undefined {
  const LOCATIONS = makeLocations();
  if (LOCATIONS[id]) return LOCATIONS[id];
  if (id.startsWith('wave-')) return {...LOCATIONS.wavetable, selector:`[data-help="${id}"]`};
  if (id.startsWith('mseg-') || id==='envelope-mode') return {...LOCATIONS.mseg, selector:`[data-help="${id}"]`, path:msg("helpSearchIndex.instrumentEnvelopeChooseAmplitudePitchOrLocal")};
  if (id.startsWith('chain-') || id==='scene-tempo') return {...LOCATIONS['chain-panel'],selector:`[data-help="${id}"]`};
  if (id.startsWith('instrument.')) {
    const panel=/attack|decay|sustain|pitchDrop|pitchTime/.test(id)?'env':/filter|ring|fold|comb/.test(id)?'timbre':'snd';
    return location(panel,id,panel==='snd'?'[data-ob="synthesis-mode"]':`[data-ob="${panel==='env'?'env-tab':'timbre-tab'}"]`,msg("helpSearchIndex.instrumentSomeSettingsAreAvailableOnlyFor", {p0: panel==='env'?msg("helpSearchIndex.envelope"):panel==='timbre'?msg("helpSearchIndex.timbre"):msg("helpSearchIndex.source")}));
  }
  if (id.startsWith('effect.')) return location('track',id,'[data-ob="sound-panel"]',msg("helpSearchIndex.trackTrackTabEffectsParametersAppearAfter"));
  if (id==='track.volume'||id==='track.pan') return location('track',id,'[data-ob="sound-panel"]',msg("helpSearchIndex.trackTrackTabVolumeAndPan"));
  return undefined;
}
function buildHelpIndex(): HelpEntry[] {
  const cards: Record<string,HelpCard> = {...Object.fromEntries((Object.keys(PARAMETERS) as ParameterId[]).map(id=>[id,parameterHelp(id)])),...CARDS,...EXPLANATIONS};
  delete cards['track.portamentoSec'];
  const entries: HelpEntry[] = Object.entries(cards).map(([id,card])=>({
    id,card,location:locate(id),aliases:aliases[id]??'',
    heading:words(bilingualSearchText(card.title)+' '+(aliases[id]??'')),
    words:words([card.title,card.text,card.how,card.example].map(bilingualSearchText).join(' ')+' '+(aliases[id]??'')),
  }));
  for(const guide of GUIDES) entries.push({id:'guide:'+guide.id,guideId:guide.id,
    card:{title:msg('helpSearchIndex.guide')+guide.title,text:guide.goal,how:guide.steps.map(s=>s.say).join(' ')},
    aliases:'',heading:words(bilingualSearchText(guide.title)),
    words:words([guide.title,guide.goal,...guide.steps.flatMap(s=>[s.say,s.hint])].map(bilingualSearchText).join(' '))});
  return entries;
}
let indexLocale = getLocale();
export let HELP_INDEX: HelpEntry[] = buildHelpIndex();
export function getHelpIndex(): HelpEntry[] {
  if (indexLocale !== getLocale()) { indexLocale = getLocale(); HELP_INDEX = buildHelpIndex(); }
  return HELP_INDEX;
}
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
  const index = getHelpIndex();
  const tokens=words(query.slice(0,160)).filter(w=>!['как','что','такое','где','это','в','и','на','для','мне','сделать','найти','хочу','нужно','покажи','объясни','про','how','what','where','is','the','a','an','to','in','and','for','me','find','show','want','need'].includes(w)).slice(0,8);
  if(!tokens.length)return ['portamento','wavetable','mseg','instrument-layers','chain-panel','wave-position-lfo'].map(id=>index.find(e=>e.id===id)!).filter(Boolean);
  return index.map(entry=>{
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
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.entry.card.title.localeCompare(b.entry.card.title,getLocale())).map(r=>r.entry).slice(0,60);
}
