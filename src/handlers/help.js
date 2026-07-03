import { editReply } from '../lib/discord.js';
import { COMMAND_MAP } from '../commands.js';

export async function handleHelp(interaction, env) {
  const cmd = interaction.data.options?.[0]?.value;

  if (!cmd) {
    const names = Object.values(COMMAND_MAP)
      .map((c) => `**/${c.name}** — ${c.description}`)
      .join('\n');

    const message = `Available commands:\n${names}\n\nUse /help command:<name> for details about a single command.`;
    await editReply(env, interaction, { content: message, flags: 64 });
    return;
  }

  const command = COMMAND_MAP[cmd];
  if (!command) {
    await editReply(env, interaction, { content: `Unknown command: ${cmd}`, flags: 64 });
    return;
  }

  const options = (command.options || []).map((o) => `- ${o.name}: ${o.description} ${o.required ? '(required)' : ''}`).join('\n') || 'No options.';
  
  let additionalHelp = '';
  switch (cmd) {
    case 'register':
      additionalHelp = 'Use /register to register for the tournament. You may only register for the tournament prior to the deadline the tournament organizer has indicated. If the tournament has started, you cannot register.';
      break;
    case 'report-score' || 'report':
      additionalHelp = 'Use /report-score [opponent] [your-score] [opponent\'s score] to report the result of your own match. To select your opponent, after typing /report-score, start typing their name and select them from the dropdown. Then, report your score followed by their score; e.g. if you won the match 3-1, you should report 3-1, and if you lost the match 1-3, you should report 1-3. You must play your match and report it prior to the Sunday midnight deadline. Please see /rules or ping the tournament organizer if you need help or have other issues.';
      break;
    case 'my-match':
      additionalHelp = 'Use /my-match to view your current match details, including your opponent and the match status. The message will only be visible to you.';
      break;
    case 'tournament':
      additionalHelp = 'Use /tournament to view the current progress of the tournament. During the Swiss rounds, this returns the standings leaderboard with records and tiebreakers. During the single-elimination bracket rounds, this returns the bracket visualization with matches and results.';
      break;
    case 'start-tournament':
      additionalHelp = 'TO Only. Start the tournament with a tournament name for identification. This will automatically send the round 1 pairings and end registration.';
      break;
    case 'force-match-winner' || 'force':
      additionalHelp = 'TO Only. When needed, force a match between two specific players to have a random or specific winner. For a specific winner, you need the optional winner argument. Without the winner argument, when the tournament is in the swiss stage, the winner is randomly decided, and when the tournament is in the elimination bracket stage, the winner is the higher seed.';
      break;
    case 'undo-match-result' || 'undo':
      additionalHelp = 'TO Only. Undo a match between two specific players for the current round. Cannot undo if the round has already progressed beyond the match.';
      break;
    case 'next-round':
      additionalHelp = 'TO Only. Progress to the next round. If there are pending matches, use force = True to randomize the winner of each match. If the current round is the final round of swiss, this will progress to the elimination bracket. You can optionally use extend_deadline = True to push the new round\'s deadline to the Sunday after the upcoming one (useful if you progress a round early mid-week and want to give players a full week+ to play).';
      break;
    case 'to-add':
      additionalHelp = 'TO Only. Add a tournament organizer.';
      break;
    case 'to-remove':
      additionalHelp = 'TO Only. Remove a tournament organizer.';
      break;
    case 'cancel-tournament':
      additionalHelp = 'TO Only. Cancel the tournament. This will remove all players and matches from the tournament. Use cautiously.';
      break;
    case 'rules':
      additionalHelp = 'Use /rules to view the official rules of the tournament. These rules include the official rules of table tennis, with a few modifications for the sake of the tournament. Please read the rules carefully so that the tournament runs as smoothly as possible.';
      break;
    case 'history':
      additionalHelp = 'Use /history [subcommand] to view past data for a tournament. Subcommands are:\n- `/history player user:@player [tournament:id]` — View complete match results and stats for that player.\n- `/history standings [tournament:id]` — View the final Swiss standings with tiebreakers.\n- `/history bracket [tournament:id]` — View the single-elimination bracket.';
      break;
    case 'tournaments':
      additionalHelp = 'List all tournaments played in this server along with their IDs, names, dates created, and current phases.';
      break;
  }

  const detail = `/${command.name} — ${command.description}\n\nOptions:\n${options}${additionalHelp ? '\n\n' + additionalHelp : ''}`;
  await editReply(env, interaction, { content: detail, flags: 64 });
}
