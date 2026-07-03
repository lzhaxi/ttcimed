import { editReply, getUser, userError } from '../lib/discord.js';
import { getSupabase, getActiveTournament, getPlayerByDiscordId } from '../lib/supabase.js';

export async function handleRegister(interaction, env) {
  const user = getUser(interaction);
  const supabase = getSupabase(env);

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);

    if (!tournament) {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    if (tournament.phase !== 'registration') {
      await editReply(env, interaction, { content: userError('REGISTRATION_CLOSED') });
      return;
    }

    const existing = await getPlayerByDiscordId(supabase, tournament.id, user.id);
    if (existing) {
      const { error: delError } = await supabase
        .from('players')
        .delete()
        .eq('id', existing.id);
      if (delError) throw delError;

      await editReply(env, interaction, { content: 'You have been unregistered from the tournament.' });
      return;
    }

    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament.id);

    const { error } = await supabase.from('players').insert({
      tournament_id: tournament.id,
      discord_id: user.id,
      discord_username: user.username,
      seed: (count ?? 0) + 1,
    });

    if (error) throw error;

    const totalCount = (count ?? 0) + 1;
    await editReply(env, interaction, {
      content: `You're registered for **${tournament.name}**! (${totalCount} player${totalCount === 1 ? '' : 's'} signed up)`,
    });
  } catch (err) {
    console.error('register error:', err);
    await editReply(env, interaction, {
      content: 'Could not complete registration. Please try again later.',
    });
  }
}
