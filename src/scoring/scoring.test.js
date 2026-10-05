const {
  getOverlappingTeamIds,
  scoreGuess,
  isValidGuess,
  rankPlayersByOverlap,
} = require('./scoring');

describe('getOverlappingTeamIds', () => {
  test('returns team ids present in both lists', () => {
    expect(getOverlappingTeamIds([1, 2, 3], [2, 3, 4])).toEqual(
      expect.arrayContaining([2, 3])
    );
  });

  test('returns empty array when there is no overlap', () => {
    expect(getOverlappingTeamIds([1, 2], [3, 4])).toEqual([]);
  });

  test('deduplicates repeated selected team ids', () => {
    // e.g. a UI bug or double-click that adds the same team twice
    expect(getOverlappingTeamIds([1, 2], [1, 1, 2])).toEqual(
      expect.arrayContaining([1, 2])
    );
    expect(getOverlappingTeamIds([1, 2], [1, 1, 2])).toHaveLength(2);
  });

  test('handles empty selected teams', () => {
    expect(getOverlappingTeamIds([1, 2, 3], [])).toEqual([]);
  });

  test('handles a player with no team history', () => {
    expect(getOverlappingTeamIds([], [1, 2, 3])).toEqual([]);
  });
});

describe('scoreGuess', () => {
  test('scores 1 point per overlapping team', () => {
    expect(scoreGuess([1, 2, 3], [2, 3, 4])).toBe(2);
  });

  test('scores 0 for a completely wrong guess', () => {
    expect(scoreGuess([1, 2], [3, 4])).toBe(0);
  });

  test('scores full overlap when player played for every selected team', () => {
    expect(scoreGuess([1, 2, 3], [1, 2, 3])).toBe(3);
  });

  test('throws a clear error on non-array input', () => {
    expect(() => scoreGuess(null, [1, 2])).toThrow(TypeError);
    expect(() => scoreGuess([1, 2], undefined)).toThrow(TypeError);
  });
});

describe('isValidGuess', () => {
  test('is valid when there is at least one overlapping team', () => {
    expect(isValidGuess([1, 2], [2, 3])).toBe(true);
  });

  test('is invalid when there is no overlap', () => {
    expect(isValidGuess([1, 2], [3, 4])).toBe(false);
  });

  test('is invalid when selected teams is empty', () => {
    expect(isValidGuess([1, 2], [])).toBe(false);
  });
});

describe('rankPlayersByOverlap', () => {
  const players = [
    { id: 1, name: 'Player A', teamIds: [10, 20, 30] }, // overlaps 2
    { id: 2, name: 'Player B', teamIds: [10] },          // overlaps 1
    { id: 3, name: 'Player C', teamIds: [99] },          // overlaps 0
    { id: 4, name: 'Player D', teamIds: [10, 20] },      // overlaps 2 (tie with A)
  ];
  const selectedTeamIds = [10, 20];

  test('excludes players with zero overlap', () => {
    const ranked = rankPlayersByOverlap(players, selectedTeamIds);
    expect(ranked.find((p) => p.id === 3)).toBeUndefined();
  });

  test('sorts by score descending', () => {
    const ranked = rankPlayersByOverlap(players, selectedTeamIds);
    const scores = ranked.map((p) => p.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test('handles ties without dropping either player', () => {
    const ranked = rankPlayersByOverlap(players, selectedTeamIds);
    const ids = ranked.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([1, 4]));
  });

  test('returns empty array when no players overlap', () => {
    expect(rankPlayersByOverlap(players, [999])).toEqual([]);
  });
});
