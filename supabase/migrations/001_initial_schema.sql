-- Ping Pong Tournament Bot — initial schema

CREATE TYPE tournament_phase AS ENUM ('registration', 'swiss', 'top_cut', 'completed');
CREATE TYPE match_phase AS ENUM ('swiss', 'top_cut');
CREATE TYPE match_status AS ENUM ('pending', 'completed', 'defaulted');

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Table Tennis League',
  phase tournament_phase NOT NULL DEFAULT 'registration',
  current_round INT NOT NULL DEFAULT 0,
  total_swiss_rounds INT,
  top_cut_size INT,
  to_role_id TEXT,
  round_started_at TIMESTAMPTZ,
  round_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX one_active_tournament_per_guild
  ON tournaments (guild_id)
  WHERE phase != 'completed';

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  swiss_wins INT NOT NULL DEFAULT 0,
  swiss_losses INT NOT NULL DEFAULT 0,
  swiss_draws INT NOT NULL DEFAULT 0,
  buchholz NUMERIC NOT NULL DEFAULT 0,
  owp NUMERIC NOT NULL DEFAULT 0,
  seed INT,
  eliminated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, discord_id)
);

CREATE INDEX players_standings_idx
  ON players (tournament_id, swiss_wins DESC, buchholz DESC, owp DESC);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  phase match_phase NOT NULL DEFAULT 'swiss',
  player1_id UUID NOT NULL REFERENCES players(id),
  player2_id UUID REFERENCES players(id),
  player1_score INT,
  player2_score INT,
  winner_id UUID REFERENCES players(id),
  status match_status NOT NULL DEFAULT 'pending',
  default_reason TEXT,
  reported_by TEXT,
  player1_scheduled BOOLEAN NOT NULL DEFAULT false,
  player2_scheduled BOOLEAN NOT NULL DEFAULT false,
  scheduling_notes TEXT,
  bracket_slot INT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (player2_id IS NULL OR player1_id <> player2_id)
);

CREATE INDEX matches_tournament_round_idx
  ON matches (tournament_id, round_number, phase);

CREATE INDEX matches_pending_deadline_idx
  ON matches (tournament_id, status)
  WHERE status = 'pending';

CREATE TABLE match_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  performed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Tiebreaker recalculation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalculate_tiebreakers(p_tournament_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE players p
  SET
    buchholz = COALESCE((
      SELECT SUM(opp.swiss_wins + opp.swiss_draws * 0.5)
      FROM matches m
      JOIN players opp ON opp.id = CASE
        WHEN m.player1_id = p.id THEN m.player2_id
        WHEN m.player2_id = p.id THEN m.player1_id
      END
      WHERE m.tournament_id = p_tournament_id
        AND m.phase = 'swiss'
        AND m.status IN ('completed', 'defaulted')
        AND (m.player1_id = p.id OR m.player2_id = p.id)
        AND m.player2_id IS NOT NULL
    ), 0),
    owp = COALESCE((
      SELECT AVG(
        CASE
          WHEN (opp.swiss_wins + opp.swiss_losses + opp.swiss_draws) = 0 THEN 0
          ELSE (opp.swiss_wins + opp.swiss_draws * 0.5)::NUMERIC
            / (opp.swiss_wins + opp.swiss_losses + opp.swiss_draws)::NUMERIC
        END
      )
      FROM matches m
      JOIN players opp ON opp.id = CASE
        WHEN m.player1_id = p.id THEN m.player2_id
        WHEN m.player2_id = p.id THEN m.player1_id
      END
      WHERE m.tournament_id = p_tournament_id
        AND m.phase = 'swiss'
        AND m.status IN ('completed', 'defaulted')
        AND (m.player1_id = p.id OR m.player2_id = p.id)
        AND m.player2_id IS NOT NULL
    ), 0)
  WHERE p.tournament_id = p_tournament_id
    AND p.is_active = true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Report match result (player-submitted scores)
-- ---------------------------------------------------------------------------

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

  IF v_match.phase = 'top_cut' THEN
    UPDATE players SET eliminated = true
    WHERE id = CASE WHEN v_winner_id = v_match.player1_id THEN v_match.player2_id ELSE v_match.player1_id END;
  END IF;

  PERFORM recalculate_tiebreakers(v_match.tournament_id);

  RETURN jsonb_build_object('ok', true, 'winner_id', v_winner_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Force match winner (TO override / default win)
-- ---------------------------------------------------------------------------

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

  INSERT INTO match_audit_log (match_id, action, snapshot, performed_by)
  VALUES (p_match_id, v_status::TEXT, v_snapshot, p_admin_discord_id);

  UPDATE matches
  SET
    winner_id = p_winner_id,
    status = v_status,
    default_reason = p_reason,
    reported_by = p_admin_discord_id,
    completed_at = NOW(),
    player1_score = CASE WHEN p_winner_id = player1_id THEN 1 ELSE 0 END,
    player2_score = CASE WHEN p_winner_id = player2_id THEN 1 ELSE 0 END
  WHERE id = p_match_id;

  IF p_winner_id = v_match.player1_id THEN
    UPDATE players SET swiss_wins = swiss_wins + 1 WHERE id = v_match.player1_id AND v_match.phase = 'swiss';
    UPDATE players SET swiss_losses = swiss_losses + 1 WHERE id = v_match.player2_id AND v_match.phase = 'swiss';
  ELSE
    UPDATE players SET swiss_wins = swiss_wins + 1 WHERE id = v_match.player2_id AND v_match.phase = 'swiss';
    UPDATE players SET swiss_losses = swiss_losses + 1 WHERE id = v_match.player1_id AND v_match.phase = 'swiss';
  END IF;

  IF v_match.phase = 'top_cut' THEN
    UPDATE players SET eliminated = true
    WHERE id = CASE WHEN p_winner_id = v_match.player1_id THEN v_match.player2_id ELSE v_match.player1_id END;
  END IF;

  PERFORM recalculate_tiebreakers(v_match.tournament_id);

  RETURN jsonb_build_object('ok', true, 'winner_id', p_winner_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Undo match result
-- ---------------------------------------------------------------------------

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
    eliminated = (v_p1 ->> 'eliminated')::BOOLEAN
  WHERE id = v_match.player1_id;

  UPDATE players SET
    swiss_wins = (v_p2 ->> 'swiss_wins')::INT,
    swiss_losses = (v_p2 ->> 'swiss_losses')::INT,
    swiss_draws = (v_p2 ->> 'swiss_draws')::INT,
    buchholz = (v_p2 ->> 'buchholz')::NUMERIC,
    owp = (v_p2 ->> 'owp')::NUMERIC,
    eliminated = (v_p2 ->> 'eliminated')::BOOLEAN
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

-- ---------------------------------------------------------------------------
-- Apply deadline defaults for overdue pending matches
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
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_FOUND');
  END IF;
  IF v_tournament.round_deadline IS NULL OR v_tournament.round_deadline > NOW() THEN
    RETURN jsonb_build_object('ok', true, 'defaults_applied', 0);
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
      IF random() < 0.5 THEN
        v_winner_id := v_match.player1_id;
      ELSE
        v_winner_id := v_match.player2_id;
      END IF;
      v_reason := 'Default win: Neither player reported within the deadline.';
    END IF;

    PERFORM force_match_winner(v_match.id, v_winner_id, v_reason, 'system-deadline', true);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'defaults_applied', v_count);
END;
$$;
