import dotenv from 'dotenv';
import { getSupabase, getActiveTournament } from './src/lib/supabase.js';

dotenv.config({ path: '.dev.vars' });

async function seed() {
  const env = process.env;
  const supabase = getSupabase(env);
  
  const guildId = env.GUILD_ID || "mock_guild_123";
  console.log(`Getting active tournament for guild ${guildId}...`);
  const tournament = await getActiveTournament(supabase, guildId);
  console.log(`Tournament ID: ${tournament.id}, Name: ${tournament.name}, Phase: ${tournament.phase}`);
  
  console.log(`Checking existing players count...`);
  const { count: existingCount, error: countError } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id);

  if (countError) throw countError;
  console.log(`Current player count in this tournament: ${existingCount}`);

  console.log(`Seeding 9 players into tournament...`);
  const mockPlayers = [];
  const specificIds = [
    '272937604339466240',
    '616754792965865495',
    '340354052715970563',
    '1518108329723957371',
    '542488723128844312'
  ];

  // Insert the 5 specific bot users
  specificIds.forEach((id, index) => {
    mockPlayers.push({
      tournament_id: tournament.id,
      discord_id: id,
      discord_username: `Bot User ${index + 1}`,
      seed: (existingCount ?? 0) + index + 1,
      is_active: true
    });
  });

  // Insert 3 mock users
  for (let i = 1; i <= 3; i++) {
    mockPlayers.push({
      tournament_id: tournament.id,
      discord_id: `mock_user_${Date.now()}_${i}`,
      discord_username: `Mock Player ${i}`,
      seed: (existingCount ?? 0) + specificIds.length + i,
      is_active: true
    });
  }

  const { error: insertError } = await supabase
    .from('players')
    .insert(mockPlayers);

  if (insertError) {
    console.error('Error seeding players:', insertError);
  } else {
    console.log('Successfully seeded 9 players!');
  }
}

seed().catch(console.error);
