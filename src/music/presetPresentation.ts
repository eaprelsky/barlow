import { t as msg } from '../i18n/runtime.ts';
import { DEFAULT_MACROS } from './macros';
import { factory } from '../i18n/catalogs/factory';
import type { InstrumentPreset } from './instrumentPresets';

/** Presentation only. Imported names and sound snapshots never pass through this function. */
export function localizeFactoryPreset(preset: InstrumentPreset): InstrumentPreset {
  const nameKey = `factory.${preset.id}.name` as keyof typeof factory;
  const hintKey = `factory.${preset.id}.hint` as keyof typeof factory;
  if (!Object.hasOwn(factory, nameKey) || !Object.hasOwn(factory, hintKey)) return preset;
  return {
    ...preset,
    track: { ...preset.track, ...(preset.track.macros ? { macros: preset.track.macros.map(m => ({...m, name: DEFAULT_MACROS.find(d => d.id === m.id)?.name ?? m.name})) } : {}) },
    name: msg(nameKey), hint: msg(hintKey),
    searchTerms: [preset.name, preset.hint ?? '', factory[nameKey].ru, factory[nameKey].en,
      factory[hintKey].ru, factory[hintKey].en],
  };
}

export function categoryLabel(category: string): string {
  switch (category) {
    case 'свои':
    case 'мои': return msg('category.user');
    case 'стартовые': return msg('category.starters');
    case 'клавишные': return msg('category.keys');
    case 'бас': return msg('category.bass');
    case 'тоны и лиды': return msg('category.leads');
    case 'перкуссия': return msg('category.percussion');
    case 'фоны': return msg('category.pads');
    case 'сэмплеры': return msg('category.samplers');
    case 'прочее': return msg('category.other');
    default: return category;
  }
}
