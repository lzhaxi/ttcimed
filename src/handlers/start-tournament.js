import { editReply, userError, sendChannelMessage, resolveEphemeral, getOption } from '../lib/discord.js';
import { getSupabase, getActiveTournament, getPlayers } from '../lib/supabase.js';
import { isTournamentOrganizer, calcSwissRounds, calcTopCutSize } from '../utils/permissions.js';
import { generatePairings, buildSwissMatchRows } from '../services/swiss.js';
import { insertMatchesWithByes } from '../services/matches.js';
import { pairingsEmbed } from '../utils/embeds.js';
import { getNextSundayMidnightCT } from '../utils/dates.js';

const MIN_PLAYERS = 9;

export async function handleStartTournament(interaction, env) {
  const supabase = getSupabase(env);
  const tournamentName = getOption(interaction, 'name');

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);

    if (!await isTournamentOrganizer(interaction, env, supabase)) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    if (!tournament) {
      if (tournamentName) {
        const { error } = await supabase.from('tournaments').insert({
          guild_id: interaction.guild_id,
          name: tournamentName,
          phase: 'registration',
        });
        if (error) throw error;
        await resolveEphemeral(env, interaction, 'Done');
        await sendChannelMessage(env, interaction, { content: `Registration is now open for **${tournamentName}**` });
        return;
      } else {
        await editReply(env, interaction, { content: 'You must provide a name to open a tournament for registration.' });
        return;
      }
    }

    if (tournament.phase !== 'registration') {
      await editReply(env, interaction, { content: 'Tournament is already in progress.' });
      return;
    }

    if (tournamentName) {
      await editReply(env, interaction, { content: 'You already named this tournament! If you want to rename it, please cancel the tournament and re-start it.' });
      return;
    }

    const players = await getPlayers(supabase, tournament.id);
    if (players.length < MIN_PLAYERS) {
      await editReply(env, interaction, { content: userError('MIN_PLAYERS') });
      return;
    }

    const totalSwissRounds = calcSwissRounds(players.length);
    const topCutSize = calcTopCutSize(players.length);
    const now = new Date();
    const deadline = getNextSundayMidnightCT(now);

    const { pairs, bye } = generatePairings(players, [], 1);
    const matchRows = buildSwissMatchRows(tournament.id, 1, pairs, bye);
    await insertMatchesWithByes(supabase, matchRows);

    const { error: tourError } = await supabase
      .from('tournaments')
      .update({
        phase: 'swiss',
        current_round: 1,
        total_swiss_rounds: totalSwissRounds,
        top_cut_size: topCutSize,
        round_started_at: now.toISOString(),
        round_deadline: deadline.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', tournament.id);

    if (tourError) throw tourError;

    const { data: insertedMatches } = await supabase
      .from('matches')
      .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
      .eq('tournament_id', tournament.id)
      .eq('round_number', 1);

    const updatedTournament = {
      ...tournament,
      phase: 'swiss',
      current_round: 1,
      total_swiss_rounds: totalSwissRounds,
      top_cut_size: topCutSize,
      round_deadline: deadline.toISOString(),
    };

    const embed = pairingsEmbed(updatedTournament, insertedMatches ?? []);
    embed.fields.push({
      name: 'Format',
      value: `${totalSwissRounds} Swiss rounds → Top ${topCutSize}`,
    });

    const pings = (insertedMatches ?? [])
      .filter(m => m.player2_id !== null)
      .flatMap(m => [m.player1?.discord_id, m.player2?.discord_id])
      .filter(Boolean)
      .map(id => `<@${id}>`)
      .join(' ');

    await resolveEphemeral(env, interaction);
    if (pings) {
      await sendChannelMessage(env, interaction, { content: 'The tournament has begun! Registrations are now closed.\n\n' + pings + '\nPlease contact your opponent to schedule your match.' });
    }
    await sendChannelMessage(env, interaction, { embeds: [embed] });
  } catch (err) {
    console.error('tournament-start error:', err);
    await editReply(env, interaction, {
      content: `Could not start the tournament. Please try again or check Supabase logs.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}
