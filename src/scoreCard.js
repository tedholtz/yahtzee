import { CATEGORIES, UPPER_BONUS, UPPER_BONUS_THRESHOLD } from './categories.js';

export class ScoreCard {
  constructor() {
    this.filled = new Map(); // category id -> score
  }

  isOpen(id) {
    return !this.filled.has(id);
  }

  openCategories() {
    return CATEGORIES.filter((c) => this.isOpen(c.id));
  }

  possibleScores(diceValues) {
    const result = new Map();
    for (const c of this.openCategories()) result.set(c.id, c.score(diceValues));
    return result;
  }

  score(id, diceValues) {
    const category = CATEGORIES.find((c) => c.id === id);
    if (!category) throw new Error(`Unknown category: ${id}`);
    if (!this.isOpen(id)) throw new Error(`Category already scored: ${id}`);
    const value = category.score(diceValues);
    this.filled.set(id, value);
    return value;
  }

  upperTotal() {
    return CATEGORIES.filter((c) => c.section === 'upper')
      .reduce((sum, c) => sum + (this.filled.get(c.id) || 0), 0);
  }

  upperBonus() {
    return this.upperTotal() >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
  }

  lowerTotal() {
    return CATEGORIES.filter((c) => c.section === 'lower')
      .reduce((sum, c) => sum + (this.filled.get(c.id) || 0), 0);
  }

  grandTotal() {
    return this.upperTotal() + this.upperBonus() + this.lowerTotal();
  }

  isComplete() {
    return this.filled.size === CATEGORIES.length;
  }
}
