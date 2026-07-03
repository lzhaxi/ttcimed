import { editReply, getOption, getUser, userError, resolveEphemeral, sendChannelMessage } from '../lib/discord.js';
import { getSupabase, getActiveTournament } from '../lib/supabase.js';
import { isTournamentOrganizer } from '../utils/permissions.js';
import { undoEmbed } from '../utils/embeds.js';

export async function handleUndoMatchResult(interaction, env) {
  const user = getUser(interaction);
  const p1Discord = getOption(interaction, 'player_1');
  const p2Discord = getOption(interaction, 'player_2');
  const supabase = getSupabase(env);

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament || tournament.phase === 'registration') {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    if (!await isTournamentOrganizer(interaction, env, supabase)) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    const { data: p1 } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('discord_id', p1Discord)
      .maybeSingle();

    const { data: p2 } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('discord_id', p2Discord)
      .maybeSingle();

    if (!p1 || !p2) {
      await editReply(env, interaction, { content: 'No match found with those players.' });
      return;
    }

    const targetPhase = tournament.phase === 'completed' ? 'top_cut' : tournament.phase;
    const targetRound = tournament.current_round;

    const { data: match } = await supabase
      .from('matches')
      .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
      .eq('tournament_id', tournament.id)
      .eq('phase', targetPhase)
      .eq('round_number', targetRound)
      .neq('status', 'pending')
      .or(
        `and(player1_id.eq.${p1.id},player2_id.eq.${p2.id}),and(player1_id.eq.${p2.id},player2_id.eq.${p1.id})`
      )
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!match) {
      await editReply(env, interaction, { content: 'No completed match found between those players in the **current** active round. You cannot undo matches from previous rounds.' });
      return;
    }

    if (match.status === 'pending') {
      await editReply(env, interaction, { content: 'This match has not been reported yet.' });
      return;
    }

    const { data: result, error } = await supabase.rpc('undo_match_result', {
      p_match_id: match.id,
      p_admin_discord_id: user.id,
    });

    if (error) throw error;
    if (!result?.ok) {
      await editReply(env, interaction, { content: userError(result.error) });
      return;
    }

    const embed = undoEmbed(match);
    await resolveEphemeral(env, interaction);
    await sendChannelMessage(env, interaction, { embeds: [embed] });
  } catch (err) {
    console.error('undo-match-result error:', err);
    await editReply(env, interaction, {
      content: 'Could not undo match result. Please try again.',
    });
  }
}
