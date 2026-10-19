import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, UPPER_BONUS_THRESHOLD, UPPER_BONUS } from '../src/categories.js';
import { ScoreCard } from '../src/scoreCard.js';

function scoreOf(id, dice) {
  return CATEGORIES.find((c) => c.id === id).score(dice);
}

test('upper section sums only matching faces', () => {
  assert.equal(scoreOf('ones', [1, 1, 2, 3, 4]), 2);
  assert.equal(scoreOf('sixes', [6, 6, 6, 1, 2]), 18);
  assert.equal(scoreOf('fours', [1, 2, 3, 5, 6]), 0);
});

test('three/four of a kind score the sum of all dice', () => {
  assert.equal(scoreOf('threeKind', [2, 2, 2, 5, 6]), 17);
  assert.equal(scoreOf('threeKind', [2, 2, 5, 5, 6]), 0);
  assert.equal(scoreOf('fourKind', [3, 3, 3, 3, 5]), 17);
  // a 4-of-a-kind also satisfies 3-of-a-kind's requirement
  assert.equal(scoreOf('threeKind', [3, 3, 3, 3, 5]), 17);
});

test('full house requires an exact 3+2 split, not five of a kind', () => {
  assert.equal(scoreOf('fullHouse', [2, 2, 3, 3, 3]), 25);
  assert.equal(scoreOf('fullHouse', [2, 2, 2, 2, 2]), 0);
  assert.equal(scoreOf('fullHouse', [2, 2, 2, 3, 5]), 0);
});

test('straights require a true consecutive run', () => {
  assert.equal(scoreOf('smallStraight', [1, 2, 3, 4, 4]), 30);
  assert.equal(scoreOf('smallStraight', [1, 2, 3, 5, 6]), 0);
  assert.equal(scoreOf('largeStraight', [2, 3, 4, 5, 6]), 40);
  assert.equal(scoreOf('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreOf('smallStraight', [1, 2, 3, 4, 6]), 30);
});

test('yahtzee and chance', () => {
  assert.equal(scoreOf('yahtzee', [4, 4, 4, 4, 4]), 50);
  assert.equal(scoreOf('yahtzee', [4, 4, 4, 4, 5]), 0);
  assert.equal(scoreOf('chance', [1, 2, 3, 4, 5]), 15);
});

test('ScoreCard rejects re-scoring a filled category', () => {
  const sc = new ScoreCard();
  sc.score('ones', [1, 1, 1, 2, 3]);
  assert.throws(() => sc.score('ones', [1, 1, 1, 2, 3]));
});

test('ScoreCard applies the upper bonus at the threshold', () => {
  const sc = new ScoreCard();
  sc.score('ones', [1, 1, 1, 1, 1]); // 5
  sc.score('twos', [2, 2, 2, 2, 2]); // 10
  sc.score('threes', [3, 3, 3, 3, 3]); // 15
  sc.score('fours', [4, 4, 4, 4, 4]); // 20
  sc.score('fives', [5, 5, 1, 1, 1]); // 10
  sc.score('sixes', [6, 1, 1, 1, 1]); // 6, upper = 66 >= 63
  assert.equal(sc.upperTotal(), 66);
  assert.equal(sc.upperBonus(), UPPER_BONUS);
  assert.ok(66 >= UPPER_BONUS_THRESHOLD);
  assert.equal(sc.grandTotal(), 66 + UPPER_BONUS);
});
