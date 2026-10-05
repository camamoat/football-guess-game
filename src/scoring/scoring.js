/**
 * Core game logic for the football team-overlap guessing game.
 *
 * Rules:
 * - A set of teams is selected for a round (by the players).
 * - Players guess a football player they believe has played for some
 *   of those teams.
 * - Score = number of selected teams that the guessed player has
 *   actually played for (1 point per matching team).
 * - A guess with zero overlap is invalid and scores 0.
 *
 * All functions here are pure (no I/O, no DB) so they're cheap and
 * fast to unit test in isolation from the data layer.
 */

/**
 * @param {number[]} playerTeamIds - distinct team IDs the guessed player has played for
 * @param {number[]} selectedTeamIds - team IDs chosen for this round
 * @returns {number[]} the team IDs that appear in both lists (deduplicated)
 */
function getOverlappingTeamIds(playerTeamIds, selectedTeamIds) {
  const playerSet = new Set(playerTeamIds);
  const selectedSet = new Set(selectedTeamIds);
  const overlap = [];
  for (const teamId of selectedSet) {
    if (playerSet.has(teamId)) overlap.push(teamId);
  }
  return overlap;
}

/**
 * @param {number[]} playerTeamIds
 * @param {number[]} selectedTeamIds
 * @returns {number} points scored for this guess (0 if no overlap)
 */
function scoreGuess(playerTeamIds, selectedTeamIds) {
  if (!Array.isArray(playerTeamIds) || !Array.isArray(selectedTeamIds)) {
    throw new TypeError('playerTeamIds and selectedTeamIds must both be arrays');
  }
  return getOverlappingTeamIds(playerTeamIds, selectedTeamIds).length;
}

/**
 * @param {number[]} playerTeamIds
 * @param {number[]} selectedTeamIds
 * @returns {boolean} true if the guessed player links at least one selected team
 */
function isValidGuess(playerTeamIds, selectedTeamIds) {
  return scoreGuess(playerTeamIds, selectedTeamIds) > 0;
}

/**
 * Given a pool of players (each with their team history) and the teams
 * selected for the round, return players sorted by overlap score
 * descending. Useful for picking a "best possible answer" to show
 * players after a round, or for generating round difficulty.
 *
 * @param {{id: number, name: string, teamIds: number[]}[]} players
 * @param {number[]} selectedTeamIds
 * @returns {{id: number, name: string, score: number}[]}
 */
function rankPlayersByOverlap(players, selectedTeamIds) {
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: scoreGuess(p.teamIds, selectedTeamIds),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  getOverlappingTeamIds,
  scoreGuess,
  isValidGuess,
  rankPlayersByOverlap,
};
