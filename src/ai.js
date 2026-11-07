import { CATEGORIES } from './categories.js';

export const SKILL_LEVELS = ['rookie', 'amateur', 'expert'];
export const SKILL_LETTERS = { rookie: 'R', amateur: 'A', expert: 'E' };

export function pickRandomSkill() {
  return SKILL_LEVELS[Math.floor(Math.random() * SKILL_LEVELS.length)];
}

/**
 * Exact expected score of each category on a single fresh roll of 5 dice
 * (no rerolls), computed once by brute-forcing all 6^5 = 7776 equally
 * likely outcomes. Used as a baseline to judge how good the CURRENT roll
 * is for a category relative to normal - see `advantage` below. Only the
 * 'expert' skill tier uses this.
 */
function computeBaselineEV() {
  const totals = new Map(CATEGORIES.map((c) => [c.id, 0]));
  let count = 0;
  const dice = [0, 0, 0, 0, 0];
  for (dice[0] = 1; dice[0] <= 6; dice[0]++) {
    for (dice[1] = 1; dice[1] <= 6; dice[1]++) {
      for (dice[2] = 1; dice[2] <= 6; dice[2]++) {
        for (dice[3] = 1; dice[3] <= 6; dice[3]++) {
          for (dice[4] = 1; dice[4] <= 6; dice[4]++) {
            for (const c of CATEGORIES) totals.set(c.id, totals.get(c.id) + c.score(dice));
            count++;
          }
        }
      }
    }
  }
  const baseline = new Map();
  for (const [id, total] of totals) baseline.set(id, total / count);
  return baseline;
}

const BASELINE_EV = computeBaselineEV();

/**
 * How much better (or worse) `diceValues` is for `category` than an
 * average fresh roll. Rare, high-value categories (Yahtzee, straights) have
 * a low baseline, so even a modest roll toward one shows a large advantage;
 * flexible categories (Chance, 3-of-a-kind) have a high baseline, so only
 * an unusually good roll beats it. Ranking by advantage rather than raw
 * score keeps flexible categories in reserve for bad rolls instead of
 * spending them on merely-decent ones.
 */
function advantage(category, diceValues) {
  return category.score(diceValues) - BASELINE_EV.get(category.id);
}

/** Best achievable advantage across the still-open categories for this hand. */
function handValue(openCategories, diceValues) {
  let best = -Infinity;
  for (const c of openCategories) {
    const a = advantage(c, diceValues);
    if (a > best) best = a;
  }
  return best;
}

/** All 6^n possible face combinations for n dice, cached by n (0-5). */
const REROLL_OUTCOMES = [[[]]];
for (let n = 1; n <= 5; n++) {
  const smaller = REROLL_OUTCOMES[n - 1];
  const outcomes = [];
  for (let face = 1; face <= 6; face++) {
    for (const combo of smaller) outcomes.push([face, ...combo]);
  }
  REROLL_OUTCOMES[n] = outcomes;
}

function popcount(mask) {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}

/**
 * Expert reroll strategy: tries every one of the 32 possible keep/reroll
 * splits and, for each, computes the EXACT expected hand value (averaged
 * over every possible outcome of the dice being rerolled - at most
 * 6^5 = 7776, trivial to enumerate), then picks the split with the highest
 * expected value. Ties favor keeping more dice.
 */
function decideKeepExpert(diceValues, scoreCard) {
  const openCategories = scoreCard.openCategories();
  let bestMask = 0;
  let bestEV = -Infinity;

  for (let mask = 0; mask < 32; mask++) {
    const rerollIdx = [];
    for (let i = 0; i < 5; i++) if (!(mask & (1 << i))) rerollIdx.push(i);

    const outcomes = REROLL_OUTCOMES[rerollIdx.length];
    const finalDice = diceValues.slice();
    let total = 0;
    for (const outcome of outcomes) {
      for (let j = 0; j < rerollIdx.length; j++) finalDice[rerollIdx[j]] = outcome[j];
      total += handValue(openCategories, finalDice);
    }
    const ev = total / outcomes.length;

    if (ev > bestEV || (ev === bestEV && popcount(mask) > popcount(bestMask))) {
      bestEV = ev;
      bestMask = mask;
    }
  }

  const keepIdx = [];
  for (let i = 0; i < 5; i++) if (bestMask & (1 << i)) keepIdx.push(i);
  return keepIdx;
}

/** Expert category choice: whichever open category this roll most overperforms relative to its normal average. */
function decideCategoryExpert(scoreCard, diceValues) {
  const open = scoreCard.openCategories();
  let best = open[0];
  let bestAdvantage = advantage(best, diceValues);
  for (const c of open.slice(1)) {
    const a = advantage(c, diceValues);
    if (a > bestAdvantage) {
      bestAdvantage = a;
      best = c;
    }
  }
  return best.id;
}

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

/**
 * Amateur reroll strategy: pattern-matching heuristics rather than exact
 * expectation - keep the biggest same-face group, or chase an already
 * near-complete straight, but doesn't reason about hands it hasn't
 * basically already rolled.
 */
function decideKeepAmateur(diceValues, scoreCard) {
  const byFace = countsByFace(diceValues);
  const [, bestIdx] = [...byFace.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
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

const AMATEUR_ZERO_PRIORITY = ['yahtzee', 'largeStraight', 'fullHouse', 'smallStraight', 'fourKind', 'threeKind'];
const AMATEUR_UPPER_ORDER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

/** Amateur category choice: greedily takes the highest-scoring open category, with a fixed fallback order when nothing scores. */
function decideCategoryAmateur(scoreCard, diceValues) {
  const possible = scoreCard.possibleScores(diceValues);
  let best = null;
  for (const [id, value] of possible) {
    if (value > 0 && (best === null || value > best.value)) best = { id, value };
  }
  if (best) return best.id;

  for (const id of AMATEUR_ZERO_PRIORITY) if (scoreCard.isOpen(id)) return id;
  for (const id of AMATEUR_UPPER_ORDER) if (scoreCard.isOpen(id)) return id;
  return scoreCard.openCategories()[0].id;
}

/** Rookie reroll strategy: only ever notices a same-face pair or better; blind to straights, full houses, everything else. */
function decideKeepRookie(diceValues) {
  const byFace = countsByFace(diceValues);
  const [, bestIdx] = [...byFace.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return bestIdx.length >= 2 ? bestIdx : [];
}

/** Rookie category choice: takes the first open category (in fixed scorecard order) that scores anything at all. */
function decideCategoryRookie(scoreCard, diceValues) {
  const open = scoreCard.openCategories();
  for (const c of open) {
    if (c.score(diceValues) > 0) return c.id;
  }
  return open[0].id;
}

/** Returns the indices (0-4) of dice the computer player chooses to keep. */
export function decideKeep(diceValues, scoreCard, skill = 'expert') {
  if (skill === 'rookie') return decideKeepRookie(diceValues);
  if (skill === 'amateur') return decideKeepAmateur(diceValues, scoreCard);
  return decideKeepExpert(diceValues, scoreCard);
}

/** Returns the category id the computer player chooses to score into. */
export function decideCategory(scoreCard, diceValues, skill = 'expert') {
  if (skill === 'rookie') return decideCategoryRookie(scoreCard, diceValues);
  if (skill === 'amateur') return decideCategoryAmateur(scoreCard, diceValues);
  return decideCategoryExpert(scoreCard, diceValues);
}
