// Pip layout per face, decoded from the original 1978 BASIC drawing routine
// (lines 6070-6230 of YAHTZEE.bas): each face is 3 rows of [left, mid, right].
const PIP_PATTERNS = {
  1: [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
  2: [[0, 0, 1], [0, 0, 0], [1, 0, 0]],
  3: [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
  4: [[1, 0, 1], [0, 0, 0], [1, 0, 1]],
  5: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  6: [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
};

const DIE_GLYPHS = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };

export const BOX_WIDTH = 9;
export const BOX_HEIGHT = 5;

export function dieGlyph(value) {
  return DIE_GLYPHS[value] || '?';
}

/** Returns an array of BOX_HEIGHT strings, each BOX_WIDTH wide. */
export function dieBoxLines(value, { held = false } = {}) {
  const pattern = PIP_PATTERNS[value] || PIP_PATTERNS[1];
  const corner = held ? ['╔', '╗', '╚', '╝'] : ['┌', '┐', '└', '┘'];
  const h = held ? '═' : '─';
  const v = held ? '║' : '│';
  const lines = [corner[0] + h.repeat(BOX_WIDTH - 2) + corner[1]];
  for (const row of pattern) {
    const cells = [' ', ' ', ' ', ' ', ' ', ' ', ' '];
    if (row[0]) cells[1] = '●';
    if (row[1]) cells[3] = '●';
    if (row[2]) cells[5] = '●';
    lines.push(v + cells.join('') + v);
  }
  lines.push(corner[2] + h.repeat(BOX_WIDTH - 2) + corner[3]);
  return lines;
}
