import { browserStorage } from './storage';
import { categories, slugify, starterId, type Word } from '../data/words';

const validCategories = new Set(categories.map(c => c.id));
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const RECOGNITIONS = ['Common', 'Regional', 'Specialist'] as const;

export const MAX_NAME_LENGTH = 60;
export const MAX_ALIASES = 8;
export const MAX_NOTE_LENGTH = 160;
export const MAX_IMPORT_WORDS = 1000;
export const MAX_IMPORT_CHARS = 500_000;

const strings = (v: unknown, max = 40): string[] =>
  Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(s => s && s.length <= max) : [];

/**
 * Comparison key for spotting the same word written differently:
 * case, accents, spaces, hyphens, dots and apostrophes are ignored ("Auto-rickshaw" == "autorickshaw").
 */
export const nameKey = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const isUserWord = (w: Pick<Word, 'id'>) => w.id.startsWith('custom-') || w.id.startsWith('import-');

/**
 * Turns untrusted data (imports, localStorage, the add-word form) into a safe Word, or null when it is unusable.
 * Missing languages stay empty: we never claim a word belongs to a language nobody tagged it with.
 */
export function normalizeWord(input: unknown, id: string): Word | null {
  if (!input || typeof input !== 'object') return null;
  const w = input as Record<string, unknown>;
  const name = typeof w.name === 'string' ? w.name.replace(/\s+/g, ' ').trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH || !nameKey(name)) return null;
  if (typeof w.category !== 'string' || !validCategories.has(w.category)) return null;
  const key = nameKey(name);
  const aliases = [...new Set(strings(w.aliases))].filter(a => nameKey(a) && nameKey(a) !== key).slice(0, MAX_ALIASES);
  const regions = strings(w.regions);
  const note = typeof w.note === 'string' ? w.note.trim().slice(0, MAX_NOTE_LENGTH) : '';
  return {
    id,
    name,
    category: w.category,
    aliases,
    languages: [...new Set(strings(w.languages))],
    regions: regions.length ? regions : ['User added'],
    difficulty: DIFFICULTIES.find(d => d === w.difficulty) ?? 'Medium',
    recognition: RECOGNITIONS.find(r => r === w.recognition) ?? 'Regional',
    ...(note ? { note } : {}),
  };
}

/** The word whose name matches `name` ignoring case, accents and punctuation. */
export function findExisting(existing: Word[], name: string): Word | undefined {
  const key = nameKey(name);
  return existing.find(w => nameKey(w.name) === key);
}

/** Like findExisting, but a name that is another word's alias (for example Golgappa for Pani puri) also counts as a duplicate. */
export function findExistingOrAlias(existing: Word[], name: string): Word | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return existing.find(w => nameKey(w.name) === key || w.aliases.some(a => nameKey(a) === key));
}

export type MergeResult = { added: Word[]; duplicates: number; invalid: number };

/** Normalises a list, skipping invalid entries and names already known. Incoming ids are ignored. */
export function mergeWordsDetailed(existing: Word[], incoming: unknown, idPrefix: string, stamp = Date.now()): MergeResult {
  if (!Array.isArray(incoming)) throw new Error('Invalid format: expected a JSON array of words.');
  if (incoming.length > MAX_IMPORT_WORDS) throw new Error(`Invalid format: too many words (limit ${MAX_IMPORT_WORDS}).`);
  const known = new Set(existing.flatMap(w => [nameKey(w.name), ...w.aliases.map(nameKey)]));
  const result: MergeResult = { added: [], duplicates: 0, invalid: 0 };
  incoming.forEach((raw, i) => {
    const w = normalizeWord(raw, `${idPrefix}-${stamp}-${i}`);
    if (!w) { result.invalid++; return; }
    if (known.has(nameKey(w.name))) { result.duplicates++; return; }
    known.add(nameKey(w.name));
    result.added.push(w);
  });
  return result;
}

export const mergeWords = (existing: Word[], incoming: unknown, idPrefix: string, stamp = Date.now()): Word[] =>
  mergeWordsDetailed(existing, incoming, idPrefix, stamp).added;

