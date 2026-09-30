import assert from 'node:assert';
import {
  getBracketSeedPairs,
  seedTopCutBracket,
  buildTopCutRoundOneRows,
  buildNextBracketRound,
} from './src/services/bracket.js';
import { getSingleEliminationRoundName, getMatchCode, calcTopCutSize } from './src/utils/permissions.js';
import { bracketEmbed, renderAsciiGrid, pairingsEmbed } from './src/utils/embeds.js';

console.log('Running Single Elimination Bracket & Seeding Tests...\n');

// TEST 1: calcTopCutSize logic
console.log('Test 1: calcTopCutSize');
assert.strictEqual(calcTopCutSize(4), 4);
assert.strictEqual(calcTopCutSize(8), 4);
assert.strictEqual(calcTopCutSize(9), 4);
assert.strictEqual(calcTopCutSize(15), 4);
assert.strictEqual(calcTopCutSize(16), 8);
assert.strictEqual(calcTopCutSize(24), 8);
assert.strictEqual(calcTopCutSize(31), 8);
assert.strictEqual(calcTopCutSize(32), 16);
console.log('✔ calcTopCutSize passed.');

// TEST 2: getBracketSeedPairs
console.log('\nTest 2: getBracketSeedPairs');
const pairs4 = getBracketSeedPairs(4);
assert.deepStrictEqual(pairs4, [[1, 4], [2, 3]]);

const pairs8 = getBracketSeedPairs(8);
assert.deepStrictEqual(pairs8, [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7],
]);

const pairs16 = getBracketSeedPairs(16);
assert.deepStrictEqual(pairs16, [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [3, 14],
  [6, 11],
  [7, 10],
  [2, 15],
]);
console.log('✔ getBracketSeedPairs passed for 4, 8, and 16 players.');

// TEST 3: seedTopCutBracket for 8 players
console.log('\nTest 3: seedTopCutBracket for Top 8');
const players8 = Array.from({ length: 8 }, (_, i) => ({
  id: `player-${i + 1}`,
  discord_id: `disc-${i + 1}`,
  discord_username: `Player${i + 1}`,
  seed: i + 1,
  swiss_wins: 8 - i,
  buchholz: 10,
  owp: 0.5,
  game_wins: 0,
  game_losses: 0,
}));

const qfPairs = seedTopCutBracket(players8, 8);
assert.strictEqual(qfPairs.length, 4);

// Check matchups
assert.strictEqual(qfPairs[0][0].seed, 1);
assert.strictEqual(qfPairs[0][1].seed, 8); // #1 vs #8
assert.strictEqual(qfPairs[1][0].seed, 4);
assert.strictEqual(qfPairs[1][1].seed, 5); // #4 vs #5
assert.strictEqual(qfPairs[2][0].seed, 3);
assert.strictEqual(qfPairs[2][1].seed, 6); // #3 vs #6
assert.strictEqual(qfPairs[3][0].seed, 2);
assert.strictEqual(qfPairs[3][1].seed, 7); // #2 vs #7
console.log('✔ seedTopCutBracket produces standard tournament QF matchups: 1v8, 4v5, 3v6, 2v7.');

// TEST 4: Round progression into Semifinals and Finals
console.log('\nTest 4: buildNextBracketRound into Semifinals');
const qfRows = buildTopCutRoundOneRows(100, qfPairs);

// Simulate QF winners (higher seeds win: 1, 4, 3, 2)
const completedQF = qfRows.map((row, idx) => {
  const p1 = qfPairs[idx][0];
  const p2 = qfPairs[idx][1];
  return {
    ...row,
    player1: p1,
    player2: p2,
    player1_score: 3,
    player2_score: 0,
    winner_id: p1.id,
    status: 'completed',
  };
});

// Build Semifinals (Round 2)
const sfRows = buildNextBracketRound(100, completedQF, 2);
assert.strictEqual(sfRows.length, 2);

// Semifinal slot 0 should be Winner(1v8) vs Winner(4v5) -> Seed 1 vs Seed 4
assert.strictEqual(sfRows[0].player1_id, 'player-1');
assert.strictEqual(sfRows[0].player2_id, 'player-4');
assert.strictEqual(sfRows[0].bracket_slot, 0);

// Semifinal slot 1 should be Winner(3v6) vs Winner(2v7) -> Seed 3 vs Seed 2
assert.strictEqual(sfRows[1].player1_id, 'player-3');
assert.strictEqual(sfRows[1].player2_id, 'player-2');
assert.strictEqual(sfRows[1].bracket_slot, 1);

console.log('✔ Semifinals are #1 vs #4, and #3 vs #2 (NOT #1 vs #2 and #3 vs #4)!');

