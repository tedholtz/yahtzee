// Row order matches the original 1978 BASIC scorecard screen exactly
// (routine at line 8010 of YAHTZEE.bas: 6 upper categories, bonus, upper
// total, 7 lower categories, lower total, grand total).
export const SCOREBOARD_ROWS = [
  { kind: 'cat', id: 'ones', label: 'Aces' },
  { kind: 'cat', id: 'twos', label: 'Twos' },
  { kind: 'cat', id: 'threes', label: 'Threes' },
  { kind: 'cat', id: 'fours', label: 'Fours' },
  { kind: 'cat', id: 'fives', label: 'Fives' },
  { kind: 'cat', id: 'sixes', label: 'Sixes' },
  { kind: 'bonus', label: 'Bonus' },
  { kind: 'upperTotal', label: 'Upper Total' },
  { kind: 'cat', id: 'threeKind', label: '3/Kind' },
  { kind: 'cat', id: 'fourKind', label: '4/Kind' },
  { kind: 'cat', id: 'fullHouse', label: 'Fl.House' },
  { kind: 'cat', id: 'smallStraight', label: 'Sm.Strt' },
  { kind: 'cat', id: 'largeStraight', label: 'Lg.Strt' },
  { kind: 'cat', id: 'yahtzee', label: 'Yahtzee' },
  { kind: 'cat', id: 'chance', label: 'Chance' },
  { kind: 'lowerTotal', label: 'Lower Total' },
  { kind: 'grandTotal', label: 'GRAND TOTAL' },
];

export function scoreboardCell(player, row) {
  const sc = player.scoreCard;
  switch (row.kind) {
    case 'cat': {
      const value = sc.filled.get(row.id);
      return value === undefined ? '-' : String(value);
    }
    case 'bonus':
      return String(sc.upperBonus());
    case 'upperTotal':
      return String(sc.upperTotal());
    case 'lowerTotal':
      return String(sc.lowerTotal());
    case 'grandTotal':
      return String(sc.grandTotal());
    default:
      return '';
  }
}
