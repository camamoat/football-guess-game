const {
  createMatch, turnOrder, currentPlayer, pickTeam, passPick, repick,
  startGuessing, recordGuess, passTurn, nextRound, winnerText,
} = require('./match');

function pickBoth(match, firstTeam, secondTeam) {
  match = pickTeam(match, firstTeam);
  match = passPick(match);
  return pickTeam(match, secondTeam);
}

// Scores are given in turn order: first guesser, then second guesser.
function playRound(match, firstScore, secondScore) {
  match = startGuessing(pickBoth(match, 1, 2));
  match = recordGuess(match, { score: firstScore });
  match = passTurn(match);
  return recordGuess(match, { score: secondScore });
}

describe('pass-and-play match', () => {
  test('creates a three-round match with trimmed names and zero scores', () => {
    const match = createMatch([' Alex ', 'Sam']);
    expect(match.players).toEqual([{ name: 'Alex', score: 0 }, { name: 'Sam', score: 0 }]);
    expect(match).toMatchObject({ round: 1, totalRounds: 3, phase: 'picking', step: 0, picks: [null, null] });
  });

  test.each([[], ['Only one'], ['', 'Sam'], [null, 'Sam'], ['x'.repeat(25), 'Sam']])(
    'rejects invalid player names: %j', (...names) => {
      expect(() => createMatch(names)).toThrow(TypeError);
    }
  );

  test.each([0, -1, 1.5, '2', null])('rejects invalid club pick %j', (teamId) => {
    expect(() => pickTeam(createMatch(['Alex', 'Sam']), teamId)).toThrow(TypeError);
  });

  test('each player picks one club in secret, then both are revealed', () => {
    let match = pickTeam(createMatch(['Alex', 'Sam']), 3);
    expect(match).toMatchObject({ phase: 'pickHandoff', picks: [3, null], teamIds: [] });
    expect(() => pickTeam(match, 4)).toThrow();
    match = passPick(match);
    expect(currentPlayer(match)).toBe(1);
    match = pickTeam(match, 5);
    expect(match).toMatchObject({ phase: 'reveal', picks: [3, 5], teamIds: [3, 5] });
  });

  test('picking the same club sends both players back to pick again', () => {
    let match = pickBoth(createMatch(['Alex', 'Sam']), 2, 2);
    expect(match).toMatchObject({ phase: 'clash', clashTeamId: 2, picks: [null, null], teamIds: [] });
    expect(() => startGuessing(match)).toThrow();
    match = repick(match);
    expect(match).toMatchObject({ phase: 'picking', step: 0 });
    expect(currentPlayer(match)).toBe(0);
    match = pickBoth(match, 2, 4);
    expect(match).toMatchObject({ phase: 'reveal', teamIds: [2, 4] });
  });

  test('guesses stay with the right player and require a handoff', () => {
    let match = startGuessing(pickBoth(createMatch(['Alex', 'Sam']), 1, 2));
    match = recordGuess(match, { score: 2 });
    expect(match.phase).toBe('handoff');
    expect(match.players.map((player) => player.score)).toEqual([2, 0]);
    expect(match.guesses).toEqual([{ score: 2 }, null]);
    expect(() => recordGuess(match, { score: 1 })).toThrow('Wait for your turn');
    match = recordGuess(passTurn(match), { score: 1 });
    expect(match.players.map((player) => player.score)).toEqual([2, 1]);
    expect(match.phase).toBe('review');
  });

  test.each([-1, 3, NaN, 1.5])('rejects invalid score %s', (score) => {
    const match = startGuessing(pickBoth(createMatch(['Alex', 'Sam']), 1, 2));
    expect(() => recordGuess(match, { score })).toThrow(TypeError);
  });

  test('the first picker and guesser alternates each round', () => {
    let match = createMatch(['Alex', 'Sam']);
    expect(turnOrder(match)).toEqual([0, 1]);
    match = nextRound(playRound(match, 0, 0));
    expect(turnOrder(match)).toEqual([1, 0]);
    expect(currentPlayer(match)).toBe(1);
    match = pickTeam(match, 4);
    expect(match.picks).toEqual([null, 4]);
    match = pickTeam(passPick(match), 6);
    expect(match.teamIds).toEqual([4, 6]);
    match = startGuessing(match);
    match = recordGuess(match, { score: 2 });
    expect(match.players.map((player) => player.score)).toEqual([0, 2]);
    match = recordGuess(passTurn(match), { score: 0 });
    match = nextRound(match);
    expect(turnOrder(match)).toEqual([0, 1]);
  });

  test('three rounds carry scores forward and announce a winner', () => {
    let match = createMatch(['Alex', 'Sam']);
    match = nextRound(playRound(match, 2, 1)); // Alex 2, Sam 1
    match = nextRound(playRound(match, 2, 0)); // Sam first: Sam 3, Alex 2
    match = playRound(match, 2, 0); // Alex 4, Sam 3
    expect(match.phase).toBe('finished');
    expect(match.players.map((player) => player.score)).toEqual([4, 3]);
    expect(winnerText(match)).toBe('Alex wins!');
    expect(() => nextRound(match)).toThrow();
  });

  test('announces a draw', () => {
    let match = createMatch(['Alex', 'Sam']);
    for (let round = 1; round <= 3; round++) {
      match = playRound(match, 1, 1);
      if (round < 3) match = nextRound(match);
    }
    expect(winnerText(match)).toBe("It's a draw!");
  });

  test('rejects out-of-order actions', () => {
    const match = createMatch(['Alex', 'Sam']);
    expect(() => recordGuess(match, { score: 1 })).toThrow();
    expect(() => passPick(match)).toThrow();
    expect(() => repick(match)).toThrow();
    expect(() => startGuessing(match)).toThrow();
    expect(() => passTurn(match)).toThrow();
    expect(() => nextRound(match)).toThrow();
    expect(() => winnerText(match)).toThrow();
  });
});
