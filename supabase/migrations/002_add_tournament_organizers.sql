-- Migration to add tournament_organizers table and remove to_role_id from tournaments

CREATE TABLE IF NOT EXISTS tournament_organizers (
  discord_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remove the to_role_id column as we are no longer using Discord roles for TO permissions
ALTER TABLE tournaments DROP COLUMN IF EXISTS to_role_id;
