import { Dice } from './dice.js';
import { Player } from './player.js';
import { CATEGORIES, PERFECT_GAME_TOTAL } from './categories.js';
import { decideKeep, decideCategory, pickRandomSkill, SKILL_LETTERS } from './ai.js';
import { pickComputerNames } from './computerNames.js';
import { SCOREBOARD_ROWS, scoreboardCell } from './scoreboardRows.js';
import { Screen } from './term/screen.js';
import { createKeyReader, waitForKey, textInput } from './term/input.js';
import { dieBoxLines, BOX_WIDTH, BOX_HEIGHT } from './term/diceArt.js';

const MAX_PLAYERS = 5;
const GAMES_PER_SERIES = 6;
const ROUNDS_PER_GAME = 13;
const MAX_ROLLS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const screen = new Screen();
const reader = createKeyReader(screen.stdin);

let currentRender = null;
function setFrame(renderFn) {
  currentRender = () => {
    screen.newFrame();
    renderFn();
    screen.render();
  };
  currentRender();
}

function cleanupAndExit(code = 0) {
  reader.close();
  screen.stop();
  process.exit(code);
}

async function waitForSpace() {
  while (true) {
    const key = await waitForKey(reader);
    if (key.name === 'ctrl-c') cleanupAndExit();
    if (key.name === 'space') return;
  }
}

const SCOREBOARD_LABEL_WIDTH = 13;
const DICE_NUMBER_WIDTH = 2; // "1 " prefix before each die's box
const DICE_COL_WIDTH = DICE_NUMBER_WIDTH + BOX_WIDTH;
const DICE_GRID_GAP = 2;
const GRID_START_COL = DICE_COL_WIDTH + DICE_GRID_GAP;
const DICE_ROWS = BOX_HEIGHT * 5; // 5 boxes stacked directly - each one's own border already separates it

// Rows consumed by the header (with a spacer line) plus the taller of: the
// always-visible scorecard grid (player-name row + separator + 17 category
// rows + a blank spacer + the series-total row), or the dice column beside
// it. Every screen's height budget is this baseline plus however many extra
// rows its own content below both needs.
const GRID_ROWS = 2 + SCOREBOARD_ROWS.length + 2;
const BASELINE_ROWS = 2 + Math.max(GRID_ROWS, DICE_ROWS);

/** Draws up to 5 dice stacked vertically at column 0, as real bordered boxes with pips. Always consumes DICE_ROWS rows. */
function renderDiceColumn(startRow, values, kept) {
  for (let i = 0; i < 5; i++) {
    const top = startRow + i * BOX_HEIGHT;
    const lines = dieBoxLines(values[i], { held: kept[i] });
    for (let r = 0; r < BOX_HEIGHT; r++) {
      const prefix = r === 0 ? `${i + 1} ` : ' '.repeat(DICE_NUMBER_WIDTH);
      screen.writeAt(top + r, 0, prefix + lines[r]);
    }
  }
}

/** The first free row below both the grid and the dice column, whichever is taller. */
function contentRow(afterHeader, afterGrid) {
  return Math.max(afterGrid, afterHeader + DICE_ROWS);
}

/** Draws the compact one-line in-game header. Returns the next free row. */
function drawGameHeader({ game, round, player }) {
  screen.writeAt(0, 2, `Game ${game} of ${GAMES_PER_SERIES}  Round ${round} of ${ROUNDS_PER_GAME}  -  ${player.name}'s turn${player.isComputer ? ' (computer)' : ''}`);
  return 2;
}

function scoreboardColumnWidth(players) {
  return Math.min(12, Math.max(7, ...players.map((p) => p.name.length)));
}

const liveSeriesTotal = (p) => p.seriesTotal + p.scoreCard.grandTotal();

/**
 * Draws the always-visible scorecard grid (categories as rows, one column per player),
 * starting at GRID_START_COL so a dice column can sit to its left. Returns the next free row.
 * When `preview` is given ({ player, values (categoryId -> score), highlightCategoryId? }), the previewing
 * player's category rows get three distinct looks instead of all looking like plain numbers: the
 * highlighted category (if any) is inverse video, open (still-selectable) categories are dim with their
 * live preview score, and already-scored categories are bold. This is shown continuously while rolling,
 * and doubles as the category-selection UI (no separate screen).
 * `seriesTotalFor(player)` computes the series-total row's value; defaults to "series total so far plus
 * the current in-progress game" - pass `(p) => p.seriesTotal` once a game's score has already been
 * folded into seriesTotal, to avoid counting it twice.
 */
