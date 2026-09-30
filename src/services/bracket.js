import { sortByStandings } from './swiss.js';

/**
 * Generates standard tournament bracket seed pairs for any power-of-2 size (e.g. 4, 8, 16).
 * Ensures higher seeds meet lower seeds in round 1, and seeds are separated so that #1 and #2
 * can only meet in the Finals, #1 vs #4 and #2 vs #3 can only meet in Semifinals, etc.
 *
 * For size = 4:  [[1, 4], [2, 3]]
 * For size = 8:  [[1, 8], [4, 5], [3, 6], [2, 7]]
 * For size = 16: [[1, 16], [8, 9], [5, 12], [4, 13], [3, 14], [6, 11], [7, 10], [2, 15]]
 */
export function getBracketSeedPairs(topCutSize) {
  const size = Math.max(2, 2 ** Math.round(Math.log2(topCutSize || 4)));
  let pls = [1, 2];
  const rounds = Math.log2(size) - 1;
  for (let i = 0; i < rounds; i++) {
    const nextPls = [];
    const sum = pls.length * 2 + 1;
    for (let j = 0; j < pls.length; j += 2) {
      nextPls.push(pls[j]);
      nextPls.push(sum - pls[j]);
      nextPls.push(sum - pls[j + 1]);
      nextPls.push(pls[j + 1]);
    }
    pls = nextPls;
  }
  const pairs = [];
  for (let i = 0; i < pls.length; i += 2) {
    const s1 = Math.min(pls[i], pls[i + 1]);
    const s2 = Math.max(pls[i], pls[i + 1]);
    pairs.push([s1, s2]);
  }
  return pairs;
}

/** Seed top N players into a single-elimination bracket using standard bracket seeding */
export function seedTopCutBracket(players, topCutSize) {
  const seeded = sortByStandings(players).slice(0, topCutSize);
  const seedPairs = getBracketSeedPairs(topCutSize);
  return seedPairs.map(([s1, s2]) => [seeded[s1 - 1], seeded[s2 - 1]]);
}

export function buildTopCutRoundOneRows(tournamentId, pairs) {
  return pairs.map(([p1, p2], idx) => ({
    tournament_id: tournamentId,
    round_number: 1,
    phase: 'top_cut',
    player1_id: p1.id,
    player2_id: p2.id,
    bracket_slot: idx,
    status: 'pending',
  }));
}

/** Given completed top-cut matches in a round, build next-round pairings */
export function buildNextBracketRound(tournamentId, completedMatches, nextRound) {
  const winners = completedMatches
    .sort((a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0))
    .map((m) => {
      const winner =
        m.winner_id === m.player1_id ? m.player1 : m.winner_id === m.player2_id ? m.player2 : null;
      return { ...winner, bracket_slot: m.bracket_slot };
    })
    .filter(Boolean);

  const pairs = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    pairs.push([winners[i], winners[i + 1]]);
  }

  return pairs.map(([p1, p2], idx) => ({
    tournament_id: tournamentId,
    round_number: nextRound,
    phase: 'top_cut',
    player1_id: p1.id,
    player2_id: p2.id,
    bracket_slot: idx,
    status: 'pending',
  }));
}

export function isRoundComplete(matches) {
  return matches.length > 0 && matches.every((m) => m.status !== 'pending');
}
