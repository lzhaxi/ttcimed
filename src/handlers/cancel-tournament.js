import { editReply, getOption, userError, resolveEphemeral, sendChannelMessage } from '../lib/discord.js';
import { getSupabase, getActiveTournament } from '../lib/supabase.js';
import { isTournamentOrganizer } from '../utils/permissions.js';

export async function handleCancelTournament(interaction, env) {
  const supabase = getSupabase(env);
  const confirmText = getOption(interaction, 'confirm');

  try {
    if (confirmText !== 'Yes') {
      await editReply(env, interaction, { content: 'Tournament cancellation aborted. You must type "Yes" for the confirm option.' });
      return;
    }

    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament) {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    if (!await isTournamentOrganizer(interaction, env, supabase)) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournament.id);

    if (error) throw error;

    await resolveEphemeral(env, interaction);
    await sendChannelMessage(env, interaction, { content: '✅ The tournament and all associated matches and players have been completely deleted.' });
  } catch (err) {
    console.error('tournament-cancel error:', err);
    await editReply(env, interaction, {
      content: `Could not cancel the tournament. Please try again or check logs.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}
