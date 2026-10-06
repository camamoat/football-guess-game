/* global FootballMatch */
const $ = (id) => document.getElementById(id);
const PANELS = ['picking', 'pick-handoff', 'clash', 'reveal', 'guessing', 'handoff', 'results'];
const PANEL_FOR_PHASE = {
  picking: 'picking',
  pickHandoff: 'pick-handoff',
  clash: 'clash',
  reveal: 'reveal',
  guessing: 'guessing',
  handoff: 'handoff',
  review: 'results',
  finished: 'results',
};
let data;
let playerIdByName;
let match;
let busy = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to connect to the game.');
  return body;
}

function teamName(id) {
  return data.teams.find((team) => team.id === id).name;
}

function playerName(index) {
  return match.players[index].name;
}

function nextPlayer() {
  return FootballMatch.turnOrder(match)[1];
}

function selectedTeamId() {
  const input = document.querySelector('#team-grid input:checked');
  return input ? Number(input.value) : null;
}

function buildPicker() {
  $('team-grid').replaceChildren();
  for (const team of data.teams) {
    const label = element('label', undefined, 'team-card');
    const input = element('input');
    input.type = 'radio';
    input.name = 'club';
    input.value = team.id;
    input.addEventListener('change', () => { $('lock-pick').disabled = false; });
    const copy = element('span', undefined, 'team-copy');
    copy.append(element('strong', team.name), element('span', team.country, 'team-country'));
    label.append(input, copy);
    $('team-grid').append(label);
  }
  $('lock-pick').disabled = true;
}

function activePlayer() {
  if (['picking', 'guessing'].includes(match.phase)) return FootballMatch.currentPlayer(match);
  if (['pickHandoff', 'handoff'].includes(match.phase)) return nextPlayer();
  if (match.phase === 'clash') return FootballMatch.turnOrder(match)[0];
  return null;
}

function renderScoreboard() {
  $('scoreboard').replaceChildren();
  const active = activePlayer();
  match.players.forEach((player, index) => {
    const card = element('div', undefined, 'score-card');
    if (index === active) card.classList.add('active');
    // Keep this round's scores private until both players have guessed.
    const pendingScore = ['guessing', 'handoff'].includes(match.phase) ? match.guesses[index]?.score || 0 : 0;
    const label = element('div');
    label.append(element('span', `PLAYER ${index + 1}`, 'eyebrow'), element('p', player.name, 'score-name'));
    const score = element('div', undefined, 'score');
    score.append(element('strong', String(player.score - pendingScore)), element('span', 'PTS'));
    card.append(label, score);
    $('scoreboard').append(card);
  });
}

function pickCards(container) {
  container.replaceChildren();
  FootballMatch.turnOrder(match).forEach((index) => {
    const card = element('div', undefined, 'result-card');
    card.append(element('p', `${playerName(index)} picked`, 'eyebrow'), element('h3', teamName(match.picks[index])));
    container.append(card);
  });
}

function renderResults() {
  const finished = match.phase === 'finished';
  $('results-eyebrow').textContent = finished ? 'FULL TIME' : `ROUND ${match.round} / THE REVEAL`;
  $('results-title').textContent = finished ? FootballMatch.winnerText(match) : 'Connections revealed.';
  $('guess-results').replaceChildren();
  FootballMatch.turnOrder(match).forEach((index) => {
    const guess = match.guesses[index];
    const card = element('div', undefined, 'result-card');
    card.append(element('p', playerName(index), 'eyebrow'), element('h3', guess.player.name));
    card.append(element('p', `+${guess.score} ${guess.score === 1 ? 'point' : 'points'}`, 'result-score'));
    card.append(element('p', guess.matchingTeams.length ?
      guess.matchingTeams.map((team) => team.name).join(' · ') :
      'No connections this time.', 'muted'));
    $('guess-results').append(card);
  });
  const best = match.guesses.find(Boolean);
  const others = best.bestAnswerCount - best.bestAnswers.length;
  $('best-answer').textContent = best.bestAnswers.length ?
    `${best.bestAnswers.map((answer) => answer.name).join(' / ')}${others > 0 ? ` and ${others} more` : ''}` +
      ` — ${best.topScore} of ${match.teamIds.length} clubs.` :
    'None of the footballers in this edition played for these clubs.';
  $('continue').textContent = finished ? 'Play again ↗' : 'Next round →';
}

