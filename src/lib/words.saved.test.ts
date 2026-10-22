import { describe, expect, it } from 'vitest';
import { words, type Word } from '../data/words';
import { buildLibrary, EXTRA_WORDS_KEY, isUserWord, loadSavedWords, mergeWordsDetailed, nameKey, normalizeWord, parseImportText, QUARANTINE_KEY, saveSavedWords, validateWordBank } from './words';

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [[EXTRA_WORDS_KEY, initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, peek: (k: string = EXTRA_WORDS_KEY) => data.get(k) };
};
const legacy = (over: Record<string, unknown> = {}) => ({ id: 'custom-1700000000000', name: 'Old Custom', category: 'objects', aliases: ['Oc'], languages: ['English'], regions: ['User added'], difficulty: 'Medium', recognition: 'Regional', ...over });
const empty = { extras: [], shadowed: [], quarantined: [], notices: [], legacyEnglish: [] };

describe('saved words: loading, migration and saving', () => {
  it('round-trips user words (custom and imported) and keeps their ids', () => {
    const store = memory();
    const a = normalizeWord({ name: 'My Word', category: 'food' }, 'custom-1')!;
    const b = normalizeWord({ name: 'Other Word', category: 'food' }, 'import-2-0')!;
    expect(saveSavedWords({ extras: [a, b], shadowed: [], quarantined: [] }, store)).toBe(true);
    const loaded = loadSavedWords(words, store);
    expect(loaded.extras).toEqual([a, b]);
    expect(loaded.notices).toEqual([]);
  });
  it('loads data saved by earlier versions untouched (ids, metadata, legacy English tag)', () => {
    const loaded = loadSavedWords(words, memory(JSON.stringify([legacy()])));
    expect(loaded.extras).toMatchObject([{ id: 'custom-1700000000000', name: 'Old Custom', aliases: ['Oc'], languages: ['English'], category: 'objects' }]);
    expect(loaded.shadowed).toEqual([]);
  });
  it('is a no-op when nothing was saved', () => {
    expect(loadSavedWords(words, memory())).toEqual(empty);
  });
  it('keeps a saved word that now matches a starter word, hidden but not deleted', () => {
    const rec = legacy({ id: 'custom-9', name: 'delhi', category: 'places', aliases: ['Dilli', 'Capital'] });
    const store = memory(JSON.stringify([rec, legacy({ id: 'custom-10', name: 'Keep Me' })]));
    const loaded = loadSavedWords(words, store);
    expect(loaded.extras.map(w => w.name)).toEqual(['Keep Me']);
    expect(loaded.shadowed.map(w => w.id)).toEqual(['custom-9']);
    expect(loaded.notices.join(' ')).toMatch(/already in the built-in library/);
    saveSavedWords(loaded, store);
    expect(JSON.parse(store.peek()!).map((w: Word) => w.id)).toEqual(['custom-10', 'custom-9']);
    expect(loadSavedWords(words, store).shadowed).toHaveLength(1);
  });
  it('resolves variants of case, spacing, punctuation and accents the same way', () => {
    ['PANI PURI', ' pani  puri ', 'Pani-Puri', 'pání púri'].forEach((name, i) => {
      const loaded = loadSavedWords(words, memory(JSON.stringify([legacy({ id: `custom-v${i}`, name, category: 'food' })])));
      expect(loaded.shadowed, name).toHaveLength(1);
      expect(loaded.extras, name).toHaveLength(0);
    });
  });
  it('never shows a word twice in the active library', () => {
    const recs = [legacy({ id: 'custom-1', name: 'Delhi', category: 'places' }), legacy({ id: 'custom-2', name: 'Twin', category: 'food' }), legacy({ id: 'custom-3', name: 'TWIN', category: 'food' })];
    const lib = buildLibrary(words, loadSavedWords(words, memory(JSON.stringify(recs))));
    const keys = lib.map(w => nameKey(w.name));
    expect(new Set(keys).size).toBe(keys.length);
    expect(lib.filter(w => nameKey(w.name) === 'twin')).toHaveLength(1);
  });
  it('adds a users extra aliases to the starter word but never changes trusted starter content', () => {
    const rec = legacy({ id: 'custom-9', name: 'Delhi', category: 'food', aliases: ['Dilli', 'Mumbai', 'Delhi'], difficulty: 'Hard', note: 'my note', regions: ['Mars'] });
    const lib = buildLibrary(words, loadSavedWords(words, memory(JSON.stringify([rec]))));
    const before = words.find(w => w.id === 'places-delhi')!;
    const after = lib.find(w => w.id === 'places-delhi')!;
    expect(after.aliases).toEqual([...before.aliases, 'Dilli']);
    expect({ ...after, aliases: before.aliases }).toEqual(before);
    expect(lib.filter(w => w.category === 'food' && w.name === 'Delhi')).toHaveLength(0);
  });
  it('does not let a saved alias collide with another word', () => {
    const rec = legacy({ id: 'custom-9', name: 'Delhi', category: 'places', aliases: ['Dosa', 'Idli'] });
    const lib = buildLibrary(words, loadSavedWords(words, memory(JSON.stringify([rec]))));
    expect(lib.find(w => w.id === 'places-delhi')!.aliases).not.toContain('Dosa');
    expect(validateWordBank(lib)).toEqual([]);
  });
  it('quarantines unreadable records verbatim and keeps the good ones', () => {
    const bad = [{ id: 'custom-x', name: '', category: 'food' }, { name: 'No Cat' }, 42, null];
    const store = memory(JSON.stringify([...bad, legacy()]));
    const loaded = loadSavedWords(words, store);
    expect(loaded.extras).toHaveLength(1);
    expect(loaded.quarantined).toEqual(bad);
    saveSavedWords(loaded, store);
    expect(JSON.parse(store.peek(QUARANTINE_KEY)!)).toEqual(bad);
    expect(loadSavedWords(words, store).quarantined).toEqual(bad);
  });
  it('keeps corrupted storage text instead of deleting it', () => {
    const store = memory('{not json');
    const loaded = loadSavedWords(words, store);
    expect(loaded.extras).toEqual([]);
    expect(loaded.quarantined).toEqual(['{not json']);
    saveSavedWords(loaded, store);
    expect(JSON.parse(store.peek(QUARANTINE_KEY)!)).toEqual(['{not json']);
  });
  it('wraps a non-array JSON value rather than ignoring it', () => {
    expect(loadSavedWords(words, memory('{"a":1}')).quarantined).toEqual([{ a: 1 }]);
  });
  it('gives clashing ids a new id and says so', () => {
    const recs = [legacy({ id: 'custom-1', name: 'One' }), legacy({ id: 'custom-1', name: 'Two' }), legacy({ id: 'food-biryani', name: 'Three' })];
    const loaded = loadSavedWords(words, memory(JSON.stringify(recs)));
    expect(loaded.extras).toHaveLength(3);
    expect(new Set(loaded.extras.map(w => w.id)).size).toBe(3);
    expect(loaded.extras.map(w => w.id)).not.toContain('food-biryani');
    expect(loaded.notices.join(' ')).toMatch(/clashing id/);
  });
  it('reports a failed write instead of pretending to save', () => {
    const full = { setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(saveSavedWords({ extras: [], shadowed: [], quarantined: [] }, full)).toBe(false);
  });
  it('survives storage that throws on read', () => {
    const broken = { getItem: () => { throw new Error('denied'); } };
    expect(loadSavedWords(words, broken)).toEqual({ ...empty, readFailed: true });
  });
  it('only custom- and import- ids are user words', () => {
    expect(isUserWord({ id: 'custom-1' })).toBe(true);
    expect(isUserWord({ id: 'import-1-0' })).toBe(true);
    expect(isUserWord({ id: 'food-biryani' })).toBe(false);
  });
});

describe('import safety', () => {
  it('rejects malformed, empty and oversized input with readable messages', () => {
    expect(() => parseImportText('')).toThrow(/Invalid format/);
    expect(() => parseImportText('{oops')).toThrow(/not valid JSON/);
    expect(() => parseImportText('x'.repeat(600_000))).toThrow(/too large/);
    expect(() => mergeWordsDetailed(words, Array.from({ length: 1001 }, () => ({})), 'import')).toThrow(/too many/);
  });
  it('reports how many entries were new, duplicate and invalid', () => {
    const r = mergeWordsDetailed(words, [{ name: 'Brand New', category: 'food' }, { name: 'Dosa', category: 'food' }, { name: 'x', category: 'nope' }, { name: 'y'.repeat(100), category: 'food' }], 'import', 1);
    expect(r.added.map(w => w.name)).toEqual(['Brand New']);
    expect([r.duplicates, r.invalid]).toEqual([1, 2]);
  });
  it('drops oversized aliases and truncates notes safely', () => {
    const w = normalizeWord({ name: 'Big', category: 'food', aliases: ['z'.repeat(100), 'ok'], note: 'n'.repeat(1000) }, 'x')!;
    expect(w.aliases).toEqual(['ok']);
    expect(w.note!.length).toBe(160);
  });
  it('a failed import leaves the existing library untouched', () => {
    const snapshot = JSON.stringify(words);
    expect(() => mergeWordsDetailed(words, 'nope', 'import')).toThrow();
    expect(JSON.stringify(words)).toBe(snapshot);
  });
  it('export then import into the same library adds nothing and creates no duplicate ids', () => {
    const custom = normalizeWord({ name: 'Round Trip', category: 'food' }, 'custom-77')!;
    const lib = [...words, custom];
    const exported = JSON.parse(JSON.stringify(lib));
    expect(mergeWordsDetailed(lib, exported, 'import', 1).added).toEqual([]);
    const fresh = mergeWordsDetailed(words, exported, 'import', 2).added;
    expect(fresh.map(w => w.name)).toEqual(['Round Trip']);
    expect(validateWordBank([...words, ...fresh])).toEqual([]);
  });
});
