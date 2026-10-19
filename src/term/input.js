import { EventEmitter } from 'node:events';

const NAMED_SEQUENCES = {
  '\x03': 'ctrl-c',
  '\r': 'enter',
  '\n': 'enter',
  ' ': 'space',
  '\x7f': 'backspace',
  '\b': 'backspace',
  '\x1b': 'escape',
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
};

/** Wraps stdin (already in raw mode) and emits normalized {name, char} key events. */
export function createKeyReader(stdin = process.stdin) {
  const emitter = new EventEmitter();
  const onData = (chunk) => {
    const str = chunk.toString('utf8');
    const named = NAMED_SEQUENCES[str];
    if (named) {
      emitter.emit('key', { name: named });
      return;
    }
    for (const ch of str) {
      emitter.emit('key', { name: 'char', char: ch });
    }
  };
  stdin.on('data', onData);
  emitter.close = () => stdin.off('data', onData);
  return emitter;
}

export function waitForKey(reader) {
  return new Promise((resolve) => reader.once('key', resolve));
}

/** Drives a single-line text field, re-rendering the whole screen via `render(value)` after each change. */
export async function textInput({ reader, render, initial = '' }) {
  let value = initial;
  render(value);
  while (true) {
    const key = await waitForKey(reader);
    if (key.name === 'ctrl-c') return { cancelled: true, value };
    if (key.name === 'enter') return { cancelled: false, value };
    if (key.name === 'backspace') value = value.slice(0, -1);
    else if (key.name === 'space') value += ' ';
    else if (key.name === 'char') value += key.char;
    else continue;
    render(value);
  }
}

/** Drives an arrow-key navigable menu, re-rendering via `render(index)`. Escape resolves separately from Ctrl-C, for "go back" vs "quit". */
export async function selectMenu({ reader, render, itemCount, initialIndex = 0 }) {
  let index = initialIndex;
  render(index);
  while (true) {
    const key = await waitForKey(reader);
    if (key.name === 'ctrl-c') return { cancelled: true, escaped: false, index };
    if (key.name === 'escape') return { cancelled: false, escaped: true, index };
    if (key.name === 'up') index = (index - 1 + itemCount) % itemCount;
    else if (key.name === 'down') index = (index + 1) % itemCount;
    else if (key.name === 'enter') return { cancelled: false, escaped: false, index };
    else continue;
    render(index);
  }
}

/** Waits for any key press at all; resolves with it. */
export async function pressAnyKey(reader) {
  return waitForKey(reader);
}
