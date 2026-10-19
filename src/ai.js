function countsByFace(diceValues) {
  const map = new Map();
  diceValues.forEach((v, i) => {
    if (!map.has(v)) map.set(v, []);
    map.get(v).push(i);
  });
  return map;
}

function longestRunIndices(diceValues) {
  const present = new Set(diceValues);
  let bestRun = [];
  for (let start = 1; start <= 6; start++) {
    const run = [];
    for (let face = start; face <= 6 && present.has(face); face++) run.push(face);
    if (run.length > bestRun.length) bestRun = run;
  }
  return bestRun.map((face) => diceValues.indexOf(face));
}

/** Returns the indices (0-4) of dice the computer player chooses to keep. */
export function decideKeep(diceValues, scoreCard) {
  const byFace = countsByFace(diceValues);
  const [bestFace, bestIdx] = [...byFace.entries()].sort(
    (a, b) => b[1].length - a[1].length || b[0] - a[0]
  )[0];
  const bestCount = bestIdx.length;

  if (bestCount >= 4) return bestIdx;

  const run = longestRunIndices(diceValues);
  if (run.length >= 4 && (scoreCard.isOpen('largeStraight') || scoreCard.isOpen('smallStraight'))) {
    return run;
  }

  if (bestCount >= 2) return bestIdx;

  const maxVal = Math.max(...diceValues);
  return [diceValues.indexOf(maxVal)];
}

const ZERO_PRIORITY = ['yahtzee', 'largeStraight', 'fullHouse', 'smallStraight', 'fourKind', 'threeKind'];
const UPPER_ORDER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

/** Returns the category id the computer player chooses to score into. */
export function decideCategory(scoreCard, diceValues) {
  const possible = scoreCard.possibleScores(diceValues);
  let best = null;
  for (const [id, value] of possible) {
    if (value > 0 && (best === null || value > best.value)) best = { id, value };
  }
  if (best) return best.id;

  for (const id of ZERO_PRIORITY) if (scoreCard.isOpen(id)) return id;
  for (const id of UPPER_ORDER) if (scoreCard.isOpen(id)) return id;
  return scoreCard.openCategories()[0].id;
}
