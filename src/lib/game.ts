import type { Word } from '../data/words';

export type Player = { id: string; name: string };
export type Role = { playerId: string; isImposter: boolean; word?: Word };
export type Rng = () => number;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_IMPOSTERS = 3;

/** Imposters must always be a minority: at most floor((n-1)/2), capped at MAX_IMPOSTERS. */
export function maxImposters(playerCount: number): number {
  return Math.max(1, Math.min(MAX_IMPOSTERS, Math.floor((playerCount - 1) / 2)));
}

export function shuffle<T>(list: readonly T[], rng: Rng = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickWords(pool: Word[], count: number, rng: Rng = Math.random): Word[] {
  return shuffle(pool, rng).slice(0, Math.max(0, Math.min(count, pool.length)));
}

/**
 * Takes the first `count` players and cleans their names: trims, collapses whitespace,
 * replaces empty names with "Player N", and de-duplicates (case-insensitive) so every
 * player can be told apart when voting.
 */
export function normalizePlayers(players: Player[], count: number): Player[] {
  if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new Error(`Choose between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
  }
  if (players.length < count) throw new Error('Some players are missing. Check the player list.');
  const seen = new Map<string, number>();
  return players.slice(0, count).map((p, i) => {
    const base = p.name.replace(/\s+/g, ' ').trim() || `Player ${i + 1}`;
    const key = base.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { id: p.id, name: n === 1 ? base : `${base} (${n})` };
  });
}

export function assignRoles(
  players: Player[],
  pool: Word[],
  imposterCount: number,
  rng: Rng = Math.random,
): { word: Word; roles: Role[] } {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Choose between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
  }
  if (new Set(players.map(p => p.id)).size !== players.length) throw new Error('Player ids must be unique.');
  if (!Number.isInteger(imposterCount) || imposterCount < 1 || imposterCount > maxImposters(players.length)) {
    throw new Error(`${players.length} players can have 1 to ${maxImposters(players.length)} imposter(s).`);
  }
  if (!pool.length) throw new Error('No words available for these categories.');
  const word = pickWords(pool, 1, rng)[0];
  const imposters = new Set(shuffle(players, rng).slice(0, imposterCount).map(p => p.id));
  return {
    word,
    roles: players.map(p => ({ playerId: p.id, isImposter: imposters.has(p.id), word: imposters.has(p.id) ? undefined : word })),
  };
}

/** Returns a new votes map. Rejects unknown players, self-votes and duplicate votes. */
export function castVote(
  votes: Record<string, string>,
  voterId: string,
  targetId: string,
  playerIds: string[],
): Record<string, string> {
  if (!playerIds.includes(voterId)) throw new Error('Unknown voter.');
  if (!playerIds.includes(targetId)) throw new Error('Choose a player to vote for.');
  if (voterId === targetId) throw new Error("You can't vote for yourself.");
  if (voterId in votes) throw new Error('This player has already voted.');
  return { ...votes, [voterId]: targetId };
}

export function tallyVotes(votes: Record<string, string>) {
  const counts: Record<string, number> = {};
  Object.values(votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  const max = Math.max(0, ...Object.values(counts));
  const tiedPlayers = Object.keys(counts).filter(id => counts[id] === max);
  return { counts, max, tiedPlayers, isTie: tiedPlayers.length !== 1 };
}

export type RoundOutcome = 'caught' | 'escaped' | 'tie';
export type RoundResult = { outcome: RoundOutcome; groupWins: boolean; accusedIds: string[]; imposterIds: string[]; counts: Record<string, number> };

/**
 * With k imposters the group must single out all of them: the k most-voted players must be
 * exactly the imposters. A tie at the cut-off (or no votes) means nobody can be singled out.
 * With one imposter this is simply "the top-voted player is the imposter".
 */
export function resolveRound(votes: Record<string, string>, roles: Role[]): RoundResult {
  const imposterIds = roles.filter(r => r.isImposter).map(r => r.playerId);
  const { counts } = tallyVotes(votes);
  const k = imposterIds.length;
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const tiedAtCut = k < ranked.length && counts[ranked[k - 1]] === counts[ranked[k]];
  const accusedIds = ranked.slice(0, k);
  if (!ranked.length || tiedAtCut || ranked.length < k) {
    return { outcome: 'tie', groupWins: false, accusedIds: [], imposterIds, counts };
  }
  const caught = accusedIds.length === k && accusedIds.every(id => imposterIds.includes(id));
  return { outcome: caught ? 'caught' : 'escaped', groupWins: caught, accusedIds, imposterIds, counts };
}
