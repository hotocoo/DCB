/**
 * @typedef {Object} GameState
 * @property {string} id
 * @property {(undefined|'red'|'yellow')[][]} board
 * @property {Object} players
 * @property {Object} players.red
 * @property {string} players.red.id
 * @property {string} players.red.name
 * @property {string} players.red.symbol
 * @property {Object} players.yellow
 * @property {string} players.yellow.id
 * @property {string} players.yellow.name
 * @property {string} players.yellow.symbol
 * @property {'red'|'yellow'} currentPlayer
 * @property {'active'|'completed'} status
 * @property {boolean} isAI
 * @property {'easy'|'medium'|'hard'} difficulty
 * @property {number} created
 */

/**
 * @typedef {import('discord.js').ChatInputCommandInteraction} CommandInteraction
 * @typedef {import('discord.js').ButtonInteraction} ButtonInteraction
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { updateUserStats } from '../achievements.js';
import { connect4Games } from '../game-states.js';
import { CommandError, handleCommandError } from '../errorHandler.js';
import { safeInteractionReply, safeInteractionUpdate } from '../interactionHandlers.js';
import { logError } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('connect4')
  .setDescription('Play Connect Four - strategic dropping game')
  .addUserOption((option) => option.setName('opponent').setDescription('Player to challenge').setRequired(true))
  .addStringOption((option) =>
    option
      .setName('difficulty')
      .setDescription('AI difficulty (if playing against AI)')
      .addChoices({ name: 'Easy', value: 'easy' }, { name: 'Medium', value: 'medium' }, { name: 'Hard', value: 'hard' })
      .setRequired(false),
  );

/**
 * @param {CommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    const opponent = interaction.options.getUser('opponent');
    if (!opponent) throw new CommandError('Opponent not found.', 'INVALID_ARGUMENT');
    const difficulty = interaction.options.getString('difficulty') || 'medium';

    // Validation: Cannot play against self
    if (opponent.id === interaction.user.id) {
      throw new CommandError('You cannot play against yourself!', 'INVALID_ARGUMENT');
    }

    // Validation: Require difficulty for AI games
    if (opponent.bot && !difficulty) {
      throw new CommandError('Please specify difficulty when playing against AI.', 'INVALID_ARGUMENT');
    }

    // Generate unique game ID
    const gameId = `c4_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Initialize game state
    /** @type {GameState} */
    const gameState = {
      id: gameId,
      board: Array.from({ length: 6 }, () => /** @type {(undefined|'red'|'yellow')[]} */ (Array.from({ length: 7 }))),
      players: {
        red: { id: interaction.user.id, name: interaction.user.username, symbol: '🔴' },
        yellow: { id: opponent.id, name: opponent.username, symbol: '🟡' },
      },
      currentPlayer: /** @type {'red'|'yellow'} */ ('red'),
      status: /** @type {'active'|'completed'} */ ('active'),
      isAI: opponent.bot,
      difficulty: /** @type {'easy'|'medium'|'hard'} */ (difficulty || 'medium'),
      created: Date.now(),
    };

    // Store game state
    connect4Games.set(gameId, gameState);

    await sendConnect4Board(interaction, gameState);
  } catch (error) {
    await handleCommandError(interaction, error instanceof Error ? error : new CommandError(String(error), 'UNKNOWN_ERROR'));
  }
}

/**
 * Look up a player in the players object using Object.hasOwn to prevent
 * arbitrary-key access (security/detect-object-injection guard).
 * @param {GameState['players']} players
 * @param {string} key
 * @returns {{ id: string, name: string, symbol: string } | undefined}
 */
function getPlayer(players, key) {
  if (Object.hasOwn(players, key)) {
    // key validated above via Object.hasOwn
    // eslint-disable-next-line security/detect-object-injection
    return /** @type {{ id: string, name: string, symbol: string }} */ (players[/** @type {'red'|'yellow'} */ (key)]);
  }
}