// Simulate SF winners (Seed 1 and Seed 2 win)
const completedSF = [
  {
    ...sfRows[0],
    player1: players8[0],
    player2: players8[3],
    winner_id: 'player-1',
    status: 'completed',
  },
  {
    ...sfRows[1],
    player1: players8[2],
    player2: players8[1],
    winner_id: 'player-2',
    status: 'completed',
  },
];

// Build Finals (Round 3)
const finalRows = buildNextBracketRound(100, completedSF, 3);
assert.strictEqual(finalRows.length, 1);
assert.strictEqual(finalRows[0].player1_id, 'player-1');
assert.strictEqual(finalRows[0].player2_id, 'player-2');
assert.strictEqual(finalRows[0].bracket_slot, 0);
console.log('✔ Finals are #1 vs #2!');

// TEST 5: Match codes
console.log('\nTest 5: getMatchCode');
assert.strictEqual(getMatchCode(8, 1, 0), 'QF1');
assert.strictEqual(getMatchCode(8, 1, 1), 'QF2');
assert.strictEqual(getMatchCode(8, 1, 2), 'QF3');
assert.strictEqual(getMatchCode(8, 1, 3), 'QF4');
assert.strictEqual(getMatchCode(8, 2, 0), 'SF1');
assert.strictEqual(getMatchCode(8, 2, 1), 'SF2');
assert.strictEqual(getMatchCode(8, 3, 0), 'Final');
console.log('✔ getMatchCode passed.');

// TEST 6: bracketEmbed with ASCII tree and future projection
console.log('\nTest 6: bracketEmbed projection and ASCII visualizer');
const mockTournament = { id: 100, name: 'TTC Championship', top_cut_size: 8, phase: 'top_cut', current_round: 1 };

// Stage 1: Round 1 matches pending
const initialMatches = [
  { round_number: 1, bracket_slot: 0, player1_id: 'player-1', player2_id: 'player-8', player1: players8[0], player2: players8[7], status: 'pending' },
  { round_number: 1, bracket_slot: 1, player1_id: 'player-4', player2_id: 'player-5', player1: players8[3], player2: players8[4], status: 'pending' },
  { round_number: 1, bracket_slot: 2, player1_id: 'player-3', player2_id: 'player-6', player1: players8[2], player2: players8[5], status: 'pending' },
  { round_number: 1, bracket_slot: 3, player1_id: 'player-2', player2_id: 'player-7', player1: players8[1], player2: players8[6], status: 'pending' },
];

const embedStage1 = bracketEmbed(mockTournament, initialMatches);
assert.strictEqual(embedStage1.fields.length, 3);
assert.strictEqual(embedStage1.fields[0].name, 'Quarterfinals');
assert.strictEqual(embedStage1.fields[1].name, 'Semifinals');
assert.strictEqual(embedStage1.fields[2].name, 'Finals');

// In Semifinals field, check projection
assert(embedStage1.fields[1].value.includes('Winner of QF1 vs Winner of QF2'), 'SF1 should project Winner of QF1 vs Winner of QF2');
assert(embedStage1.fields[1].value.includes('Winner of QF3 vs Winner of QF4'), 'SF2 should project Winner of QF3 vs Winner of QF4');
// In Finals field, check projection
assert(embedStage1.fields[2].value.includes('Winner of SF1 vs Winner of SF2'), 'Final should project Winner of SF1 vs Winner of SF2');

// Check that ASCII art is in description
assert(embedStage1.description.startsWith('```text\n'));
assert(embedStage1.description.includes('QUARTERFINALS'));
assert(embedStage1.description.includes('SEMIFINALS'));
assert(embedStage1.description.includes('FINALS'));
console.log('✔ bracketEmbed successfully projects all rounds from Round 1 with ASCII visualization!');

// Stage 2: QF1 is completed
initialMatches[0].status = 'completed';
initialMatches[0].winner_id = 'player-1';
initialMatches[0].player1_score = 3;
initialMatches[0].player2_score = 1;

const embedStage2 = bracketEmbed(mockTournament, initialMatches);
// Semifinals should now reflect Player 1 vs Winner of QF2!
assert(embedStage2.fields[1].value.includes('(#1) <@disc-1> vs Winner of QF2'), 'SF1 should update to (#1) <@disc-1> vs Winner of QF2');
// Stage 3: projectFuture: false (used by next-round initial embed)
const embedNextRound = bracketEmbed(mockTournament, initialMatches, { projectFuture: false });
assert.strictEqual(embedNextRound.fields.length, 1);
assert.strictEqual(embedNextRound.fields[0].name, 'Quarterfinals');
assert.strictEqual(embedNextRound.fields.some(f => f.name === 'Semifinals'), false, 'Semifinals should be omitted when projectFuture: false in Round 1');
assert.strictEqual(embedNextRound.fields.some(f => f.name === 'Finals'), false, 'Finals should be omitted when projectFuture: false in Round 1');
console.log('✔ bracketEmbed with projectFuture: false omits future "winner of ___" round fields for next-round!');

