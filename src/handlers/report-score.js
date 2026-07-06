import {
  editReply,
  getOption,
  getUser,
  userError,
  sendFollowup,
} from '../lib/discord.js';
import {
  getSupabase,
  getActiveTournament,
  findMatchBetween,
  getPlayerByDiscordId,
} from '../lib/supabase.js';
import { resolveEphemeral, sendChannelMessage } from '../lib/discord.js';
import { matchPhaseForTournament } from '../utils/permissions.js';
import { matchResultEmbed } from '../utils/embeds.js';

export async function handleReportScore(interaction, env) {
  const user = getUser(interaction);
  const opponentId = getOption(interaction, 'opponent');
  const yourScore = Number(getOption(interaction, 'your_score'));
  const opponentScore = Number(getOption(interaction, 'opponent_score'));
  const supabase = getSupabase(env);

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament || tournament.phase === 'registration') {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    const phase = matchPhaseForTournament(tournament);
    const match = await findMatchBetween(
      supabase,
      tournament.id,
      user.id,
      opponentId,
      tournament.current_round,
      phase,
      'pending'
    );

    if (!match) {
      await editReply(env, interaction, { content: userError('MATCH_NOT_FOUND') });
      return;
    }

    // Validate best-of-5: one player must have 3 wins and the other 0-2
    const scoresValid =
      Number.isInteger(yourScore) &&
      Number.isInteger(opponentScore) &&
      ((yourScore === 3 && opponentScore >= 0 && opponentScore <= 2) ||
        (opponentScore === 3 && yourScore >= 0 && yourScore <= 2));

    if (!scoresValid) {
      await editReply(env, interaction, {
        content: 'Scores must reflect a best-of-5 (first to 3). Forfeits should be reported as 3-0. Please resubmit.',
      });
      return;
    }

    const reporter = await getPlayerByDiscordId(supabase, tournament.id, user.id);
    const isPlayer1 = match.player1_id === reporter.id;
    const p1Score = isPlayer1 ? yourScore : opponentScore;
    const p2Score = isPlayer1 ? opponentScore : yourScore;

    const { data: result, error } = await supabase.rpc('report_match_result', {
      p_match_id: match.id,
      p_discord_id: user.id,
      p_p1_score: p1Score,
      p_p2_score: p2Score,
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
    console.error('report-score error:', err);
    await editReply(env, interaction, {
      content: 'Could not report score. Please try again or contact a TO.',
    });
  }
}
