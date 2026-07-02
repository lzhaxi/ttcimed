import { editReply, getOption, getUser, userError, sendFollowup } from '../lib/discord.js';
import { getSupabase } from '../lib/supabase.js';
import { isTournamentOrganizer } from '../utils/permissions.js';

export async function handleToAdd(interaction, env) {
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
      await editReply(env, interaction, { content: 'Please specify a user to add.' });
      return;
    }

    // Resolve the target user's username from interaction details
    const targetUser = interaction.data.resolved?.users?.[targetUserId];
    const targetUsername = targetUser?.username ?? `User ${targetUserId}`;

    // Check if they are already a TO
    const { data: existing, error: checkError } = await supabase
      .from('tournament_organizers')
      .select('discord_id')
      .eq('discord_id', targetUserId)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      await editReply(env, interaction, {
        content: `**${targetUsername}** is already a tournament organizer.`,
      });
      return;
    }

    // Insert into the database
    const { error: insertError } = await supabase
      .from('tournament_organizers')
      .insert({
        discord_id: targetUserId,
        discord_username: targetUsername,
      });

    if (insertError) throw insertError;

    await editReply(env, interaction, { content: 'Done' });
    await sendFollowup(env, interaction, {
      content: `Successfully added **${targetUsername}** (<@${targetUserId}>) to the tournament organizers list.`,
    });
  } catch (err) {
    console.error('to-add error:', err);
    await editReply(env, interaction, {
      content: 'Could not add user to the tournament organizers list. Please try again.',
    });
  }
}
