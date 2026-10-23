# Imposter India

A responsive Indian-culture-first social deduction party game built with React, TypeScript, Vite, and Lucide icons. One Mobile (pass-and-play on a single phone) is fully playable offline.

## Scope

One Mobile is playable locally in the browser and needs no backend. Multiple Mobiles remains a UI prototype for gameplay; an isolated Mode B connection proof now uses a small Node WebSocket relay to test temporary rooms and harmless messages. The proof does not synchronize a game or transmit words and roles.

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
- `src/multiplayer/` — isolated connection proof, protocol validation and WebSocket transport
- `server/server.mjs` — temporary in-memory room relay for the proof
- `src/styles.css` — responsive visual system and component styles

## Current UI screens

- Home and How to Play
- Offline mode selection
- One Mobile player setup, category selection, difficulty, and language settings
- Multiple Mobiles mock room/join screens and a separate Mode B connection proof
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

## Planned follow-up

1. Harden and deploy the Mode B relay, then implement online game sessions and private role delivery.
2. Evaluate native networking options for Mode C nearby offline play; see `docs/multiplayer-phase-1.md`.

## Note

Google Fonts are loaded from an external stylesheet for typography; all gameplay data and interactions are local. For fully offline font rendering, replace the font import with bundled font files or system fallbacks.

## Game rules

- 3-12 players. Imposters are always a minority: at most `floor((n-1)/2)`, capped at 3.
- Each player votes once and cannot vote for themselves.
- With k imposters the group wins only if the k most-voted players are exactly the imposters. A tie at the cut-off, or no votes, means the imposter wins.

## Saved data, privacy and limits

- Everything is stored in the browser's `localStorage` on the device you play on: settings (`ii-settings`) and custom/imported words (`ii-extra-words`, with a few small bookkeeping keys). **Nothing is synchronised between devices or browsers**, and clearing site data removes it. Use Export JSON in the Word Library to back up your words.
- Browsers limit `localStorage` (typically a few MB) and may block it entirely (private modes, strict settings). If a save fails the app says so and the change lasts only until the page is closed; it never claims a failed save worked.
- A game in progress is held in memory only. The secret word is never written to storage, is not in the page while a card is hidden, and is hidden again when you leave the screen or switch tabs. Refreshing or closing the tab ends the game (the browser asks first while a game is running).
- Screen readers get short neutral announcements ("Player 3, it's your turn to vote."); they never include secret words or votes.

## Deploying

The build uses root-relative asset paths (`/assets/...`), so serve `dist/` from the root of a domain. To host under a sub-path (for example GitHub Pages project sites) set `base` in `vite.config.ts` first.

The connection proof also needs the Node relay running (`npm run server`). For hosted use, deploy `server/server.mjs` to a public Node service with WebSocket support and TLS, then set `VITE_MULTIPLAYER_SERVER_URL` to its `wss://` endpoint when building the frontend. The default `ws(s)://<page-host>:3001` URL is for local development; HTTPS sites require a secure WebSocket endpoint. The relay keeps rooms in memory and is not production-ready for real games. See `docs/multiplayer-phase-1.md` for the design, limitations and Mode C investigation.

## Known limitations

- Full Multiple Mobiles gameplay remains a UI prototype; networking is limited to the isolated Mode B connection proof.
- Custom words accept letters and digits of any script. Duplicate checks ignore case, Latin accents, spaces and punctuation but never transliterate, so a Devanagari word and its Latin spelling are different words.
- Fonts load from Google Fonts; offline the app falls back to system fonts.
- Layout and 44px targets are verified in emulated viewports only; the procedure is in `docs/browser-qa.md`.
- Verified by browser emulation and automated tests only. Real devices and screen readers are not yet tested.

