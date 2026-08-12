import { editReply, getOption, getUser, userError, sendChannelMessage, resolveEphemeral } from '../lib/discord.js';
import { getSupabase, getActiveTournament, getPendingMatchForPlayer } from '../lib/supabase.js';
import { isTournamentOrganizer, matchPhaseForTournament } from '../utils/permissions.js';

export async function handleDq(interaction, env) {
  const user = getUser(interaction);
  const targetDiscordId = getOption(interaction, 'player');
  const supabase = getSupabase(env);

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament || tournament.phase === 'completed') {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    if (!await isTournamentOrganizer(interaction, env, supabase)) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    // 1. Get the player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('discord_id', targetDiscordId)
      .maybeSingle();

    if (playerError) throw playerError;

    if (!player) {
      await editReply(env, interaction, { content: 'That user is not registered in the current tournament.' });
      return;
    }

    if (!player.is_active) {
      await editReply(env, interaction, { content: 'That player is already disqualified or dropped from the tournament.' });
      return;
    }

    // 2. Set the player to inactive
    const { error: updateError } = await supabase
      .from('players')
      .update({ is_active: false })
      .eq('id', player.id);

    if (updateError) throw updateError;

    // 3. Find if they have a pending match in the current round
    const phase = matchPhaseForTournament(tournament);
    let pendingMatch = null;
    if (tournament.phase !== 'registration') {
      pendingMatch = await getPendingMatchForPlayer(supabase, tournament.id, targetDiscordId, tournament.current_round, phase);
    }

    let publicMessage = `<@${targetDiscordId}> has been dropped from the tournament.`;
    let opponentId = null;

    if (pendingMatch) {
      // Find the opponent
      const isPlayer1 = pendingMatch.player1_id === player.id;
      const opponent = isPlayer1 ? pendingMatch.player2 : pendingMatch.player1;

      if (opponent) {
        opponentId = opponent.id;
        publicMessage += `\n<@${opponent.discord_id}> has been granted a default win for their current match.`;
      }

      // Force the match winner
      const { data: result, error: rpcError } = await supabase.rpc('force_match_winner', {
        p_match_id: pendingMatch.id,
        p_winner_id: opponentId, // if opponentId is null, it's fine (will be a draw/loss for both)
        p_admin_discord_id: user.id,
        p_is_default: true,
      });

      if (rpcError) throw rpcError;
      if (!result?.ok) {
         // We won't block the DQ if the match resolution fails for some weird reason, but we log it.
         console.error('Failed to auto-resolve pending match during dq:', result.error);
         publicMessage += `\n*(Note: Failed to automatically resolve their pending match. A TO may need to manually fix it.)*`;
      }
    }

    await resolveEphemeral(env, interaction);
    
    // Send public announcement
    await sendChannelMessage(env, interaction, { content: publicMessage });

  } catch (err) {
    console.error('dq error:', err);
    await editReply(env, interaction, {
      content: `Could not dq player. Please try again.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}
