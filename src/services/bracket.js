import { sortByStandings } from './swiss.js';

/** Seed top N players into a single-elimination bracket (1 vs N, 2 vs N-1, ...) */
export function seedTopCutBracket(players, topCutSize) {
  const seeded = sortByStandings(players).slice(0, topCutSize);

  const pairs = [];
  for (let i = 0; i < seeded.length / 2; i++) {
    pairs.push([seeded[i], seeded[seeded.length - 1 - i]]);
  }
  return pairs;
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
