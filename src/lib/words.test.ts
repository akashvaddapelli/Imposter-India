import { describe, expect, it } from 'vitest';
import { bank } from '../data/bank';
import { categories, countByCategory, slugify, starterId, words, type Word } from '../data/words';
import { eligibleWords, findExisting, findExistingOrAlias, hasStableStarterId, mergeWords, mergeWordsDetailed, nameKey, normalizeWord, validateWordBank } from './words';

const make = (over: Partial<Word> = {}): Word => ({ id: 'food-test', name: 'Test', category: 'food', aliases: [], languages: ['English'], regions: ['Pan-India'], difficulty: 'Easy', recognition: 'Common', ...over });

describe('word bank data', () => {
  it('passes every integrity check (ids, names, aliases, metadata, near-duplicates)', () => {
    expect(validateWordBank(words)).toEqual([]);
  });
  it('has a bank file for every category and no stray files', () => {
    expect(Object.keys(bank).sort()).toEqual(categories.map(c => c.id).sort());
  });
  it('gives every category a healthy number of words', () => {
    const counts = countByCategory(words);
    categories.forEach(c => expect(counts[c.id], c.id).toBeGreaterThanOrEqual(30));
  });
  it('derives category counts from the data', () => {
    const counts = countByCategory(words);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(words.length);
    categories.forEach(c => expect(counts[c.id] ?? 0).toBe(words.filter(w => w.category === c.id).length));
    categories.forEach(c => expect(counts[c.id]).toBe(bank[c.id].length));
  });
  it('uses stable, readable ids of the form category-slug', () => {
    words.forEach(w => { expect(hasStableStarterId(w), w.id).toBe(true); expect(w.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/); });
    expect(starterId('food', 'Pani puri')).toBe('food-pani-puri');
    expect(slugify('  Dr. B. R. Ambedkar ')).toBe('dr-b-r-ambedkar');
  });
  it('keeps ids of long-standing words unchanged', () => {
    ['movies-baahubali', 'food-biryani', 'epics-rama', 'places-hyderabad', 'landmarks-charminar', 'gods-ganesha'].forEach(id => expect(words.some(w => w.id === id), id).toBe(true));
  });
  it('has no name that appears in two categories, even with different spelling', () => {
    const keys = words.map(w => nameKey(w.name));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('mixes languages and regions rather than leaning on one community', () => {
    const langs = new Set(words.flatMap(w => w.languages));
    ['Telugu', 'Tamil', 'Hindi', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi'].forEach(l => expect(langs.has(l), l).toBe(true));
    const telugu = words.filter(w => w.languages.includes('Telugu')).length;
    expect(telugu / words.length).toBeLessThan(0.5);
  });
});

describe('integrity checks catch problems', () => {
  it('flags duplicate ids, duplicate names and spelling variants', () => {
    const issues = validateWordBank([make(), make(), make({ id: 'food-x', name: 'T-est' })]).map(i => i.problem);
    expect(issues).toContain('duplicate id');
    expect(issues.some(p => p.startsWith('same name as'))).toBe(true);
  });
  it('flags an alias that is another word, and an alias repeating the name', () => {
    const list = [make({ id: 'food-a', name: 'Alpha', aliases: ['Beta'] }), make({ id: 'food-b', name: 'Beta' })];
    expect(validateWordBank(list).some(i => i.problem.includes('is also the word'))).toBe(true);
    expect(validateWordBank([make({ aliases: ['test'] })]).map(i => i.problem)).toContain('alias repeats the name');
  });
  it('flags bad categories, difficulties and empty metadata', () => {
    const problems = validateWordBank([make({ category: 'nope', difficulty: 'Wild' as never, languages: [], regions: [], name: ' ' })]).map(i => i.problem);
    expect(problems.some(p => p.startsWith('unknown category'))).toBe(true);
    expect(problems).toEqual(expect.arrayContaining(['invalid difficulty', 'no languages', 'no regions', 'empty name']));
  });
  it('nameKey ignores case, accents, spaces and punctuation', () => {
    expect(nameKey('Auto-rickshaw')).toBe(nameKey('autorickshaw'));
    expect(nameKey('  Café  ')).toBe('cafe');
    expect(nameKey('M. S. Dhoni')).toBe(nameKey('MS Dhoni'));
  });
});

describe('normalizeWord', () => {
  it('rejects junk and fills defaults', () => {
    expect(normalizeWord(null, 'x')).toBeNull();
    expect(normalizeWord({ name: ' ', category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: '***', category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: 'Dosa', category: 'nope' }, 'x')).toBeNull();
    expect(normalizeWord({ name: 'x'.repeat(61), category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: ' Dosa ', category: 'food', aliases: 'bad' }, 'x')).toMatchObject({ name: 'Dosa', aliases: [], languages: [], regions: ['User added'], difficulty: 'Medium' });
    expect(normalizeWord({ name: 'Dosa', category: 'food', aliases: 'bad' }, 'x')?.languages).toEqual([]);
  });
  it('cleans aliases: trims, de-duplicates, drops the name itself, and caps the list', () => {
    const w = normalizeWord({ name: 'Dosa', category: 'food', aliases: [' Dosai ', 'dosai', 'DOSA', '', 5, ...Array.from({ length: 20 }, (_, i) => `a${i}`)] }, 'x')!;
    expect(w.aliases[0]).toBe('Dosai');
    expect(w.aliases).not.toContain('DOSA');
    expect(w.aliases.length).toBeLessThanOrEqual(8);
  });
  it('keeps a trimmed, length-limited note', () => {
    expect(normalizeWord({ name: 'Dosa', category: 'food', note: ' hello ' }, 'x')?.note).toBe('hello');
    expect(normalizeWord({ name: 'Dosa', category: 'food', note: 'n'.repeat(500) }, 'x')?.note?.length).toBe(160);
    expect(normalizeWord({ name: 'Dosa', category: 'food', note: '  ' }, 'x')).not.toHaveProperty('note');
  });
});

describe('import compatibility', () => {
  it('skips duplicates (any spelling) and invalid items, and rejects non-arrays', () => {
    const added = mergeWords(words, [{ name: 'BIRYANI', category: 'food' }, { name: 'Zzyzx Test', category: 'food' }, 5, { name: 'zzyzx-test', category: 'food' }], 'import', 1);
    expect(added.map(w => w.name)).toEqual(['Zzyzx Test']);
    expect(() => mergeWords(words, { a: 1 }, 'import')).toThrow(/Invalid/);
  });
  it('treats a file exported by the app as importable: only genuinely new words come in', () => {
    const custom = normalizeWord({ name: 'My Family Dish', category: 'food', aliases: ['Dish'] }, 'custom-1')!;
    const exported = JSON.parse(JSON.stringify([...words, custom]));
    expect(mergeWords(words, exported, 'import', 7).map(w => w.name)).toEqual(['My Family Dish']);
    expect(mergeWords([...words, custom], exported, 'import', 8)).toEqual([]);
  });
  it('accepts older exports with positional ids and missing fields', () => {
    const legacy = [{ id: 'word-001', name: 'Legacy Dish', category: 'food' }, { id: 'word-002', name: 'Legacy Place', category: 'places', aliases: ['Old name'], languages: [], regions: [] }];
    const added = mergeWords(words, legacy, 'import', 3);
    expect(added).toHaveLength(2);
    expect(added.every(w => w.id.startsWith('import-3-'))).toBe(true);
    expect(validateWordBank([...words, ...added])).toEqual([]);
  });
  it('ignores incoming ids so imports can never overwrite or collide with existing words', () => {
    const added = mergeWords(words, [{ id: 'food-biryani', name: 'Not Biryani', category: 'food' }], 'import', 4);
    expect(added[0].id).toBe('import-4-0');
  });
  it('finds existing words by normalised name', () => {
    expect(findExisting(words, 'pani-puri')?.id).toBe('food-pani-puri');
    expect(findExisting(words, 'Nothing Like This')).toBeUndefined();
  });
  it('treats a name that is another word’s alias as a duplicate (spelling-insensitive), but only for add/import', () => {
    expect(findExisting(words, 'Golgappa')).toBeUndefined();
    expect(findExistingOrAlias(words, 'Golgappa')?.id).toBe('food-pani-puri');
    expect(findExistingOrAlias(words, 'gol-GAPPA')?.id).toBe('food-pani-puri');
    expect(findExistingOrAlias(words, 'Pani puri')?.id).toBe('food-pani-puri');
    expect(findExistingOrAlias(words, 'Nothing Like This')).toBeUndefined();
    expect(findExistingOrAlias(words, '!!!')).toBeUndefined();
  });
  it('import skips a word whose name is an existing alias and reports it as a duplicate', () => {
    const r = mergeWordsDetailed(words, [{ name: 'Puchka', category: 'food' }, { name: 'Totally New Dish', category: 'food' }], 'import', 1);
    expect(r.duplicates).toBe(1);
    expect(r.added.map(w => w.name)).toEqual(['Totally New Dish']);
  });
});

describe('eligibleWords (what a round can draw from)', () => {
  const extra = normalizeWord({ name: 'Custom Movie', category: 'movies', difficulty: 'Hard' }, 'custom-9')!;
  const all = [...words, extra];
  it('uses only the selected categories', () => {
    const pool = eligibleWords(all, ['movies', 'food'], false, 'Any');
    expect(pool.every(w => w.category === 'movies' || w.category === 'food')).toBe(true);
    expect(pool.length).toBe(countByCategory(all).movies + countByCategory(all).food);
    expect(pool).toContain(extra);
  });
  it('Mixed uses the whole library including custom words, ignoring the category selection', () => {
    expect(eligibleWords(all, [], true, 'Any')).toHaveLength(all.length);
    expect(eligibleWords(all, ['food'], true, 'Any')).toHaveLength(all.length);
  });
  it('narrows by difficulty in both modes', () => {
    expect(eligibleWords(all, ['movies'], false, 'Hard').map(w => w.id)).toContain('custom-9');
    expect(eligibleWords(all, [], true, 'Easy').every(w => w.difficulty === 'Easy')).toBe(true);
  });
  it('is empty when nothing is selected outside Mixed', () => {
    expect(eligibleWords(all, [], false, 'Any')).toEqual([]);
  });
});

describe('Unicode custom words (Indian scripts)', () => {
  const dev = 'पानी पूरी';
  const tel = 'పానీ పూరీ';
  it('keeps letters and vowel signs of Indian scripts in the comparison key', () => {
    expect(nameKey(dev)).toBe('पानीपूरी');
    expect(nameKey(tel)).toBe('పానీపూరీ');
  });
  it('still folds Latin case, accents, spaces and punctuation', () => {
    expect(nameKey('Pâni púri')).toBe('panipuri');
    expect(nameKey('Auto-rickshaw.')).toBe('autorickshaw');
  });
  it('accepts Devanagari and Telugu words exactly as typed (no transliteration)', () => {
    expect(normalizeWord({ name: dev, category: 'food' }, 'custom-1')?.name).toBe(dev);
    expect(normalizeWord({ name: tel, category: 'food' }, 'custom-2')?.name).toBe(tel);
  });
  it('accepts mixed-script names and keeps them unchanged', () => {
    expect(normalizeWord({ name: 'पानी puri', category: 'food' }, 'custom-3')?.name).toBe('पानी puri');
  });
  it('still accepts plain Latin words', () => {
    expect(normalizeWord({ name: 'Pani puri', category: 'food' }, 'custom-4')?.name).toBe('Pani puri');
  });
  it('rejects punctuation-only, whitespace-only and empty names', () => {
    expect(normalizeWord({ name: '!!! ---', category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: '।।', category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: '   	  ', category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: '', category: 'food' }, 'x')).toBeNull();
  });
  it('enforces the length limit on Indian-script names too', () => {
    expect(normalizeWord({ name: 'पा'.repeat(40), category: 'food' }, 'x')).toBeNull();
    expect(normalizeWord({ name: 'पा'.repeat(20), category: 'food' }, 'x')).not.toBeNull();
  });
  it('detects duplicates in Indian scripts despite spacing and punctuation', () => {
    const existing = [normalizeWord({ name: dev, category: 'food' }, 'custom-1')!];
    expect(findExistingOrAlias(existing, 'पानी  पूरी')?.name).toBe(dev);
    expect(findExistingOrAlias(existing, 'पानी-पूरी')?.name).toBe(dev);
    expect(findExistingOrAlias(existing, 'पानी')).toBeUndefined();
  });
  it('does not treat a Devanagari word as a duplicate of a Latin one (no transliteration)', () => {
    expect(findExistingOrAlias(words, 'पानी पूरी')).toBeUndefined();
  });
  it('import skips a duplicate Telugu word and keeps the new one', () => {
    const existing = [normalizeWord({ name: tel, category: 'food' }, 'custom-1')!];
    const r = mergeWordsDetailed(existing, [{ name: 'పానీ-పూరీ', category: 'food' }, { name: 'బిర్యానీ', category: 'food' }], 'import', 2);
    expect(r.duplicates).toBe(1);
    expect(r.added.map(w => w.name)).toEqual(['బిర్యానీ']);
  });
  it('the starter library still passes every integrity check', () => {
    expect(validateWordBank(words)).toEqual([]);
  });
});
