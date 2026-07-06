/** @returns {boolean} true if these two players have already met */
function havePlayed(playerAId, playerBId, previousMatches) {
  return previousMatches.some(
    (m) =>
      m.player2_id &&
      ((m.player1_id === playerAId && m.player2_id === playerBId) ||
        (m.player1_id === playerBId && m.player2_id === playerAId))
  );
}

function pairGroup(group, previousMatches) {
  const pairs = [];
  const used = new Set();
  const sorted = [...group];

  let left = 0;
  let right = sorted.length - 1;

  while (left < right) {
    let a = sorted[left];
    let b = sorted[right];

    if (havePlayed(a.id, b.id, previousMatches)) {
      let swapped = false;
      for (let k = right - 1; k > left; k--) {
        if (!havePlayed(a.id, sorted[k].id, previousMatches)) {
          [sorted[k], sorted[right]] = [sorted[right], sorted[k]];
          b = sorted[right];
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        for (let k = left + 1; k < right; k++) {
          if (!havePlayed(sorted[k].id, b.id, previousMatches)) {
            [sorted[k], sorted[left]] = [sorted[left], sorted[k]];
            a = sorted[left];
            swapped = true;
            break;
          }
        }
      }
    }

    pairs.push([a, b]);
    used.add(a.id);
    used.add(b.id);
    left++;
    right--;
  }

  const unpaired = sorted.filter((p) => !used.has(p.id));
  return { pairs, unpaired };
}

export function sortByStandings(players) {
  return [...players].sort((a, b) => {
    if (b.swiss_wins !== a.swiss_wins) return b.swiss_wins - a.swiss_wins;
    if (Number(b.buchholz) !== Number(a.buchholz)) return Number(b.buchholz) - Number(a.buchholz);
    if (Number(b.owp) !== Number(a.owp)) return Number(b.owp) - Number(a.owp);
    
    // ponytail: added game win % tiebreaker from history.js
    const gwA = (a.game_wins + a.game_losses) > 0 ? a.game_wins / (a.game_wins + a.game_losses) : 0;
    const gwB = (b.game_wins + b.game_losses) > 0 ? b.game_wins / (b.game_wins + b.game_losses) : 0;
    if (gwB !== gwA) return gwB - gwA;
    
    return (a.seed ?? 9999) - (b.seed ?? 9999);
  });
}

/** Round 1: shuffle and pair adjacent players */
export function pairRoundOne(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  const bye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;
  return { pairs, bye };
}

/** Swiss rounds 2+: Dutch-style pairing within score groups */
export function pairSwissRound(players, previousMatches) {
  const sorted = sortByStandings(players);
  const groups = new Map();
  for (const p of sorted) {
    const key = p.swiss_wins;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const allPairs = [];
  let carryOver = [];

  for (const wins of [...groups.keys()].sort((a, b) => b - a)) {
    const group = [...carryOver, ...groups.get(wins)];
    carryOver = [];
    const { pairs, unpaired } = pairGroup(group, previousMatches);
    allPairs.push(...pairs);
    if (unpaired.length) carryOver.push(...unpaired);
  }

  let bye = null;
  if (carryOver.length === 1) {
    bye = carryOver[0];
  } else if (carryOver.length > 1) {
    const { pairs, unpaired } = pairGroup(carryOver, previousMatches);
    allPairs.push(...pairs);
    if (unpaired.length === 1) bye = unpaired[0];
  }

  return { pairs: allPairs, bye };
}

export function buildSwissMatchRows(tournamentId, round, pairs, bye) {
  const rows = pairs.map(([p1, p2]) => ({
    tournament_id: tournamentId,
    round_number: round,
    phase: 'swiss',
    player1_id: p1.id,
    player2_id: p2.id,
    status: 'pending',
  }));

  if (bye) {
    rows.push({
      tournament_id: tournamentId,
      round_number: round,
      phase: 'swiss',
      player1_id: bye.id,
      player2_id: null,
      winner_id: bye.id,
      player1_score: 1,
      player2_score: 0,
      status: 'completed',
      completed_at: new Date().toISOString(),

    });
  }

  return rows;
}

export function generatePairings(players, previousMatches, round) {
  if (round === 1) return pairRoundOne(players);
  return pairSwissRound(players, previousMatches);
}