/**
 * @param {CommandInteraction|ButtonInteraction} interaction
 * @param {GameState} gameState
 */
async function sendConnect4Board(interaction, gameState) {
  try {
    const { board, players, currentPlayer, status, isAI, difficulty, id } = gameState;

    // Check for winner
    const winner = checkConnect4Winner(board);
    if (winner) {
      gameState.status = 'completed';

      if (winner !== 'tie') {
        const winnerPlayer = getPlayer(players, winner);
        if (winnerPlayer && winnerPlayer.id !== 'ai' && winnerPlayer.id) {
          try {
            updateUserStats(winnerPlayer.id, { connect4_wins: 1 });
          } catch (statsError) {
            logError('Failed to update user stats', statsError, { userId: winnerPlayer.id });
          }
        }
      }

      // Clean up game state
      connect4Games.delete(id);

      const winnerPlayer = winner !== 'tie' ? getPlayer(players, winner) : undefined;
      const winnerName = winnerPlayer?.name ?? 'Unknown';

      const resultEmbed = new EmbedBuilder()
        .setTitle('🎯 Connect Four - Game Over!')
        .setColor(winner === 'tie' ? 0xff_a5_00 : 0x00_ff_00)
        .setDescription(winner === 'tie' ? "🤝 **It's a tie!**" : `🎉 **${winnerName} wins!**`)
        .addFields({
          name: 'Final Board',
          value: formatConnect4Board(board),
          inline: false,
        });

      if (interaction.replied || interaction.deferred) {
        await safeInteractionUpdate(interaction, { embeds: [resultEmbed], components: [] });
      } else {
        await safeInteractionReply(interaction, { embeds: [resultEmbed] });
      }
    }

    // Update game state in storage
    connect4Games.set(id, gameState);

    // currentPlayer is validated to be 'red' | 'yellow' via the GameState type,
    // so the player lookup is safe after the Object.hasOwn guard.
    const activePlayer = getPlayer(players, currentPlayer);
    const playerName = activePlayer?.name ?? 'Unknown';
    const playerSymbol = activePlayer?.symbol ?? '❓';

    const embed = new EmbedBuilder()
      .setTitle('🎯 Connect Four')
      .setColor(currentPlayer === 'red' ? 0xff_00_00 : 0xff_ff_00)
      .setDescription(`${playerName}'s turn ${playerSymbol}`)
      .addFields({
        name: 'Game Board',
        value: formatConnect4Board(board),
        inline: false,
      });

    // Create column buttons (0-6) - Split into two rows since max 5 per row.
    // The board helpers below only access `boardRow[col]` / `testBoard[row]` /
    // `preferredColumns[i]` etc. with loop-bounded integer indices, so the
    // security/detect-object-injection warnings there are false positives.
    /* eslint-disable security/detect-object-injection */
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    for (let col = 0; col < 7; col++) {
      const topRow = board[0];
      const canPlay = topRow ? topRow[col] === undefined : false;

      const button = new ButtonBuilder()
        .setCustomId(`c4_${col}_${id}`)
        .setLabel(`${col + 1}`)
        .setStyle(canPlay ? (currentPlayer === 'red' ? ButtonStyle.Danger : ButtonStyle.Secondary) : ButtonStyle.Secondary)
        .setDisabled(!canPlay || (isAI && currentPlayer === 'yellow'));

      if (col < 5) {
        row1.addComponents(button);
      } else {
        row2.addComponents(button);
      }
    }

    if (interaction.replied || interaction.deferred) {
      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row1, row2] });
    } else {
      await safeInteractionReply(interaction, { embeds: [embed], components: [row1, row2] });
    }

    // AI move if it's AI's turn
    if (isAI && currentPlayer === 'yellow' && status === 'active') {
      setTimeout(async () => {
        try {
          const aiMove = getConnect4AIMove(board, difficulty);
          if (aiMove !== undefined) {
            await makeConnect4Move(gameState, aiMove);
            await sendConnect4Board(interaction, gameState);
          }
        } catch (aiError) {
          logError('AI move error', aiError);
        }
      }, 1500);
    }
    /* eslint-enable security/detect-object-injection */
  } catch (error) {
    logError('sendConnect4Board error', error);
    await handleCommandError(
      interaction,
      new CommandError('Failed to update game board.', 'UNKNOWN_ERROR', { originalError: error instanceof Error ? error.message : String(error) }),
    );
  }
}

