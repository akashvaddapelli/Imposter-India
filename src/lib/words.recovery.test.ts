import { describe, expect, it } from 'vitest';
import { words, type Word } from '../data/words';
import { ANY_LANGUAGE, buildLibrary, clearLegacyEnglish, eligibleWords, EXTRA_WORDS_KEY, keepLegacyEnglish, LEGACY_ENGLISH_KEY, loadDismissedNotice, loadSavedWords, noticeKey, NOTICE_DISMISSED_KEY, normalizeWord, QUARANTINE_KEY, saveDismissedNotice, saveSavedWords, SCHEMA_KEY } from './words';

type Store = ReturnType<typeof memory>;
const memory = (initial: Record<string, string> = {}) => {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
};
const rec = (over: Record<string, unknown> = {}) => ({ id: 'custom-1700000000000', name: 'Old Custom', category: 'objects', aliases: [], languages: ['English'], regions: ['User added'], difficulty: 'Medium', recognition: 'Regional', ...over });
const main = (...records: unknown[]) => ({ [EXTRA_WORDS_KEY]: JSON.stringify(records) });
const cycle = (store: Store) => { const s = loadSavedWords(words, store); expect(saveSavedWords(s, store)).toBe(true); return s; };

describe('recovery data is never silently lost', () => {
  const bad = [{ name: '', category: 'food' }, { foo: 'bar' }, 42];

  it('survives many load/save cycles unchanged and without growing', () => {
    const store = memory(main(rec(), ...bad));
    for (let i = 0; i < 6; i++) cycle(store);
    expect(JSON.parse(store.data.get(QUARANTINE_KEY)!)).toEqual(bad);
    expect(loadSavedWords(words, store).quarantined).toEqual(bad);
    expect(loadSavedWords(words, store).extras).toHaveLength(1);
  });
  it('does not duplicate a record that appears both in the main list and the recovery list', () => {
    const store = memory({ ...main(rec(), bad[1]), [QUARANTINE_KEY]: JSON.stringify([bad[1]]) });
    expect(loadSavedWords(words, store).quarantined).toEqual([bad[1]]);
  });
  it('keeps a damaged recovery file instead of overwriting it', () => {
    const store = memory({ ...main(rec()), [QUARANTINE_KEY]: '[{broken' });
    const s = loadSavedWords(words, store);
    expect(s.quarantined).toEqual(['[{broken']);
    saveSavedWords(s, store);
    expect(JSON.parse(store.data.get(QUARANTINE_KEY)!)).toEqual(['[{broken']);
  });
  it('writes recovery data first: if that write fails the main list is left exactly as it was', () => {
    const original = JSON.stringify([rec(), ...bad]);
    const data = new Map<string, string>([[EXTRA_WORDS_KEY, original]]);
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (k === QUARANTINE_KEY) throw new Error('QuotaExceededError'); data.set(k, v); } };
    const s = loadSavedWords(words, store);
    expect(saveSavedWords(s, store)).toBe(false);
    expect(data.get(EXTRA_WORDS_KEY)).toBe(original);
  });
  it('refuses to write when storage could not be read, so unseen data is not overwritten', () => {
    const readFails = { getItem: () => { throw new Error('denied'); } };
    const s = loadSavedWords(words, readFails);
    expect(s.readFailed).toBe(true);
    const store = memory();
    expect(saveSavedWords({ ...s, extras: [normalizeWord({ name: 'New', category: 'food' }, 'custom-9')!] }, store)).toBe(false);
    expect(store.data.size).toBe(0);
  });
  it('keeps shadowed words through repeated cycles', () => {
    const store = memory(main(rec({ id: 'custom-5', name: 'delhi', category: 'places' })));
    for (let i = 0; i < 3; i++) expect(cycle(store).shadowed).toHaveLength(1);
    expect(JSON.parse(store.data.get(EXTRA_WORDS_KEY)!)).toHaveLength(1);
  });
});

describe('notice dismissal', () => {
  const dup = () => rec({ id: 'custom-5', name: 'delhi', category: 'places' });
  it('is stored separately and never touches words or recovery data', () => {
    const store = memory(main(rec(), dup(), { foo: 'bar' }));
    const s = loadSavedWords(words, store);
    const before = JSON.stringify([...store.data.entries()]);
    expect(saveDismissedNotice(noticeKey(s.notices), store)).toBe(true);
    const after = new Map(store.data);
    after.delete(NOTICE_DISMISSED_KEY);
    expect(JSON.stringify([...after.entries()])).toBe(before);
  });
  it('stays dismissed for the same notices across reloads, without needing another save', () => {
    const store = memory(main(rec(), dup(), { foo: 'bar' }));
    const first = loadSavedWords(words, store);
    saveDismissedNotice(noticeKey(first.notices), store);
    const second = loadSavedWords(words, store);
    expect(loadDismissedNotice(store)).toBe(noticeKey(second.notices));
    expect(second.quarantined).toEqual([{ foo: 'bar' }]);
  });
  it('shows again when something new needs attention', () => {
    const store = memory(main(rec(), dup(), { foo: 'bar' }));
    saveDismissedNotice(noticeKey(loadSavedWords(words, store).notices), store);
    store.data.set(EXTRA_WORDS_KEY, JSON.stringify([rec(), dup(), rec({ id: 'custom-6', name: 'pani puri', category: 'food' }), { foo: 'bar' }]));
    expect(loadDismissedNotice(store)).not.toBe(noticeKey(loadSavedWords(words, store).notices));
  });
  it('tolerates storage that throws', () => {
    expect(loadDismissedNotice({ getItem: () => { throw new Error('x'); } })).toBeNull();
    expect(saveDismissedNotice('k', { setItem: () => { throw new Error('x'); } })).toBe(false);
  });
});

