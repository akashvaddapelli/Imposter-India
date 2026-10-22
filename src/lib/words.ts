import { categories, type Word } from '../data/words';

const validCategories = new Set(categories.map(c => c.id));
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const RECOGNITIONS = ['Common', 'Regional', 'Specialist'] as const;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : []);

/** Turns untrusted data (imports, localStorage) into a safe Word, or null when it is unusable. */
export function normalizeWord(input: unknown, id: string): Word | null {
  if (!input || typeof input !== 'object') return null;
  const w = input as Record<string, unknown>;
  const name = typeof w.name === 'string' ? w.name.trim() : '';
  if (!name || typeof w.category !== 'string' || !validCategories.has(w.category)) return null;
  const languages = strings(w.languages);
  const regions = strings(w.regions);
  return {
    id,
    name,
    category: w.category,
    aliases: strings(w.aliases),
    languages: languages.length ? languages : ['English'],
    regions: regions.length ? regions : ['User added'],
    difficulty: DIFFICULTIES.find(d => d === w.difficulty) ?? 'Medium',
    recognition: RECOGNITIONS.find(r => r === w.recognition) ?? 'Regional',
  };
}

/** Normalises a list, skipping invalid entries and names already known (case-insensitive). */
export function mergeWords(existing: Word[], incoming: unknown, idPrefix: string, stamp = Date.now()): Word[] {
  if (!Array.isArray(incoming)) throw new Error('Invalid format: expected a JSON array of words.');
  const known = new Set(existing.map(w => w.name.toLowerCase()));
  const added: Word[] = [];
  incoming.forEach((raw, i) => {
    const w = normalizeWord(raw, `${idPrefix}-${stamp}-${i}`);
    if (!w || known.has(w.name.toLowerCase())) return;
    known.add(w.name.toLowerCase());
    added.push(w);
  });
  return added;
}

export const EXTRA_WORDS_KEY = 'ii-extra-words';
const isExtra = (w: Word) => w.id.startsWith('custom-') || w.id.startsWith('import-');

export function loadExtraWords(starter: Word[], storage: Pick<Storage, 'getItem'> = localStorage): Word[] {
  try {
    const raw = JSON.parse(storage.getItem(EXTRA_WORDS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const known = new Set(starter.map(w => w.name.toLowerCase()));
    const out: Word[] = [];
    raw.forEach((r, i) => {
      const id = typeof r?.id === 'string' && /^(custom|import)-/.test(r.id) ? r.id : `import-restored-${i}`;
      const w = normalizeWord(r, id);
      if (w && !known.has(w.name.toLowerCase())) { known.add(w.name.toLowerCase()); out.push(w); }
    });
    return out;
  } catch {
    return [];
  }
}

export function saveExtraWords(all: Word[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(EXTRA_WORDS_KEY, JSON.stringify(all.filter(isExtra))); } catch { /* storage unavailable or full */ }
}
