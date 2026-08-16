// Человекочитальные имена файлов: кириллица транслитерируется, мусор
// заменяется на дефисы. Для сэмплов суффикс-хеш добавляет вызывающий.

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(name: string, maxLen = 40): string {
  const lower = name.toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (RU[ch] !== undefined) out += RU[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  return (
    out
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLen)
      .replace(/-+$/g, '') || 'untitled'
  );
}
