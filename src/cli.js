import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Dice } from './dice.js';
import { Player } from './player.js';
import { CATEGORIES, PERFECT_GAME_TOTAL } from './categories.js';
import { decideKeep, decideCategory, pickRandomSkill, SKILL_LETTERS } from './ai.js';
import { pickComputerNames } from './computerNames.js';
import { SCOREBOARD_ROWS, scoreboardCell } from './scoreboardRows.js';

const rl = createInterface({ input: stdin, output: stdout });
const ask = (q) => rl.question(q);

const MAX_PLAYERS = 5;
const GAMES_PER_SERIES = 6;
const ROUNDS_PER_GAME = 13;
const MAX_ROLLS = 3;

function printDiceRow(dice) {
  const positions = dice.values.map((v, i) => {
    const label = `${i + 1}:${dice.kept[i] ? '[' : ' '}${v}${dice.kept[i] ? ']' : ' '}`;
    return label;
  });
  console.log(positions.join('  '));
}

function printScoreboard(players) {
  const labelWidth = 13;
  const colWidth = Math.min(12, Math.max(7, ...players.map((p) => p.name.length)));
  console.log();
  console.log(
    ' '.repeat(labelWidth) + ' ' + players.map((p) => p.name.slice(0, colWidth).padStart(colWidth)).join(' ')
  );
  console.log('-'.repeat(labelWidth + (colWidth + 1) * players.length));
  for (const r of SCOREBOARD_ROWS) {
    const cells = players.map((p) => scoreboardCell(p, r).padStart(colWidth)).join(' ');
    console.log(`${r.label.padEnd(labelWidth)} ${cells}`);
  }
}

async function rollOffForOrder(players) {
  console.log('\nRolling to determine player order...');
  const totals = players.map((p) => {
    const d = new Dice();
    d.rollAll();
    console.log(`  ${p.name}: ${d.values.join(' ')} = ${d.values.reduce((a, b) => a + b, 0)}`);
    return { player: p, total: d.values.reduce((a, b) => a + b, 0) };
  });
  totals.sort((a, b) => b.total - a.total);
  return totals.map((t) => t.player);
}

async function selectPlayers() {
  console.log('\n=== PLAYER SELECTION ===');
  console.log('(Enter a blank name when done.)');
  const humans = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const name = (await ask(`Enter player ${i + 1}'s name: `)).trim();
    if (name === '') break;
    humans.push(new Player(name, { isComputer: false }));
  }

  const remainingSlots = MAX_PLAYERS - humans.length;
  let computerCount = 0;
  if (remainingSlots > 0) {
    while (true) {
      const answer = (await ask(`How many computer opponents would you like? (0-${remainingSlots}): `)).trim();
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 0 && n <= remainingSlots) {
        computerCount = n;
        break;
      }
      console.log(`Please enter a whole number from 0 to ${remainingSlots}.`);
    }
  }

  const computers = pickComputerNames(computerCount).map((name) => {
    const skill = pickRandomSkill();
    return new Player(`${name}-${SKILL_LETTERS[skill]}`, { isComputer: true, skill });
  });
  return [...humans, ...computers];
}

async function humanTurn(player) {
  const dice = new Dice();
  dice.rollAll();
  let rolls = 1;
  printDiceRow(dice);

  while (rolls < MAX_ROLLS) {
    const answer = (await ask(
      `Roll ${rolls}/${MAX_ROLLS}. Dice to KEEP (e.g. "1 3 5"), blank to reroll all, or "score" to stop rolling: `
    )).trim();
    if (answer.toLowerCase() === 'score') break;

    const keepIdx = new Set(
      answer
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => Number(s) - 1)
        .filter((n) => n >= 0 && n < 5)
    );
    for (let i = 0; i < 5; i++) {
      if (keepIdx.has(i)) dice.keep(i);
      else dice.release(i);
    }
    dice.roll();
    rolls++;
    printDiceRow(dice);
  }

  const possible = player.scoreCard.possibleScores(dice.values);
  console.log('\nAvailable categories:');
  const open = player.scoreCard.openCategories();
  open.forEach((c, i) => console.log(`  ${i + 1}. ${c.label.padEnd(14)} -> ${possible.get(c.id)}`));

  let choice;
  while (true) {
    const answer = (await ask('Score which category (number)? ')).trim();
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= open.length) {
      choice = open[n - 1].id;
      break;
    }
    console.log('Invalid choice.');
  }
  const scored = player.scoreCard.score(choice, dice.values);
  console.log(`${player.name} scores ${scored} in ${CATEGORIES.find((c) => c.id === choice).label}.`);
}

function computerTurn(player) {
  const dice = new Dice();
  dice.rollAll();
  let rolls = 1;
  while (rolls < MAX_ROLLS) {
    const keepIdx = decideKeep(dice.values, player.scoreCard, player.skill);
    const keepSet = new Set(keepIdx);
    for (let i = 0; i < 5; i++) {
      if (keepSet.has(i)) dice.keep(i);
      else dice.release(i);
    }
    if (keepSet.size === 5) break; // nothing left to improve
    dice.roll();
    rolls++;
  }
  const categoryId = decideCategory(player.scoreCard, dice.values, player.skill);
  const scored = player.scoreCard.score(categoryId, dice.values);
  console.log(`${player.name} rolls ${dice.values.join(' ')} and scores ${scored} in ${CATEGORIES.find((c) => c.id === categoryId).label}.`);
}

async function playGame(players, gameNumber) {
  console.log(`\n========== GAME ${gameNumber} ==========`);
  for (const p of players) p.newGame();

  for (let round = 1; round <= ROUNDS_PER_GAME; round++) {
    console.log(`\n--- Round ${round} of ${ROUNDS_PER_GAME} ---`);
    for (const player of players) {
      console.log(`\n${player.name}'s turn:`);
      if (player.isComputer) computerTurn(player);
      else await humanTurn(player);
    }
  }

  console.log(`\n=== GAME ${gameNumber} RESULTS ===`);
  for (const p of players) p.seriesTotal += p.scoreCard.grandTotal();
  printScoreboard(players);
  for (const p of players) {
    if (p.scoreCard.grandTotal() === PERFECT_GAME_TOTAL) {
      console.log(`*** CONGRATULATIONS, ${p.name} - A PERFECT GAME! ***`);
    }
  }
}

function printStandings(players) {
  const ranked = [...players].sort((a, b) => b.seriesTotal - a.seriesTotal);
  console.log('\n=== SERIES STANDINGS ===');
  ranked.forEach((p, i) => console.log(`  ${i + 1}. ${p.name.padEnd(12)} ${p.seriesTotal}`));
  return ranked[0];
}

async function main() {
  console.log('Y A H T Z E E');
  console.log('Original 1978 Apple Computer game adapted by Gary A. Foote');
  console.log('Node.js port and adaptation by Ted Holtz\n');

  const players = await selectPlayers();
  if (players.length === 0) {
    console.log('No players entered. Goodbye.');
    rl.close();
    return;
  }

  let order = players;
  if (players.length > 1) order = await rollOffForOrder(players);

  console.log('\nPlayer order:');
  order.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));

  for (let game = 1; game <= GAMES_PER_SERIES; game++) {
    await playGame(order, game);
    if (game < GAMES_PER_SERIES) {
      const answer = (await ask('\nPress Enter for the next game, or type "end" to stop the series: ')).trim();
      if (answer.toLowerCase() === 'end') break;
    }
  }

  const winner = printStandings(order);
  console.log(`\nCONGRATULATIONS, YOU WON ${winner.name}!`);
  rl.close();
}

main();
