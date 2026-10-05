# Football Guess Game

A pass-and-play football trivia game. Players pick teams; then guess a
football player who has played for as many of those teams as possible.
Score = number of selected teams the guessed player actually played for.

## Status

Early scaffold: data model, scoring engine, and seed pipeline are built
and tested. The playable UI (React) is the next step.

## Project structure

```
src/
  db/
    schema.sql        -- teams / players / player_teams tables
  scoring/
    scoring.js         -- pure game logic (no I/O) - the testable core
    scoring.test.js
  seed/
    sample-data.json   -- small hand-curated dataset, no API key needed
    seed.js             -- loads sample-data.json OR pulls from API-Football
    seed.test.js
.github/workflows/ci.yml -- lint + test on every push
```

## Getting started

```bash
npm install
npm run seed:sample   # populates data/game.db from the bundled sample data
npm test               # runs the full test suite
npm run test:coverage  # same, with a coverage report
```

## Data strategy

The game never calls a live football API during play. Team/player data
is pulled once via `src/seed/seed.js` and cached in a local SQLite DB.
This matters because API-Football's free tier is capped at **10
requests/minute and 100 requests/day** — far too low to query live
during gameplay, but plenty for a periodic seeding job.

To seed from the real API instead of the bundled sample data:

```bash
API_FOOTBALL_KEY=your_key_here npm run seed -- --source=api
```

(Note: `seedFromApi` in `seed.js` is currently a stub — see the comments
there for what to fill in once you've picked which leagues/clubs to
curate.)

## Testing approach

- **Unit tests** (`scoring.test.js`): the scoring/overlap logic in
  isolation, including edge cases (no overlap, full overlap, ties,
  duplicate team selections, invalid input types).
- **Integration tests** (`seed.test.js`): the seeding pipeline against
  an in-memory SQLite DB, verifying upserts are idempotent and
  player-team links are correct. No network calls in tests or CI.
- **CI**: GitHub Actions runs lint + tests with coverage on every push
  and PR.

## Roadmap

- [ ] React frontend: team picker, guess input, scoreboard
- [ ] Round generator (pick N random teams with a guaranteed valid answer)
- [ ] E2E tests (Playwright) for the full game flow
- [ ] Implement `seedFromApi` against a curated list of leagues/clubs
- [ ] Online multiplayer (v2)