function drawScoreboardGrid(startRow, players, preview = null, seriesTotalFor = liveSeriesTotal) {
  const colWidth = scoreboardColumnWidth(players);
  let row = startRow;
  let col = GRID_START_COL + SCOREBOARD_LABEL_WIDTH + 1;
  players.forEach((pl) => {
    screen.writeAt(row, col, pl.name.slice(0, colWidth).padStart(colWidth));
    col += colWidth + 1;
  });
  row += 1;
  screen.writeAt(row, GRID_START_COL, '-'.repeat(SCOREBOARD_LABEL_WIDTH + (colWidth + 1) * players.length));
  row += 1;
  for (const r of SCOREBOARD_ROWS) {
    const isPreviewRow = preview && r.kind === 'cat';
    const isOpenForPreview = isPreviewRow && preview.values.has(r.id);
    const isHighlightedRow = isPreviewRow && preview.highlightCategoryId !== undefined && r.id === preview.highlightCategoryId;

    screen.writeAt(row, GRID_START_COL, r.label.padEnd(SCOREBOARD_LABEL_WIDTH));
    if (isHighlightedRow) screen.style(row, GRID_START_COL, SCOREBOARD_LABEL_WIDTH, 'inverse');
    else if (isPreviewRow) screen.style(row, GRID_START_COL, SCOREBOARD_LABEL_WIDTH, 'bold');

    let c = GRID_START_COL + SCOREBOARD_LABEL_WIDTH + 1;
    players.forEach((pl) => {
      const isPreviewCell = preview && pl === preview.player && isOpenForPreview;
      const text = isPreviewCell ? String(preview.values.get(r.id)) : scoreboardCell(pl, r);
      screen.writeAt(row, c, text.padStart(colWidth));
      if (preview && pl === preview.player && isPreviewRow) {
        if (isHighlightedRow) screen.style(row, c, colWidth, 'inverse');
        else screen.style(row, c, colWidth, isOpenForPreview ? 'dim' : 'bold');
      }
      c += colWidth + 1;
    });
    row += 1;
  }

  row += 1; // blank spacer before the series total
  screen.writeAt(row, GRID_START_COL, 'Series Total'.padEnd(SCOREBOARD_LABEL_WIDTH));
  let sc = GRID_START_COL + SCOREBOARD_LABEL_WIDTH + 1;
  players.forEach((pl) => {
    screen.writeAt(row, sc, String(seriesTotalFor(pl)).padStart(colWidth));
    sc += colWidth + 1;
  });
  row += 1;

  return row;
}

function requiredWidth(players) {
  return GRID_START_COL + SCOREBOARD_LABEL_WIDTH + (scoreboardColumnWidth(players) + 1) * players.length;
}

function layoutFits(players, extraRows) {
  return screen.width >= requiredWidth(players) && screen.height >= BASELINE_ROWS + extraRows;
}

function renderTooSmallExact(needW, needH) {
  const mid = Math.floor(screen.height / 2);
  screen.centerAt(Math.max(0, mid - 2), 'Terminal window is too small for this screen.');
  screen.centerAt(Math.max(0, mid - 1), `Need at least ${needW} columns x ${needH} rows.`);
  screen.centerAt(mid, `Currently ${screen.width} columns x ${screen.height} rows.`);
  screen.centerAt(Math.min(screen.height - 1, mid + 2), 'Please resize your terminal window...');
}

function renderTooSmall(players, extraRows) {
  renderTooSmallExact(requiredWidth(players), BASELINE_ROWS + extraRows);
}

/** Draws a full in-game frame, falling back to a resize prompt if the terminal is too small for it. */
function drawFrameOrResize(players, extraRows, drawFn) {
  if (!layoutFits(players, extraRows)) setFrame(() => renderTooSmall(players, extraRows));
  else setFrame(drawFn);
}

async function selectHumanPlayersScreen() {
  const players = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const { cancelled, value } = await textInput({
      reader,
      render: (value) =>
        setFrame(() => {
          screen.centerAt(1, 'Y A H T Z E E');
          screen.centerAt(3, 'PLAYER SELECTION');
          screen.centerAt(4, '(blank name to finish)');
          players.forEach((p, idx) => screen.writeAt(6 + idx, 4, `${idx + 1}. ${p.name}`));
          screen.writeAt(6 + players.length, 4, `${players.length + 1}. ${value}_`);
        }),
    });
    if (cancelled) cleanupAndExit();
    const name = value.trim();
    if (name === '') break;
    players.push(new Player(name, { isComputer: false }));
  }
  return players;
}

