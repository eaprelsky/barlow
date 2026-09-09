import { t as msg } from '../i18n/runtime.ts';
import type { InstrumentPreset } from './instrumentPresets';
export const SOUND_PACKS = [
  { id:'transitions-01',get name() { return msg("soundSearch.risersAndDownlifters"); },get description() { return msg("soundSearch.12TransitionsNoiseWhistlesMetalReactorSpace"); } },
  { id: 'character-01', get name() { return msg("soundSearch.heavyAndCosmic"); }, get description() { return msg("soundSearch.15SoundsNeurofunkDubstepDistortedStringsSpace"); } },
  { id: 'core-v39', get name() { return msg("soundSearch.foundations"); }, get description() { return msg("soundSearch.theOriginalPaletteAndTwoSamplerTemplates"); } },
  { id: 'idm-02', name: 'IDM 02', get description() { return msg("soundSearch.60WavetableVARingModulationWavefoldingAnd"); } },
  { id: 'idm-01', name: 'IDM 01', get description() { return msg("soundSearch.68SynthesisRecipesForElectronicMusic"); } },
  { id: 'user', get name() { return msg("soundSearch.myInstruments"); }, get description() { return msg("soundSearch.yourSavedSounds"); } },
];
export const presetPackOf = (p: InstrumentPreset): string => p.packId ?? (p.id?.startsWith('idm-01-') ? 'idm-01' : p.category === 'мои' ? 'user' : 'core-v39');
export const soundSearchText = (s: string) => s.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е');
const aliases: Record<string, string[]> = {
  kick: ['kick', 'бочк'], bass: ['bass', 'бас'], pad: ['pad', 'фон', 'пэд'],
  snare: ['snare', 'снейр', 'малый барабан'], hat: ['hat', 'хэт', 'хай-хэт'],
  lead: ['lead', 'лид'], bell: ['bell', 'колокол', 'звон'], pluck: ['pluck', 'плак', 'щип'],
  noise: ['noise', 'шум'], drone: ['drone', 'дрон'], granular: ['granular', 'зерн', 'гранул'],
  short: ['short', 'корот', 'микро'], long: ['long', 'длин', 'долг'], metal: ['metal', 'металл'],
  dark: ['dark', 'темн', 'тёмн'], bright: ['bright', 'ярк'], 'короткий': ['корот', 'short'],
  'бочка': ['бочк', 'kick'], 'хэт': ['хэт', 'hat'], 'фон': ['фон', 'pad'],
};
/** AND across words/quoted phrases; bilingual instrument vocabulary is small
 * and explicit, not a claim of semantic or fuzzy/AI search. */
export function soundMatches(text: string, query: string): boolean {
  const haystack = soundSearchText(text);
  const terms = soundSearchText(query.slice(0, 256)).match(/"[^"]+"|\S+/g) ?? [];
  return terms.every(term => term.startsWith('"') ? haystack.includes(term.slice(1, -1)) : (aliases[term] ?? [term]).some(t => haystack.includes(t)));
}
export function presetMatches(p: InstrumentPreset, query: string): boolean {
  const pack = SOUND_PACKS.find(pack => pack.id === presetPackOf(p));
  return soundMatches([p.name, p.category, p.hint ?? '', p.packName ?? '', p.packDescription ?? '', ...(p.tags ?? []), ...(p.searchTerms ?? []), pack?.name ?? '', ...SOUND_COLLECTIONS.filter(c=>presetInCollection(p,c.id)).map(c=>c.name), p.track.waveform === 'sample' ? 'sample сэмпл' : 'synthesis синтез'].join(' '), query);
}
export const presetFavoriteId = (p: InstrumentPreset) => `preset:${p.id ?? p.name}`;
export const sampleFavoriteId = (id: string) => `sample:${id}`;
export const FAVORITES_KEY = 'barlow.sound-favorites.v1';
export const FAVORITES_EVENT = 'barlow:sound-favorites';
export function loadSoundFavorites(): Set<string> {
  const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
  if (!Array.isArray(value) || value.length > 2000 || value.some(id => typeof id !== 'string' || id.length > 512)) throw new Error(msg("soundSearch.couldNotReadFavoritesCheckAccessTo"));
  return new Set(value);
}
export function saveSoundFavorites(ids: Set<string>): void {
  if (ids.size > 2000) throw new Error(msg("soundSearch.favoritesAlreadyContains2000SoundsRemoveSome"));
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(FAVORITES_EVENT));
}

/** Musical collections are independent of historical release packs and may overlap. */
export const SOUND_COLLECTIONS = [
  {id:'transitions',get name() { return msg("soundSearch.risersAndDownlifters"); },get description() { return msg("soundSearch.buildUpsBeforeTheClimaxAndFalling"); }},
  {id:'rhythm',get name() { return msg("soundSearch.rhythmAndDrums"); },get description() { return msg("soundSearch.kicksSnaresHiHatsAndPitchedPercussion"); }},
  {id:'bass',get name() { return msg("soundSearch.bassAndGroove"); },get description() { return msg("soundSearch.subBassPunchyBassesAndMovingBass"); }},
  {id:'melody',get name() { return msg("soundSearch.melodiesAndChords"); },get description() { return msg("soundSearch.keysLeadsAndPluckedSounds"); }},
  {id:'space',get name() { return msg("soundSearch.atmospheresAndSpace"); },get description() { return msg("soundSearch.padsDronesAndSpaciousSoundEffects"); }},
  {id:'heavy',get name() { return msg("soundSearch.heavyElectronics"); },get description() { return msg("soundSearch.neurofunkDubstepAndDistortedStrings"); }},
  {id:'basics',get name() { return msg("soundSearch.synthesisBasics"); },get description() { return msg("soundSearch.simpleStartingWaveformsForSoundDesign"); }},
  {id:'samplers',get name() { return msg("soundSearch.samplers"); },get description() { return msg("soundSearch.templatesForYourRecordings"); }},
  {id:'user',get name() { return msg("soundSearch.myInstruments"); },get description() { return msg("soundSearch.yourSavedAndImportedSounds"); }},
];
export function presetInCollection(p: InstrumentPreset, id: string): boolean {
  if(id.startsWith('pack:')) return p.packId===id.slice(5);
  if(id==='user') return p.category==='мои';
  if(p.category==='мои') return false;
  switch(id){
    case 'transitions': return p.packId==='transitions-01';
    case 'rhythm': return p.category==='перкуссия';
    case 'bass': return p.category==='бас';
    case 'melody': return ['клавишные','тоны и лиды'].includes(p.category);
    case 'space': return ['фоны','прочее'].includes(p.category);
    case 'heavy': return /neurofunk|dubstep|distortion|дисторшн|перегруж|нейрофанк|дабстеп/i.test([p.name,...(p.tags??[])].join(' '));
    case 'basics': return p.category==='стартовые';
    case 'samplers': return p.category==='сэмплеры';
    default: return false;
  }
}
