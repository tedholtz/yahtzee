function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0]; // index by face value 1-6
  for (const d of dice) c[d]++;
  return c;
}

function sum(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

function sumOfFace(dice, face) {
  return dice.filter((d) => d === face).length * face;
}

function maxCount(dice) {
  return Math.max(...counts(dice).slice(1));
}

function isFullHouse(dice) {
  const c = counts(dice).slice(1).filter((n) => n > 0);
  return c.length === 2 && c.includes(3) && c.includes(2);
}

function hasRun(dice, length) {
  const present = new Set(dice);
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    run = present.has(face) ? run + 1 : 0;
    if (run >= length) return true;
  }
  return false;
}

export const CATEGORIES = [
  { id: 'ones', label: 'Aces', section: 'upper', score: (d) => sumOfFace(d, 1) },
  { id: 'twos', label: 'Twos', section: 'upper', score: (d) => sumOfFace(d, 2) },
  { id: 'threes', label: 'Threes', section: 'upper', score: (d) => sumOfFace(d, 3) },
  { id: 'fours', label: 'Fours', section: 'upper', score: (d) => sumOfFace(d, 4) },
  { id: 'fives', label: 'Fives', section: 'upper', score: (d) => sumOfFace(d, 5) },
  { id: 'sixes', label: 'Sixes', section: 'upper', score: (d) => sumOfFace(d, 6) },
  { id: 'threeKind', label: '3 of a Kind', section: 'lower', score: (d) => (maxCount(d) >= 3 ? sum(d) : 0) },
  { id: 'fourKind', label: '4 of a Kind', section: 'lower', score: (d) => (maxCount(d) >= 4 ? sum(d) : 0) },
  { id: 'fullHouse', label: 'Full House', section: 'lower', score: (d) => (isFullHouse(d) ? 25 : 0) },
  { id: 'smallStraight', label: 'Sm. Straight', section: 'lower', score: (d) => (hasRun(d, 4) ? 30 : 0) },
  { id: 'largeStraight', label: 'Lg. Straight', section: 'lower', score: (d) => (hasRun(d, 5) ? 40 : 0) },
  { id: 'yahtzee', label: 'Yahtzee', section: 'lower', score: (d) => (maxCount(d) >= 5 ? 50 : 0) },
  { id: 'chance', label: 'Chance', section: 'lower', score: (d) => sum(d) },
];

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const PERFECT_GAME_TOTAL = 375;
