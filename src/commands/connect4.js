// Module file for Connect4 command
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import { updateUserStats } from '../achievements.js';
import { connect4Games } from '../game-states.js';
import { CommandError, handleCommandError } from '../errorHandler.js';
import { safeInteractionReply, safeInteractionUpdate } from '../interactionHandlers.js';

export const data = new SlashCommandBuilder()
  .setName('connect4')
  .setDescription('Play Connect Four - strategic dropping game')
  .addUserOption(option =>
    option.setName('opponent')
      .setDescription('Player to challenge')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('difficulty')
      .setDescription('AI difficulty (if playing against AI)')
      .addChoices(
        { name: 'Easy', value: 'easy' },
        { name: 'Medium', value: 'medium' },
        { name: 'Hard', value: 'hard' }
      )
      .setRequired(false));

export async function execute(interaction) {
  try {
    const opponent = interaction.options.getUser('opponent');
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
    const gameState = {
      id: gameId,
      board: Array.from({ length: 6 }).fill(null).map(() => Array.from({ length: 7 }).fill(null)),
      players: {
        red: { id: interaction.user.id, name: interaction.user.username, symbol: '🔴' },
        yellow: { id: opponent.id, name: opponent.username, symbol: '🟡' }
      },
      currentPlayer: 'red',
      status: 'active',
      isAI: opponent.bot,
      difficulty: difficulty || 'medium',
      created: Date.now()
    };

    // Store game state
    connect4Games.set(gameId, gameState);

    await sendConnect4Board(interaction, gameState);
  }
  catch (error) {
    await handleCommandError(interaction, error);
  }
}

async function sendConnect4Board(interaction, gameState) {
  try {
    const { board, players, currentPlayer, status, isAI, difficulty } = gameState;

    // Check for winner
    const winner = checkConnect4Winner(board);
    if (winner) {
      gameState.status = 'completed';

      if (winner !== 'tie') {
        const winnerPlayer = players[winner];
        if (winnerPlayer.id !== 'ai' && winnerPlayer.id) {
          try {
            updateUserStats(winnerPlayer.id, { connect4_wins: 1 });
          }
          catch (statsError) {
            console.error('Failed to update user stats:', statsError);
          }
        }
      }

      // Clean up game state
      connect4Games.delete(gameState.id);

      const resultEmbed = new EmbedBuilder()
        .setTitle('🎯 Connect Four - Game Over!')
        .setColor(winner === 'tie' ? 0xFF_A5_00 : 0x00_FF_00)
        .setDescription(winner === 'tie' ? '🤝 **It\'s a tie!**' : `🎉 **${players[winner]?.name || 'Unknown'} wins!**`)
        .addFields({
          name: 'Final Board',
          value: formatConnect4Board(board),
          inline: false
        });

      await (interaction.replied || interaction.deferred ? safeInteractionUpdate(interaction, { embeds: [resultEmbed], components: [] }) : safeInteractionReply(interaction, { embeds: [resultEmbed] }));
      return;
    }

    // Update game state in storage
    connect4Games.set(gameState.id, gameState);

    const embed = new EmbedBuilder()
      .setTitle('🎯 Connect Four')
      .setColor(currentPlayer === 'red' ? 0xFF_00_00 : 0xFF_FF_00)
      .setDescription(`${players[currentPlayer]?.name || 'Unknown'}'s turn ${players[currentPlayer]?.symbol || '❓'}`)
      .addFields({
        name: 'Game Board',
        value: formatConnect4Board(board),
        inline: false
      });

    // Create column buttons (0-6) - Split into two rows since max 5 per row
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    for (let col = 0; col < 7; col++) {
      const canPlay = board[0][col] === null; // Check if top row is empty

      const button = new ButtonBuilder()
        .setCustomId(`c4_${col}_${gameState.id}`)
        .setLabel(`${col + 1}`)
        .setStyle(canPlay ? (currentPlayer === 'red' ? ButtonStyle.Danger : ButtonStyle.Secondary) : ButtonStyle.Secondary)
        .setDisabled(!canPlay || (isAI && currentPlayer === 'yellow'));

      if (col < 5) {
        row1.addComponents(button);
      }
      else {
        row2.addComponents(button);
      }
    }

    await (interaction.replied || interaction.deferred ? safeInteractionUpdate(interaction, { embeds: [embed], components: [row1, row2] }) : safeInteractionReply(interaction, { embeds: [embed], components: [row1, row2] }));

    // AI move if it's AI's turn
    if (isAI && currentPlayer === 'yellow' && status === 'active') {
      setTimeout(async() => {
        try {
          const aiMove = getConnect4AIMove(board, difficulty);
          if (aiMove !== null) {
            await makeConnect4Move(gameState, aiMove);
            await sendConnect4Board(interaction, gameState);
          }
        }
        catch (aiError) {
          console.error('AI move error:', aiError);
        }
      }, 1500);
    }
  }
  catch (error) {
    console.error('sendConnect4Board error:', error);
    await handleCommandError(interaction, new CommandError('Failed to update game board.', 'UNKNOWN_ERROR', { originalError: error.message }));
  }
}

function formatConnect4Board(board) {
  const symbols = {
    null: '⬜',
    red: '🔴',
    yellow: '🟡'
  };

  let formatted = '';
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      formatted += symbols[board[row][col]] || '⬜';
    }
    formatted += '\n';
  }
  formatted += '1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣';
  return formatted;
}

