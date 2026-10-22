import { categories, slugify, starterId, type Word } from '../data/words';

const validCategories = new Set(categories.map(c => c.id));
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const RECOGNITIONS = ['Common', 'Regional', 'Specialist'] as const;

export const MAX_NAME_LENGTH = 60;
export const MAX_ALIASES = 8;
export const MAX_NOTE_LENGTH = 160;

const strings = (v: unknown, max = 40): string[] =>
  Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(s => s && s.length <= max) : [];

/**
 * Comparison key for spotting the same word written differently:
 * case, accents, spaces, hyphens, dots and apostrophes are ignored ("Auto-rickshaw" == "autorickshaw").
 */
export const nameKey = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Turns untrusted data (imports, localStorage, the add-word form) into a safe Word, or null when it is unusable. */
export function normalizeWord(input: unknown, id: string): Word | null {
  if (!input || typeof input !== 'object') return null;
  const w = input as Record<string, unknown>;
  const name = typeof w.name === 'string' ? w.name.replace(/\s+/g, ' ').trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH || !nameKey(name)) return null;
  if (typeof w.category !== 'string' || !validCategories.has(w.category)) return null;
  const key = nameKey(name);
  const aliases = [...new Set(strings(w.aliases))].filter(a => nameKey(a) && nameKey(a) !== key).slice(0, MAX_ALIASES);
  const languages = strings(w.languages);
  const regions = strings(w.regions);
  const note = typeof w.note === 'string' ? w.note.trim().slice(0, MAX_NOTE_LENGTH) : '';
  return {
    id,
    name,
    category: w.category,
    aliases,
    languages: languages.length ? languages : ['English'],
    regions: regions.length ? regions : ['User added'],
    difficulty: DIFFICULTIES.find(d => d === w.difficulty) ?? 'Medium',
    recognition: RECOGNITIONS.find(r => r === w.recognition) ?? 'Regional',
    ...(note ? { note } : {}),
  };
}

/** True when `name` (or any alias) collides with an existing word's name. */
export function findExisting(existing: Word[], name: string): Word | undefined {
  const key = nameKey(name);
  return existing.find(w => nameKey(w.name) === key);
}

/** Normalises a list, skipping invalid entries and names already known. Incoming ids are ignored. */
export function mergeWords(existing: Word[], incoming: unknown, idPrefix: string, stamp = Date.now()): Word[] {
  if (!Array.isArray(incoming)) throw new Error('Invalid format: expected a JSON array of words.');
  const known = new Set(existing.map(w => nameKey(w.name)));
  const added: Word[] = [];
  incoming.forEach((raw, i) => {
    const w = normalizeWord(raw, `${idPrefix}-${stamp}-${i}`);
    if (!w || known.has(nameKey(w.name))) return;
    known.add(nameKey(w.name));
    added.push(w);
  });
  return added;
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
    if (!w.languages.length) bad('no languages');
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

/** The words a round may use: selected categories (or everything for Mixed), optionally narrowed by difficulty. */
export function eligibleWords(all: Word[], selected: string[], mixed: boolean, difficulty: string): Word[] {
  let pool = mixed ? all : all.filter(w => selected.includes(w.category));
  if (difficulty !== 'Any') pool = pool.filter(w => w.difficulty === difficulty);
  return pool;
}

export const EXTRA_WORDS_KEY = 'ii-extra-words';
const isExtra = (w: Word) => w.id.startsWith('custom-') || w.id.startsWith('import-');

export function loadExtraWords(starter: Word[], storage: Pick<Storage, 'getItem'> = localStorage): Word[] {
  try {
    const raw = JSON.parse(storage.getItem(EXTRA_WORDS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const known = new Set(starter.map(w => nameKey(w.name)));
    const out: Word[] = [];
    raw.forEach((r, i) => {
      const id = typeof r?.id === 'string' && /^(custom|import)-/.test(r.id) ? r.id : `import-restored-${i}`;
      const w = normalizeWord(r, id);
      if (w && !known.has(nameKey(w.name))) { known.add(nameKey(w.name)); out.push(w); }
    });
    return out;
  } catch {
    return [];
  }
}

export function saveExtraWords(all: Word[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(EXTRA_WORDS_KEY, JSON.stringify(all.filter(isExtra))); } catch { /* storage unavailable or full */ }
}
