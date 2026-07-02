import { editReply, EPHEMERAL } from '../lib/discord.js';

export async function handleRules(interaction, env) {
  const rulesText = [
    '**Tournament Rules**',
    'Official rules here: https://www.pongfit.org/official-rules-of-table-tennis. Of note:',
    '- All games to 11 points, best of 5',
    '- All games are played at MSB by default, but you can agree to play elsewhere.',
    '- Switch sides every game.',
    '- Ceiling, walls are not allowed. The corner protector on the MSB table is NOT considered part of the table.',
    '- Serves must be tossed up at least 6 inches, with no spin, behind the table (leeway for newer players).',
    '- Only one player needs to report the result.',
    '- Forfeits should be reported as 3-0.',
    '- If a match is not played by the deadline, a winner will be decided for you. If you have attempted to schedule with your opponent but your opponent has failed to respond, please ping or DM the tournament organizer with screenshots - you will likely be granted the win.',
    '*Tournament Format*',
    '- Format is swiss followed by a single-elimination bracket. The number of rounds of swiss is determined by the number of participants.',
    '- Swiss is a format used so everyone can play as many competitive games as possible. In the first round, players are randomly paired, and subsequent round pairings depend on your win-loss record.',
    '- After swiss, the top players proceed to the single-elimination bracket. The number of players in the bracket is determined by the total number of participants. There are tiebreakers that may apply to determine the top players.',
    '  - Tiebreaker 1: Buchholz (BH), or total sets your opponents have won.',
    '  - Tiebreaker 2: Opponent win percentage (OWP), or the average of the winning percentages of the opponents you have played.',
    '  - Tiebreaker 3: Game win percentage (GW).'
  ].join('\n');

  await editReply(env, interaction, { content: rulesText, flags: 64 });
}
