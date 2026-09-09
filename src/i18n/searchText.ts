import { messages } from './messages.ts';

// Search aliases only: the interface is translated by message keys, never by text replacement.
const alternatives = new Map<string, Set<string>>();
for (const pair of Object.values(messages)) {
  for (const value of [pair.ru, pair.en]) {
    const values = alternatives.get(value) ?? new Set<string>();
    values.add(pair.ru); values.add(pair.en); alternatives.set(value, values);
  }
}
export function bilingualSearchText(value: string | undefined): string {
  return value ? [...(alternatives.get(value) ?? [value])].join(' ') : '';
}