function checkConnect4Winner(board) {
  // Check horizontal
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      const cell = board[row][col];
      if (cell && board[row][col + 1] === cell && board[row][col + 2] === cell && board[row][col + 3] === cell) {
        return cell;
      }
    }
  }

  // Check vertical
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = board[row][col];
      if (cell && board[row + 1][col] === cell && board[row + 2][col] === cell && board[row + 3][col] === cell) {
        return cell;
      }
    }
  }

  // Check diagonal (top-left to bottom-right)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const cell = board[row][col];
      if (cell && board[row + 1][col + 1] === cell && board[row + 2][col + 2] === cell && board[row + 3][col + 3] === cell) {
        return cell;
      }
    }
  }

  // Check diagonal (top-right to bottom-left)
  for (let row = 0; row < 3; row++) {
    for (let col = 3; col < 7; col++) {
      const cell = board[row][col];
      if (cell && board[row + 1][col - 1] === cell && board[row + 2][col - 2] === cell && board[row + 3][col - 3] === cell) {
        return cell;
      }
    }
  }

  // Check for tie
  if (board[0].every(cell => cell !== null)) {
    return 'tie';
  }

  return null;
}

async function makeConnect4Move(gameState, column) {
  try {
    // Validate column input
    if (column < 0 || column > 6 || !Number.isInteger(column)) {
      throw new Error(`Invalid column: ${column}`);
    }

    const { board } = gameState;

    // Find the lowest available row in the column
    for (let row = 5; row >= 0; row--) {
      if (board[row][column] === null) {
        board[row][column] = gameState.currentPlayer;
        gameState.currentPlayer = gameState.currentPlayer === 'red' ? 'yellow' : 'red';
        return true;
      }
    }

    return false; // Column is full
  }
  catch (error) {
    console.error('makeConnect4Move error:', error);
    return false;
  }
}

function getConnect4AIMove(board, difficulty) {
  try {
    const availableColumns = [];
    for (let col = 0; col < 7; col++) {
      if (board[0][col] === null) {
        availableColumns.push(col);
      }
    }

    if (availableColumns.length === 0) return null;

    switch (difficulty) {
      case 'easy': {
        // Random move, but prefer center columns
        const centerColumns = availableColumns.filter(col => col >= 2 && col <= 4);
        const preferredColumns = centerColumns.length > 0 ? centerColumns : availableColumns;
        return preferredColumns[Math.floor(Math.random() * preferredColumns.length)];
      }

      case 'medium': {
        // Check for winning moves and blocking moves
        const winningCol = findConnect4WinningMove(board, 'yellow');
        if (winningCol !== null) return winningCol;

        const blockingCol = findConnect4WinningMove(board, 'red');
        if (blockingCol !== null) return blockingCol;

        // Prefer center
        const center = [3, 2, 4, 1, 5, 0, 6].find(col => availableColumns.includes(col));
        return center !== undefined ? center : availableColumns[Math.floor(Math.random() * availableColumns.length)];
      }

      case 'hard': {
        // Use minimax algorithm for strategic play
        return getConnect4BestMove(board, 'yellow');
      }

      default: {
        return availableColumns[Math.floor(Math.random() * availableColumns.length)];
      }
    }
  }
  catch (error) {
    console.error('getConnect4AIMove error:', error);
    // Fallback to random move
    const fallbackColumns = [];
    for (let col = 0; col < 7; col++) {
      if (board[0][col] === null) {
        fallbackColumns.push(col);
      }
    }
    return fallbackColumns.length > 0 ? fallbackColumns[Math.floor(Math.random() * fallbackColumns.length)] : null;
  }
}

function findConnect4WinningMove(board, player) {
  for (let col = 0; col < 7; col++) {
    if (board[0][col] !== null) continue;

    // Test the move
    const testBoard = board.map(row => [...row]);
    for (let row = 5; row >= 0; row--) {
      if (testBoard[row][col] === null) {
        testBoard[row][col] = player;
        if (checkConnect4Winner(testBoard) === player) {
          return col;
        }
        break;
      }
    }
  }
  return null;
}

function getConnect4BestMove(board, player) {
  try {
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestCol = null;

    for (let col = 0; col < 7; col++) {
      if (board[0][col] !== null) continue;

      const testBoard = board.map(row => [...row]);
      let moveValid = false;

      for (let row = 5; row >= 0; row--) {
        if (testBoard[row][col] === null) {
          testBoard[row][col] = player;
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
    return bestCol !== null ? bestCol : 3;
  }
  catch (error) {
    console.error('getConnect4BestMove error:', error);
    return 3; // Return center column as fallback
  }
}

function evaluateConnect4Position(board, depth, player) {
  const winner = checkConnect4Winner(board);
  if (winner === 'yellow') return 100 - depth;
  if (winner === 'red') return depth - 100;
  if (winner === 'tie') return 0;

  // Simple heuristic: count potential winning lines
  let score = 0;

  // Check for 3 in a row (open ended)
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      const window = [board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]];
      score += evaluateWindow(window, player);
    }
  }

  // Check vertical
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const window = [board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]];
      score += evaluateWindow(window, player);
    }
  }

  return score;
}

function evaluateWindow(window, player) {
  const opponent = player === 'yellow' ? 'red' : 'yellow';
  let score = 0;

  if (window.filter(cell => cell === player).length === 4) score += 100;
  else if (window.filter(cell => cell === player).length === 3 && window.filter(cell => cell === null).length === 1) score += 10;
  else if (window.filter(cell => cell === player).length === 2 && window.filter(cell => cell === null).length === 2) score += 2;

  if (window.filter(cell => cell === opponent).length === 3 && window.filter(cell => cell === null).length === 1) score -= 80;

  return score;
}

export { sendConnect4Board, makeConnect4Move };