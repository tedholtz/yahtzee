const NAME_POOL = [
  'HAL', 'ELIZA', 'MARVIN', 'WATSON', 'MULTIVAC', 'DEEP THOUGHT', 'WOPR',
  'TURING', 'ADA', 'NOVA', 'ECHO', 'ATLAS', 'CORTEX', 'ARIA', 'JARVIS',
  'BALTIE', 'UNIVAC', 'ENIAC', 'SKYNET JR', 'BINARY', 'OCTAL', 'VECTOR',
  'QUBIT', 'CIRCUIT', 'MAINFRAME',
];

/** Picks `count` distinct random computer-player names, with a numbered fallback if the pool runs out. */
export function pickComputerNames(count) {
  const pool = [...NAME_POOL];
  const names = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      names.push(`COMPUTER ${i + 1}`);
      continue;
    }
    const idx = Math.floor(Math.random() * pool.length);
    names.push(pool.splice(idx, 1)[0]);
  }
  return names;
}
