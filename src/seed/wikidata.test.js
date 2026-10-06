const { buildQuery, parseResults, unconnectedPairs, fetchDataset } = require('./wikidata');
const clubsFile = require('./clubs.json');
const snapshot = require('./wikidata-data.json');

const clubs = [
  { name: 'Manchester United', country: 'England', wikidataId: 'Q18656' },
  { name: 'Real Madrid', country: 'Spain', wikidataId: 'Q8682' },
  { name: 'Juventus', country: 'Italy', wikidataId: 'Q1422' },
];

const entity = (id) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${id}` });
function row(playerId, name, clubId, born) {
  return {
    player: entity(playerId),
    playerLabel: { value: name },
    club: entity(clubId),
    ...(born ? { born: { value: born } } : {}),
  };
}
const results = (...bindings) => ({ results: { bindings } });

describe('buildQuery', () => {
  test('includes every club and the popularity threshold', () => {
    const query = buildQuery(['Q18656', 'Q8682'], 40);
    expect(query).toContain('wd:Q18656 wd:Q8682');
    expect(query).toContain('?sitelinks >= 40');
    expect(query).toContain('wikibase:DeprecatedRank');
  });

  test.each([[[], 40], [['18656'], 40], [['Q1 } DROP'], 40], [['Q1'], -1], [['Q1'], 1.5]])(
    'rejects unsafe or invalid input %j', (ids, threshold) => {
      expect(() => buildQuery(ids, threshold)).toThrow(TypeError);
    }
  );
});

describe('parseResults', () => {
  test('groups clubs per player using display names and dedupes repeat spells', () => {
    const data = parseResults(results(
      row('Q11571', 'Cristiano Ronaldo', 'Q18656'),
      row('Q11571', 'Cristiano Ronaldo', 'Q8682'),
      row('Q11571', 'Cristiano Ronaldo', 'Q18656'),
      row('Q11571', 'Cristiano Ronaldo', 'Q1422'),
    ), clubs);
    expect(data.teams).toEqual(clubs.map(({ name, country }) => ({ name, country })));
    expect(data.players).toEqual([{
      name: 'Cristiano Ronaldo',
      wikidataId: 'Q11571',
      teams: ['Juventus', 'Manchester United', 'Real Madrid'],
    }]);
  });

  test('skips players without an English label and clubs outside the list', () => {
    const data = parseResults(results(
      row('Q1', 'Q1', 'Q18656'),
      row('Q2', '  ', 'Q18656'),
      row('Q3', 'Somebody', 'Q999'),
    ), clubs);
    expect(data.players).toEqual([]);
  });

  test('tells apart players who share a name by birth year, then by Wikidata ID', () => {
    const data = parseResults(results(
      row('Q10', 'Luis Suárez', 'Q8682', '1935'),
      row('Q20', 'Luis Suárez', 'Q1422', '1987'),
      row('Q30', 'Rafinha', 'Q18656', '1993'),
      row('Q40', 'Rafinha', 'Q8682', '1993'),
      row('Q50', 'Unique Name', 'Q8682', '1990'),
    ), clubs);
    expect(data.players.map((player) => player.name)).toEqual([
      'Luis Suárez (1935)', 'Luis Suárez (1987)', 'Rafinha (1993)', 'Rafinha (Q40)', 'Unique Name',
    ]);
  });
});

describe('unconnectedPairs', () => {
  test('lists club pairs that no player links', () => {
    const data = {
      teams: clubs,
      players: [{ name: 'A', teams: ['Juventus', 'Real Madrid'] }, { name: 'B', teams: ['Manchester United'] }],
    };
    expect(unconnectedPairs(data)).toEqual([
      ['Juventus', 'Manchester United'],
      ['Manchester United', 'Real Madrid'],
    ]);
  });
});

describe('fetchDataset', () => {
  test('sends an identifying User-Agent and parses the response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => results(row('Q11571', 'Cristiano Ronaldo', 'Q18656')),
    });
    const data = await fetchDataset({ clubs, minSitelinks: 10, fetchImpl });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/^https:\/\/query\.wikidata\.org\/sparql\?query=/);
    expect(decodeURIComponent(url)).toContain('?sitelinks >= 10');
    expect(options.headers['User-Agent']).toMatch(/football-guess-game/);
    expect(data.players).toHaveLength(1);
  });

  test('reports HTTP failures clearly', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(fetchDataset({ clubs, fetchImpl })).rejects.toThrow('HTTP 429');
  });
});

describe('committed Wikidata snapshot', () => {
  test('uses exactly the curated clubs', () => {
    expect(snapshot.teams.map((team) => team.name).sort())
      .toEqual(clubsFile.map((club) => club.name).sort());
  });

  test('has unique player names that only reference known clubs', () => {
    const teamNames = new Set(snapshot.teams.map((team) => team.name));
    const names = snapshot.players.map((player) => player.name);
    expect(snapshot.players.length).toBeGreaterThan(500);
    expect(new Set(names).size).toBe(names.length);
    for (const player of snapshot.players) {
      expect(player.teams.length).toBeGreaterThan(0);
      for (const team of player.teams) expect(teamNames.has(team)).toBe(true);
    }
  });
});
