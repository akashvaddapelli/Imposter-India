export type Category = { id: string; name: string; description: string; icon: string; color: string };

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Recognition = 'Common' | 'Regional' | 'Specialist';

export type Word = {
  /** Stable id. Starter words use `${category}-${slug(name)}`; user words use `custom-*` / `import-*`. */
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  /** Alternate names and spellings only (searchable). Explanations belong in `note`. */
  aliases: string[];
  /** Language communities the word is familiar to. */
  languages: string[];
  /** Regions where it is most familiar. 'Pan-India' means widely known. */
  regions: string[];
  difficulty: Difficulty;
  recognition: Recognition;
  /** Optional short, factual context shown in the library. */
  note?: string;
};

/**
 * Compact authoring format used in src/data/bank/*.ts:
 * [name, aliases ('a|b'), languages ('Hindi+English'), regions ('Pan-India'), difficulty (E|M|H), note?]
 * The category comes from the file the row lives in.
 */
export type WordRow = readonly [
  name: string,
  aliases: string,
  languages: string,
  regions: string,
  difficulty: 'E' | 'M' | 'H',
  note?: string,
];
