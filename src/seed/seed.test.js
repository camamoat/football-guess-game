const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { seedFromSample, upsertTeam, upsertPlayer, linkPlayerToTeam } = require('./seed');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

function makeInMemoryDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

describe('seedFromSample', () => {
  let db;

  beforeEach(() => {
    db = makeInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  test('loads all teams and players from the bundled sample data', () => {
    seedFromSample(db);

    const teamCount = db.prepare('SELECT COUNT(*) AS c FROM teams').get().c;
    const playerCount = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;

    expect(teamCount).toBeGreaterThan(0);
    expect(playerCount).toBeGreaterThan(0);
  });

  test('links players to the correct teams', () => {
    seedFromSample(db);

    const ronaldo = db.prepare('SELECT id FROM players WHERE name = ?').get('Cristiano Ronaldo');
    const teams = db
      .prepare(
        `SELECT t.name FROM player_teams pt
         JOIN teams t ON t.id = pt.team_id
         WHERE pt.player_id = ?`
      )
      .all(ronaldo.id)
      .map((r) => r.name);

    expect(teams).toEqual(
      expect.arrayContaining(['Manchester United', 'Real Madrid', 'Juventus'])
    );
    expect(teams).toHaveLength(3);
  });

  test('is idempotent - running twice does not duplicate rows', () => {
    seedFromSample(db);
    seedFromSample(db);

    const playerCount = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
    const linkCount = db.prepare('SELECT COUNT(*) AS c FROM player_teams').get().c;

    // Same counts as a single run - upserts and INSERT OR IGNORE prevent duplicates
    const dbOnce = makeInMemoryDb();
    seedFromSample(dbOnce);
    const playerCountOnce = dbOnce.prepare('SELECT COUNT(*) AS c FROM players').get().c;
    const linkCountOnce = dbOnce.prepare('SELECT COUNT(*) AS c FROM player_teams').get().c;
    dbOnce.close();

    expect(playerCount).toBe(playerCountOnce);
    expect(linkCount).toBe(linkCountOnce);
  });
});

describe('upsertTeam', () => {
  let db;
  beforeEach(() => {
    db = makeInMemoryDb();
  });
  afterEach(() => {
    db.close();
  });

  test('returns the same id when called twice for the same team name', () => {
    const id1 = upsertTeam(db, 'Arsenal', 'England');
    const id2 = upsertTeam(db, 'Arsenal', 'England');
    expect(id1).toBe(id2);
  });
});

describe('upsertPlayer + linkPlayerToTeam', () => {
  let db;
  beforeEach(() => {
    db = makeInMemoryDb();
  });
  afterEach(() => {
    db.close();
  });

  test('linking the same player-team pair twice does not create duplicate rows', () => {
    const teamId = upsertTeam(db, 'Liverpool', 'England');
    const playerId = upsertPlayer(db, 'Test Player');

    linkPlayerToTeam(db, playerId, teamId);
    linkPlayerToTeam(db, playerId, teamId);

    const count = db
      .prepare('SELECT COUNT(*) AS c FROM player_teams WHERE player_id = ? AND team_id = ?')
      .get(playerId, teamId).c;
    expect(count).toBe(1);
  });
});
