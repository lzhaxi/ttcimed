import { resolveEphemeral, sendChannelMessage, editReply, userError } from '../lib/discord.js';
import { getSupabase } from '../lib/supabase.js';
import { standingsEmbed, bracketEmbed } from '../utils/embeds.js';
import { getSingleEliminationRoundName } from '../utils/permissions.js';
import { sortByStandings } from '../services/swiss.js';

function getSubcommandOption(interaction, optionName) {
  const subCommand = interaction.data.options?.[0];
  if (!subCommand || !subCommand.options) return undefined;
  return subCommand.options.find(o => o.name === optionName)?.value;
}

export async function handleHistory(interaction, env) {
  const supabase = getSupabase(env);
  const subCommandGroup = interaction.data.options?.[0];
  const subCommandName = subCommandGroup?.name;
  
  if (!subCommandName) {
    await editReply(env, interaction, { content: 'Invalid command structure.' });
    return;
  }

  try {
    const tournamentIdOpt = getSubcommandOption(interaction, 'tournament');
    let tournament;

    if (tournamentIdOpt) {
      // Look up specific tournament by ID
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentIdOpt)
        .maybeSingle();
      if (error) throw error;
      tournament = data;
    } else {
      // Default to latest tournament in guild
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('guild_id', interaction.guild_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      tournament = data;
    }

    if (!tournament) {
      await editReply(env, interaction, { content: 'No tournament found.' });
      return;
    }

    if (subCommandName === 'player') {
      const targetUserId = getSubcommandOption(interaction, 'user');
      
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', targetUserId)
        .maybeSingle();

      if (playerError) throw playerError;

      if (!player) {
         await editReply(env, interaction, { content: 'That user did not participate in this tournament.' });
         return;
      }

      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
        .eq('tournament_id', tournament.id)
        .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
        .order('phase', { ascending: true }) // swiss, then top_cut
        .order('round_number', { ascending: true });
      
      if (matchesError) throw matchesError;

      const title = `Match History: ${player.discord_username}`;
      let description = `**Tournament:** ${tournament.name}\n**Set Record:** ${player.swiss_wins}-${player.swiss_losses}-${player.swiss_draws} | **Game Record:** ${player.game_wins}-${player.game_losses}\n\n`;

      if (!matches || matches.length === 0) {
        description += '*No matches found.*';
      } else {
        description += matches.map(m => {
          const isPlayer1 = m.player1_id === player.id;
          const opp = isPlayer1 ? m.player2 : m.player1;
          const myScore = isPlayer1 ? m.player1_score : m.player2_score;
          const oppScore = isPlayer1 ? m.player2_score : m.player1_score;
          const phaseText = m.phase === 'swiss' ? `Swiss R${m.round_number}` : getSingleEliminationRoundName(tournament.top_cut_size, m.round_number);
          
          if (!opp) return `**[${phaseText}]** BYE`;
          if (m.status === 'pending') return `**[${phaseText}]** Pending vs **${opp.discord_username}**`;

          const result = myScore > oppScore ? '🟢 Won' : (myScore < oppScore ? '🔴 Lost' : '⚪ Drew');
          const scoreText = m.status === 'defaulted' ? '(Default)' : `(${myScore}-${oppScore})`;
          return `**[${phaseText}]** ${result} vs **${opp.discord_username}** ${scoreText}`;
        }).join('\n');
      }

      await resolveEphemeral(env, interaction);
      await sendChannelMessage(env, interaction, {
        embeds: [{
          title,
          description,
          color: 0x3498db, // blue
          timestamp: new Date().toISOString(),
        }]
      });

    } else if (subCommandName === 'standings') {
      let { data: players, error } = await supabase
        .from('players')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('is_active', true)
        .order('swiss_wins', { ascending: false })
        .order('buchholz', { ascending: false })
        .order('owp', { ascending: false });

      if (error) throw error;

      if (players) {
        players = sortByStandings(players);
      }

      await resolveEphemeral(env, interaction);
      await sendChannelMessage(env, interaction, {
        embeds: [standingsEmbed(tournament, players ?? [])],
      });

    } else if (subCommandName === 'bracket') {
      const { data: matches, error } = await supabase
        .from('matches')
        .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
        .eq('tournament_id', tournament.id)
        .eq('phase', 'top_cut')
        .order('round_number', { ascending: true })
        .order('bracket_slot', { ascending: true });

      if (error) throw error;

      if (!matches || matches.length === 0) {
        await editReply(env, interaction, { content: 'No single-elimination bracket exists for this tournament yet.' });
        return;
      }

      await resolveEphemeral(env, interaction);
      await sendChannelMessage(env, interaction, { embeds: [bracketEmbed(tournament, matches)] });

    } else {
      await editReply(env, interaction, { content: `Unknown subcommand: ${subCommandName}` });
    }

  } catch (err) {
    console.error('history error:', err);
    await editReply(env, interaction, {
      content: 'Could not fetch history. Please try again.',
    });
  }
}
