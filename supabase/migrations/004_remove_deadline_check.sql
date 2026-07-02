-- ---------------------------------------------------------------------------
-- Apply deadline defaults for overdue pending matches (No time check)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_deadline_defaults(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_match RECORD;
  v_winner_id UUID;
  v_reason TEXT;
  v_count INT := 0;
  v_seed1 INT;
  v_seed2 INT;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_FOUND');
  END IF;

  FOR v_match IN
    SELECT m.*
    FROM matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number = v_tournament.current_round
      AND m.phase = CASE
        WHEN v_tournament.phase = 'top_cut' THEN 'top_cut'::match_phase
        ELSE 'swiss'::match_phase
      END
      AND m.status = 'pending'
      AND m.player2_id IS NOT NULL
  LOOP
    IF v_match.player1_scheduled AND NOT v_match.player2_scheduled THEN
      v_winner_id := v_match.player1_id;
      v_reason := 'Default win: Player 1 attempted to schedule; Player 2 did not respond.';
    ELSIF v_match.player2_scheduled AND NOT v_match.player1_scheduled THEN
      v_winner_id := v_match.player2_id;
      v_reason := 'Default win: Player 2 attempted to schedule; Player 1 did not respond.';
    ELSE
      IF v_match.phase = 'top_cut' THEN
        SELECT seed INTO v_seed1 FROM players WHERE id = v_match.player1_id;
        SELECT seed INTO v_seed2 FROM players WHERE id = v_match.player2_id;
        -- lower seed number = higher seed (e.g. 1 is top seed)
        IF v_seed1 <= v_seed2 THEN
          v_winner_id := v_match.player1_id;
        ELSE
          v_winner_id := v_match.player2_id;
        END IF;
        v_reason := 'Default win: Higher seed wins in top cut by default.';
      ELSE
        IF random() < 0.5 THEN
          v_winner_id := v_match.player1_id;
        ELSE
          v_winner_id := v_match.player2_id;
        END IF;
        v_reason := 'Default win: Neither player reported within the deadline.';
      END IF;
    END IF;

    PERFORM force_match_winner(v_match.id, v_winner_id, v_reason, 'system-deadline', true);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'defaults_applied', v_count);
END;
$$;
