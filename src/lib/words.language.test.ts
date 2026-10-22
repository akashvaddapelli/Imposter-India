import { describe, expect, it } from 'vitest';
import { countByCategory, words, type Word } from '../data/words';
import { ANY_LANGUAGE, eligibleWords, emptyPoolReason, languageOptions, matchesLanguage, normalizeWord, resolveLanguage } from './words';

const make = (over: Partial<Word> = {}): Word => ({ id: 'food-test', name: 'Test', category: 'food', aliases: [], languages: ['English'], regions: ['Pan-India'], difficulty: 'Easy', recognition: 'Common', ...over });

describe('language matching', () => {
  const tel = make({ id: 'food-a', name: 'A', languages: ['Telugu', 'English'] });
  const hin = make({ id: 'food-b', name: 'B', languages: ['Hindi'] });
  const none = make({ id: 'custom-1', name: 'C', languages: [] });

  it('Any matches everything, including untagged words', () => {
    [tel, hin, none].forEach(w => expect(matchesLanguage(w, ANY_LANGUAGE)).toBe(true));
  });
  it('a specific language needs an explicit tag (case-insensitive, exact)', () => {
    expect(matchesLanguage(tel, 'Telugu')).toBe(true);
    expect(matchesLanguage(tel, ' english ')).toBe(true);
    expect(matchesLanguage(tel, 'Tamil')).toBe(false);
    expect(matchesLanguage(tel, 'Tel')).toBe(false);
  });
  it('never treats untagged words as belonging to a language', () => {
    expect(matchesLanguage(none, 'English')).toBe(false);
    expect(matchesLanguage(none, 'Telugu')).toBe(false);
  });
  it('a tag does not make a word exclusive: multi-tagged words match each of their languages', () => {
    expect(matchesLanguage(tel, 'Telugu') && matchesLanguage(tel, 'English')).toBe(true);
  });
  it('lists only languages present in the library with counts, most common first', () => {
    const opts = languageOptions([tel, hin, none, make({ id: 'food-d', name: 'D', languages: ['hindi'] })]);
    expect(opts).toEqual([{ value: 'Hindi', count: 2 }, { value: 'English', count: 1 }, { value: 'Telugu', count: 1 }]);
  });
  it('the real library offers the main Indian languages', () => {
    const values = languageOptions(words).map(o => o.value);
    ['Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'English'].forEach(l => expect(values).toContain(l));
  });
  it('falls back to Any when a saved language no longer exists', () => {
    const opts = languageOptions(words);
    expect(resolveLanguage('Telugu', opts)).toBe('Telugu');
    expect(resolveLanguage('Klingon', opts)).toBe(ANY_LANGUAGE);
    expect(resolveLanguage(ANY_LANGUAGE, [])).toBe(ANY_LANGUAGE);
  });
});

describe('eligibleWords with language', () => {
  const custom = normalizeWord({ name: 'Untagged Thing', category: 'food' }, 'custom-5')!;
  const all = [...words, custom];

  it('intersects category, difficulty and language', () => {
    const pool = eligibleWords(all, ['food', 'movies'], false, 'Easy', 'Telugu');
    expect(pool.length).toBeGreaterThan(0);
    pool.forEach(w => {
      expect(['food', 'movies']).toContain(w.category);
      expect(w.difficulty).toBe('Easy');
      expect(matchesLanguage(w, 'Telugu')).toBe(true);
    });
    const expected = all.filter(w => ['food', 'movies'].includes(w.category) && w.difficulty === 'Easy' && w.languages.includes('Telugu'));
    expect(pool.map(w => w.id).sort()).toEqual(expected.map(w => w.id).sort());
  });
  it('changing categories changes the pool', () => {
    const a = eligibleWords(all, ['food'], false, 'Any', 'Telugu').length;
    const b = eligibleWords(all, ['food', 'movies'], false, 'Any', 'Telugu').length;
    expect(b).toBeGreaterThan(a);
  });
  it('Any keeps the previous behaviour, untagged words included', () => {
    expect(eligibleWords(all, ['food'], false, 'Any')).toContain(custom);
    expect(eligibleWords(all, ['food'], false, 'Any', ANY_LANGUAGE)).toContain(custom);
    expect(eligibleWords(all, ['food'], false, 'Any').length).toBe(countByCategory(all).food);
  });
  it('a specific language excludes untagged words', () => {
    expect(eligibleWords(all, ['food'], false, 'Any', 'English')).not.toContain(custom);
    expect(eligibleWords(all, [], true, 'Any', 'Telugu')).not.toContain(custom);
  });
  it('Mixed ignores the category selection but still honours language and difficulty', () => {
    const pool = eligibleWords(all, ['food'], true, 'Any', 'Tamil');
    expect(pool.some(w => w.category !== 'food')).toBe(true);
    expect(pool.every(w => matchesLanguage(w, 'Tamil'))).toBe(true);
    expect(eligibleWords(all, [], true, 'Hard', 'Hindi').every(w => w.difficulty === 'Hard' && matchesLanguage(w, 'Hindi'))).toBe(true);
  });
  it('can be empty: no matching words for the combination', () => {
    expect(eligibleWords(all, ['food'], false, 'Any', 'Assamese')).toEqual([]);
    expect(eligibleWords(all, [], false, 'Any', 'Any')).toEqual([]);
  });
});

describe('emptyPoolReason', () => {
  it('is null when a round can start', () => {
    expect(emptyPoolReason(words, ['food'], false, 'Any', 'Telugu')).toBeNull();
    expect(emptyPoolReason(words, [], true, 'Any', 'Any')).toBeNull();
  });
  it('explains each kind of dead end', () => {
    expect(emptyPoolReason(words, [], false, 'Any', 'Any')).toMatch(/at least one category/);
    expect(emptyPoolReason(words, ['food'], false, 'Any', 'Assamese')).toMatch(/No Assamese words/);
    expect(emptyPoolReason([], ['food'], false, 'Any', 'Any')).toMatch(/no words/i);
  });
  it('mentions both language and difficulty when the combination is the problem', () => {
    const only = [make({ id: 'food-q', name: 'Q', difficulty: 'Easy', languages: ['Hindi'] })];
    expect(emptyPoolReason(only, ['food'], false, 'Hard', 'Hindi')).toMatch(/hard hindi/i);
  });
  it('blames the difficulty when only difficulty is the problem', () => {
    const only = [make({ id: 'food-q', name: 'Q', difficulty: 'Easy' })];
    expect(emptyPoolReason(only, ['food'], false, 'Hard', 'Any')).toMatch(/hard/i);
  });
});
