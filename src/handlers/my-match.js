import { editReply, getUser, userError } from '../lib/discord.js';
import { getSupabase, getActiveTournament, getPendingMatchForPlayer } from '../lib/supabase.js';
import { matchPhaseForTournament } from '../utils/permissions.js';
import { myMatchEmbed } from '../utils/embeds.js';

export async function handleMyMatch(interaction, env) {
  const user = getUser(interaction);
  const supabase = getSupabase(env);

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament || tournament.phase === 'registration' || tournament.current_round === 0) {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    const phase = matchPhaseForTournament(tournament);
    const match = await getPendingMatchForPlayer(
      supabase,
      tournament.id,
      user.id,
      tournament.current_round,
      phase
    );

    if (!match) {
      await editReply(env, interaction, {
        content: 'No pending match this round — you may have a bye or already reported.',
      });
      return;
    }

    await editReply(env, interaction, { embeds: [myMatchEmbed(match, tournament)] });
  } catch (err) {
    console.error('my-match error:', err);
    await editReply(env, interaction, {
      content: 'Could not fetch your match. Please try again later.',
    });
  }
}