/**
 * @param {(undefined|'red'|'yellow')[][]} board
 *
 * Every `board[row]` / `boardRow[col]` access uses a loop-bounded integer
 * index and every `symbols[key]` access uses a literal cell string. The
 * security/detect-object-injection rule cannot prove that statically, so we
 * disable it at the function level with this justification.
 */
/* eslint-disable security/detect-object-injection */
function formatConnect4Board(board) {
  // Symbol map keyed only by literal cell strings — keys are static.
  const symbols = {
    red: '🔴',
    yellow: '🟡',
    empty: '⬜',
  };

  let formatted = '';
  for (let row = 0; row < 6; row++) {
    const boardRow = board[row];
    if (!boardRow) continue;
    for (let col = 0; col < 7; col++) {
      const cell = boardRow[col];
      const key = cell ?? 'empty';
      formatted += symbols[key];
    }
    formatted += '\n';
  }
  formatted += '1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣';
  return formatted;
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {(undefined|'red'|'yellow')[][]} board
 *
 * Note: every `board[row]` / `boardRow[col]` here uses a loop-bounded integer
 * index that has been validated against the row/column constants below. The
 * security/detect-object-injection rule cannot prove that statically, so we
 * disable it at the function level with this justification.
 */
/* eslint-disable security/detect-object-injection */
function checkConnect4Winner(board) {
  // Check horizontal
  for (let row = 0; row < 6; row++) {
    const boardRow = board[row];
    if (!boardRow) continue;
    for (let col = 0; col < 4; col++) {
      const cell = boardRow[col];
      if (cell && boardRow[col + 1] === cell && boardRow[col + 2] === cell && boardRow[col + 3] === cell) {
        return cell;
      }
    }
  }

  // Check vertical
  for (let row = 0; row < 3; row++) {
    const boardRow0 = board[row];
    const boardRow1 = board[row + 1];
    const boardRow2 = board[row + 2];
    const boardRow3 = board[row + 3];
    if (!boardRow0 || !boardRow1 || !boardRow2 || !boardRow3) continue;
    for (let col = 0; col < 7; col++) {
      const cell = boardRow0[col];
      if (cell && boardRow1[col] === cell && boardRow2[col] === cell && boardRow3[col] === cell) {
        return cell;
      }
    }
  }

  // Check diagonal (top-left to bottom-right)
  for (let row = 0; row < 3; row++) {
    const boardRow0 = board[row];
    const boardRow1 = board[row + 1];
    const boardRow2 = board[row + 2];
    const boardRow3 = board[row + 3];
    if (!boardRow0 || !boardRow1 || !boardRow2 || !boardRow3) continue;
    for (let col = 0; col < 4; col++) {
      const cell = boardRow0[col];
      if (cell && boardRow1[col + 1] === cell && boardRow2[col + 2] === cell && boardRow3[col + 3] === cell) {
        return cell;
      }
    }
  }

  // Check diagonal (top-right to bottom-left)
  for (let row = 0; row < 3; row++) {
    const boardRow0 = board[row];
    const boardRow1 = board[row + 1];
    const boardRow2 = board[row + 2];
    const boardRow3 = board[row + 3];
    if (!boardRow0 || !boardRow1 || !boardRow2 || !boardRow3) continue;
    for (let col = 3; col < 7; col++) {
      const cell = boardRow0[col];
      if (cell && boardRow1[col - 1] === cell && boardRow2[col - 2] === cell && boardRow3[col - 3] === cell) {
        return cell;
      }
    }
  }

  // Check for tie
  const topRow = board[0];
  if (topRow && topRow.every(Boolean)) {
    return 'tie';
  }
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {GameState} gameState
 * @param {number} column
 *
 * `column` is validated to be an integer in [0, 6] above and `row` is
 * loop-bounded, so the board index accesses are safe.
 */
/* eslint-disable security/detect-object-injection */
async function makeConnect4Move(gameState, column) {
  try {
    // Validate column input
    if (column < 0 || column > 6 || !Number.isInteger(column)) {
      throw new Error(`Invalid column: ${column}`);
    }

    const { board } = gameState;

    // Find the lowest available row in the column
    for (let row = 5; row >= 0; row--) {
      const boardRow = board[row];
      if (boardRow && boardRow[column] === undefined) {
        const { currentPlayer } = gameState;
        boardRow[column] = currentPlayer;
        gameState.currentPlayer = currentPlayer === 'red' ? 'yellow' : 'red';
        return true;
      }
    }

    return false; // Column is full
  } catch (error) {
    logError('makeConnect4Move error', error, { column });
    return false;
  }
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {(undefined|'red'|'yellow')[][]} board
 * @param {'easy'|'medium'|'hard'} difficulty
 *
 * Same justification as the other board helpers — every bracket access uses a
 * loop-bounded integer index or `Math.floor(random * length)` which is always
 * in range [0, length-1].
 */
/* eslint-disable security/detect-object-injection */
function getConnect4AIMove(board, difficulty) {
  try {
    /** @type {number[]} */
    const availableColumns = [];
    for (let col = 0; col < 7; col++) {
      const topRow = board[0];
      if (topRow && topRow[col] === undefined) {
        availableColumns.push(col);
      }
    }

    if (availableColumns.length === 0) return;

    switch (difficulty) {
      case 'easy': {
        // Random move, but prefer center columns
        const centerColumns = availableColumns.filter((col) => col >= 2 && col <= 4);
        const preferredColumns = centerColumns.length > 0 ? centerColumns : availableColumns;
        return preferredColumns[Math.floor(Math.random() * preferredColumns.length)];
      }

      case 'medium': {
        // Check for winning moves and blocking moves
        const winningCol = findConnect4WinningMove(board, 'yellow');
        if (winningCol !== undefined) return winningCol;

        const blockingCol = findConnect4WinningMove(board, 'red');
        if (blockingCol !== undefined) return blockingCol;

        // Prefer center
        const center = [3, 2, 4, 1, 5, 0, 6].find((col) => availableColumns.includes(col));
        if (center !== undefined) return center;
        return availableColumns[Math.floor(Math.random() * availableColumns.length)];
      }

      case 'hard': {
        // Use minimax algorithm for strategic play
        return getConnect4BestMove(board, 'yellow');
      }

      default: {
        return availableColumns[Math.floor(Math.random() * availableColumns.length)];
      }
    }
  } catch (error) {
    logError('getConnect4AIMove error', error, { difficulty });
    // Fallback to random move
    const fallbackColumns = [];
    for (let col = 0; col < 7; col++) {
      const topRow = board[0];
      if (topRow && topRow[col] === undefined) {
        fallbackColumns.push(col);
      }
    }
    if (fallbackColumns.length === 0) return;
    return fallbackColumns[Math.floor(Math.random() * fallbackColumns.length)];
  }
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {(undefined|'red'|'yellow')[][]} board
 * @param {'red'|'yellow'} player
 *
 * Same justification as above — every bracket access uses a loop-bounded
 * integer index.
 */
/* eslint-disable security/detect-object-injection */
function findConnect4WinningMove(board, player) {
  for (let col = 0; col < 7; col++) {
    const topRow = board[0];
    if (topRow && topRow[col] !== undefined) continue;

    // Test the move
    const testBoard = board.map(/** @param {(undefined|'red'|'yellow')[]} row */ (row) => [...row]);
    for (let row = 5; row >= 0; row--) {
      const testRow = testBoard[row];
      if (testRow && testRow[col] === undefined) {
        testRow[col] = player;
        if (checkConnect4Winner(testBoard) === player) {
          return col;
        }
        break;
      }
    }
  }
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {(undefined|'red'|'yellow')[][]} board
 * @param {'red'|'yellow'} player
 *
 * Same justification as above.
 */
/* eslint-disable security/detect-object-injection */
function getConnect4BestMove(board, player) {
  try {
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestCol;

    for (let col = 0; col < 7; col++) {
      const topRow = board[0];
      if (topRow && topRow[col] !== undefined) continue;

      const testBoard = board.map(/** @param {(undefined|'red'|'yellow')[]} row */ (row) => [...row]);
      let moveValid = false;

      for (let row = 5; row >= 0; row--) {
        const testRow = testBoard[row];
        if (testRow && testRow[col] === undefined) {
          testRow[col] = player;
          const score = evaluateConnect4Position(testBoard, 0, player === 'yellow' ? 'red' : 'yellow');
          if (score > bestScore) {
            bestScore = score;
            bestCol = col;
          }
          moveValid = true;
          break;
        }
      }

      if (!moveValid) continue; // Skip if no valid move in this column
    }

    // Fallback to center column if no best move found
    return bestCol !== undefined ? bestCol : 3;
  } catch (error) {
    logError('getConnect4BestMove error', error, { player });
    return 3; // Return center column as fallback
  }
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {(undefined|'red'|'yellow')[][]} board
 * @param {number} depth
 * @param {'red'|'yellow'} player
 *
 * Same justification as above.
 */
/* eslint-disable security/detect-object-injection */
function evaluateConnect4Position(board, depth, player) {
  const winner = checkConnect4Winner(board);
  if (winner === 'yellow') return 100 - depth;
  if (winner === 'red') return depth - 100;
  if (winner === 'tie') return 0;

  // Simple heuristic: count potential winning lines
  let score = 0;

  // Check for 3 in a row (open ended)
  for (let row = 0; row < 6; row++) {
    const boardRow = board[row];
    if (!boardRow) continue;
    for (let col = 0; col < 4; col++) {
      const window = [boardRow[col], boardRow[col + 1], boardRow[col + 2], boardRow[col + 3]].filter((cell) => cell !== undefined);
      score += evaluateWindow(window, player);
    }
  }

  // Check vertical
  for (let row = 0; row < 3; row++) {
    const boardRow0 = board[row];
    const boardRow1 = board[row + 1];
    const boardRow2 = board[row + 2];
    const boardRow3 = board[row + 3];
    if (!boardRow0 || !boardRow1 || !boardRow2 || !boardRow3) continue;
    for (let col = 0; col < 7; col++) {
      const window = [boardRow0[col], boardRow1[col], boardRow2[col], boardRow3[col]].filter((cell) => cell !== undefined);
      score += evaluateWindow(window, player);
    }
  }

  return score;
}
/* eslint-enable security/detect-object-injection */

/**
 * @param {(undefined|'red'|'yellow')[]} window
 * @param {'red'|'yellow'} player
 */
function evaluateWindow(window, player) {
  const opponent = player === 'yellow' ? 'red' : 'yellow';
  let score = 0;

  let playerCount = 0;
  let emptyCount = 0;
  let opponentCount = 0;
  for (const cell of window) {
    switch (cell) {
      case undefined: {
        emptyCount++;

        break;
      }
      case player: {
        playerCount++;

        break;
      }
      case opponent: {
        opponentCount++;

        break;
      }
      // No default
    }
  }

  if (playerCount === 4) score += 100;
  else if (playerCount === 3 && emptyCount === 1) score += 10;
  else if (playerCount === 2 && emptyCount === 2) score += 2;

  if (opponentCount === 3 && emptyCount === 1) score -= 80;

  return score;
}

export { sendConnect4Board, makeConnect4Move };
