import { Dice } from './dice.js';
import { Player } from './player.js';
import { CATEGORIES, PERFECT_GAME_TOTAL } from './categories.js';
import { decideKeep, decideCategory } from './ai.js';
import { pickComputerNames } from './computerNames.js';
import { SCOREBOARD_ROWS, scoreboardCell } from './scoreboardRows.js';
import { Screen } from './term/screen.js';
import { createKeyReader, waitForKey, textInput, selectMenu, pressAnyKey } from './term/input.js';
import { dieBoxLines, dieGlyph, BOX_WIDTH, BOX_HEIGHT } from './term/diceArt.js';

const MAX_PLAYERS = 5;
const GAMES_PER_SERIES = 6;
const ROUNDS_PER_GAME = 13;
const MAX_ROLLS = 3;
const DICE_GAP = 2;
const BOX_MODE_WIDTH = BOX_WIDTH * 5 + DICE_GAP * 4 + 4;

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

async function anyKey() {
  const key = await pressAnyKey(reader);
  if (key.name === 'ctrl-c') cleanupAndExit();
  return key;
}

function centerWithin(text, width) {
  const t = text.length > width ? text.slice(0, width) : text;
  const left = Math.floor((width - t.length) / 2);
  return ' '.repeat(left) + t + ' '.repeat(width - t.length - left);
}

// Rows consumed by the header (with a spacer line) plus the always-visible
// scorecard grid (player-name row + separator + 17 category rows) plus a
// spacer before whatever comes next. Every screen's height budget is this
// baseline plus however many extra rows that screen itself needs.
const BASELINE_ROWS = 2 + (2 + SCOREBOARD_ROWS.length) + 1;

function diceBoxRows() {
  return BOX_HEIGHT + 1;
}

/** Picks box-art vs compact-glyph dice based on whichever actually fits. */
function diceDisplayMode() {
  const boxExtraRows = diceBoxRows() + 1; // dice box + one status line
  if (screen.width >= BOX_MODE_WIDTH && screen.height >= BASELINE_ROWS + boxExtraRows) return 'box';
  return 'glyph';
}

/** Renders a row of 5 dice, adapting to terminal size. Returns rows consumed. */
function renderDiceRow(startRow, values, kept) {
  if (diceDisplayMode() === 'box') {
    const totalWidth = BOX_WIDTH * 5 + DICE_GAP * 4;
    const startCol = Math.max(0, Math.floor((screen.width - totalWidth) / 2));
    const diceLines = values.map((v, i) => dieBoxLines(v, { held: kept[i] }));
    for (let r = 0; r < BOX_HEIGHT; r++) {
      let col = startCol;
      for (let i = 0; i < 5; i++) {
        screen.writeAt(startRow + r, col, diceLines[i][r]);
        col += BOX_WIDTH + DICE_GAP;
      }
    }
    let col = startCol;
    for (let i = 0; i < 5; i++) {
      screen.writeAt(startRow + BOX_HEIGHT, col, centerWithin(`${i + 1}:${kept[i] ? 'HOLD' : 'roll'}`, BOX_WIDTH));
      col += BOX_WIDTH + DICE_GAP;
    }
    return diceBoxRows();
  }
  const line = values.map((v, i) => `${i + 1}${kept[i] ? `[${dieGlyph(v)}]` : ` ${dieGlyph(v)} `}`).join('  ');
  screen.centerAt(startRow, line);
  return 1;
}

/** Draws the compact one-line in-game header. Returns the next free row. */
function drawGameHeader({ game, round, player }) {
  screen.writeAt(0, 2, `Game ${game} of ${GAMES_PER_SERIES}  Round ${round} of ${ROUNDS_PER_GAME}  -  ${player.name}'s turn${player.isComputer ? ' (computer)' : ''}`);
  return 2;
}

const SCOREBOARD_LABEL_WIDTH = 13;

function scoreboardColumnWidth(players) {
  return Math.min(12, Math.max(7, ...players.map((p) => p.name.length)));
}

/**
 * Draws the always-visible scorecard grid (categories as rows, one column per player). Returns the next free row.
 * When `preview` is given ({ player, values (categoryId -> score), highlightCategoryId? }), the previewing
 * player's category rows get three distinct looks instead of all looking like plain numbers: the
 * highlighted category (if any) is inverse video, open (still-selectable) categories are dim with their
 * live preview score, and already-scored categories are bold. This is shown continuously while rolling,
 * and doubles as the category-selection UI (no separate screen).
 */
