import { deadlineTimestamp, getSingleEliminationRoundName, getMatchCode } from '../utils/permissions.js';

export function mention(player) {
  return player?.discord_id ? `<@${player.discord_id}>` : player?.discord_username ?? 'Unknown';
}

export function matchResultEmbed(match, topCutSize) {
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

    timestamp: new Date().toISOString(),
  };
}

export function standingsEmbed(tournament, players, dqPlayers = []) {
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

  if (dqPlayers.length > 0) {
    if (lines.length > 0) lines.push('─'.repeat(30));
    lines.push('🔴 *DQ*');
    dqPlayers.slice(0, 10).forEach((p) => {
      const record = `${p.swiss_wins}-${p.swiss_losses}${p.swiss_draws ? `-${p.swiss_draws}` : ''}`;
      lines.push(`**-** ${mention(p)} — ${record}`);
    });
  }

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
  const isTopCut = tournament.phase === 'top_cut';
  const lines = matches.map((m) => {
    const formatPlayer = (p) => {
      if (!p) return '?';
      const seedStr = isTopCut && typeof p.seed === 'number' ? `(#${p.seed}) ` : '';
      return `${seedStr}${mention(p)}`;
    };
    const p1 = formatPlayer(m.player1);
    if (!m.player2) return `• ${p1} — **BYE**`;
    const p2 = formatPlayer(m.player2);
    const prefix = isTopCut && typeof m.bracket_slot === 'number'
      ? `• **${getMatchCode(tournament.top_cut_size, m.round_number, m.bracket_slot)}:** `
      : '• ';
    return `${prefix}${p1} vs ${p2}`;
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

export function renderAsciiGrid(topCutSize, matches) {
  const totalRounds = Math.max(1, Math.round(Math.log2(topCutSize || 4)));
  const totalLines = (topCutSize * 2) - 1;

  const getMatch = (r, s) => matches.find((m) => m.round_number === r && m.bracket_slot === s);
  const getWinner = (m) => {
    if (!m || m.status === 'pending') return null;
    return m.winner_id === m.player1_id ? m.player1 : (m.winner_id === m.player2_id ? m.player2 : null);
  };

  const pName = (p, maxLen = 9) => {
    if (!p) return 'TBD'.padEnd(maxLen, ' ');
    const name = p.discord_username || p.name || 'User';
    const str = `[${p.seed ?? '?'}]${name}`;
    if (str.length > maxLen) return str.slice(0, maxLen - 1) + '…';
    return str.padEnd(maxLen, ' ');
  };

  // Collect winners / projected winners for each round
  const winners = {};
  for (let r = 1; r <= totalRounds; r++) {
    winners[r] = {};
    const count = topCutSize / (2 ** r);
    for (let s = 0; s < count; s++) {
      const m = getMatch(r, s);
      const nextM = getMatch(r + 1, Math.floor(s / 2));
      const nextP = (s % 2 === 0) ? nextM?.player1 : nextM?.player2;
      winners[r][s] = getWinner(m) ?? nextP ?? null;
    }
  }

  const colNameLen = 9;
  const colWidth = colNameLen + 7;
  const totalCols = totalRounds * colWidth + 14;

  const grid = Array.from({ length: totalLines }, () => Array(totalCols).fill(' '));

  const drawStr = (row, col, str) => {
    for (let i = 0; i < str.length && col + i < totalCols; i++) {
      grid[row][col + i] = str[i];
    }
  };

  for (let r = 1; r <= totalRounds; r++) {
    const colStart = (r - 1) * colWidth;
    const count = topCutSize / (2 ** r);
    const branchCol = colStart + colNameLen + 3;

    for (let s = 0; s < count; s++) {
      const topRow = (2 ** (r + 1)) * s + (2 ** (r - 1) - 1);
      const botRow = (2 ** (r + 1)) * s + (3 * (2 ** (r - 1)) - 1);
      const centerRow = (2 ** (r + 1)) * s + (2 ** r - 1);

      let p1, p2;
      if (r === 1) {
        const m = getMatch(1, s);
        p1 = m?.player1;
        p2 = m?.player2;
      } else {
        p1 = winners[r - 1][s * 2];
        p2 = winners[r - 1][s * 2 + 1];
      }

      drawStr(topRow, colStart, pName(p1, colNameLen) + ' ──┐');
      drawStr(botRow, colStart, pName(p2, colNameLen) + ' ──┘');

      for (let y = topRow + 1; y < botRow; y++) {
        grid[y][branchCol] = '│';
      }
      drawStr(centerRow, branchCol, '├── ');
    }
  }

  // Champion
  const champRow = (2 ** totalRounds) - 1;
  const champCol = totalRounds * colWidth;
  const champ = winners[totalRounds][0];
  drawStr(champRow, champCol, champ ? `${pName(champ, colNameLen)} 🏆` : 'TBD');

  // Headers
  const headerCols = [];
  for (let r = 1; r <= totalRounds; r++) {
    const remaining = totalRounds - r;
    const name = remaining === 0 ? 'FINALS' : remaining === 1 ? 'SEMIFINALS' : remaining === 2 ? 'QUARTERFINALS' : `ROUND OF ${2 ** (remaining + 1)}`;
    headerCols.push(name.padEnd(colWidth, ' '));
  }
  headerCols.push('CHAMPION');
  const header = headerCols.join('').trimEnd();

  const lines = grid.map((row) => row.join('').trimEnd());
  return header + '\n' + lines.join('\n');
}

export function bracketEmbed(tournament, matches, { projectFuture = true, currentRoundOnly = false } = {}) {
  const topCutSize = tournament.top_cut_size || 8;
  const totalRounds = Math.max(1, Math.round(Math.log2(topCutSize)));
  const targetRound = tournament.current_round || Math.max(...matches.map((m) => m.round_number), 1);
  const maxExistingRound = Math.max(...matches.map((m) => m.round_number), 1);
  const startRound = currentRoundOnly ? targetRound : 1;
  const endRound = currentRoundOnly ? targetRound : (projectFuture ? totalRounds : Math.min(totalRounds, maxExistingRound));

  const getMatch = (r, s) => matches.find((m) => m.round_number === r && m.bracket_slot === s);
  const getWinner = (m) => {
    if (!m || m.status === 'pending') return null;
    return m.winner_id === m.player1_id ? m.player1 : (m.winner_id === m.player2_id ? m.player2 : null);
  };

  const tree = {};
  for (let r = 1; r <= totalRounds; r++) {
    tree[r] = [];
    const count = topCutSize / (2 ** r);
    for (let s = 0; s < count; s++) {
      const existing = getMatch(r, s);
      let p1 = existing?.player1 ?? null;
      let p2 = existing?.player2 ?? null;
      const winner = getWinner(existing);

      if (r > 1) {
        const f1 = tree[r - 1]?.[s * 2];
        const f2 = tree[r - 1]?.[s * 2 + 1];
        if (!p1 && f1?.winner) p1 = f1.winner;
        if (!p2 && f2?.winner) p2 = f2.winner;
      }

      tree[r].push({
        round: r,
        slot: s,
        player1: p1,
        player2: p2,
        winner,
        existing,
      });
    }
  }

  const asciiTree = renderAsciiGrid(topCutSize, matches);

  const embed = {
    title: `🏆 Bracket: ${tournament.name}`,
    description: '```text\n' + asciiTree + '\n```',
    color: 0x9b59b6, // purple
    fields: [],
    timestamp: new Date().toISOString(),
  };

  for (let r = startRound; r <= endRound; r++) {
    const roundName = getSingleEliminationRoundName(topCutSize, r);
    const count = topCutSize / (2 ** r);
    const matchLines = [];

    for (let s = 0; s < count; s++) {
      const node = tree[r][s];
      const code = getMatchCode(topCutSize, r, s);
      const m = node.existing;

      if (m && (m.status === 'completed' || m.status === 'defaulted')) {
        const winner = node.winner;
        const loser = winner?.id === node.player1?.id ? node.player2 : node.player1;
        const score =
          m.status === 'defaulted'
            ? 'Default'
            : `${Math.max(m.player1_score, m.player2_score)}-${Math.min(m.player1_score, m.player2_score)}`;
        const wStr = winner ? `(#${winner.seed}) ${mention(winner)}` : 'Unknown';
        const lStr = loser ? `(#${loser.seed}) ${mention(loser)}` : 'Unknown';
        matchLines.push(`**${code}:** 🟢 ${wStr} defeats ${lStr} (${score})`);
      } else if (m && m.status === 'pending') {
        const p1 = node.player1 ? `(#${node.player1.seed}) ${mention(node.player1)}` : 'TBD';
        const p2 = node.player2 ? `(#${node.player2.seed}) ${mention(node.player2)}` : 'TBD';
        matchLines.push(`**${code}:** ⏳ ${p1} vs ${p2}`);
      } else {
        const f1Code = getMatchCode(topCutSize, r - 1, s * 2);
        const f2Code = getMatchCode(topCutSize, r - 1, s * 2 + 1);
        const p1 = node.player1 ? `(#${node.player1.seed}) ${mention(node.player1)}` : `Winner of ${f1Code}`;
        const p2 = node.player2 ? `(#${node.player2.seed}) ${mention(node.player2)}` : `Winner of ${f2Code}`;
        matchLines.push(`**${code}:** 🔮 ${p1} vs ${p2}`);
      }
    }

    embed.fields.push({
      name: roundName,
      value: matchLines.join('\n') || '*No matches*',
      inline: false,
    });
  }

  if (currentRoundOnly && tournament.round_deadline) {
    embed.fields.push({
      name: 'Deadline',
      value: deadlineTimestamp(Math.floor(new Date(tournament.round_deadline).getTime() / 1000)),
      inline: false,
    });
  }

  if (!currentRoundOnly) {
    const champ = tree[totalRounds]?.[0]?.winner;
    if (champ) {
      embed.fields.push({
        name: '🏆 Tournament Champion',
        value: `**(#${champ.seed}) ${mention(champ)}**`,
        inline: false,
      });
    }
  }

  return embed;
}

