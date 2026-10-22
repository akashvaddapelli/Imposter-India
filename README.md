# Imposter India — Frontend UI Prototype

A responsive Indian-culture-first social deduction party game UI built with React, TypeScript, Vite, and Lucide icons.

## Scope

This repository is intentionally **frontend-only**. There are no APIs, backend, database, authentication, or real networking. One Mobile is playable locally in the browser. Multiple Mobiles is a clearly marked UI prototype only.

## Run locally

```bash
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm run lint
npm test
```

Build for production:

```bash
npm run build
npm run preview
```

## Main areas

- `src/App.tsx` — screen flow and client-side interactions
- `src/data/words.ts` — categories and curated Indian-first starter word dataset
- `src/lib/game.ts` — pure game rules: setup validation, role assignment, vote validation, tie handling and round results
- `src/lib/timer.ts` + `src/hooks/useCountdown.ts` — timestamp-based discussion timer
- `src/lib/words.ts` — validation and persistence for custom/imported words
- `src/styles.css` — responsive visual system and component styles

## Current UI screens

- Home and How to Play
- Offline mode selection
- One Mobile player setup, category selection, difficulty, and language settings
- Multiple Mobiles mock room/join screens
- Searchable word library with filters, accurate computed counts, local word creation, JSON export/import
- Secret card reveal and pass-the-phone flow
- Discussion phase with timer controls and speaker order
- Sequential private voting UI and results
- Settings with local appearance, sound, motion, and language controls

## Settings and saved data

- **Word language** (setup and Settings): `Any language` (default) uses every word. Choosing a language keeps only words explicitly tagged with it. A tag means "familiar to that language community", not "exclusive", so one word can match several languages. Untagged words (for example custom words saved without a language) are included under `Any` but never under a specific language. The language filter combines with categories and difficulty (AND); Mixed ignores the category selection but still applies language and difficulty. If the combination leaves no words, the setup screen explains why and the start button is disabled.
- **Sound**: short Web Audio cues for card reveals, votes, the timer ending and results. It is a no-op if the browser lacks audio or blocks it.
- **Motion**: follows the device's reduced-motion setting by default; can be forced to full or reduced.
- **Appearance**: Light, Dark or System.
- Preferences are stored in `localStorage` (`ii-settings`); missing or malformed values fall back to defaults.
- **Custom and imported words** are stored in `ii-extra-words`. On load, nothing is discarded: valid words that now match a built-in word (case, spacing, accent and punctuation insensitive) are kept but not shown twice, and any extra aliases are added to the built-in entry (built-in names, categories, difficulty and notes are never changed). Records that cannot be read are kept in `ii-extra-words-unrecovered` and can be downloaded from the Word Library notice.

## Word library

The starter bank lives in `src/data/bank/`, **one file per category** (`food.ts`, `places.ts`, ...). `src/data/words.ts` holds the category list and builds the typed `Word[]` from those files; `src/data/types.ts` defines the schema.

### Adding words

Add a row to the category's file:

```ts
// [name, aliases, languages, regions, difficulty, note?]
['Pani puri', 'Golgappa|Puchka', 'Hindi+English+Bengali', 'Pan-India', 'E'],
```

- `aliases` - alternate **names or spellings only**, separated by `|`. Put explanations in `note`, not aliases.
- `languages` / `regions` - separated by `+`. Use `Pan-India` for widely known words.
- `difficulty` - `E` (Easy / Common), `M` (Medium / Regional), `H` (Hard / Specialist). Recognition is derived from it.
- `note` - optional, short and factual (max 160 characters). Use it where meaning varies by region or tradition.
- The id is generated as `<category>-<slug of name>` (for example `food-pani-puri`) and must stay stable: **do not rename existing words**; add an alias instead.

`npm test` checks the whole bank: unique ids and names (spelling-insensitive), valid categories and metadata, no alias that is another word, and stable ids.

### Custom words and import/export

Words added in the library or imported from JSON are validated with the same rules (`src/lib/words.ts`), de-duplicated against the library ignoring case, accents and punctuation, and stored in browser localStorage (`ii-extra-words`). Imported ids are ignored and regenerated (`import-<timestamp>-<n>`), so a file exported from this app can be re-imported safely.

### Content guidelines

- Prefer recognisable words for a casual party game; balance pan-Indian and regional references.
- Treat religious and mythological traditions respectfully; use `note` where traditions differ.
- Avoid stereotypes and political persuasion. Do not add facts you cannot verify.
- Category counts are always derived from the data.

## Planned follow-up in Claude

1. Review and improve visual details and keyboard/mobile accessibility.
2. Add component/end-to-end tests for the screen flow.
3. Implement actual multi-device local networking in an appropriate runtime.
4. Later, build online rooms, WebSocket game sync, and audio/video as a separate phase.

## Note

Google Fonts are loaded from an external stylesheet for typography; all gameplay data and interactions are local. For fully offline font rendering, replace the font import with bundled font files or system fallbacks.

## Game rules

- 3-12 players. Imposters are always a minority: at most `floor((n-1)/2)`, capped at 3.
- Each player votes once and cannot vote for themselves.
- With k imposters the group wins only if the k most-voted players are exactly the imposters. A tie at the cut-off, or no votes, means the imposter wins.
