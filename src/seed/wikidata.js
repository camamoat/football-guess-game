#!/usr/bin/env node
/**
 * Builds a game dataset from Wikidata: every well-known association football
 * player who has a "member of sports team" (P54) statement for a curated club.
 *
 *   node src/seed/wikidata.js [--min-sitelinks=40]
 *
 * Writes src/seed/wikidata-data.json in the same shape as sample-data.json, so
 * the game and tests never need network access. Re-run it to refresh the data,
 * then run `npm run seed` to load it into the local database.
 *
 * Popularity is approximated by sitelinks (how many Wikipedia language editions
 * have an article on the player), which keeps obscure players out of the game.
 */
const fs = require('fs');
const path = require('path');

const CLUBS_PATH = path.join(__dirname, 'clubs.json');
const OUTPUT_PATH = path.join(__dirname, 'wikidata-data.json');
const ENDPOINT = 'https://query.wikidata.org/sparql';
// Wikidata's user-agent policy requires an identifying User-Agent.
const USER_AGENT = 'football-guess-game/0.1 (https://github.com/camamoat/football-guess-game)';
const DEFAULT_MIN_SITELINKS = 40;
const FOOTBALLER = 'Q937857';

function loadClubs() {
  return JSON.parse(fs.readFileSync(CLUBS_PATH, 'utf8'));
}

function buildQuery(clubIds, minSitelinks) {
  if (!Array.isArray(clubIds) || !clubIds.length || clubIds.some((id) => !/^Q\d+$/.test(id))) {
    throw new TypeError('clubIds must be a non-empty list of Wikidata IDs such as "Q18656"');
  }
  if (!Number.isInteger(minSitelinks) || minSitelinks < 0) {
    throw new TypeError('minSitelinks must be a non-negative integer');
  }
  return `SELECT ?player ?playerLabel ?club ?sitelinks (YEAR(?dob) AS ?born) WHERE {
  VALUES ?club { ${clubIds.map((id) => `wd:${id}`).join(' ')} }
  ?player p:P54 ?membership .
  ?membership ps:P54 ?club ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  ?player wdt:P106 wd:${FOOTBALLER} ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  OPTIONAL { ?player wdt:P569 ?dob }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

function entityId(uri) {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

/**
 * Turns SPARQL JSON results into { teams, players } with display club names.
 * Players without an English label are skipped. Players who share a name are
 * told apart by birth year, e.g. "Luis Suárez (1987)".
 */
function parseResults(json, clubs) {
  const clubNameById = new Map(clubs.map((club) => [club.wikidataId, club.name]));
  const byPlayer = new Map();
  for (const row of json.results.bindings) {
    const clubName = clubNameById.get(entityId(row.club.value));
    const name = row.playerLabel?.value?.trim();
    if (!clubName || !name || /^Q\d+$/.test(name)) continue;
    const id = entityId(row.player.value);
    const player = byPlayer.get(id) || { wikidataId: id, name, born: row.born?.value || null, teams: new Set() };
    player.teams.add(clubName);
    byPlayer.set(id, player);
  }

  const players = [...byPlayer.values()];
  const nameCounts = new Map();
  for (const player of players) nameCounts.set(player.name, (nameCounts.get(player.name) || 0) + 1);
  const usedNames = new Set();
  const result = players
    .sort((a, b) => a.wikidataId.localeCompare(b.wikidataId, 'en', { numeric: true }))
    .map((player) => {
      let name = player.name;
      if (nameCounts.get(name) > 1) name = `${name} (${player.born || player.wikidataId})`;
      // Same name and birth year: fall back to the Wikidata ID.
      if (usedNames.has(name)) name = `${player.name} (${player.wikidataId})`;
      usedNames.add(name);
      return { name, wikidataId: player.wikidataId, teams: [...player.teams].sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  return {
    teams: clubs.map(({ name, country }) => ({ name, country })),
    players: result,
  };
}

/** Club pairs that no player in the dataset connects, i.e. rounds worth at most 1 point. */
function unconnectedPairs(dataset) {
  const linked = new Set();
  for (const player of dataset.players) {
    for (const a of player.teams) {
      for (const b of player.teams) if (a < b) linked.add(`${a}|${b}`);
    }
  }
  const names = dataset.teams.map((team) => team.name).sort();
  const missing = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (!linked.has(`${names[i]}|${names[j]}`)) missing.push([names[i], names[j]]);
    }
  }
  return missing;
}

async function fetchDataset({ clubs = loadClubs(), minSitelinks = DEFAULT_MIN_SITELINKS, fetchImpl = fetch } = {}) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(buildQuery(clubs.map((club) => club.wikidataId), minSitelinks))}`;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`Wikidata query failed with HTTP ${response.status}. Try again in a few minutes.`);
  }
  return parseResults(await response.json(), clubs);
}

async function main() {
  const arg = process.argv.find((item) => item.startsWith('--min-sitelinks='));
  const minSitelinks = arg ? Number(arg.split('=')[1]) : DEFAULT_MIN_SITELINKS;
  const dataset = await fetchDataset({ minSitelinks });
  const snapshot = {
    source: 'Wikidata (CC0), property P54 "member of sports team"',
    retrieved: new Date().toISOString().slice(0, 10),
    minSitelinks,
    ...dataset,
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  const missing = unconnectedPairs(dataset);
  console.log(`Wrote ${dataset.players.length} players across ${dataset.teams.length} clubs to ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
  console.log(missing.length ?
    `${missing.length} club pairs have no connecting player:\n${missing.map((pair) => `  ${pair.join(' + ')}`).join('\n')}` :
    'Every pair of clubs has at least one connecting player.');
  console.log('Run `npm run seed` to load it into the game database.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { buildQuery, parseResults, unconnectedPairs, fetchDataset, OUTPUT_PATH };