function drawScoreboardGrid(startRow, players, preview = null) {
  const colWidth = scoreboardColumnWidth(players);
  let row = startRow;
  let col = SCOREBOARD_LABEL_WIDTH + 1;
  players.forEach((pl) => {
    screen.writeAt(row, col, pl.name.slice(0, colWidth).padStart(colWidth));
    col += colWidth + 1;
  });
  row += 1;
  screen.writeAt(row, 0, '-'.repeat(SCOREBOARD_LABEL_WIDTH + (colWidth + 1) * players.length));
  row += 1;
  for (const r of SCOREBOARD_ROWS) {
    const isPreviewRow = preview && r.kind === 'cat';
    const isOpenForPreview = isPreviewRow && preview.values.has(r.id);
    const isHighlightedRow = isPreviewRow && preview.highlightCategoryId !== undefined && r.id === preview.highlightCategoryId;

    screen.writeAt(row, 0, r.label.padEnd(SCOREBOARD_LABEL_WIDTH));
    if (isHighlightedRow) screen.style(row, 0, SCOREBOARD_LABEL_WIDTH, 'inverse');
    else if (isPreviewRow) screen.style(row, 0, SCOREBOARD_LABEL_WIDTH, 'bold');

    let c = SCOREBOARD_LABEL_WIDTH + 1;
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
  return row;
}

function requiredWidth(players) {
  return SCOREBOARD_LABEL_WIDTH + (scoreboardColumnWidth(players) + 1) * players.length;
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
  const computers = pickComputerNames(computerCount).map((name) => new Player(name, { isComputer: true }));
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
    screen.centerAt(screen.height - 1, 'Press any key to continue...');
  });
  await anyKey();
  return rolled.map((r) => r.player);
}

// Reuses the same always-visible grid+dice frame as the rolling screen - no
// separate screen. The currently-highlighted category is shown directly in
// the grid (row + cell highlighted, score previewed in the player's column).
// Returns { escaped: true } if the player backs out to keep rolling instead.
async function chooseCategoryMenu(player, diceValues, header, order) {
  const open = player.scoreCard.openCategories();
  const possible = player.scoreCard.possibleScores(diceValues);
  const mode = diceDisplayMode();
  const extraRows = (mode === 'box' ? diceBoxRows() : 1) + 1;
  const { index, cancelled, escaped } = await selectMenu({
    reader,
    itemCount: open.length,
    render: (idx) =>
      drawFrameOrResize(order, extraRows, () => {
        const afterHeader = drawGameHeader(header);
        const afterGrid = drawScoreboardGrid(afterHeader, order, {
          player,
          values: possible,
          highlightCategoryId: open[idx].id,
        });
        const afterDice = renderDiceRow(afterGrid + 1, diceValues, diceValues.map(() => false));
        screen.centerAt(afterGrid + 1 + afterDice, '[UP/DOWN] select     [ENTER] confirm     [ESC] go back');
      }),
  });
  if (cancelled) cleanupAndExit();
  if (escaped) return { escaped: true };
  return { escaped: false, categoryId: open[index].id };
}

/** Shows the full scorecard grid (categories as rows, one column per player), paginating columns if the terminal is too narrow. */
async function showScoreboard(players, { message, extraLines = [] } = {}) {
  const labelWidth = 13;
  const colWidth = Math.min(12, Math.max(7, ...players.map((p) => p.name.length)));
  const maxCols = Math.max(1, Math.floor((screen.width - labelWidth - 1) / (colWidth + 1)));
  const pages = [];
  for (let i = 0; i < players.length; i += maxCols) pages.push(players.slice(i, i + maxCols));

  for (let p = 0; p < pages.length; p++) {
    const pagePlayers = pages[p];
    const isLastPage = p === pages.length - 1;
    setFrame(() => {
      let row = 0;
      if (message) {
        screen.centerAt(row, message);
        row += 2;
      }
      if (pages.length > 1) {
        screen.writeAt(row, 2, `Players ${p * maxCols + 1}-${p * maxCols + pagePlayers.length} of ${players.length}`);
        row += 1;
      }
      let col = labelWidth + 1;
      pagePlayers.forEach((pl) => {
        screen.writeAt(row, col, pl.name.slice(0, colWidth).padStart(colWidth));
        col += colWidth + 1;
      });
      row += 1;
      screen.writeAt(row, 0, '-'.repeat(labelWidth + (colWidth + 1) * pagePlayers.length));
      row += 1;
      for (const r of SCOREBOARD_ROWS) {
        screen.writeAt(row, 0, r.label.padEnd(labelWidth));
        let c = labelWidth + 1;
        pagePlayers.forEach((pl) => {
          screen.writeAt(row, c, scoreboardCell(pl, r).padStart(colWidth));
          c += colWidth + 1;
        });
        row += 1;
      }
      row += 1;
      if (isLastPage) {
        for (const line of extraLines) {
          screen.writeAt(row, 2, line);
          row += 1;
        }
        row += 1;
      }
      screen.centerAt(row, isLastPage ? 'Press any key to continue...' : 'Press any key for more columns...');
    });
    await anyKey();
  }
}

