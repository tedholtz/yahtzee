// Pip layout per face, decoded from the original 1978 BASIC drawing routine
// (lines 6070-6230 of YAHTZEE.bas): each face is 3 rows of [left, mid, right].
// Box-drawing characters and the pip glyph are standard single-width glyphs
// on virtually every terminal font, unlike the Unicode die-face symbols
// (U+2680-U+2685), which render double-width in some fonts and corrupt
// fixed-column layouts - so this is the safe way to draw a "real" die.
const PIP_PATTERNS = {
  1: [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
  2: [[0, 0, 1], [0, 0, 0], [1, 0, 0]],
  3: [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
  4: [[1, 0, 1], [0, 0, 0], [1, 0, 1]],
  5: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  6: [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
};

export const BOX_WIDTH = 9;
export const BOX_HEIGHT = 5;

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
