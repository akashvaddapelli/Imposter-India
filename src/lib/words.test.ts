import { describe, expect, it } from 'vitest';
import { categories, countByCategory, words } from '../data/words';
import { loadExtraWords, mergeWords, normalizeWord, saveExtraWords } from './words';

const memory = (initial?: string) => {
  let value = initial ?? null;
  return { getItem: () => value, setItem: (_k: string, v: string) => { value = v; }, peek: () => value };
};

describe('word bank data', () => {
  it('has unique ids and unique names, all in a known category', () => {
    const ids = new Set(words.map(w => w.id));
    const names = new Set(words.map(w => w.name.toLowerCase()));
    const cats = new Set(categories.map(c => c.id));
    expect(ids.size).toBe(words.length);
    expect(names.size).toBe(words.length);
    words.forEach(w => expect(cats.has(w.category)).toBe(true));
  });
  it('derives category counts from the data', () => {
    const counts = countByCategory(words);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(words.length);
    categories.forEach(c => expect(counts[c.id] ?? 0).toBe(words.filter(w => w.category === c.id).length));
  });
});

describe('normalizeWord / mergeWords', () => {
  it('rejects junk and fills defaults', () => {
    expect(normalizeWord(null, 'x')).toBeNull();
    expect(normalizeWord({ name: ' ', category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: 'Dosa', category: 'nope' }, 'x')).toBeNull();
    expect(normalizeWord({ name: ' Dosa ', category: 'food', aliases: 'bad' }, 'x')).toMatchObject({ name: 'Dosa', aliases: [], languages: ['English'], difficulty: 'Medium' });
  });
  it('skips duplicates (case-insensitive) and invalid items, and rejects non-arrays', () => {
    const added = mergeWords(words, [{ name: 'BIRYANI', category: 'food' }, { name: 'Zzyzx Test', category: 'food' }, 5, { name: 'Zzyzx test', category: 'food' }], 'import', 1);
    expect(added.map(w => w.name)).toEqual(['Zzyzx Test']);
    expect(() => mergeWords(words, { a: 1 }, 'import')).toThrow(/Invalid/);
  });
});

describe('extra word storage', () => {
  it('round-trips custom and imported words together', () => {
    const store = memory();
    const a = normalizeWord({ name: 'My Word', category: 'food' }, 'custom-1')!;
    const b = normalizeWord({ name: 'Other Word', category: 'food' }, 'import-2-0')!;
    saveExtraWords([...words, a, b], store);
    expect(loadExtraWords(words, store).map(w => w.name)).toEqual(['My Word', 'Other Word']);
  });
  it('survives corrupted storage', () => {
    expect(loadExtraWords(words, memory('{not json'))).toEqual([]);
    expect(loadExtraWords(words, memory('{"a":1}'))).toEqual([]);
    expect(loadExtraWords(words, memory('[1,null,{"name":"x"}]'))).toEqual([]);
  });
});
