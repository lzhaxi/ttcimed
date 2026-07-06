-- ---------------------------------------------------------------------------
-- Migration 006: Auto-reset tournament ID sequence on delete
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reset_tournament_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_id INT;
BEGIN
  SELECT MAX(id) INTO v_max_id FROM tournaments;
  
  IF v_max_id IS NULL THEN
    -- Table is empty, next ID should be 1
    PERFORM setval(pg_get_serial_sequence('tournaments', 'id'), 1, false);
  ELSE
    -- Table has rows, next ID should be v_max_id + 1
    PERFORM setval(pg_get_serial_sequence('tournaments', 'id'), v_max_id, true);
  END IF;
  
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_tournament_sequence ON tournaments;

CREATE TRIGGER trg_reset_tournament_sequence
AFTER DELETE ON tournaments
FOR EACH STATEMENT
EXECUTE FUNCTION reset_tournament_sequence();