describe('legacy English tags', () => {
  const legacyRecs = [rec({ id: 'custom-1', name: 'Old One' }), rec({ id: 'custom-2', name: 'Old Two' })];

  it('flags words with the old default shape when no schema marker exists (data from before language tracking)', () => {
    expect(loadSavedWords(words, memory(main(...legacyRecs))).legacyEnglish).toEqual(['custom-1', 'custom-2']);
  });
  it('does not flag imports, other languages, other regions or untagged words', () => {
    const recs = [rec({ id: 'import-1-0', name: 'Imp' }), rec({ id: 'custom-3', name: 'Tel', languages: ['Telugu'] }), rec({ id: 'custom-4', name: 'Both', languages: ['English', 'Hindi'] }), rec({ id: 'custom-5', name: 'Reg', regions: ['Kerala'] }), rec({ id: 'custom-6', name: 'None', languages: [] })];
    expect(loadSavedWords(words, memory(main(...recs))).legacyEnglish).toEqual([]);
  });
  it('words added after the upgrade are never flagged, even when English is a genuine choice', () => {
    const store = memory(main(...legacyRecs));
    const s = loadSavedWords(words, store);
    const fresh = normalizeWord({ name: 'Chosen English', category: 'food', languages: ['English'] }, 'custom-99')!;
    saveSavedWords({ ...s, extras: [...s.extras, fresh] }, store);
    const again = loadSavedWords(words, store);
    expect(again.legacyEnglish).toEqual(['custom-1', 'custom-2']);
    expect(again.legacyEnglish).not.toContain('custom-99');
    expect(store.data.get(SCHEMA_KEY)).toBeTruthy();
  });
  it('flags nothing and asks nothing for a brand-new user', () => {
    const store = memory();
    expect(loadSavedWords(words, store).legacyEnglish).toEqual([]);
    const w = normalizeWord({ name: 'Mine', category: 'food', languages: ['English'] }, 'custom-1')!;
    saveSavedWords({ ...loadSavedWords(words, store), extras: [w] }, store);
    expect(loadSavedWords(words, store).legacyEnglish).toEqual([]);
  });
  it('keeping the tags changes no word and stops the question for good', () => {
    const store = memory(main(...legacyRecs));
    const s = keepLegacyEnglish(loadSavedWords(words, store));
    saveSavedWords(s, store);
    const again = loadSavedWords(words, store);
    expect(again.legacyEnglish).toEqual([]);
    expect(again.extras.map(w => w.languages)).toEqual([['English'], ['English']]);
  });
  it('removing the tags changes only the flagged words, and the choice persists', () => {
    const store = memory(main(...legacyRecs, rec({ id: 'custom-7', name: 'Picked', languages: ['English', 'Tamil'] })));
    const s = loadSavedWords(words, store);
    saveSavedWords(clearLegacyEnglish(s), store);
    const again = loadSavedWords(words, store);
    expect(again.legacyEnglish).toEqual([]);
    expect(again.extras.map(w => [w.name, w.languages])).toEqual([['Old One', []], ['Old Two', []], ['Picked', ['English', 'Tamil']]]);
  });
  it('removing never touches a flagged word the player has since given a different language', () => {
    const s = loadSavedWords(words, memory(main(...legacyRecs)));
    const edited = { ...s, extras: s.extras.map(w => (w.id === 'custom-1' ? { ...w, languages: ['Hindi'] } : w)) };
    expect(clearLegacyEnglish(edited).extras.map(w => w.languages)).toEqual([['Hindi'], []]);
  });

  it('under language filters: legacy English matches English, untagged matches only Any', () => {
    const legacy = normalizeWord(rec({ id: 'custom-1', name: 'Legacy Dish', category: 'food' }), 'custom-1')!;
    const untagged = normalizeWord(rec({ id: 'custom-2', name: 'Untagged Dish', category: 'food', languages: [] }), 'custom-2')!;
    const lib = [...words, legacy, untagged];
    const ids = (lang: string) => eligibleWords(lib, ['food'], false, 'Any', lang).map((w: Word) => w.id);
    expect(ids(ANY_LANGUAGE)).toEqual(expect.arrayContaining(['custom-1', 'custom-2']));
    expect(ids('English')).toContain('custom-1');
    expect(ids('English')).not.toContain('custom-2');
    expect(ids('Telugu')).not.toContain('custom-1');
    expect(ids('Telugu')).not.toContain('custom-2');
    const cleared = clearLegacyEnglish({ ...loadSavedWords(words, memory(main(rec({ id: 'custom-1', name: 'Legacy Dish', category: 'food' })))) });
    expect(eligibleWords(buildLibrary(words, cleared), ['food'], false, 'Any', 'English').some(w => w.id === 'custom-1')).toBe(false);
    expect(eligibleWords(buildLibrary(words, cleared), ['food'], false, 'Any', ANY_LANGUAGE).some(w => w.id === 'custom-1')).toBe(true);
  });
  it('ignores a damaged legacy list', () => {
    const store = memory({ ...main(...legacyRecs), [SCHEMA_KEY]: '3', [LEGACY_ENGLISH_KEY]: '{nope' });
    expect(loadSavedWords(words, store).legacyEnglish).toEqual([]);
  });
});
