#!/usr/bin/env node
/**
 * Seeds the local SQLite DB with teams, players, and player-team history.
 *
 * Sources:
 *   --source=wikidata Loads the committed wikidata-data.json snapshot (no network).
 *                      Refresh the snapshot with `npm run import:wikidata`.
 *   --source=sample   Uses the bundled sample-data.json (no network, no API key).
 *   --source=api      Pulls from API-Football. Requires API_FOOTBALL_KEY env var.
 *                      Respects the free tier's 10 requests/minute limit.
 *
 * File-based sources replace the existing teams and players, so switching
 * between datasets never mixes them. The game itself never calls an external
 * API - it only ever reads from this local DB.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'game.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');
const SAMPLE_DATA_PATH = path.join(__dirname, 'sample-data.json');
const WIKIDATA_DATA_PATH = path.join(__dirname, 'wikidata-data.json');

// API-Football free tier: 10 requests/minute. Stay comfortably under that.
const API_MIN_INTERVAL_MS = 7000; // ~8.5 req/min

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

function upsertTeam(db, name, country = null, apiFootballId = null) {
  db.prepare(
    `INSERT INTO teams (name, country, api_football_id)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET country = excluded.country`
  ).run(name, country, apiFootballId);
  return db.prepare('SELECT id FROM teams WHERE name = ?').get(name).id;
}

function upsertPlayer(db, name, apiFootballId = null) {
  const existing = apiFootballId
    ? db.prepare('SELECT id FROM players WHERE api_football_id = ?').get(apiFootballId)
    : db.prepare('SELECT id FROM players WHERE name = ?').get(name);
  if (existing) return existing.id;

  const result = db
    .prepare('INSERT INTO players (name, api_football_id) VALUES (?, ?)')
    .run(name, apiFootballId);
  return result.lastInsertRowid;
}

function linkPlayerToTeam(db, playerId, teamId) {
  db.prepare(
    `INSERT OR IGNORE INTO player_teams (player_id, team_id) VALUES (?, ?)`
  ).run(playerId, teamId);
}

function readDataset(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dataset not found: ${filePath}. Run \`npm run import:wikidata\` first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function seedDataset(db, data, label = 'dataset') {
  const teamIdByName = {};
  for (const team of data.teams) {
    teamIdByName[team.name] = upsertTeam(db, team.name, team.country);
  }

  for (const player of data.players) {
    const playerId = upsertPlayer(db, player.name);
    for (const teamName of player.teams) {
      const teamId = teamIdByName[teamName];
      if (!teamId) {
        throw new Error(
          `Data error: player "${player.name}" references unknown team "${teamName}"`
        );
      }
      linkPlayerToTeam(db, playerId, teamId);
    }
  }

  console.log(`Seeded ${data.teams.length} teams and ${data.players.length} players from ${label}.`);
}

function seedFromSample(db) {
  seedDataset(db, readDataset(SAMPLE_DATA_PATH), 'sample data');
}

/** Clears all game data and loads `data` in one transaction, so a failed load changes nothing. */
function replaceDataset(db, data, label) {
  db.transaction(() => {
    db.exec('DELETE FROM player_teams; DELETE FROM players; DELETE FROM teams;');
    seedDataset(db, data, label);
  })();
}

const FILE_SOURCES = {
  sample: [SAMPLE_DATA_PATH, 'sample data'],
  wikidata: [WIKIDATA_DATA_PATH, 'the Wikidata snapshot'],
};

/** Loads the Wikidata snapshot when it exists, otherwise the sample data. */
function defaultSource() {
  return fs.existsSync(WIKIDATA_DATA_PATH) ? 'wikidata' : 'sample';
}

/**
 * Pulls real data from API-Football. Left deliberately simple - a starting
 * point to extend once you've picked which leagues/teams to curate.
 * Never called in tests or CI; requires a real API key and network access.
 */
async function seedFromApi() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error('API_FOOTBALL_KEY environment variable is required for --source=api');
  }

  // Example of the shape you'd build out:
  //   1. Fetch a curated list of team IDs (e.g. top 20 clubs you want in the game)
  //   2. For each team, fetch its squad (respecting API_MIN_INTERVAL_MS between calls)
  //   3. For each player, fetch their transfer history to get past clubs
  //   4. Upsert everything into the DB, deduped via player_teams' primary key
  //
  // Left unimplemented here - fill in with real endpoints once you've
  // decided which leagues/seasons to curate, so you don't burn your
  // 100 requests/day free-tier budget on exploratory calls.
  throw new Error(
    'seedFromApi is a stub - implement team/player/transfer-history fetching here, ' +
      `pacing calls at least ${API_MIN_INTERVAL_MS}ms apart.`
  );
}

async function main() {
  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
  const source = sourceArg ? sourceArg.split('=')[1] : defaultSource();
  if (source !== 'api' && !Object.hasOwn(FILE_SOURCES, source)) {
    throw new Error(`Unknown --source "${source}". Use "wikidata", "sample", or "api".`);
  }

  const db = openDb();
  try {
    if (source === 'api') {
      await seedFromApi(db);
    } else {
      const [filePath, label] = FILE_SOURCES[source];
      replaceDataset(db, readDataset(filePath), label);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  openDb,
  upsertTeam,
  upsertPlayer,
  linkPlayerToTeam,
  seedFromSample,
  seedDataset,
  replaceDataset,
  readDataset,
  defaultSource,
  FILE_SOURCES,
};