async function askComputerCount(maxAllowed) {
  let errorMsg = '';
  while (true) {
    const { cancelled, value } = await textInput({
      reader,
      render: (value) =>
        setFrame(() => {
          screen.centerAt(1, 'Y A H T Z E E');
          screen.centerAt(3, 'COMPUTER OPPONENTS');
          screen.centerAt(5, `How many computer opponents would you like? (0-${maxAllowed})`);
          screen.writeAt(7, 4, `> ${value}_`);
          if (errorMsg) screen.centerAt(9, errorMsg);
        }),
    });
    if (cancelled) cleanupAndExit();
    const n = Number(value.trim());
    if (Number.isInteger(n) && n >= 0 && n <= maxAllowed) return n;
    errorMsg = `Please enter a whole number from 0 to ${maxAllowed}.`;
  }
}

async function selectPlayersScreen() {
  const humans = await selectHumanPlayersScreen();
  const remainingSlots = MAX_PLAYERS - humans.length;
  let computerCount = 0;
  if (remainingSlots > 0) computerCount = await askComputerCount(remainingSlots);
  const computers = pickComputerNames(computerCount).map((name) => {
    const skill = pickRandomSkill();
    return new Player(`${name}-${SKILL_LETTERS[skill]}`, { isComputer: true, skill });
  });
  return [...humans, ...computers];
}

async function rollOffScreen(players) {
  if (players.length <= 1) return players;
  const rolled = players.map((p) => {
    const d = new Dice();
    d.rollAll();
    return { player: p, total: d.values.reduce((a, b) => a + b, 0), values: d.values };
  });
  rolled.sort((a, b) => b.total - a.total);
  setFrame(() => {
    screen.centerAt(1, 'Y A H T Z E E');
    screen.centerAt(3, 'Rolling to determine player order...');
    rolled.forEach((r, i) => screen.writeAt(5 + i, 4, `${r.player.name.padEnd(12)} ${r.values.join(' ')}  = ${r.total}`));
    let row = 5 + rolled.length + 2;
    screen.writeAt(row++, 4, 'Player order:');
    rolled.forEach((r, i) => screen.writeAt(row + i, 4, `${i + 1}. ${r.player.name}`));
    screen.centerAt(screen.height - 1, 'Press [SPACE] to continue...');
  });
  await waitForSpace();
  return rolled.map((r) => r.player);
}

async function humanTurn(player, header, order) {
  const dice = new Dice();
  dice.rollAll();
  let rolls = 1;
  let selected = 0;
  let categoryId = null;

  while (categoryId === null) {
    const open = player.scoreCard.openCategories();
    const canReroll = rolls < MAX_ROLLS;
    drawFrameOrResize(order, 1, () => {
      const afterHeader = drawGameHeader(header);
      renderDiceColumn(afterHeader, dice.values, dice.kept);
      const possible = player.scoreCard.possibleScores(dice.values);
      const afterGrid = drawScoreboardGrid(afterHeader, order, {
        player,
        values: possible,
        highlightCategoryId: open[selected].id,
      });
      screen.centerAt(
        contentRow(afterHeader, afterGrid),
        `Roll ${rolls} of ${MAX_ROLLS}.   [1-5] hold   [SPACE] reroll   [UP/DOWN] select   [ENTER] save score`
      );
    });

    const key = await waitForKey(reader);
    if (key.name === 'ctrl-c') cleanupAndExit();
    if (key.name === 'up') selected = (selected - 1 + open.length) % open.length;
    else if (key.name === 'down') selected = (selected + 1) % open.length;
    else if (key.name === 'enter') categoryId = open[selected].id;
    else if (key.name === 'char' && /^[1-5]$/.test(key.char)) dice.toggle(Number(key.char) - 1);
    else if (key.name === 'space' && canReroll) {
      dice.roll();
      rolls++;
    }
  }

  const scored = player.scoreCard.score(categoryId, dice.values);
  const perfect = player.scoreCard.isComplete() && player.scoreCard.grandTotal() === PERFECT_GAME_TOTAL;

  drawFrameOrResize(order, 1, () => {
    const afterHeader = drawGameHeader(header);
    renderDiceColumn(afterHeader, dice.values, dice.values.map(() => false));
    const afterGrid = drawScoreboardGrid(afterHeader, order);
    const message = `${player.name} scores ${scored} in ${CATEGORIES.find((c) => c.id === categoryId).label}.${perfect ? '  *** PERFECT GAME! ***' : ''}`;
    screen.centerAt(contentRow(afterHeader, afterGrid), message);
  });
  await sleep(700);
}

