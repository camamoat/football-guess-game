const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { seedFromSample } = require('../seed/seed');
const { createServer, getGameData } = require('./server');

describe('game server', () => {
  let db;
  let server;
  let baseUrl;
  let teams;
  let players;

  beforeAll(async () => {
    db = new Database(':memory:');
    db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
    seedFromSample(db);
    ({ teams, players } = getGameData(db));
    server = createServer(db);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    db.close();
  });

  function guess(body, options = {}) {
    return fetch(`${baseUrl}/api/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...options,
    });
  }

  test('serves clubs and player names without revealing their career links', async () => {
    const response = await fetch(`${baseUrl}/api/game-data`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.teams).toHaveLength(6);
    expect(data.players).toHaveLength(4);
    expect(data.players[0]).not.toHaveProperty('teamIds');
  });

  test.each(['/', '/styles.css', '/app.js', '/match.js'])('serves the browser asset %s', async (url) => {
    const response = await fetch(`${baseUrl}${url}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).not.toHaveLength(0);
  });

  test('scores a guess using SQLite history and returns best answers', async () => {
    const teamIds = ['Manchester United', 'Real Madrid', 'Juventus']
      .map((name) => teams.find((team) => team.name === name).id);
    const playerId = players.find((player) => player.name === 'Cristiano Ronaldo').id;
    const response = await guess({ playerId, teamIds });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.score).toBe(3);
    expect(result.matchingTeams).toHaveLength(3);
    expect(result.bestAnswers).toEqual([expect.objectContaining({ name: 'Cristiano Ronaldo', score: 3 })]);
    expect(result.bestAnswerCount).toBe(1);
  });

  test('a player without any matching clubs scores zero', async () => {
    const teamIds = ['Chelsea', 'Paris Saint-Germain']
      .map((name) => teams.find((team) => team.name === name).id);
    const playerId = players.find((player) => player.name === 'Andrea Pirlo').id;
    const response = await guess({ playerId, teamIds });
    expect(await response.json()).toMatchObject({ score: 0, matchingTeams: [], topScore: 1 });
  });

  test.each([
    null, {}, { teamIds: [1], playerId: 1 }, { teamIds: [1, 1], playerId: 1 },
    { teamIds: [1, 999], playerId: 1 }, { teamIds: ['1', 2], playerId: 1 },
    { teamIds: [1, 2], playerId: 999 }, { teamIds: [1, 2], playerId: '1' },
    { teamIds: [1, 2, 3, 4, 5], playerId: 1 },
  ])('rejects an invalid guess: %j', async (body) => {
    const response = await guess(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  });

  test('rejects malformed and oversized JSON requests', async () => {
    const malformed = await guess(null, { body: '{broken' });
    expect(malformed.status).toBe(400);
    const oversized = await guess({ extra: 'x'.repeat(9000) });
    expect(oversized.status).toBe(400);
  });

  test('rejects non-JSON guesses', async () => {
    const response = await guess({}, { headers: { 'Content-Type': 'text/plain' } });
    expect(response.status).toBe(415);
  });

  test.each(['/package.json', '/.env', '/db/schema.sql', '/unknown', '/constructor'])(
    'does not serve files outside the asset allowlist: %s', async (url) => {
      const response = await fetch(`${baseUrl}${url}`);
      expect(response.status).toBe(404);
    }
  );
});
