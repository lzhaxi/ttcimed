import dotenv from 'dotenv';
import { getSupabase, getActiveTournament } from './src/lib/supabase.js';
import { calcTopCutSize } from './src/utils/permissions.js';

dotenv.config({ path: '.dev.vars' });

async function seed() {
  const env = process.env;
  const supabase = getSupabase(env);
  
  // const guildId = env.GUILD_ID || '435629931641176094';
  const guildId = '435629931641176094';
  const targetTotal = parseInt(process.argv[2], 10) || 16;

  console.log(`Getting active tournament for guild ${guildId}...`);
  const tournament = await getActiveTournament(supabase, guildId);
  if (!tournament) {
    console.error(`No active tournament found for guild ${guildId}!`);
    return;
  }
  console.log(`Tournament ID: ${tournament.id}, Name: ${tournament.name}, Phase: ${tournament.phase}`);
  
  console.log(`Checking existing players...`);
  const { data: existingPlayers, error: countError } = await supabase
    .from('players')
    .select('id, discord_id')
    .eq('tournament_id', tournament.id);

  if (countError) throw countError;
  const existingCount = existingPlayers?.length ?? 0;
  const existingDiscordIds = new Set(existingPlayers?.map((p) => p.discord_id) || []);
  console.log(`Current player count in this tournament: ${existingCount}`);

  if (existingCount >= targetTotal) {
    console.log(`Tournament already has ${existingCount} players (target: ${targetTotal}). Top Cut Size: ${calcTopCutSize(existingCount)}.`);
    return;
  }

  const needed = targetTotal - existingCount;
  console.log(`Seeding ${needed} player(s) to reach ${targetTotal} total players (Target Top Cut: ${calcTopCutSize(targetTotal)})...`);

  const mockPlayers = [];
  const specificIds = [
    '272937604339466240',
    '616754792965865495',
    '340354052715970563',
    '1518108329723957371',
    '542488723128844312',
  ];

  let currentSeed = existingCount;

  // Insert specific bot users first (if not already registered in this tournament)
  for (let index = 0; index < specificIds.length; index++) {
    if (mockPlayers.length >= needed) break;
    const id = specificIds[index];
    if (!existingDiscordIds.has(id)) {
      currentSeed++;
      mockPlayers.push({
        tournament_id: tournament.id,
        discord_id: id,
        discord_username: `Bot User ${index + 1}`,
        seed: currentSeed,
        is_active: true,
      });
      existingDiscordIds.add(id);
    }
  }

  // Insert mock users to fill out the remaining target count
  const remainingNeeded = needed - mockPlayers.length;
  for (let i = 1; i <= remainingNeeded; i++) {
    currentSeed++;
    mockPlayers.push({
      tournament_id: tournament.id,
      discord_id: `mock_user_${Date.now()}_${i}`,
      discord_username: `Mock Player ${existingCount + mockPlayers.length + 1}`,
      seed: currentSeed,
      is_active: true,
    });
  }

  const { error: insertError } = await supabase
    .from('players')
    .insert(mockPlayers);

  if (insertError) {
    console.error('Error seeding players:', insertError);
  } else {
    const totalCount = existingCount + mockPlayers.length;
    console.log(`Successfully seeded ${mockPlayers.length} players! (Total: ${totalCount} players, Top Cut Size: ${calcTopCutSize(totalCount)})`);
  }
}

seed().catch(console.error);
