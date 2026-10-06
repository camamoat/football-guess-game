(function () {
  const ROUNDS = 3;

  function freshRound(round) {
    return {
      round,
      phase: 'picking',
      step: 0,
      picks: [null, null],
      clashTeamId: null,
      teamIds: [],
      guesses: [null, null],
    };
  }

  function createMatch(names) {
    if (!Array.isArray(names) || names.length !== 2 ||
        names.some((name) => typeof name !== 'string' || !name.trim() || name.trim().length > 24)) {
      throw new TypeError('Enter two player names, up to 24 characters each.');
    }
    return {
      players: names.map((name) => ({ name: name.trim(), score: 0 })),
      totalRounds: ROUNDS,
      ...freshRound(1),
    };
  }

  // Player one leads odd rounds and player two leads even rounds, for both picking and guessing.
  function turnOrder(match) {
    return match.round % 2 === 1 ? [0, 1] : [1, 0];
  }

  function currentPlayer(match) {
    return turnOrder(match)[match.step];
  }

  function pickTeam(match, teamId) {
    if (match.phase !== 'picking') throw new Error('It is not time to pick a club.');
    if (!Number.isSafeInteger(teamId) || teamId < 1) throw new TypeError('Choose one club.');
    const picks = [...match.picks];
    picks[currentPlayer(match)] = teamId;
    if (match.step === 0) return { ...match, picks, phase: 'pickHandoff' };
    if (picks[0] === picks[1]) {
      return { ...match, picks: [null, null], clashTeamId: teamId, phase: 'clash' };
    }
    return { ...match, picks, teamIds: turnOrder(match).map((index) => picks[index]), phase: 'reveal' };
  }

  function passPick(match) {
    if (match.phase !== 'pickHandoff') throw new Error('There is no pick to pass.');
    return { ...match, phase: 'picking', step: 1 };
  }

  function repick(match) {
    if (match.phase !== 'clash') throw new Error('There is no clash to resolve.');
    return { ...match, phase: 'picking', step: 0 };
  }

  function startGuessing(match) {
    if (match.phase !== 'reveal') throw new Error('Both players must pick a club first.');
    return { ...match, phase: 'guessing', step: 0 };
  }

  function recordGuess(match, result) {
    if (match.phase !== 'guessing') throw new Error('Wait for your turn to guess.');
    if (!result || !Number.isInteger(result.score) || result.score < 0 ||
        result.score > match.teamIds.length) {
      throw new TypeError('Invalid guess score.');
    }
    const guesser = currentPlayer(match);
    const guesses = [...match.guesses];
    guesses[guesser] = result;
    const players = match.players.map((player, index) => ({
      ...player,
      score: player.score + (index === guesser ? result.score : 0),
    }));
    const phase = match.step === 0 ? 'handoff' :
      (match.round === match.totalRounds ? 'finished' : 'review');
    return { ...match, players, guesses, phase };
  }

  function passTurn(match) {
    if (match.phase !== 'handoff') throw new Error('There is no turn to pass.');
    return { ...match, phase: 'guessing', step: 1 };
  }

  function nextRound(match) {
    if (match.phase !== 'review') throw new Error('Finish this round before continuing.');
    return { ...match, ...freshRound(match.round + 1) };
  }

  function winnerText(match) {
    if (match.phase !== 'finished') throw new Error('The match is not finished.');
    const [first, second] = match.players;
    if (first.score === second.score) return "It's a draw!";
    return `${first.score > second.score ? first.name : second.name} wins!`;
  }

  const api = {
    createMatch, turnOrder, currentPlayer, pickTeam, passPick, repick,
    startGuessing, recordGuess, passTurn, nextRound, winnerText,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.FootballMatch = api;
  }
})();