/** Parses pasted import text, rejecting oversized or malformed input with a readable message. */
export function parseImportText(text: string): unknown {
  if (!text.trim()) throw new Error('Invalid format: paste a JSON array first.');
  if (text.length > MAX_IMPORT_CHARS) throw new Error('Invalid format: the pasted text is too large.');
  try { return JSON.parse(text); } catch { throw new Error('Invalid format: that is not valid JSON.'); }
}

export type BankIssue = { id: string; problem: string };

/** Integrity checks for a whole library. Returns an empty list when the data is healthy. */
export function validateWordBank(list: Word[]): BankIssue[] {
  const issues: BankIssue[] = [];
  const ids = new Map<string, Word>();
  const names = new Map<string, Word>();
  for (const w of list) {
    const bad = (problem: string) => issues.push({ id: w.id, problem });
    if (ids.has(w.id)) bad('duplicate id'); else ids.set(w.id, w);
    if (!w.name.trim()) bad('empty name');
    if (w.name.length > MAX_NAME_LENGTH) bad('name too long');
    if (!validCategories.has(w.category)) bad(`unknown category "${w.category}"`);
    if (!DIFFICULTIES.includes(w.difficulty)) bad('invalid difficulty');
    if (!RECOGNITIONS.includes(w.recognition)) bad('invalid recognition');
    // Built-in words must be language-tagged; user words may be untagged.
    if (!w.languages.length && !isUserWord(w)) bad('no languages');
    if (!w.regions.length) bad('no regions');
    if (w.aliases.length > MAX_ALIASES) bad('too many aliases');
    if (new Set(w.aliases.map(nameKey)).size !== w.aliases.length) bad('repeated alias');
    if (w.aliases.some(a => nameKey(a) === nameKey(w.name))) bad('alias repeats the name');
    if (w.note !== undefined && (!w.note.trim() || w.note.length > MAX_NOTE_LENGTH)) bad('invalid note');
    const key = nameKey(w.name);
    const clash = names.get(key);
    if (clash) bad(`same name as ${clash.id}`); else names.set(key, w);
  }
  // An alias must not be another entry's name (that would be a near-duplicate).
  for (const w of list) {
    for (const a of w.aliases) {
      const other = names.get(nameKey(a));
      if (other && other.id !== w.id) issues.push({ id: w.id, problem: `alias "${a}" is also the word ${other.id}` });
    }
  }
  return issues;
}

/** Starter ids must be exactly `${category}-${slug(name)}` so they stay stable. */
export const hasStableStarterId = (w: Word) => w.id === starterId(w.category, w.name) && w.id === `${w.category}-${slugify(w.name)}`;

// ---------------------------------------------------------------------------
// Language and round eligibility
// ---------------------------------------------------------------------------

/** Setup value meaning "do not filter by language". */
export const ANY_LANGUAGE = 'Any';

/**
 * A word matches a chosen language only if it is explicitly tagged with it.
 * Untagged words match "Any" but never a specific language. A tag means "familiar to that
 * language community", not "exclusive to it", so words can match several languages.
 */
export function matchesLanguage(w: Pick<Word, 'languages'>, language: string): boolean {
  if (language === ANY_LANGUAGE) return true;
  const wanted = language.trim().toLowerCase();
  return w.languages.some(l => l.trim().toLowerCase() === wanted);
}

export type LanguageOption = { value: string; count: number };

