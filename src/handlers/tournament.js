import { editReply, userError, sendFollowup } from '../lib/discord.js';
import { getSupabase, getActiveTournament } from '../lib/supabase.js';
import { standingsEmbed, bracketEmbed } from '../utils/embeds.js';

export async function handleTournament(interaction, env) {
  const supabase = getSupabase(env);

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament) {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    if (tournament.phase === 'top_cut' || tournament.phase === 'completed') {
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
        .eq('tournament_id', tournament.id)
        .eq('phase', 'top_cut')
        .order('round_number', { ascending: true })
        .order('bracket_slot', { ascending: true });

      if (error) throw error;

      if (!matches || matches.length === 0) {
        await editReply(env, interaction, { content: 'No single-elimination bracket exists for this tournament yet.' });
        return;
      }

      await editReply(env, interaction, { content: 'Done' });
      await sendFollowup(env, interaction, {
        embeds: [bracketEmbed(tournament, matches)],
      });
      return;
    }

    // Otherwise Swiss standings
    const { data: allPlayers, error } = await supabase
      .from('players')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('swiss_wins', { ascending: false })
      .order('buchholz', { ascending: false })
      .order('owp', { ascending: false });

    if (error) throw error;

    const players = allPlayers?.filter(p => p.is_active) ?? [];
    const dqPlayers = allPlayers?.filter(p => !p.is_active) ?? [];

    // Apply Game Win Percentage as 3rd tiebreaker (after OWP)
    if (players) {
      players.sort((a, b) => {
        if (a.swiss_wins !== b.swiss_wins) return b.swiss_wins - a.swiss_wins;
        if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
        if (a.owp !== b.owp) return b.owp - a.owp;

        const gwA = (a.game_wins + a.game_losses) > 0 ? a.game_wins / (a.game_wins + a.game_losses) : 0;
        const gwB = (b.game_wins + b.game_losses) > 0 ? b.game_wins / (b.game_wins + b.game_losses) : 0;
        
        return gwB - gwA;
      });
    }

    await editReply(env, interaction, { content: 'Done' });
    await sendFollowup(env, interaction, {
      embeds: [standingsEmbed(tournament, players, dqPlayers)],
    });
  } catch (err) {
    console.error('tournament command error:', err);
    await editReply(env, interaction, {
      content: `Could not load tournament status. Please try again later.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}
