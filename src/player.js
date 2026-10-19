import { ScoreCard } from './scoreCard.js';

export class Player {
  constructor(name, { isComputer = false } = {}) {
    this.name = name;
    this.isComputer = isComputer;
    this.scoreCard = new ScoreCard();
    this.seriesTotal = 0;
  }

  newGame() {
    this.scoreCard = new ScoreCard();
  }
}
