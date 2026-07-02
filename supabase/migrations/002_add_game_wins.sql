-- Add game stats columns to players
ALTER TABLE players 
ADD COLUMN game_wins INT NOT NULL DEFAULT 0,
ADD COLUMN game_losses INT NOT NULL DEFAULT 0;

-- Update the report_match_result function to track game wins/losses
CREATE OR REPLACE FUNCTION report_match_result(
  p_match_id UUID,
  p_reporter_discord_id TEXT,
  p_player1_score INT,
  p_player2_score INT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_p1 players%ROWTYPE;
  v_p2 players%ROWTYPE;
  v_winner_id UUID;
  v_snapshot JSONB;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND');
  END IF;
  IF v_match.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_REPORTED');
  END IF;

  SELECT * INTO v_p1 FROM players WHERE id = v_match.player1_id;
  SELECT * INTO v_p2 FROM players WHERE id = v_match.player2_id;

  IF v_p2.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BYE_MATCH');
  END IF;

  IF p_reporter_discord_id NOT IN (v_p1.discord_id, v_p2.discord_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_YOUR_MATCH');
  END IF;

  IF p_player1_score = p_player2_score THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DRAW_NOT_ALLOWED');
  END IF;

  IF p_player1_score > p_player2_score THEN
    v_winner_id := v_match.player1_id;
  ELSE
    v_winner_id := v_match.player2_id;
  END IF;

  v_snapshot := jsonb_build_object(
    'match', to_jsonb(v_match),
    'player1', to_jsonb(v_p1),
    'player2', to_jsonb(v_p2)
  );

  INSERT INTO match_audit_log (match_id, action, snapshot, performed_by)
  VALUES (p_match_id, 'completed', v_snapshot, p_reporter_discord_id);

  UPDATE matches
  SET
    player1_score = p_player1_score,
    player2_score = p_player2_score,
    winner_id = v_winner_id,
    status = 'completed',
    reported_by = p_reporter_discord_id,
    completed_at = NOW()
  WHERE id = p_match_id;

  IF v_winner_id = v_match.player1_id THEN
    UPDATE players SET swiss_wins = swiss_wins + 1 WHERE id = v_match.player1_id AND v_match.phase = 'swiss';
    UPDATE players SET swiss_losses = swiss_losses + 1 WHERE id = v_match.player2_id AND v_match.phase = 'swiss';
  ELSE
    UPDATE players SET swiss_wins = swiss_wins + 1 WHERE id = v_match.player2_id AND v_match.phase = 'swiss';
    UPDATE players SET swiss_losses = swiss_losses + 1 WHERE id = v_match.player1_id AND v_match.phase = 'swiss';
  END IF;

  -- Add Game Wins / Losses Tracking
  UPDATE players SET 
    game_wins = game_wins + p_player1_score,
    game_losses = game_losses + p_player2_score
  WHERE id = v_match.player1_id;

  UPDATE players SET 
    game_wins = game_wins + p_player2_score,
    game_losses = game_losses + p_player1_score
  WHERE id = v_match.player2_id;

  IF v_match.phase = 'top_cut' THEN
    UPDATE players SET eliminated = true
    WHERE id = CASE WHEN v_winner_id = v_match.player1_id THEN v_match.player2_id ELSE v_match.player1_id END;
  END IF;

  PERFORM recalculate_tiebreakers(v_match.tournament_id);

  RETURN jsonb_build_object('ok', true, 'winner_id', v_winner_id);
END;
$$;


-- Update the force_match_winner function to track game wins/losses
CREATE OR REPLACE FUNCTION force_match_winner(
  p_match_id UUID,
  p_winner_id UUID,
  p_reason TEXT,
  p_admin_discord_id TEXT,
  p_as_default BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_p1 players%ROWTYPE;
  v_p2 players%ROWTYPE;
  v_snapshot JSONB;
  v_status match_status;
  v_p1_score INT;
  v_p2_score INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND');
  END IF;
  IF v_match.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_REPORTED');
  END IF;
  IF p_winner_id NOT IN (v_match.player1_id, v_match.player2_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_WINNER');
  END IF;

  SELECT * INTO v_p1 FROM players WHERE id = v_match.player1_id;
  SELECT * INTO v_p2 FROM players WHERE id = v_match.player2_id;

  v_snapshot := jsonb_build_object(
    'match', to_jsonb(v_match),
    'player1', to_jsonb(v_p1),
    'player2', to_jsonb(v_p2)
  );

  v_status := CASE WHEN p_as_default THEN 'defaulted'::match_status ELSE 'completed'::match_status END;
  v_p1_score := CASE WHEN p_winner_id = v_match.player1_id THEN 3 ELSE 0 END;
  v_p2_score := CASE WHEN p_winner_id = v_match.player2_id THEN 3 ELSE 0 END;

  INSERT INTO match_audit_log (match_id, action, snapshot, performed_by)
  VALUES (p_match_id, v_status::TEXT, v_snapshot, p_admin_discord_id);

  UPDATE matches
  SET
    winner_id = p_winner_id,
    status = v_status,
    default_reason = p_reason,
    reported_by = p_admin_discord_id,
    completed_at = NOW(),
    player1_score = v_p1_score,
    player2_score = v_p2_score
  WHERE id = p_match_id;

  IF p_winner_id = v_match.player1_id THEN
    UPDATE players SET swiss_wins = swiss_wins + 1 WHERE id = v_match.player1_id AND v_match.phase = 'swiss';
    UPDATE players SET swiss_losses = swiss_losses + 1 WHERE id = v_match.player2_id AND v_match.phase = 'swiss';
  ELSE
    UPDATE players SET swiss_wins = swiss_wins + 1 WHERE id = v_match.player2_id AND v_match.phase = 'swiss';
    UPDATE players SET swiss_losses = swiss_losses + 1 WHERE id = v_match.player1_id AND v_match.phase = 'swiss';
  END IF;

  UPDATE players SET 
    game_wins = game_wins + v_p1_score,
    game_losses = game_losses + v_p2_score
  WHERE id = v_match.player1_id;

  UPDATE players SET 
    game_wins = game_wins + v_p2_score,
    game_losses = game_losses + v_p1_score
  WHERE id = v_match.player2_id;

  IF v_match.phase = 'top_cut' THEN
    UPDATE players SET eliminated = true
    WHERE id = CASE WHEN p_winner_id = v_match.player1_id THEN v_match.player2_id ELSE v_match.player1_id END;
  END IF;

  PERFORM recalculate_tiebreakers(v_match.tournament_id);

  RETURN jsonb_build_object('ok', true, 'winner_id', p_winner_id);
END;
$$;


-- Update the undo_match_result function to restore game wins/losses
CREATE OR REPLACE FUNCTION undo_match_result(
  p_match_id UUID,
  p_admin_discord_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_audit match_audit_log%ROWTYPE;
  v_p1 JSONB;
  v_p2 JSONB;
  v_tournament_id UUID;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND');
  END IF;
  IF v_match.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_PENDING');
  END IF;

  SELECT * INTO v_audit
  FROM match_audit_log
  WHERE match_id = p_match_id AND action IN ('completed', 'defaulted')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUDIT_LOG');
  END IF;

  v_p1 := v_audit.snapshot -> 'player1';
  v_p2 := v_audit.snapshot -> 'player2';
  v_tournament_id := v_match.tournament_id;

  UPDATE players SET
    swiss_wins = (v_p1 ->> 'swiss_wins')::INT,
    swiss_losses = (v_p1 ->> 'swiss_losses')::INT,
    swiss_draws = (v_p1 ->> 'swiss_draws')::INT,
    buchholz = (v_p1 ->> 'buchholz')::NUMERIC,
    owp = (v_p1 ->> 'owp')::NUMERIC,
    eliminated = (v_p1 ->> 'eliminated')::BOOLEAN,
    game_wins = COALESCE((v_p1 ->> 'game_wins')::INT, game_wins),
    game_losses = COALESCE((v_p1 ->> 'game_losses')::INT, game_losses)
  WHERE id = v_match.player1_id;

  UPDATE players SET
    swiss_wins = (v_p2 ->> 'swiss_wins')::INT,
    swiss_losses = (v_p2 ->> 'swiss_losses')::INT,
    swiss_draws = (v_p2 ->> 'swiss_draws')::INT,
    buchholz = (v_p2 ->> 'buchholz')::NUMERIC,
    owp = (v_p2 ->> 'owp')::NUMERIC,
    eliminated = (v_p2 ->> 'eliminated')::BOOLEAN,
    game_wins = COALESCE((v_p2 ->> 'game_wins')::INT, game_wins),
    game_losses = COALESCE((v_p2 ->> 'game_losses')::INT, game_losses)
  WHERE id = v_match.player2_id;

  UPDATE matches
  SET
    player1_score = NULL,
    player2_score = NULL,
    winner_id = NULL,
    status = 'pending',
    default_reason = NULL,
    reported_by = NULL,
    completed_at = NULL
  WHERE id = p_match_id;

  INSERT INTO match_audit_log (match_id, action, snapshot, performed_by)
  VALUES (p_match_id, 'undone', v_audit.snapshot, p_admin_discord_id);

  PERFORM recalculate_tiebreakers(v_tournament_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;
