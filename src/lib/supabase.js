import { createClient } from '@supabase/supabase-js';

export function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getActiveTournament(supabase, guildId) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('guild_id', guildId)
    .neq('phase', 'completed')
    .maybeSingle();

  if (error) throw error;
  return data;
}



export async function getPlayerByDiscordId(supabase, tournamentId, discordId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('discord_id', discordId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPlayers(supabase, tournamentId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('is_active', true)
    .order('seed', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function getAllMatches(supabase, tournamentId) {
  const { data, error } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournamentId);

  if (error) throw error;
  return data ?? [];
}

export async function getRoundMatches(supabase, tournamentId, round, phase) {
  const { data, error } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournamentId)
    .eq('round_number', round)
    .eq('phase', phase);

  if (error) throw error;
  return data ?? [];
}

export async function getPendingMatchForPlayer(supabase, tournamentId, discordId, round, phase) {
  const player = await getPlayerByDiscordId(supabase, tournamentId, discordId);
  if (!player) return null;

  const { data, error } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournamentId)
    .eq('round_number', round)
    .eq('phase', phase)
    .eq('status', 'pending')
    .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
    .maybeSingle();

  if (error) throw error;
  return data;
}



export async function findMatchBetween(supabase, tournamentId, discordId1, discordId2, round, phase, status = null) {
  const p1 = await getPlayerByDiscordId(supabase, tournamentId, discordId1);
  const p2 = await getPlayerByDiscordId(supabase, tournamentId, discordId2);
  if (!p1 || !p2) return null;

  let query = supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournamentId)
    .eq('round_number', round)
    .eq('phase', phase);
    
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query
    .or(
      `and(player1_id.eq.${p1.id},player2_id.eq.${p2.id}),and(player1_id.eq.${p2.id},player2_id.eq.${p1.id})`
    )
    .maybeSingle();

  if (error) throw error;
  return data;
}
