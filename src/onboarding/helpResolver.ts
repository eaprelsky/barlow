import { CARDS, type HelpCard } from './cards';
import { EXPLANATIONS } from './explanations';
import { isParameterId } from '../parameters';
import { parameterHelp } from './parameterHelp';

export const helpCard = (key: string | null): HelpCard | undefined => key ? EXPLANATIONS[key] ?? CARDS[key] ?? (isParameterId(key) ? parameterHelp(key) : undefined) : undefined;
const controlSelector = 'svg[tabindex], button, input:not([type="hidden"]), select, textarea, summary, [role="slider"], canvas, [role="button"], [role="checkbox"], [role="tab"], a';
const regions: [string, string][] = [
  ['.wav-export', 'export-wav'], ['.native-dialog', 'dialog'], ['.audio-status', 'status'], ['.bridge-settings', 'bridge'],
  ['.sample-zones', 'sample-zones'], ['.sample-slices', 'sample-slices'],
  ['.scale-dd', 'scale-tools'], ['.roll-tools', 'roll'],
  ['.track', 'sound-panel'], ['.sound-browser', 'library-panel'], ['.auto-editor', 'auto-toggle'],
  ['.header', 'workspace'], ['main', 'workspace'], ['#root', 'workspace'],
];
const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
// Wording aliases only resolve shared concepts. Explicit data-help wins.
const concepts: [RegExp, string][] = [
  [/^громкость/, 'track.volume'], [/^панорама дорожки/, 'track.pan'], [/^Шаг \d/i, 'roll'], [/^гид$/, 'help-guides'],
  [/^атака/, 'attack'], [/^плато/, 'sustain'], [/^спад/, 'decay'], [/portamento|портаменто|скольжение/, 'portamento'],
  [/формант/, 'formant-group'], [/группа глушения|группа прерывания/, 'choke-group'], [/приоритет/, 'choke-priority'],
  [/новая нота (глушит|прерывает)/, 'mono'],
];
export interface HelpMatch { element: Element; card: HelpCard; source: 'explicit' | 'description' | 'group'; key: string }
function nameOf(el: Element): string {
  const labelled = el.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
  return el.getAttribute('aria-label') || labelled || (el.matches('input,select,textarea') ? el.closest('label')?.textContent?.trim() : el.textContent?.trim()) || '';
}
function instruction(el: Element): string | undefined {
  if (el.matches('[role="slider"]') || el.closest('.knob-wrap')) return 'Потяни ручку вверх или вниз; Shift — медленнее. Двойной щелчок или Enter — точный ввод. Стрелки меняют значение с клавиатуры.';
  if (el.matches('summary')) return 'Нажми заголовок, чтобы раскрыть или свернуть группу настроек.';
  if (el.matches('select')) return 'Открой список и выбери вариант. С клавиатуры используй стрелки и Enter.';
  if (el.matches('input[type="checkbox"], [role="checkbox"]')) return 'Нажми, чтобы включить или выключить; с клавиатуры — пробел.';
  if (el.matches('input,textarea')) return 'Нажми поле и введи значение. Для числового поля Enter завершает ввод, Escape отменяет текущую правку.';
  return undefined;
}
/** A semantic leaf owns its explanation; decoration inherits the closest group.
 * No DOM mutation, network request or model-generated text at interaction time.
 * Never inspect input values (in particular credentials) to construct help. */
export function resolveHelp(target: Element | null): HelpMatch | null {
  if (!target || target.closest('.ph-overlay')) return null;
  if (target.matches('html,body')) return { element: document.querySelector('#root') ?? target, card: EXPLANATIONS.workspace, key: 'workspace', source: 'explicit' };
  const control = target.closest(controlSelector);
  let group: HelpMatch | null = null;
  for (let el: Element | null = target; el; el = el.parentElement) {
    const key = el.getAttribute('data-help') ?? el.getAttribute('data-ob');
    const baseCard = helpCard(key);
    const detail = el.getAttribute('data-help-detail');
    let card = baseCard && detail ? { ...baseCard, text: `${baseCard.text} ${detail}` } : baseCard;
    if (card && el.getAttribute('data-guide-id')) card = { ...card, guide: { id: el.getAttribute('data-guide-id')!, step: Number(el.getAttribute('data-guide-step') ?? 0) } };
    if (card) {
      group = { element: el, card, key: key!, source: 'explicit' };
      // A wrapper dedicated to one control owns that control too.
      if (!control || el === control || el.matches('.knob-wrap,label') || (el.hasAttribute('data-help') && !el.matches('section,details,.layer-row'))) return { ...group, element: control ?? el };
      break;
    }
  }
  if (!group) {
    for (let el: Element | null = target; el && !group; el = el.parentElement) {
      const region = regions.find(([selector]) => el!.matches(selector));
      if (region) group = { element: el, card: helpCard(region[1])!, key: region[1], source: 'group' };
    }
  }
  const leaf = control ?? target.closest('[title]');
  if (leaf) {
    const title = leaf.closest('[title]')?.getAttribute('title') || (leaf.getAttribute('aria-label')?.includes('—') ? leaf.getAttribute('aria-label')! : '');
    const name = nameOf(leaf).replace(/\s+/g, ' ').slice(0, 100);
    const concept = concepts.find(([pattern]) => pattern.test(normalized(name || title)));
    if (concept) return { element: leaf, card: helpCard(concept[1])!, source: 'explicit', key: concept[1] };
    const descriptive = title.length > 24;
    if (descriptive || group) {
      const card = group?.card ?? EXPLANATIONS.workspace;
      return { element: leaf, source: descriptive ? 'description' : 'group', key: group?.key ?? 'workspace', card: {
        title: name || (title.length < 85 ? title : card.title) || card.title,
        text: descriptive ? title : card.text,
        how: instruction(leaf) ?? card.how,
        example: card.example,
        guide: card.guide,
      } };
    }
  }
  return group;
}

/** Runtime inventory used by UI tests; group inheritance is reported separately. */
export function helpCoverage(root: ParentNode = document): { total: number; missing: string[]; inherited: string[] } {
  const elements = [...root.querySelectorAll(controlSelector)].filter(el => el.getClientRects().length && !el.closest('.ph-overlay'));
  const missing: string[] = [], inherited: string[] = [];
  for (const element of elements) {
    const match = resolveHelp(element), name = nameOf(element) || element.tagName;
    if (!match || (match.source === 'group' && match.key === 'workspace')) missing.push(name);
    else if (match.source === 'group') inherited.push(name);
  }
  return { total: elements.length, missing, inherited };
}
