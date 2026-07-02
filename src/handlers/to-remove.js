import { editReply, getOption, getUser, userError, sendFollowup } from '../lib/discord.js';
import { getSupabase } from '../lib/supabase.js';
import { isTournamentOrganizer } from '../utils/permissions.js';

export async function handleToRemove(interaction, env) {
  const user = getUser(interaction);
  const targetUserId = getOption(interaction, 'user');
  const supabase = getSupabase(env);

  try {
    const authorized = await isTournamentOrganizer(interaction, env, supabase);
    if (!authorized) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    if (!targetUserId) {
      await editReply(env, interaction, { content: 'Please specify a user to remove.' });
      return;
    }

    // Resolve the target user's username
    const targetUser = interaction.data.resolved?.users?.[targetUserId];
    const targetUsername = targetUser?.username ?? `User ${targetUserId}`;

    // Check if they are actually a TO
    const { data: existing, error: checkError } = await supabase
      .from('tournament_organizers')
      .select('discord_id')
      .eq('discord_id', targetUserId)
      .maybeSingle();

    if (checkError) throw checkError;

    if (!existing) {
      await editReply(env, interaction, {
        content: `**${targetUsername}** is not a tournament organizer.`,
      });
      return;
    }

    // Delete from the database
    const { error: deleteError } = await supabase
      .from('tournament_organizers')
      .delete()
      .eq('discord_id', targetUserId);

    if (deleteError) throw deleteError;

    await editReply(env, interaction, { content: 'Done' });
    await sendFollowup(env, interaction, {
      content: `Successfully removed **${targetUsername}** (<@${targetUserId}>) from the tournament organizers list.`,
    });
  } catch (err) {
    console.error('to-remove error:', err);
    await editReply(env, interaction, {
      content: 'Could not remove user from the tournament organizers list. Please try again.',
    });
  }
}
