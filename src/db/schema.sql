-- Teams a player could be picked for in the game
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  country TEXT,
  api_football_id INTEGER UNIQUE -- nullable: null for manually-curated teams
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_football_id INTEGER UNIQUE
);

-- Many-to-many: which teams has this player played for (career history)
-- A player can appear more than once for the same team (e.g. loan then return),
-- but for the game we only care about DISTINCT team membership, so this table
-- is deduplicated at insert time (see seed.js).
CREATE TABLE IF NOT EXISTS player_teams (
  player_id INTEGER NOT NULL REFERENCES players(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  PRIMARY KEY (player_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_player_teams_team_id ON player_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_player_teams_player_id ON player_teams(player_id);
