import { editReply, userError, getOption, sendFollowup } from '../lib/discord.js';
import {
  getSupabase,
  getActiveTournament,
  getPlayers,
  getAllMatches,
  getRoundMatches,
} from '../lib/supabase.js';
import {
  isTournamentOrganizer,
  getSingleEliminationRoundName,
  calcSwissRounds,
  calcTopCutSize,
} from '../utils/permissions.js';
import { generatePairings, buildSwissMatchRows, sortByStandings } from '../services/swiss.js';
import { insertMatchesWithByes } from '../services/matches.js';
import {
  seedTopCutBracket,
  buildTopCutRoundOneRows,
  buildNextBracketRound,
  isRoundComplete,
} from '../services/bracket.js';
import { pairingsEmbed, bracketEmbed, standingsEmbed, mention } from '../utils/embeds.js';
import { getNextSundayMidnightCT } from '../utils/dates.js';
import { resolveEphemeral, sendChannelMessage } from '../lib/discord.js';

const MIN_PLAYERS = 9;

export async function handleNextRound(interaction, env) {
  const supabase = getSupabase(env);
  const forceResolve = Boolean(getOption(interaction, 'force'));
  const extendDeadline = Boolean(getOption(interaction, 'extend_deadline'));

  try {
    const tournament = await getActiveTournament(supabase, interaction.guild_id);
    if (!tournament) {
      await editReply(env, interaction, { content: userError('NO_TOURNAMENT') });
      return;
    }

    if (!await isTournamentOrganizer(interaction, env, supabase)) {
      await editReply(env, interaction, { content: userError('UNAUTHORIZED') });
      return;
    }

    const now = new Date();
    const deadline = getNextSundayMidnightCT(now, extendDeadline ? 1 : 0);

    if (tournament.phase === 'registration') {
      await closeRegistrationAndStartSwiss(supabase, env, interaction, tournament, now, deadline);
      return;
    }

    const phase = tournament.phase === 'top_cut' ? 'top_cut' : 'swiss';
    const currentMatches = await getRoundMatches(
      supabase,
      tournament.id,
      tournament.current_round,
      phase
    );

    let forcedText = '';

    if (!isRoundComplete(currentMatches)) {
      if (!forceResolve) {
        await editReply(env, interaction, { content: userError('ROUND_INCOMPLETE') });
        return;
      }

      const pendingMatchIds = currentMatches.filter(m => m.status === 'pending').map(m => m.id);

      // Force-resolve incomplete matches using DB RPC
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('apply_deadline_defaults', {
        p_tournament_id: tournament.id,
      });
      if (rpcErr) throw rpcErr;

      if (pendingMatchIds.length > 0) {
        const { data: updatedMatches } = await supabase
          .from('matches')
          .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
          .in('id', pendingMatchIds);
        
        forcedText = updatedMatches.map(m => {
          const p1 = m.player1 ? `<@${m.player1.discord_id}>` : 'BYE';
          const p2 = m.player2 ? `<@${m.player2.discord_id}>` : 'BYE';
          return `*Forced Match:* ${p1} ${m.player1_score}-${m.player2_score} ${p2}`;
        }).join('\n');
      }
    }

    if (tournament.phase === 'swiss') {
      if (tournament.current_round >= tournament.total_swiss_rounds) {
        await startTopCut(supabase, env, interaction, tournament, now, deadline, forcedText);
        return;
      }
      await advanceSwissRound(supabase, env, interaction, tournament, now, deadline, forcedText);
      return;
    }

    if (tournament.phase === 'top_cut') {
      await advanceTopCutRound(supabase, env, interaction, tournament, now, deadline, forcedText);
      return;
    }

    await editReply(env, interaction, { content: userError('TOP_CUT_COMPLETE') });
  } catch (err) {
    console.error('next-round error:', err);
    await editReply(env, interaction, {
      content: `Could not advance the tournament. Please try again.\n\n**Error Details:**\n\`${err.message}\``,
    });
  }
}

