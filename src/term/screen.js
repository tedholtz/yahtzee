const ENTER_ALT_SCREEN = '\x1b[?1049h';
const LEAVE_ALT_SCREEN = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CURSOR_HOME = '\x1b[H';

const STYLE_CODES = {
  inverse: { on: '\x1b[7m', off: '\x1b[27m' },
  bold: { on: '\x1b[1m', off: '\x1b[22m' },
  dim: { on: '\x1b[2m', off: '\x1b[22m' },
};

/**
 * A minimal full-redraw text-screen abstraction: a plain-text buffer of
 * fixed-width rows, plus a style overlay (inverse video, bold, dim) applied
 * on top at render time (so width math never has to account for embedded
 * ANSI codes).
 */
export class Screen {
  constructor({ stdout = process.stdout, stdin = process.stdin } = {}) {
    this.stdout = stdout;
    this.stdin = stdin;
    this.buffer = [];
  }

  get width() {
    return this.stdout.columns || 80;
  }

  get height() {
    return this.stdout.rows || 24;
  }

  start() {
    this.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
    if (this.stdin.isTTY) this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdin.setEncoding('utf8');
  }

  stop() {
    if (this.stdin.isTTY) this.stdin.setRawMode(false);
    this.stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN);
  }

  newFrame() {
    this.buffer = Array.from({ length: this.height }, () => '');
    this.styles = [];
    return this;
  }

  writeAt(row, col, text) {
    if (row < 0 || row >= this.buffer.length || col >= this.width) return;
    const clipped = text.slice(0, Math.max(0, this.width - col));
    const line = this.buffer[row].padEnd(col, ' ');
    this.buffer[row] = (line.slice(0, col) + clipped + line.slice(col + clipped.length)).slice(0, this.width);
  }

  centerAt(row, text) {
    this.writeAt(row, Math.max(0, Math.floor((this.width - text.length) / 2)), text);
  }

  /** Marks a region to render in a given style ('inverse' | 'bold' | 'dim'), without affecting width math. */
  style(row, col, length, kind = 'inverse') {
    this.styles.push({ row, col, length, kind });
  }

  /** Shorthand for style(..., 'inverse'). */
  highlight(row, col, length) {
    this.style(row, col, length, 'inverse');
  }

  render() {
    const lines = this.buffer.map((line) => line.padEnd(this.width, ' '));

    const byRow = new Map();
    for (const s of this.styles || []) {
      if (s.row < 0 || s.row >= lines.length) continue;
      if (!byRow.has(s.row)) byRow.set(s.row, []);
      byRow.get(s.row).push(s);
    }
    // Multiple styled spans on the same row must all be built in one pass
    // against the ORIGINAL plain text: slicing a row already containing a
    // previously-inserted escape code shifts every later column index left
    // by that code's length, misplacing any span after the first.
    for (const [rowIdx, spans] of byRow) {
      const line = lines[rowIdx];
      spans.sort((a, b) => a.col - b.col);
      let result = '';
      let pos = 0;
      for (const s of spans) {
        const start = Math.max(pos, s.col);
        const end = Math.max(start, s.col + s.length);
        const codes = STYLE_CODES[s.kind] || STYLE_CODES.inverse;
        result += line.slice(pos, start);
        result += `${codes.on}${line.slice(start, end)}${codes.off}`;
        pos = end;
      }
      result += line.slice(pos);
      lines[rowIdx] = result;
    }

    this.stdout.write(CURSOR_HOME + lines.join('\r\n'));
  }
}