async function computerTurn(player, header, order) {
  const dice = new Dice();
  dice.rollAll();
  let rolls = 1;

  const show = async (message) => {
    drawFrameOrResize(order, 1, () => {
      const afterHeader = drawGameHeader(header);
      renderDiceColumn(afterHeader, dice.values, dice.kept);
      const possible = player.scoreCard.possibleScores(dice.values);
      const afterGrid = drawScoreboardGrid(afterHeader, order, { player, values: possible });
      screen.centerAt(contentRow(afterHeader, afterGrid), message);
    });
    await sleep(450);
  };

  await show(`${player.name} rolls...`);
  while (rolls < MAX_ROLLS) {
    const keepIdx = decideKeep(dice.values, player.scoreCard, player.skill);
    const keepSet = new Set(keepIdx);
    for (let i = 0; i < 5; i++) (keepSet.has(i) ? dice.keep(i) : dice.release(i));
    if (keepSet.size === 5) break;
    dice.roll();
    rolls++;
    await show(`${player.name} re-rolls...`);
  }

  const categoryId = decideCategory(player.scoreCard, dice.values, player.skill);
  const scored = player.scoreCard.score(categoryId, dice.values);
  const perfect = player.scoreCard.isComplete() && player.scoreCard.grandTotal() === PERFECT_GAME_TOTAL;
  drawFrameOrResize(order, 1, () => {
    const afterHeader = drawGameHeader(header);
    renderDiceColumn(afterHeader, dice.values, dice.values.map(() => false));
    const afterGrid = drawScoreboardGrid(afterHeader, order);
    const message = `${player.name} scores ${scored} in ${CATEGORIES.find((c) => c.id === categoryId).label}.${perfect ? '  *** PERFECT GAME! ***' : ''}`;
    screen.centerAt(contentRow(afterHeader, afterGrid), message);
  });
  await sleep(700);
}

async function askContinueSeries(order, gameNumber) {
  drawFrameOrResize(order, 1, () => {
    screen.writeAt(0, 2, `Game ${gameNumber} of ${GAMES_PER_SERIES} complete.`);
    const afterGrid = drawScoreboardGrid(2, order, null, (p) => p.seriesTotal);
    screen.centerAt(afterGrid, 'Press [SPACE] for the next game, or [Q] to end the series.');
  });
  while (true) {
    const key = await waitForKey(reader);
    if (key.name === 'ctrl-c') cleanupAndExit();
    if (key.name === 'space') return true;
    if (key.name === 'char' && key.char.toLowerCase() === 'q') return false;
  }
}

async function showStandings(players) {
  const ranked = [...players].sort((a, b) => b.seriesTotal - a.seriesTotal);
  setFrame(() => {
    screen.centerAt(1, 'SERIES STANDINGS');
    ranked.forEach((p, i) => screen.writeAt(3 + i, 4, `${i + 1}. ${p.name.padEnd(14)} ${p.seriesTotal}`));
    screen.centerAt(3 + ranked.length + 2, `CONGRATULATIONS, ${ranked[0].name}!`);
    screen.centerAt(screen.height - 1, 'Press [SPACE] to exit...');
  });
  await waitForSpace();
}

async function main() {
  screen.start();
  process.stdout.on('resize', () => {
    if (currentRender) currentRender();
  });
  process.on('SIGINT', () => cleanupAndExit(0));

  setFrame(() => {
    const mid = Math.floor(screen.height / 2);
    screen.centerAt(mid - 2, 'Y A H T Z E E');
    screen.centerAt(mid, 'Original 1978 Apple Computer game adapted by Gary A. Foote');
    screen.centerAt(mid + 1, 'Node.js port and adaptation by Ted Holtz');
    screen.centerAt(mid + 3, 'Press [SPACE] to begin...');
  });
  await waitForSpace();

  const players = await selectPlayersScreen();
  if (players.length === 0) {
    cleanupAndExit(0);
    return;
  }

  const order = await rollOffScreen(players);

  for (let game = 1; game <= GAMES_PER_SERIES; game++) {
    for (const p of order) p.newGame();
    for (let round = 1; round <= ROUNDS_PER_GAME; round++) {
      for (const player of order) {
        const header = { game, round, player };
        if (player.isComputer) await computerTurn(player, header, order);
        else await humanTurn(player, header, order);
      }
    }
    for (const p of order) p.seriesTotal += p.scoreCard.grandTotal();
    if (game < GAMES_PER_SERIES) {
      const keepGoing = await askContinueSeries(order, game);
      if (!keepGoing) break;
    }
  }

  await showStandings(order);
  cleanupAndExit(0);
}

main().catch((err) => {
  screen.stop();
  console.error(err);
  process.exit(1);
});
