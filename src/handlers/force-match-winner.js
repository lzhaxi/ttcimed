import { editReply, getOption, getUser, userError, sendChannelMessage, resolveEphemeral } from '../lib/discord.js';
import { getSupabase, getActiveTournament, findMatchBetween } from '../lib/supabase.js';
import { isTournamentOrganizer, matchPhaseForTournament } from '../utils/permissions.js';
import { matchResultEmbed } from '../utils/embeds.js';

export async function handleForceMatchWinner(interaction, env) {
  const user = getUser(interaction);
  const p1Discord = getOption(interaction, 'player_1');
  const p2Discord = getOption(interaction, 'player_2');
  const winnerDiscord = getOption(interaction, 'winner');
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

    const phase = matchPhaseForTournament(tournament);
    const match = await findMatchBetween(
      supabase,
      tournament.id,
      p1Discord,
      p2Discord,
      tournament.current_round,
      phase
    );

    if (!match) {
      await editReply(env, interaction, { content: 'No pending match found with those players.' });
      return;
    }

    if (match.status !== 'pending') {
      await editReply(env, interaction, { content: 'This match has already been reported. If a mistake was made, please use /undo-match-result first.' });
      return;
    }

    // If winner specified, validate; otherwise choose based on phase (top_cut -> higher seed wins, swiss -> random)
    let chosenWinnerDiscord = winnerDiscord;


    if (!chosenWinnerDiscord) {
      // fetch player seeds to decide for top_cut or pick randomly for swiss
      const { data: players } = await supabase
        .from('players')
        .select('id, discord_id, seed')
        .in('id', [match.player1_id, match.player2_id]);

      const p1 = players?.find((p) => p.id === match.player1_id);
      const p2 = players?.find((p) => p.id === match.player2_id);

      if (phase === 'top_cut' && p1 && p2 && typeof p1.seed === 'number' && typeof p2.seed === 'number') {
        // lower seed number = higher seed (1 is top). Choose the higher seed (lower number).
        chosenWinnerDiscord = p1.seed <= p2.seed ? p1.discord_id : p2.discord_id;

      } else {
        // swiss or missing seeds: random
        chosenWinnerDiscord = Math.random() < 0.5 ? p1?.discord_id ?? p2?.discord_id : p2?.discord_id ?? p1?.discord_id;

      }
    }

    const { data: winnerPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('discord_id', chosenWinnerDiscord)
      .maybeSingle();

    const winnerId =
      winnerPlayer?.id === match.player1_id || winnerPlayer?.id === match.player2_id
        ? winnerPlayer.id
        : null;

    if (!winnerId) {
      await editReply(env, interaction, { content: userError('INVALID_WINNER') });
      return;
    }

    const { data: result, error } = await supabase.rpc('force_match_winner', {
      p_match_id: match.id,
      p_winner_id: winnerId,
      p_admin_discord_id: user.id,
      p_is_default: true,
    });

    if (error) throw error;
    if (!result?.ok) {
      await editReply(env, interaction, { content: userError(result.error) });
      return;
    }

    const { data: updated } = await supabase
      .from('matches')
      .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
      .eq('id', match.id)
      .single();

    const embed = matchResultEmbed(updated, tournament.top_cut_size);
    await resolveEphemeral(env, interaction);
    await sendChannelMessage(env, interaction, { embeds: [embed] });
  } catch (err) {
    console.error('force-match-winner error:', err);
    await editReply(env, interaction, {
      content: `Could not force match result. Please try again.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}