function render() {
  const started = Boolean(match);
  $('setup').hidden = started;
  $('match').hidden = !started;
  if (!started) return;
  $('round-label').textContent = `ROUND ${match.round} OF ${match.totalRounds}`;
  renderScoreboard();
  const panel = PANEL_FOR_PHASE[match.phase];
  for (const id of PANELS) $(id).hidden = id !== panel;
  const [first, second] = FootballMatch.turnOrder(match);

  if (match.phase === 'picking') {
    const picker = FootballMatch.currentPlayer(match);
    const other = picker === first ? second : first;
    $('pick-title').textContent = `${playerName(picker)}, pick your secret club.`;
    $('pick-hint').textContent = `Make sure ${playerName(other)} isn’t looking.`;
    buildPicker();
    $('pick-title').focus();
  } else if (match.phase === 'pickHandoff') {
    $('pick-handoff-title').textContent = `Pass to ${playerName(second)}.`;
    $('pick-handoff-title').focus();
  } else if (match.phase === 'clash') {
    $('clash-title').textContent = `You both picked ${teamName(match.clashTeamId)}!`;
    $('clash-hint').textContent = `Both players pick again. Pass back to ${playerName(first)} to start.`;
    $('clash-title').focus();
  } else if (match.phase === 'reveal') {
    pickCards($('reveal-picks'));
    $('start-guessing').textContent = `Start guessing: ${playerName(first)} goes first →`;
    $('reveal-title').focus();
  } else if (match.phase === 'guessing') {
    $('turn-title').textContent = `${playerName(FootballMatch.currentPlayer(match))}, you’re up.`;
    $('selected-clubs').replaceChildren(...match.teamIds.map((id) => element('span', teamName(id), 'club-tag')));
    $('player-guess').value = '';
    $('turn-title').focus();
  } else if (match.phase === 'handoff') {
    $('handoff-title').textContent = `Pass to ${playerName(second)}.`;
    $('player-guess').value = '';
    $('handoff-title').focus();
  } else {
    renderResults();
    $('results-title').focus();
  }
}

function resetMatch() {
  match = null;
  showError('');
  render();
  $('player-one').focus();
}

function advance(action) {
  match = action(match);
  render();
}

$('setup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    match = FootballMatch.createMatch([$('player-one').value, $('player-two').value]);
    showError('');
    render();
  } catch (error) {
    showError(error.message);
  }
});

$('lock-pick').addEventListener('click', () => {
  const teamId = selectedTeamId();
  if (teamId !== null) advance((current) => FootballMatch.pickTeam(current, teamId));
});
$('pass-pick').addEventListener('click', () => advance(FootballMatch.passPick));
$('repick').addEventListener('click', () => advance(FootballMatch.repick));
$('start-guessing').addEventListener('click', () => advance(FootballMatch.startGuessing));
$('pass-turn').addEventListener('click', () => advance(FootballMatch.passTurn));

$('guess-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || match.phase !== 'guessing') return;
  const playerId = playerIdByName.get($('player-guess').value.trim().toLowerCase());
  if (!playerId) {
    showError('Choose a footballer from the suggestions as you type.');
    $('player-guess').focus();
    return;
  }
  busy = true;
  $('submit-guess').disabled = true;
  $('restart').disabled = true;
  $('submit-guess').textContent = 'Checking the connection…';
  showError('');
  try {
    const result = await request('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, teamIds: match.teamIds }),
    });
    match = FootballMatch.recordGuess(match, result);
    render();
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    $('submit-guess').disabled = false;
    $('restart').disabled = false;
    $('submit-guess').textContent = 'Submit guess →';
  }
});

$('continue').addEventListener('click', () => {
  if (match.phase === 'finished') return resetMatch();
  advance(FootballMatch.nextRound);
});

$('restart').addEventListener('click', () => {
  if (!busy && window.confirm('Start a new match? Your current scores will be cleared.')) resetMatch();
});

async function initialize() {
  try {
    data = await request('/api/game-data');
    if (data.teams.length < 2 || !data.players.length) {
      throw new Error('Not enough football data. Run npm run seed and reload.');
    }
    playerIdByName = new Map(data.players.map((player) => [player.name.toLowerCase(), player.id]));
    $('player-options').replaceChildren(...data.players.map((player) => {
      const option = element('option');
      option.value = player.name;
      return option;
    }));
    $('dataset-label').textContent =
      `${data.teams.length} clubs / ${data.players.length} footballers · Reloading resets the match.`;
    $('app').hidden = false;
  } catch (error) {
    showError(`${error.message} Reload to try again.`);
  } finally {
    $('loading').hidden = true;
  }
}

initialize();