async function closeRegistrationAndStartSwiss(supabase, env, interaction, tournament, now, deadline) {
  const players = await getPlayers(supabase, tournament.id);
  if (players.length < MIN_PLAYERS) {
    await editReply(env, interaction, { content: userError('MIN_PLAYERS') });
    return;
  }

  const totalSwissRounds = calcSwissRounds(players.length);
  const topCutSize = calcTopCutSize(players.length);

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
    await sendChannelMessage(env, interaction, {
      content: 'The tournament has begun! Registrations are now closed.\n\n' + pings + '\nPlease contact your opponent to schedule your match.'
    });
  } else {
    await sendChannelMessage(env, interaction, {
      content: 'The tournament has begun! Registrations are now closed.'
    });
  }
  await sendChannelMessage(env, interaction, { embeds: [embed] });
}


async function advanceSwissRound(supabase, env, interaction, tournament, now, deadline, forcedText) {
  const nextRound = tournament.current_round + 1;
  const players = await getPlayers(supabase, tournament.id);
  const allMatches = await getAllMatches(supabase, tournament.id);
  const swissMatches = allMatches.filter((m) => m.phase === 'swiss');

  const { pairs, bye } = generatePairings(players, swissMatches, nextRound);
  const matchRows = buildSwissMatchRows(tournament.id, nextRound, pairs, bye);
  await insertMatchesWithByes(supabase, matchRows);

  const { error: tourError } = await supabase
    .from('tournaments')
    .update({
      current_round: nextRound,
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
    .eq('round_number', nextRound);

  const updatedTournament = {
    ...tournament,
    current_round: nextRound,
    round_deadline: deadline.toISOString(),
  };

  const embed = pairingsEmbed(updatedTournament, insertedMatches ?? []);
  
  const pings = (insertedMatches ?? [])
    .filter(m => m.player2_id !== null)
    .flatMap(m => [m.player1?.discord_id, m.player2?.discord_id])
    .filter(Boolean)
    .map(id => `<@${id}>`)
    .join(' ');

  await resolveEphemeral(env, interaction);
  if (forcedText || pings) {
    const textParts = [];
    if (forcedText) textParts.push(`**Resolved Pending Matches:**\n${forcedText}`);
    if (pings) textParts.push(pings + '\nPlease contact your opponent to schedule your match.');
    await sendChannelMessage(env, interaction, { content: textParts.join('\n\n') });
  }
  await sendChannelMessage(env, interaction, { embeds: [embed] });
}

async function startTopCut(supabase, env, interaction, tournament, now, deadline, forcedText) {
  const players = await getPlayers(supabase, tournament.id);
  const sortedPlayers = sortByStandings(players);

  // Assign final Swiss placement as their new seed for the single elimination bracket
  sortedPlayers.forEach((p, idx) => {
    p.seed = idx + 1;
  });
  const updatePromises = sortedPlayers.map((p) => 
    supabase.from('players').update({ seed: p.seed }).eq('id', p.id)
  );
  await Promise.all(updatePromises);

  const pairs = seedTopCutBracket(sortedPlayers, tournament.top_cut_size);
  const matchRows = buildTopCutRoundOneRows(tournament.id, pairs);

  const { error: matchError } = await supabase.from('matches').insert(matchRows);
  if (matchError) throw matchError;

  const { error: tourError } = await supabase
    .from('tournaments')
    .update({
      phase: 'top_cut',
      current_round: 1,
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
    .eq('phase', 'top_cut')
    .eq('round_number', 1);

  const updatedTournament = {
    ...tournament,
    phase: 'top_cut',
    current_round: 1,
    round_deadline: deadline.toISOString(),
  };

  const { data: allTopCutMatches } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournament.id)
    .eq('phase', 'top_cut')
    .order('round_number', { ascending: true })
    .order('bracket_slot', { ascending: true });

  const standingsEmb = standingsEmbed(tournament, sortedPlayers);
  const embed = bracketEmbed(updatedTournament, allTopCutMatches ?? [], { currentRoundOnly: true });
  
  const pings = (insertedMatches ?? [])
    .filter(m => m.player2_id !== null)
    .flatMap(m => [m.player1?.discord_id, m.player2?.discord_id])
    .filter(Boolean)
    .map(id => `<@${id}>`)
    .join(' ');

  await resolveEphemeral(env, interaction);
  
  if (forcedText) {
    await sendChannelMessage(env, interaction, { content: `**Resolved Pending Matches:**\n${forcedText}` });
  }

  await sendChannelMessage(env, interaction, { embeds: [standingsEmb] });

  let pingsText = '';
  if (pings) {
    pingsText = '\n\n' + pings + '\nPlease contact your opponent to schedule your match.';
  }

  await sendChannelMessage(env, interaction, { content: pingsText || undefined, embeds: [embed] });
}

async function advanceTopCutRound(supabase, env, interaction, tournament, now, deadline, forcedText) {
  const completed = await getRoundMatches(
    supabase,
    tournament.id,
    tournament.current_round,
    'top_cut'
  );

  const totalRounds = Math.max(1, Math.round(Math.log2(tournament.top_cut_size || 4)));

  if (tournament.current_round >= totalRounds || completed.length === 1) {
    const finalMatch = completed.find((m) => m.bracket_slot === 0) || completed[0];
    const thirdMatch = completed.find((m) => m.bracket_slot === 1);
    const winner =
      finalMatch.winner_id === finalMatch.player1_id
        ? finalMatch.player1
        : finalMatch.player2;
    const runnerUp =
      finalMatch.winner_id === finalMatch.player1_id
        ? finalMatch.player2
        : finalMatch.player1;
    const thirdPlace = thirdMatch
      ? (thirdMatch.winner_id === thirdMatch.player1_id ? thirdMatch.player1 : thirdMatch.player2)
      : null;

    await supabase
      .from('tournaments')
      .update({ phase: 'completed', updated_at: now.toISOString() })
      .eq('id', tournament.id);

    const fields = [];
    if (winner) fields.push({ name: '🥇 1st Place', value: mention(winner), inline: true });
    if (runnerUp) fields.push({ name: '🥈 2nd Place', value: mention(runnerUp), inline: true });
    if (thirdPlace) fields.push({ name: '🥉 3rd Place', value: mention(thirdPlace), inline: true });

    const embed = {
      title: `🏆 ${tournament.name} Results`,
      description: `**${winner ? `<@${winner.discord_id}>` : 'Unknown'}** wins **${tournament.name}!** Congratulations!`,
      fields: fields.length > 0 ? fields : undefined,
      color: 0xfee75c,
      timestamp: now.toISOString(),
    };

    await resolveEphemeral(env, interaction);
    if (forcedText) {
      await sendChannelMessage(env, interaction, { content: `**Resolved Pending Matches:**\n${forcedText}` });
    }
    await sendChannelMessage(env, interaction, { embeds: [embed] });
    return;
  }

  const nextRound = tournament.current_round + 1;
  const nextRows = buildNextBracketRound(tournament.id, completed, nextRound);

  // If entering final round with 3rd place match, unmark eliminated for semifinal losers so they are active for 3rd place match
  if (completed.length === 2 && nextRows.length === 2) {
    const thirdMatch = nextRows.find((m) => m.bracket_slot === 1);
    if (thirdMatch) {
      await supabase
        .from('players')
        .update({ eliminated: false })
        .in('id', [thirdMatch.player1_id, thirdMatch.player2_id]);
    }
  }

  const { error: matchError } = await supabase.from('matches').insert(nextRows);
  if (matchError) throw matchError;

  const { error: tourError } = await supabase
    .from('tournaments')
    .update({
      current_round: nextRound,
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
    .eq('phase', 'top_cut')
    .eq('round_number', nextRound);

  const updatedTournament = {
    ...tournament,
    current_round: nextRound,
    round_deadline: deadline.toISOString(),
  };

  const { data: allTopCutMatches } = await supabase
    .from('matches')
    .select('*, player1:players!matches_player1_id_fkey(*), player2:players!matches_player2_id_fkey(*)')
    .eq('tournament_id', tournament.id)
    .eq('phase', 'top_cut')
    .order('round_number', { ascending: true })
    .order('bracket_slot', { ascending: true });

  const embed = bracketEmbed(updatedTournament, allTopCutMatches ?? [], { currentRoundOnly: true });
  
  const pings = (insertedMatches ?? [])
    .filter(m => m.player2_id !== null)
    .flatMap(m => [m.player1?.discord_id, m.player2?.discord_id])
    .filter(Boolean)
    .map(id => `<@${id}>`)
    .join(' ');

  await resolveEphemeral(env, interaction);
  if (forcedText || pings) {
    const textParts = [];
    if (forcedText) textParts.push(`**Resolved Pending Matches:**\n${forcedText}`);
    if (pings) textParts.push(pings + '\nPlease contact your opponent to schedule your match.');
    await sendChannelMessage(env, interaction, { content: textParts.join('\n\n') });
  }
  await sendChannelMessage(env, interaction, { embeds: [embed] });
}
