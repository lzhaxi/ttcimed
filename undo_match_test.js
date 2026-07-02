import dotenv from 'dotenv';
import { getSupabase, getActiveTournament } from './src/lib/supabase.js';
import { handleUndoMatchResult } from './src/handlers/undo-match-result.js';

dotenv.config({ path: '.dev.vars' });

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url.startsWith('https://discord.com/api')) {
    console.log(`\n📢 [MOCKED DISCORD API CALL]`);
    console.log(`Method: ${options.method || 'GET'}`);
    console.log(`URL: ${url}`);
    if (options.body) {
      console.log('Payload:', JSON.stringify(JSON.parse(options.body), null, 2));
    }
    return { ok: true, text: async () => 'OK', json: async () => ({}) };
  }
  return originalFetch(url, options);
};

async function test() {
  const env = process.env;
  const supabase = getSupabase(env);

  console.log('Fetching active tournament...');
  const tournament = await getActiveTournament(supabase, env.GUILD_ID);
  if (!tournament) {
    console.error('No active tournament found!');
    return;
  }
  console.log(`Active Tournament ID: ${tournament.id}, Phase: ${tournament.phase}, Round: ${tournament.current_round}`);

  const phase = tournament.phase === 'top_cut' ? 'top_cut' : 'swiss';
  
  // Find a completed or defaulted match in the database for the active round (ignoring byes)
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournament.id)
    .eq('round_number', tournament.current_round)
    .eq('phase', phase)
    .neq('status', 'pending')
    .not('player2_id', 'is', null)
    .limit(1);

  if (matchError) throw matchError;

  if (!matches || matches.length === 0) {
    console.log('No completed or defaulted matches found in the current round to undo.');
    return;
  }

  const match = matches[0];
  const p1 = match.player1;
  const p2 = match.player2;

  console.log(`\nFound completed match to undo:`);
  console.log(`- Player 1: ${p1.discord_username} (${p1.discord_id})`);
  console.log(`- Player 2: ${p2.discord_username} (${p2.discord_id})`);
  console.log(`- Current status: ${match.status}, Score: ${match.player1_score} – ${match.player2_score}`);

  // Simulate /undo-match-result command
  const mockInteraction = {
    guild_id: env.GUILD_ID,
    token: 'mock_interaction_token',
    member: {
      user: { id: env.ADMIN_ID } // Executes command as admin
    },
    data: {
      name: 'undo-match-result',
      options: [
        { name: 'player_1', value: p1.discord_id },
        { name: 'player_2', value: p2.discord_id }
      ]
    }
  };

  console.log('\nRunning handleUndoMatchResult...');
  await handleUndoMatchResult(mockInteraction, env);
  
  // Check the match status in database afterwards
  const { data: checkMatch } = await supabase
    .from('matches')
    .select('*')
    .eq('id', match.id)
    .single();
  console.log('\nDatabase Check (after undo) status:', checkMatch.status); // Expected: "pending"
  
  const { data: updatedPlayers } = await supabase
    .from('players')
    .select('discord_username, game_wins, game_losses')
    .in('id', [p1.id, p2.id]);

  console.log('\nChecking updated game wins:');
  for (const player of updatedPlayers) {
    const totalGames = player.game_wins + player.game_losses;
    const winPct = totalGames > 0 ? ((player.game_wins / totalGames) * 100).toFixed(0) : 0;
    console.log(`- ${player.discord_username}: ${player.game_wins}W - ${player.game_losses}L (${winPct}%)`);
  }

  console.log('\nExecution complete.');
}

test().catch(console.error);
