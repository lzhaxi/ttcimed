import dotenv from 'dotenv';
import { getSupabase, getActiveTournament } from './src/lib/supabase.js';
import { handleForceMatchWinner } from './src/handlers/force-match-winner.js';

dotenv.config({ path: '.dev.vars' });

// Mock Discord API calls to prevent invalid token errors, while allowing Supabase calls to pass through
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
    console.error('No active tournament found! Run /tournament-start first in Discord or database.');
    return;
  }
  console.log(`Active Tournament ID: ${tournament.id}, Phase: ${tournament.phase}, Round: ${tournament.current_round}`);

  // Get the first pending match in the database for the active round
  const phase = tournament.phase === 'top_cut' ? 'top_cut' : 'swiss';
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournament.id)
    .eq('round_number', tournament.current_round)
    .eq('phase', phase)
    .eq('status', 'pending')
    .limit(1);

  if (matchError) throw matchError;
  
  if (!matches || matches.length === 0) {
    console.log('No pending matches found in the current round. Make sure to generate pairings first.');
    return;
  }

  const match = matches[0];
  const p1 = match.player1;
  const p2 = match.player2;

  console.log(`\nFound pending match:`);
  console.log(`- Player 1: ${p1.discord_username} (${p1.discord_id})`);
  console.log(`- Player 2: ${p2.discord_username} (${p2.discord_id})`);

  // Simulate /force-match-winner interaction
  const mockInteraction = {
    guild_id: env.GUILD_ID,
    token: 'mock_interaction_token',
    member: {
      user: { id: env.ADMIN_ID } // Executes command as admin
    },
    data: {
      name: 'force-match-winner',
      options: [
        { name: 'player_1', value: p1.discord_id },
        { name: 'player_2', value: p2.discord_id },
        { name: 'winner', value: p1.discord_id }, // Set player 1 as the winner
      ]
    }
  };

  console.log('\nRunning handleForceMatchWinner...');
  await handleForceMatchWinner(mockInteraction, env);
  console.log('\nExecution complete. Checking updated game wins...');

  const { data: updatedPlayers } = await supabase
    .from('players')
    .select('discord_username, game_wins, game_losses')
    .in('id', [p1.id, p2.id]);

  for (const player of updatedPlayers) {
    const totalGames = player.game_wins + player.game_losses;
    const winPct = totalGames > 0 ? ((player.game_wins / totalGames) * 100).toFixed(0) : 0;
    console.log(`- ${player.discord_username}: ${player.game_wins}W - ${player.game_losses}L (${winPct}%)`);
  }
}

test().catch(console.error);
