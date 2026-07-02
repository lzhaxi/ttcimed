import { editReply, resolveEphemeral, sendChannelMessage } from '../lib/discord.js';
import { getSupabase } from '../lib/supabase.js';

export async function handleTournaments(interaction, env) {
  const supabase = getSupabase(env);
  
  try {
    const { data: tournaments, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('guild_id', interaction.guild_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!tournaments || tournaments.length === 0) {
      await editReply(env, interaction, { content: 'No tournaments found for this server.' });
      return;
    }

    const lines = tournaments.map(t => {
      const date = new Date(t.created_at).toLocaleDateString();
      const activeStr = t.phase !== 'completed' ? ' **(Active)**' : '';
      return `\`${t.id}\` | **${t.name}** (${date}) - Phase: ${t.phase}${activeStr}`;
    });

    const description = lines.join('\n\n');

    await resolveEphemeral(env, interaction);
    await sendChannelMessage(env, interaction, {
      embeds: [{
        title: 'All Tournaments',
        description,
        color: 0x3498db,
        timestamp: new Date().toISOString(),
      }]
    });

  } catch (err) {
    console.error('tournaments error:', err);
    await editReply(env, interaction, { content: 'Could not fetch tournaments.' });
  }
}
