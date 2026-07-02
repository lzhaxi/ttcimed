import { deadlineTimestamp, getSingleEliminationRoundName } from '../utils/permissions.js';

function mention(player) {
  return player?.discord_id ? `<@${player.discord_id}>` : player?.discord_username ?? 'Unknown';
}

export function matchResultEmbed(match, reason, topCutSize) {
  const p1 = mention(match.player1) ?? 'Player 1';
  const p2 = mention(match.player2) ?? 'Bye';
  const p1Score = match.player1_score ?? (match.winner_id === match.player1_id ? 1 : 0);
  const p2Score = match.player2_score ?? (match.winner_id === match.player2_id ? 1 : 0);
  const winner =
    match.winner_id === match.player1_id ? p1 : match.winner_id === match.player2_id ? p2 : 'TBD';

  const roundName = match.phase === 'top_cut'
    ? getSingleEliminationRoundName(topCutSize, match.round_number)
    : `Swiss R${match.round_number}`;

  return {
    title: '🏓 Match Result',
    color: match.status === 'defaulted' ? 0xffa500 : 0x57f287,
    fields: [
      { name: 'Players', value: `${p1} vs ${p2}`, inline: true },
      { name: 'Score', value: `${p1Score} – ${p2Score}`, inline: true },
      { name: 'Winner', value: winner, inline: true },
      { name: 'Round', value: roundName, inline: true },
      { name: 'Status', value: match.status, inline: true },
    ],
    footer: reason ? { text: reason } : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function standingsEmbed(tournament, players) {
  const topCutSize = tournament.top_cut_size || 0;
  const lines = [];

  players.slice(0, 25).forEach((p, i) => {
    const record = `${p.swiss_wins}-${p.swiss_losses}${p.swiss_draws ? `-${p.swiss_draws}` : ''}`;
    const gwPct = (p.game_wins + p.game_losses) > 0 
      ? (p.game_wins / (p.game_wins + p.game_losses) * 100).toFixed(0) 
      : 0;
    
    // Add visual indicator for qualifying players if in Swiss stage
    const prefix = (topCutSize > 0 && i < topCutSize && tournament.phase === 'swiss') ? '⭐ ' : '';
    lines.push(`${prefix}**${i + 1}.** ${mention(p)} — ${record} (BH: ${Number(p.buchholz).toFixed(1)}, OWP: ${(Number(p.owp) * 100).toFixed(0)}%, GW: ${gwPct}%)`);

    // Insert a cutoff divider line
    if (topCutSize > 0 && i === topCutSize - 1 && players.length > topCutSize && tournament.phase === 'swiss') {
      lines.push('─'.repeat(30) + ' 🛑 *Top Cut Cutoff*');
    }
  });

  return {
    title: `📊 ${tournament.name} — Standings`,
    description: lines.join('\n') || 'No players yet.',
    color: 0x5865f2,
    fields: [
      {
        name: 'Phase',
        value: tournament.phase === 'top_cut' ? 'Single-Elimination' : tournament.phase.replace('_', ' '),
        inline: true,
      },
      {
        name: 'Round',
        value: tournament.phase === 'top_cut' ? getSingleEliminationRoundName(tournament.top_cut_size, tournament.current_round) : `${tournament.current_round}${tournament.total_swiss_rounds ? `/${tournament.total_swiss_rounds}` : ''}`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };
}

export function pairingsEmbed(tournament, matches) {
  const lines = matches.map((m) => {
    const p1 = mention(m.player1) ?? '?';
    if (!m.player2) return `• ${p1} — **BYE**`;
    const p2 = mention(m.player2);
    return `• ${p1} vs ${p2}`;
  });

  const deadline = tournament.round_deadline
    ? deadlineTimestamp(Math.floor(new Date(tournament.round_deadline).getTime() / 1000))
    : 'TBD';

  const roundTitle = tournament.phase === 'top_cut'
    ? `Single-Elimination — ${getSingleEliminationRoundName(tournament.top_cut_size, tournament.current_round)}`
    : `Round ${tournament.current_round}${tournament.total_swiss_rounds ? `/${tournament.total_swiss_rounds}` : ''}`;

  return {
    title: `🏓 ${roundTitle} Pairings`,
    description: lines.join('\n'),
    color: 0xeb459e,
    fields: [{ name: 'Deadline', value: deadline }],
    timestamp: new Date().toISOString(),
  };
}

export function myMatchEmbed(match, tournament) {
  let opponentName = 'Unknown';
  if (match.player2) {
    opponentName = `${mention(match.player1)} vs ${mention(match.player2)}`;
  } else {
    opponentName = 'BYE (automatic win)';
  }

  const deadline = tournament.round_deadline
    ? deadlineTimestamp(Math.floor(new Date(tournament.round_deadline).getTime() / 1000))
    : 'TBD';

  const roundName = tournament.phase === 'top_cut'
    ? getSingleEliminationRoundName(tournament.top_cut_size, tournament.current_round)
    : String(tournament.current_round);

  return {
    title: '🏓 Your Current Match',
    description: opponentName,
    color: 0x5865f2,
    fields: [
      { name: 'Round', value: roundName, inline: true },
      { name: 'Deadline', value: deadline, inline: false },
    ],
  };
}

export function undoEmbed(match) {
  const p1 = mention(match.player1) ?? 'Player 1';
  const p2 = mention(match.player2) ?? 'Player 2';
  return {
    title: '↩️ Match Result Reverted',
    description: `**${p1} vs ${p2}** has been reset to pending. Standings recalculated.`,
    color: 0xed4245,
    timestamp: new Date().toISOString(),
  };
}

export function bracketEmbed(tournament, matches) {
  const rounds = {};
  matches.forEach(m => {
    if (!rounds[m.round_number]) rounds[m.round_number] = [];
    rounds[m.round_number].push(m);
  });

  const maxRound = Math.max(...Object.keys(rounds).map(Number));

  const embed = {
    title: `🏆 Bracket: ${tournament.name}`,
    color: 0x9b59b6, // purple
    fields: [],
    timestamp: new Date().toISOString()
  };

  for (let r = 1; r <= maxRound; r++) {
    const roundMatches = rounds[r] || [];
    const roundName = getSingleEliminationRoundName(tournament.top_cut_size, r);

    const matchLines = roundMatches.map(m => {
      const formatPlayer = (p) => p ? `(#${p.seed}) ${mention(p)}` : 'TBD';
      const p1 = formatPlayer(m.player1);
      const p2 = formatPlayer(m.player2);
      
      if (m.status === 'pending') {
        return `⏳ **${p1}** vs **${p2}**`;
      } else {
        const winner = m.winner_id === m.player1_id ? p1 : p2;
        const loser = m.winner_id === m.player1_id ? p2 : p1;
        const score = m.status === 'defaulted' ? 'Default' : `${Math.max(m.player1_score, m.player2_score)}-${Math.min(m.player1_score, m.player2_score)}`;
        return `🟢 **${winner}** defeats **${loser}** (${score})`;
      }
    }).join('\n');

    embed.fields.push({
      name: roundName,
      value: matchLines || '*No matches*',
      inline: false
    });
  }

  return embed;
}

