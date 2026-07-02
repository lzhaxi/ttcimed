/** Insert match rows and apply Swiss win for any bye (auto-completed) matches. */
export async function insertMatchesWithByes(supabase, matchRows) {
  const { error } = await supabase.from('matches').insert(matchRows);
  if (error) throw error;

  for (const row of matchRows) {
    if (row.player2_id === null && row.status === 'completed') {
      const { data: player } = await supabase
        .from('players')
        .select('swiss_wins, tournament_id')
        .eq('id', row.player1_id)
        .single();

      if (player) {
        await supabase
          .from('players')
          .update({ swiss_wins: player.swiss_wins + 1 })
          .eq('id', row.player1_id);

        await supabase.rpc('recalculate_tiebreakers', {
          p_tournament_id: player.tournament_id,
        });
      }
    }
  }
}
