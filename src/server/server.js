const http = require('http');
const fs = require('fs');
const path = require('path');
const { openDb, replaceDataset, readDataset, defaultSource, FILE_SOURCES } = require('../seed/seed');
const { getOverlappingTeamIds, scoreGuess, rankPlayersByOverlap } = require('../scoring/scoring');

const ASSETS = {
  '/': ['../web/index.html', 'text/html'],
  '/styles.css': ['../web/styles.css', 'text/css'],
  '/app.js': ['../web/app.js', 'application/javascript'],
  '/match.js': ['../game/match.js', 'application/javascript'],
};
const MAX_BEST_ANSWERS = 5;

function getGameData(db) {
  return {
    teams: db.prepare('SELECT id, name, country FROM teams ORDER BY name').all(),
    players: db.prepare('SELECT id, name FROM players ORDER BY name').all(),
  };
}

function evaluateGuess(db, input) {
  const { teams, players } = getGameData(db);
  if (!input || !Array.isArray(input.teamIds) ||
      input.teamIds.length < 2 || input.teamIds.length > 4 ||
      new Set(input.teamIds).size !== input.teamIds.length ||
      input.teamIds.some((id) => !Number.isSafeInteger(id) || !teams.some((team) => team.id === id))) {
    throw new TypeError('Choose between two and four different teams from the list.');
  }
  const player = Number.isSafeInteger(input.playerId) &&
    db.prepare('SELECT id, name FROM players WHERE id = ?').get(input.playerId);
  if (!player) throw new TypeError('Choose a football player from the list.');

  // Only links to the selected clubs can score, so rank just those players.
  const links = db.prepare(
    `SELECT player_id, team_id FROM player_teams
     WHERE team_id IN (${input.teamIds.map(() => '?').join(', ')})`
  ).all(...input.teamIds);
  const teamIdsByPlayer = new Map();
  for (const link of links) {
    if (!teamIdsByPlayer.has(link.player_id)) teamIdsByPlayer.set(link.player_id, []);
    teamIdsByPlayer.get(link.player_id).push(link.team_id);
  }
  const nameById = new Map(players.map((item) => [item.id, item.name]));
  const histories = [...teamIdsByPlayer].map(([id, teamIds]) => ({ id, name: nameById.get(id), teamIds }));
  const history = teamIdsByPlayer.get(player.id) || [];
  const overlap = getOverlappingTeamIds(history, input.teamIds);
  const ranked = rankPlayersByOverlap(histories, input.teamIds);
  const topScore = ranked[0]?.score || 0;
  const best = ranked
    .filter((item) => item.score === topScore)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return {
    player,
    score: scoreGuess(history, input.teamIds),
    matchingTeams: teams.filter((team) => overlap.includes(team.id)),
    bestAnswers: best.slice(0, MAX_BEST_ANSWERS),
    bestAnswerCount: best.length,
    topScore,
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new TypeError('The guess request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new TypeError('Send a valid JSON guess.');
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function createServer(db) {
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/api/game-data') {
        return sendJson(response, 200, getGameData(db));
      }
      if (request.method === 'POST' && url.pathname === '/api/guess') {
        if (!request.headers['content-type']?.startsWith('application/json')) {
          return sendJson(response, 415, { error: 'Send guesses as application/json.' });
        }
        const result = evaluateGuess(db, await readJson(request));
        return sendJson(response, 200, result);
      }
      const asset = Object.hasOwn(ASSETS, url.pathname) ? ASSETS[url.pathname] : null;
      if (request.method === 'GET' && asset) {
        const content = await fs.promises.readFile(path.join(__dirname, asset[0]));
        response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        return response.end(content);
      }
      return sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof TypeError) {
        return sendJson(response, 400, { error: error.message });
      }
      console.error(error);
      return sendJson(response, 500, { error: 'Something went wrong. Please try again.' });
    }
  });
}

if (require.main === module) {
  const db = openDb();
  if (db.prepare('SELECT COUNT(*) AS count FROM players').get().count === 0) {
    const [filePath, label] = FILE_SOURCES[defaultSource()];
    replaceDataset(db, readDataset(filePath), label);
  }
  const server = createServer(db);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  server.on('error', (error) => {
    console.error(`Could not start the game: ${error.message}`);
    db.close();
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Football Guess Game is ready at http://${host}:${port}`);
  });
  const shutdown = () => server.close(() => {
    db.close();
    process.exit(0);
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createServer, getGameData, evaluateGuess };