async function humanTurn(player, header, order) {
  const dice = new Dice();
  dice.rollAll();
  let rolls = 1;
  let categoryId = null;

  while (categoryId === null) {
    while (true) {
      const canReroll = rolls < MAX_ROLLS;
      const mode = diceDisplayMode();
      const extraRows = (mode === 'box' ? diceBoxRows() : 1) + 1;
      drawFrameOrResize(order, extraRows, () => {
        const afterHeader = drawGameHeader(header);
        const possible = player.scoreCard.possibleScores(dice.values);
        const afterGrid = drawScoreboardGrid(afterHeader, order, { player, values: possible });
        const afterDice = renderDiceRow(afterGrid + 1, dice.values, dice.kept);
        const row = afterGrid + 1 + afterDice;
        const hint = canReroll
          ? `Roll ${rolls} of ${MAX_ROLLS}.   [1-5] hold   [S] stop & score   [SPACE] reroll`
          : `Roll ${rolls} of ${MAX_ROLLS}.   No rolls left - [S] to choose a category.`;
        screen.centerAt(row, hint);
      });

      const key = await waitForKey(reader);
      if (key.name === 'ctrl-c') cleanupAndExit();
      if (key.name === 'char' && key.char.toLowerCase() === 's') break;
      if (key.name === 'char' && /^[1-5]$/.test(key.char)) {
        dice.toggle(Number(key.char) - 1);
        continue;
      }
      if (key.name === 'space' && canReroll) {
        dice.roll();
        rolls++;
      }
    }

    const result = await chooseCategoryMenu(player, dice.values, header, order);
    if (!result.escaped) categoryId = result.categoryId;
  }

  const scored = player.scoreCard.score(categoryId, dice.values);

  drawFrameOrResize(order, 1, () => {
    const afterHeader = drawGameHeader(header);
    const afterGrid = drawScoreboardGrid(afterHeader, order);
    screen.centerAt(afterGrid + 1, `${player.name} scores ${scored} in ${CATEGORIES.find((c) => c.id === categoryId).label}.`);
  });
  await sleep(700);
}

async function computerTurn(player, header, order) {
  const dice = new Dice();
  dice.rollAll();
  let rolls = 1;

  const show = async (message) => {
    const mode = diceDisplayMode();
    const extraRows = (mode === 'box' ? diceBoxRows() : 1) + 1;
    drawFrameOrResize(order, extraRows, () => {
      const afterHeader = drawGameHeader(header);
      const possible = player.scoreCard.possibleScores(dice.values);
      const afterGrid = drawScoreboardGrid(afterHeader, order, { player, values: possible });
      const afterDice = renderDiceRow(afterGrid + 1, dice.values, dice.kept);
      screen.centerAt(afterGrid + 1 + afterDice, message);
    });
    await sleep(450);
  };

  await show(`${player.name} rolls...`);
  while (rolls < MAX_ROLLS) {
    const keepIdx = decideKeep(dice.values, player.scoreCard);
    const keepSet = new Set(keepIdx);
    for (let i = 0; i < 5; i++) (keepSet.has(i) ? dice.keep(i) : dice.release(i));
    if (keepSet.size === 5) break;
    dice.roll();
    rolls++;
    await show(`${player.name} re-rolls...`);
  }

  const categoryId = decideCategory(player.scoreCard, dice.values);
  const scored = player.scoreCard.score(categoryId, dice.values);
  drawFrameOrResize(order, 1, () => {
    const afterHeader = drawGameHeader(header);
    const afterGrid = drawScoreboardGrid(afterHeader, order);
    screen.centerAt(afterGrid + 1, `${player.name} scores ${scored} in ${CATEGORIES.find((c) => c.id === categoryId).label}.`);
  });
  await sleep(700);
}

async function showGameResults(players, gameNumber) {
  for (const p of players) p.seriesTotal += p.scoreCard.grandTotal();

  const ranked = [...players].sort((a, b) => b.seriesTotal - a.seriesTotal);
  const extraLines = ['', 'Series totals so far:', ...ranked.map((p, i) => `  ${i + 1}. ${p.name.padEnd(14)} ${p.seriesTotal}`)];
  const perfect = players.find((p) => p.scoreCard.grandTotal() === PERFECT_GAME_TOTAL);
  if (perfect) extraLines.push('', `*** CONGRATULATIONS, ${perfect.name} - A PERFECT GAME! ***`);

  await showScoreboard(players, { message: `GAME ${gameNumber} RESULTS`, extraLines });
}

async function askContinueSeries() {
  setFrame(() => {
    screen.centerAt(Math.floor(screen.height / 2), 'Press ENTER for the next game, or Q to end the series.');
  });
  while (true) {
    const key = await waitForKey(reader);
    if (key.name === 'ctrl-c') cleanupAndExit();
    if (key.name === 'enter') return true;
    if (key.name === 'char' && key.char.toLowerCase() === 'q') return false;
  }
}

async function showStandings(players) {
  const ranked = [...players].sort((a, b) => b.seriesTotal - a.seriesTotal);
  setFrame(() => {
    screen.centerAt(1, 'SERIES STANDINGS');
    ranked.forEach((p, i) => screen.writeAt(3 + i, 4, `${i + 1}. ${p.name.padEnd(14)} ${p.seriesTotal}`));
    screen.centerAt(3 + ranked.length + 2, `CONGRATULATIONS, ${ranked[0].name}!`);
    screen.centerAt(screen.height - 1, 'Press any key to exit...');
  });
  await anyKey();
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
    screen.centerAt(mid + 3, 'Press any key to begin...');
  });
  await anyKey();

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
    await showGameResults(order, game);
    if (game < GAMES_PER_SERIES) {
      const keepGoing = await askContinueSeries();
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
