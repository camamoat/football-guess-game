# Football Guess Game

A pass-and-play football trivia game. Players pick teams; then guess a
football player who has played for as many of those teams as possible.
Score = number of selected teams the guessed player actually played for.

## Status

Playable local prototype with a responsive browser interface, SQLite-backed
scoring, and a two-player pass-and-play match. Uses plain HTML, CSS, and
JavaScript with a Node HTTP server; no frontend build or API key is needed.
The bundled dataset is a Wikidata snapshot of 1,735 well-known footballers
across 27 curated clubs — broad, but not a complete career database.

## Project structure

```
src/
  game/
    match.js           -- shared match state: turns, rounds, scores, winner
    match.test.js
  server/
    server.js          -- local HTTP server, static assets, and scoring API
    server.test.js
  web/
    index.html         -- accessible browser interface
    styles.css         -- responsive layout
    app.js             -- browser interaction and API calls
  db/
    schema.sql        -- teams / players / player_teams tables
  scoring/
    scoring.js         -- pure game logic (no I/O) - the testable core
    scoring.test.js
  seed/
    clubs.json          -- curated club list with Wikidata IDs
    wikidata.js          -- imports a dataset from Wikidata (SPARQL, P54)
    wikidata-data.json   -- committed snapshot: 27 clubs, 1,735 players
    sample-data.json     -- tiny hand-curated fallback dataset
    seed.js              -- loads a dataset into SQLite (wikidata | sample | api)
    seed.test.js, wikidata.test.js
```

## Getting started

```bash
npm install
npm start                # opens SQLite; seeds the bundled dataset if no players exist
npm run seed             # re-seed data/game.db from the committed Wikidata snapshot
npm run import:wikidata  # optionally refresh the snapshot from Wikidata (network)
npm run lint
npm test                 # runs the full test suite
npm run test:coverage    # same, with a coverage report
```

Use Node.js 22 or newer, as required by `better-sqlite3` 13 (validated here on
Node.js 24). Older `better-sqlite3` releases can abort on Node.js 24.19+. Open
**http://127.0.0.1:3000** in a browser on the machine running the server.
`PORT=3001 npm start` selects another port. The server binds to loopback by
default. For a remote workspace, use your environment's port forwarding or
preview feature; your own laptop's localhost is not the remote machine.

### How to play

1. Enter two names and start a match.
2. Each player secretly picks one club, passing the device between picks. If
   both pick the same club, both pick again.
3. The two clubs are revealed. Each player then guesses one footballer, passing
   the device between guesses. Guesses and points are revealed only after both
   players have guessed, and both may name the same footballer.
4. One point is awarded for each of the two clubs the footballer played for
   according to the local dataset, up to 2 points per guess. Pick a name from
   the suggestions that appear as you type; free-typed names are not matched.
5. Play three rounds. Who picks and guesses first alternates each round. The
   highest cumulative score wins; equal scores are a draw.

The scoreboard and match state live in the browser and reset on reload.
**New match** resets the game with confirmation. This is a local casual game,
not an authenticated or cheat-resistant multiplayer service.

## Data strategy

The game never calls a live API during play. Team/player data is imported
once into a local SQLite DB, and the browser only talks to the local
server.

The default dataset comes from **Wikidata** (SPARQL, property P54 "member of
sports team") and is committed as `src/seed/wikidata-data.json`, so installing
and testing the game needs no network. It covers 1,735 players who played for
at least one of 27 curated clubs (`src/seed/clubs.json`), filtered to players
with at least 40 Wikipedia sitelinks so obscure players stay out of the game.
Wikidata data is CC0, so embedding the snapshot is fine.

```bash
npm run import:wikidata   # refresh the snapshot from Wikidata (needs network)
npm run seed              # load the snapshot into data/game.db (no network)
npm run seed:sample       # or switch data/game.db to the tiny sample dataset
```

`import:wikidata` accepts `--min-sitelinks=N` to widen or narrow the player
pool. Importing replaces the snapshot and seeding replaces the DB contents,
so switching datasets never mixes them.

Known tradeoff: 7 of the 351 club pairs have no shared player in the snapshot
(for example Arsenal + Porto or Dortmund + Porto), so a clash of those pairs
always scores 0-0. A refresh with a lower `--min-sitelinks` would add the
players who connect them.

An API-Football import remains available as an alternative for a curated
league approach:

```bash
API_FOOTBALL_KEY=your_key_here node src/seed/seed.js --source=api
```

API-Football's free tier is capped at **10 requests/minute and 100
requests/day** — far too low to query live during gameplay, but plenty for a
periodic seeding job. (`seedFromApi` in `seed.js` is still a stub — see the
comments there for what to fill in once you've picked which leagues/clubs to
curate.)

## Testing approach

- **Unit tests** (`scoring.test.js`): the scoring/overlap logic in
  isolation, including edge cases (no overlap, full overlap, ties,
  duplicate team selections, invalid input types).
- **Integration tests** (`seed.test.js`): the seeding pipeline against
  an in-memory SQLite DB, verifying upserts are idempotent, player-team
  links are correct, and dataset replacement is atomic. No network
  calls in tests or CI.
- **Wikidata tests** (`wikidata.test.js`): the SPARQL query builder and
  result parser (dedupe, name disambiguation, unknown-club rejection)
  against fixture JSON, plus club-pair coverage of the snapshot. No
  network calls.
- **Match tests** (`match.test.js`): secret picks, same-club re-picks,
  alternating turn order, handoffs, three rounds, winner/draw, and invalid
  state transitions.
- **HTTP tests** (`server.test.js`): static assets, database-backed scoring,
  malformed/invalid requests, and non-public file rejection. Use a temporary
  local server and an in-memory database, with no external network calls.
- **CI**: not configured yet. Run lint and tests locally.

## Roadmap

- [x] Browser frontend: team picker, guess input, scoreboard
- [x] Two-player match: turns, three rounds, results, winner, and restart
- [x] Expanded dataset: Wikidata import (27 clubs, 1,735 footballers)
- [ ] Round generator (pick N random teams with a guaranteed valid answer)
- [ ] E2E tests (Playwright) for the full game flow
- [ ] Implement `seedFromApi` against a curated list of leagues/clubs
- [ ] Online multiplayer (v2)
