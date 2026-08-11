import { editReply, userError, sendChannelMessage, resolveEphemeral, getOption } from '../lib/discord.js';
import { getSupabase, getActiveTournament } from '../lib/supabase.js';
import { isTournamentOrganizer } from '../utils/permissions.js';

export async function handleStartTournament(interaction, env) {
  const supabase = getSupabase(env);
  const tournamentName = getOption(interaction, 'name');

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);

    if (!await isTournamentOrganizer(interaction, env, supabase)) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    if (tournament) {
      if (tournament.phase === 'registration') {
        await editReply(env, interaction, { content: `Registration is already open for **${tournament.name}**.` });
      } else {
        await editReply(env, interaction, { content: 'Tournament is already in progress.' });
      }
      return;
    }

    if (!tournamentName) {
      await editReply(env, interaction, { content: 'You must provide a name to open a tournament for registration.' });
      return;
    }

    const { error } = await supabase.from('tournaments').insert({
      guild_id: interaction.guild_id,
      name: tournamentName,
      phase: 'registration',
    });
    if (error) throw error;

    await resolveEphemeral(env, interaction, 'Done');
    await sendChannelMessage(env, interaction, { content: `Registration is now open for **${tournamentName}**` });
  } catch (err) {
    console.error('start-tournament error:', err);
    await editReply(env, interaction, {
      content: `Could not start tournament registration. Please try again.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}

