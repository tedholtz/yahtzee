export class Dice {
  constructor() {
    this.values = [0, 0, 0, 0, 0];
    this.kept = [false, false, false, false, false];
  }

  rollAll() {
    this.kept = [false, false, false, false, false];
    this.roll();
  }

  roll() {
    for (let i = 0; i < 5; i++) {
      if (!this.kept[i]) this.values[i] = 1 + Math.floor(Math.random() * 6);
    }
  }

  keep(i) {
    this.kept[i] = true;
  }

  release(i) {
    this.kept[i] = false;
  }

  toggle(i) {
    this.kept[i] = !this.kept[i];
  }

  toString() {
    return this.values.map((v, i) => (this.kept[i] ? `[${v}]` : ` ${v} `)).join(' ');
  }
}
