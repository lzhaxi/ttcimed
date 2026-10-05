export async function isTournamentOrganizer(interaction, env, supabase) {
  const user = interaction.member?.user ?? interaction.user;
  if (!user) return false;

  if (env.ADMIN_ID && user.id === env.ADMIN_ID) {
    return true;
  }

  const { data, error } = await supabase
    .from('tournament_organizers')
    .select('discord_id')
    .eq('discord_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error checking tournament organizer status:', error);
    return false;
  }

  return !!data;
}

export function calcSwissRounds(playerCount) {
  return Math.ceil(Math.log2(playerCount));
}

export function calcTopCutSize(playerCount) {
  const size = 2 ** Math.floor(Math.log2(playerCount) - 1);
  return Math.max(4, Math.min(64, size));
}

export function matchPhaseForTournament(tournament) {
  return tournament.phase === 'top_cut' ? 'top_cut' : 'swiss';
}

export function deadlineTimestamp(unixSeconds) {
  return `<t:${unixSeconds}:F> (<t:${unixSeconds}:R>)`;
}

export function getSingleEliminationRoundName(topCutSize, roundNumber) {
  if (!topCutSize) return `Single-Elimination Round ${roundNumber}`;
  const totalRounds = Math.log2(topCutSize);
  const remaining = totalRounds - roundNumber;

  if (remaining === 0) return 'Finals';
  if (remaining === 1) return 'Semifinals';
  if (remaining === 2) return 'Quarterfinals';
  if (remaining >= 3) return `Round of ${2 ** (remaining + 1)}`;
  
  return `Single-Elimination Round ${roundNumber}`;
}

export function getMatchCode(topCutSize, roundNumber, slotIndex) {
  if (!topCutSize) return `M${slotIndex + 1}`;
  const totalRounds = Math.log2(topCutSize);
  const remaining = totalRounds - roundNumber;

  if (remaining === 0) return slotIndex === 1 ? '3rd Place' : 'Final';
  if (remaining === 1) return `SF${slotIndex + 1}`;
  if (remaining === 2) return `QF${slotIndex + 1}`;
  if (remaining >= 3) return `R${2 ** (remaining + 1)}-${slotIndex + 1}`;

  return `R${roundNumber}-${slotIndex + 1}`;
}

