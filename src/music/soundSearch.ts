import type { InstrumentPreset } from './instrumentPresets';
export const SOUND_PACKS = [
  { id: 'core-v39', name: 'Основы', description: 'Исходная палитра и два сэмплерных шаблона' },
  { id: 'idm-02', name: 'IDM 02', description: '60 тембров wavetable, VA, ring, wavefold и comb' },
  { id: 'idm-01', name: 'IDM 01', description: '68 синтетических рецептов для электронной музыки' },
  { id: 'user', name: 'Мои инструменты', description: 'Сохранённые тобой тембры' },
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
  return soundMatches([p.name, p.category, p.hint ?? '', ...(p.tags ?? []), pack?.name ?? '', p.track.waveform === 'sample' ? 'sample сэмпл' : 'synthesis синтез'].join(' '), query);
}
export const presetFavoriteId = (p: InstrumentPreset) => `preset:${p.id ?? p.name}`;
export const sampleFavoriteId = (id: string) => `sample:${id}`;
export const FAVORITES_KEY = 'barlow.sound-favorites.v1';
export const FAVORITES_EVENT = 'barlow:sound-favorites';
export function loadSoundFavorites(): Set<string> {
  const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
  if (!Array.isArray(value) || value.length > 2000 || value.some(id => typeof id !== 'string' || id.length > 512)) throw new Error('Не удалось прочитать избранное. Проверь доступ к локальному хранилищу.');
  return new Set(value);
}
export function saveSoundFavorites(ids: Set<string>): void {
  if (ids.size > 2000) throw new Error('В избранном уже 2000 звуков. Убери часть отметок перед добавлением новых.');
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(FAVORITES_EVENT));
}