// TEST 7: next-round embed (bracket visual visible for whole bracket, fields contain ONLY upcoming round)
console.log('\nTest 7: next-round bracketEmbed with currentRoundOnly: true');
const qfTournament = { name: 'TTC Championship', top_cut_size: 8, phase: 'top_cut', current_round: 1, round_deadline: new Date(Date.now() + 604800000).toISOString() };
const qfEmbed = bracketEmbed(qfTournament, initialMatches, { currentRoundOnly: true });

// Visual must be present for whole bracket in description
assert(qfEmbed.description.startsWith('```text\n'));
assert(qfEmbed.description.includes('QUARTERFINALS'));
assert(qfEmbed.description.includes('SEMIFINALS'));
assert(qfEmbed.description.includes('FINALS'));

// Fields must contain ONLY the upcoming matches (Quarterfinals) and Deadline
assert.strictEqual(qfEmbed.fields.length, 2);
assert.strictEqual(qfEmbed.fields[0].name, 'Quarterfinals');
assert(qfEmbed.fields[0].value.includes('**QF1:**'));
assert(qfEmbed.fields[0].value.includes('**QF2:**'));
assert.strictEqual(qfEmbed.fields[1].name, 'Deadline');
assert(!qfEmbed.fields.some(f => f.name === 'Semifinals'));
assert(!qfEmbed.fields.some(f => f.name === 'Finals'));
console.log('✔ next-round Round 1 embed contains whole bracket visual and ONLY upcoming QF matches + deadline!');

// Advance to Semifinals (Round 2)
const sfTournament = { name: 'TTC Championship', top_cut_size: 8, phase: 'top_cut', current_round: 2, round_deadline: new Date(Date.now() + 604800000).toISOString() };
const allMatchesUpToSF = [
  ...completedQF,
  { round_number: 2, bracket_slot: 0, player1_id: 'player-1', player2_id: 'player-4', player1: players8[0], player2: players8[3], status: 'pending' },
  { round_number: 2, bracket_slot: 1, player1_id: 'player-3', player2_id: 'player-2', player1: players8[2], player2: players8[1], status: 'pending' },
];

const sfNextRoundEmbed = bracketEmbed(sfTournament, allMatchesUpToSF, { currentRoundOnly: true });
// Bracket visual present
assert(sfNextRoundEmbed.description.startsWith('```text\n'));
assert(sfNextRoundEmbed.description.includes('QUARTERFINALS'));
assert(sfNextRoundEmbed.description.includes('SEMIFINALS'));
assert(sfNextRoundEmbed.description.includes('FINALS'));

// Fields must contain ONLY upcoming Semifinals matches and Deadline (NO previous round Quarterfinals history!)
assert.strictEqual(sfNextRoundEmbed.fields.length, 2);
assert.strictEqual(sfNextRoundEmbed.fields[0].name, 'Semifinals');
assert(sfNextRoundEmbed.fields[0].value.includes('**SF1:** ⏳ (#1) <@disc-1> vs (#4) <@disc-4>'));
assert(sfNextRoundEmbed.fields[0].value.includes('**SF2:** ⏳ (#3) <@disc-3> vs (#2) <@disc-2>'));
assert.strictEqual(sfNextRoundEmbed.fields[1].name, 'Deadline');
assert(!sfNextRoundEmbed.fields.some(f => f.name === 'Quarterfinals'), 'Quarterfinals history must NOT be in next-round embed fields');
assert(!sfNextRoundEmbed.fields.some(f => f.name === 'Finals'), 'Finals projection must NOT be in next-round embed fields');
console.log('✔ next-round Semifinals embed contains whole bracket visual, NO previous round history, and ONLY upcoming SF matches + deadline!');

// Tournament command (/tournament) with the same state shows BOTH bracket visual and ALL individual matches
const sfTournamentEmbed = bracketEmbed(sfTournament, allMatchesUpToSF, { currentRoundOnly: false });
assert(sfTournamentEmbed.description.startsWith('```text\n'));
assert.strictEqual(sfTournamentEmbed.fields.length, 3);
assert.strictEqual(sfTournamentEmbed.fields[0].name, 'Quarterfinals'); // Past history included
assert(sfTournamentEmbed.fields[0].value.includes('🟢'));
assert.strictEqual(sfTournamentEmbed.fields[1].name, 'Semifinals');   // Upcoming matches included
assert.strictEqual(sfTournamentEmbed.fields[2].name, 'Finals');       // Future projection included
console.log('✔ /tournament command shows whole bracket visual AND all individual matches (past history, upcoming, and projections)!');

console.log('\nAll tests completed successfully! 🎉');