/** Languages actually present in the library, most common first. */
export function languageOptions(list: Word[]): LanguageOption[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const w of list) {
    for (const l of new Set(w.languages.map(x => x.trim()).filter(Boolean))) {
      const k = l.toLowerCase();
      const cur = counts.get(k);
      if (cur) cur.count++; else counts.set(k, { label: l, count: 1 });
    }
  }
  return [...counts.values()].map(({ label, count }) => ({ value: label, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Falls back to "Any" when a saved language is no longer in the library. */
export const resolveLanguage = (language: string, options: LanguageOption[]): string =>
  language === ANY_LANGUAGE || options.some(o => o.value.toLowerCase() === language.trim().toLowerCase()) ? language : ANY_LANGUAGE;

/**
 * The words a round may use: selected categories (or everything for Mixed), narrowed by
 * difficulty and language. Filters combine with AND.
 */
export function eligibleWords(all: Word[], selected: string[], mixed: boolean, difficulty: string, language: string = ANY_LANGUAGE): Word[] {
  let pool = mixed ? all : all.filter(w => selected.includes(w.category));
  if (difficulty !== 'Any') pool = pool.filter(w => w.difficulty === difficulty);
  if (language !== ANY_LANGUAGE) pool = pool.filter(w => matchesLanguage(w, language));
  return pool;
}

/** A player-facing explanation when the filters leave no words, or null when a round can start. */
export function emptyPoolReason(all: Word[], selected: string[], mixed: boolean, difficulty: string, language: string = ANY_LANGUAGE): string | null {
  if (!mixed && selected.length === 0) return 'Choose at least one category, or pick Mixed.';
  if (eligibleWords(all, selected, mixed, difficulty, language).length > 0) return null;
  const byCategory = eligibleWords(all, selected, mixed, 'Any', ANY_LANGUAGE);
  if (!byCategory.length) return 'There are no words in this selection yet. Try another category.';
  const lang = language !== ANY_LANGUAGE;
  const diff = difficulty !== 'Any';
  if (lang && diff && eligibleWords(all, selected, mixed, 'Any', language).length > 0) return `No ${difficulty.toLowerCase()} ${language} words in this selection. Try another difficulty or language.`;
  if (lang && diff && eligibleWords(all, selected, mixed, difficulty, ANY_LANGUAGE).length > 0) return `No ${difficulty.toLowerCase()} ${language} words in this selection. Try another language or difficulty.`;
  if (lang) return `No ${language} words in this selection. Try another category, or set the language to Any.`;
  return `No ${difficulty.toLowerCase()} words in this selection. Try another difficulty or category.`;
}

// ---------------------------------------------------------------------------
// Saved (user) words: loading, migration and saving
// ---------------------------------------------------------------------------

export const EXTRA_WORDS_KEY = 'ii-extra-words';
export const QUARANTINE_KEY = 'ii-extra-words-unrecovered';
/** Written on every save. Its absence on non-empty saved data means the data predates language-tag tracking. */
export const SCHEMA_KEY = 'ii-saved-schema';
export const SCHEMA_VERSION = '3';
/** Ids of saved words whose language tag was most likely added automatically by an older version. */
export const LEGACY_ENGLISH_KEY = 'ii-legacy-english';
export const NOTICE_DISMISSED_KEY = 'ii-notice-dismissed';

export type SavedWords = {
  /** Valid user words shown in the library. */
  extras: Word[];
  /** Valid user words that match a built-in (or earlier saved) word. Kept so nothing is lost; not shown twice. */
  shadowed: Word[];
  /** Records that could not be understood. Kept verbatim so they can be recovered. */
  quarantined: unknown[];
  /** Plain-language explanations for the player. */
  notices: string[];
  /** Saved words (ids) that older versions tagged "English" automatically. The player decides what to do with them. */
  legacyEnglish: string[];
  /** True when storage could not be read at all; saving is then refused so existing data is never overwritten blind. */
  readFailed?: boolean;
};

export const emptySaved = (): SavedWords => ({ extras: [], shadowed: [], quarantined: [], notices: [], legacyEnglish: [] });

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

type ReadResult = { ok: true; value: unknown } | { ok: false; raw: string } | { failed: true } | null;

function readJson(storage: ReadableStorage, key: string): ReadResult {
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { return { failed: true }; }
  if (raw === null || raw === '') return null;
  try { return { ok: true, value: JSON.parse(raw) }; } catch { return { ok: false, raw }; }
}

/**
 * Loads saved user words without ever discarding data:
 * - valid words are kept (their saved ids are preserved when unique);
 * - words that match a built-in word are "shadowed" (hidden from the library, but retained);
 * - anything unreadable is quarantined verbatim and reported.
 */
export function loadSavedWords(starter: Word[], storage: ReadableStorage = browserStorage()): SavedWords {
  const out = emptySaved();
  const previouslyQuarantined = readJson(storage, QUARANTINE_KEY);
  if (previouslyQuarantined && 'failed' in previouslyQuarantined) out.readFailed = true;
  else if (previouslyQuarantined?.ok) out.quarantined.push(...(Array.isArray(previouslyQuarantined.value) ? previouslyQuarantined.value : [previouslyQuarantined.value]));
  else if (previouslyQuarantined) out.quarantined.push(previouslyQuarantined.raw); // a damaged recovery file is itself kept

  const saved = readJson(storage, EXTRA_WORDS_KEY);
  if (saved && 'failed' in saved) out.readFailed = true;
  if (!saved || 'failed' in saved) {
    out.quarantined = dedupeRecords(out.quarantined);
    return out;
  }
  const records: unknown[] = !saved.ok ? [saved.raw] : Array.isArray(saved.value) ? saved.value : [saved.value];

  const starterKeys = new Map(starter.map(w => [nameKey(w.name), w]));
  const usedIds = new Set(starter.map(w => w.id));
  const extraKeys = new Set<string>();
  let renamed = 0;
  records.forEach((r, i) => {
    const wantedId = typeof (r as { id?: unknown })?.id === 'string' && /^(custom|import)-[\w-]+$/.test((r as { id: string }).id) ? (r as { id: string }).id : `import-restored-${i}`;
    const id = usedIds.has(wantedId) ? `import-restored-${i}-${usedIds.size}` : wantedId;
    if (id !== wantedId) renamed++;
    const w = normalizeWord(r, id);
    if (!w) { out.quarantined.push(r); return; }
    usedIds.add(id);
    const key = nameKey(w.name);
    if (starterKeys.has(key) || extraKeys.has(key)) out.shadowed.push(w);
    else { extraKeys.add(key); out.extras.push(w); }
  });

  out.quarantined = dedupeRecords(out.quarantined);
  out.legacyEnglish = detectLegacyEnglish(storage, out.extras);

  if (out.shadowed.length) {
    const names = out.shadowed.slice(0, 3).map(w => `"${w.name}"`).join(', ');
    const n = out.shadowed.length;
    out.notices.push(`${n} saved word${n === 1 ? '' : 's'} (${names}${n > 3 ? ', ...' : ''}) ${n === 1 ? 'is' : 'are'} already in the built-in library, so ${n === 1 ? 'it is' : 'they are'} not shown twice. Any extra aliases you saved were added to the built-in entry.`);
  }
  if (renamed) out.notices.push(`${renamed} saved word${renamed === 1 ? '' : 's'} had a clashing id and was given a new one.`);
  return out;
}

/** Drops exact repeats (by content) so repeated loads can never make recovery data grow. */
function dedupeRecords(list: unknown[]): unknown[] {
  const seen = new Set<string>();
  return list.filter(r => {
    const key = typeof r === 'string' ? `s:${r}` : `j:${JSON.stringify(r)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Before language tags were chosen by the player, the add-word form always saved `["English"]`.
 * A saved word that still has exactly that default shape (custom id, one English tag, "User added") may therefore
 * be a real choice or an automatic tag, and the two cannot be told apart. Once a save has stamped the schema marker,
 * only the ids recorded at that time count, so words added later (when English is a genuine choice) are never flagged.
 */
function detectLegacyEnglish(storage: ReadableStorage, extras: Word[]): string[] {
  const looksDefault = (w: Word) => w.id.startsWith('custom-') && w.languages.length === 1 && w.languages[0] === 'English' && w.regions.length === 1 && w.regions[0] === 'User added';
  let marker: string | null;
  try { marker = storage.getItem(SCHEMA_KEY); } catch { marker = null; }
  if (marker === null) return extras.filter(looksDefault).map(w => w.id);
  const recorded = readJson(storage, LEGACY_ENGLISH_KEY);
  const ids = recorded && 'ok' in recorded && recorded.ok && Array.isArray(recorded.value) ? recorded.value.filter((x): x is string => typeof x === 'string') : [];
  const present = new Set(extras.filter(w => w.languages.length === 1 && w.languages[0] === 'English').map(w => w.id));
  return ids.filter(id => present.has(id));
}

/** The player chose to keep the English tags: nothing changes except that we stop asking. */
export const keepLegacyEnglish = (saved: SavedWords): SavedWords => ({ ...saved, legacyEnglish: [] });

/** The player chose to remove the automatic English tags: only the listed words are changed, to "no language". */
export function clearLegacyEnglish(saved: SavedWords): SavedWords {
  const ids = new Set(saved.legacyEnglish);
  const clear = (w: Word): Word => (ids.has(w.id) && w.languages.length === 1 && w.languages[0] === 'English' ? { ...w, languages: [] } : w);
  return { ...saved, extras: saved.extras.map(clear), shadowed: saved.shadowed.map(clear), legacyEnglish: [] };
}

/** Identifies the current set of notices so a dismissal only hides notices the player has already seen. */
export const noticeKey = (notices: string[]): string => notices.join('\n');

export function loadDismissedNotice(storage: ReadableStorage = browserStorage()): string | null {
  try { return storage.getItem(NOTICE_DISMISSED_KEY); } catch { return null; }
}

/** Remembers a dismissal. This never touches saved words or recovery data. */
export function saveDismissedNotice(key: string, storage: WritableStorage = browserStorage()): boolean {
  try { storage.setItem(NOTICE_DISMISSED_KEY, key); return true; } catch { return false; }
}


/**
 * Builds the active library: built-in words (unchanged, apart from extra aliases the player saved
 * on a matching word) followed by the player's own words. Never shows the same word twice.
 */
export function buildLibrary(starter: Word[], saved: SavedWords): Word[] {
  const taken = new Set<string>([...starter.map(w => nameKey(w.name)), ...saved.extras.map(w => nameKey(w.name))]);
  const extraAliases = new Map<string, string[]>();
  for (const s of saved.shadowed) {
    const key = nameKey(s.name);
    const list = extraAliases.get(key) ?? [];
    for (const a of s.aliases) {
      const ak = nameKey(a);
      if (!ak || taken.has(ak) || list.some(x => nameKey(x) === ak)) continue;
      list.push(a);
      taken.add(ak);
    }
    extraAliases.set(key, list);
  }
  const merged = starter.map(w => {
    const add = extraAliases.get(nameKey(w.name));
    if (!add?.length) return w;
    const fresh = add.filter(a => !w.aliases.some(x => nameKey(x) === nameKey(a)));
    const room = Math.max(0, MAX_ALIASES - w.aliases.length);
    return fresh.length && room ? { ...w, aliases: [...w.aliases, ...fresh.slice(0, room)] } : w;
  });
  return [...merged, ...saved.extras];
}

/**
 * Writes user words (and anything we are keeping safe). Returns false if the browser refused a write.
 * Recovery data is written first: if that fails nothing else is touched, so records can never be lost between
 * leaving the main list and arriving in the recovery list. Nothing is written if storage could not be read.
 */
export function saveSavedWords(saved: Pick<SavedWords, 'extras' | 'shadowed' | 'quarantined'> & Partial<Pick<SavedWords, 'legacyEnglish' | 'readFailed'>>, storage: WritableStorage = browserStorage()): boolean {
  if (saved.readFailed) return false;
  try {
    if (saved.quarantined.length) storage.setItem(QUARANTINE_KEY, JSON.stringify(saved.quarantined));
    storage.setItem(LEGACY_ENGLISH_KEY, JSON.stringify(saved.legacyEnglish ?? []));
    storage.setItem(EXTRA_WORDS_KEY, JSON.stringify([...saved.extras, ...saved.shadowed]));
    storage.setItem(SCHEMA_KEY, SCHEMA_VERSION);
    return true;
  } catch {
    return false;
  }
}
