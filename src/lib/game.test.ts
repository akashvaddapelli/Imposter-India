import { describe, expect, it } from 'vitest';
import type { Word } from '../data/words';
import { assignRoles, castVote, maxImposters, normalizePlayers, resolveRound, tallyVotes, type Player, type Role } from './game';

const word = (name: string): Word => ({ id: name, name, category: 'food', aliases: [], languages: ['English'], regions: [], difficulty: 'Easy', recognition: 'Common' });
const pool = [word('Biryani'), word('Dosa'), word('Samosa')];
const makePlayers = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const rolesFor = (n: number, imposters: string[]): Role[] => makePlayers(n).map(p => ({ playerId: p.id, isImposter: imposters.includes(p.id) }));

describe('maxImposters', () => {
  it('keeps imposters a strict minority and capped at 3', () => {
    expect([3, 4, 5, 6, 7, 8, 9, 12].map(maxImposters)).toEqual([1, 1, 2, 2, 3, 3, 3, 3]);
  });
});

describe('normalizePlayers', () => {
  it('rejects counts outside 3-12 and missing players', () => {
    expect(() => normalizePlayers(makePlayers(5), 2)).toThrow();
    expect(() => normalizePlayers(makePlayers(13), 13)).toThrow();
    expect(() => normalizePlayers(makePlayers(3), 4)).toThrow(/missing/i);
    expect(() => normalizePlayers(makePlayers(5), 4.5)).toThrow();
  });
  it('fills empty names, trims, and de-duplicates case-insensitively', () => {
    const input = [{ id: 'a', name: '   ' }, { id: 'b', name: '  Asha   Rao ' }, { id: 'c', name: 'asha rao' }, { id: 'd', name: 'Zed' }];
    expect(normalizePlayers(input, 3).map(p => p.name)).toEqual(['Player 1', 'Asha Rao', 'asha rao (2)']);
  });
  it('only returns the first `count` players', () => {
    expect(normalizePlayers(makePlayers(8), 4)).toHaveLength(4);
  });
});

describe('assignRoles', () => {
  it('assigns exactly the requested imposters, and only civilians get the word', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { word: w, roles } = assignRoles(makePlayers(7), pool, 3, seeded(seed));
      expect(roles.filter(r => r.isImposter)).toHaveLength(3);
      roles.forEach(r => (r.isImposter ? expect(r.word).toBeUndefined() : expect(r.word).toBe(w)));
      expect(pool).toContain(w);
    }
  });
  it('picks every player as imposter eventually (no positional bias)', () => {
    const hits = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) assignRoles(makePlayers(4), pool, 1, seeded(seed)).roles.forEach(r => r.isImposter && hits.add(r.playerId));
    expect(hits.size).toBe(4);
  });
  it('rejects invalid configurations', () => {
    expect(() => assignRoles(makePlayers(2), pool, 1)).toThrow();
    expect(() => assignRoles(makePlayers(13), pool, 1)).toThrow();
    expect(() => assignRoles(makePlayers(3), pool, 0)).toThrow();
    expect(() => assignRoles(makePlayers(3), pool, 2)).toThrow(/imposter/);
    expect(() => assignRoles(makePlayers(5), pool, 3)).toThrow();
    expect(() => assignRoles(makePlayers(5), pool, 1.5)).toThrow();
    expect(() => assignRoles(makePlayers(5), [], 1)).toThrow(/No words/);
    expect(() => assignRoles([...makePlayers(3).slice(0, 2), { id: 'p1', name: 'dup' }], pool, 1)).toThrow(/unique/);
  });
  it('does not mutate the player list or word pool', () => {
    const players = makePlayers(5);
    const snapshot = JSON.stringify([players, pool]);
    assignRoles(players, pool, 2, seeded(3));
    expect(JSON.stringify([players, pool])).toBe(snapshot);
  });
});

describe('castVote', () => {
  const ids = ['p1', 'p2', 'p3'];
  it('records a valid vote without mutating the old map', () => {
    const before = {};
    const after = castVote(before, 'p1', 'p2', ids);
    expect(after).toEqual({ p1: 'p2' });
    expect(before).toEqual({});
  });
  it('rejects self-votes, duplicate votes and unknown players', () => {
    expect(() => castVote({}, 'p1', 'p1', ids)).toThrow(/yourself/);
    expect(() => castVote({ p1: 'p2' }, 'p1', 'p3', ids)).toThrow(/already voted/);
    expect(() => castVote({}, 'p9', 'p1', ids)).toThrow();
    expect(() => castVote({}, 'p1', 'p9', ids)).toThrow();
    expect(() => castVote({}, 'p1', '', ids)).toThrow();
  });
});

describe('tallyVotes', () => {
  it('counts and flags ties', () => {
    expect(tallyVotes({ a: 'x', b: 'x', c: 'y' })).toMatchObject({ counts: { x: 2, y: 1 }, max: 2, tiedPlayers: ['x'], isTie: false });
    expect(tallyVotes({ a: 'x', b: 'y' }).isTie).toBe(true);
    expect(tallyVotes({}).isTie).toBe(true);
  });
});

describe('resolveRound', () => {
  it('single imposter caught when top-voted', () => {
    const r = resolveRound({ p1: 'p2', p3: 'p2', p2: 'p1' }, rolesFor(3, ['p2']));
    expect(r).toMatchObject({ outcome: 'caught', groupWins: true, accusedIds: ['p2'] });
  });
  it('single imposter escapes when someone else is top-voted', () => {
    expect(resolveRound({ p1: 'p3', p2: 'p3', p3: 'p1' }, rolesFor(3, ['p2']))).toMatchObject({ outcome: 'escaped', groupWins: false });
  });
  it('a tie for first means the imposter wins', () => {
    expect(resolveRound({ p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' }, rolesFor(4, ['p2']))).toMatchObject({ outcome: 'tie', groupWins: false, accusedIds: [] });
  });
  it('no votes at all is a tie', () => {
    expect(resolveRound({}, rolesFor(4, ['p2']))).toMatchObject({ outcome: 'tie', groupWins: false });
  });
  it('multiple imposters must all be singled out', () => {
    const roles = rolesFor(6, ['p1', 'p2']);
    expect(resolveRound({ p3: 'p1', p4: 'p1', p5: 'p2', p6: 'p2', p1: 'p3' }, roles)).toMatchObject({ outcome: 'caught', groupWins: true });
    expect(resolveRound({ p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p4', p1: 'p4' }, roles)).toMatchObject({ outcome: 'escaped', groupWins: false });
    expect(resolveRound({ p3: 'p1', p4: 'p1', p5: 'p2', p6: 'p4' }, roles).outcome).toBe('tie');
  });
});
