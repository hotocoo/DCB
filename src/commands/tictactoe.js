import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { updateUserStats } from '../achievements.js';
import { tttGames } from '../game-states.js';

export const data = new SlashCommandBuilder()
  .setName('tictactoe')
  .setDescription('Play Tic-Tac-Toe against another player or AI')
  .addUserOption(option =>
    option.setName('opponent')
      .setDescription('Player to challenge (leave empty for AI)')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('difficulty')
      .setDescription('AI difficulty (if playing against AI)')
      .addChoices(
        { name: 'Easy', value: 'easy' },
        { name: 'Medium', value: 'medium' },
        { name: 'Hard', value: 'hard' },
        { name: 'Impossible', value: 'impossible' }
      )
      .setRequired(false));

/**
 * Executes the Tic-Tac-Toe command.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 */
export async function execute(interaction) {
  try {
    const opponent = interaction.options.getUser('opponent');
    const difficulty = interaction.options.getString('difficulty') || 'medium';

    // Validate opponent input
    if (opponent) {
      if (opponent.id === interaction.user.id) {
        return await interaction.reply({ content: '❌ You cannot play against yourself!', flags: MessageFlags.Ephemeral });
      }
      if (opponent.bot) {
        return await interaction.reply({ content: '❌ You cannot challenge bot accounts to Tic-Tac-Toe.', flags: MessageFlags.Ephemeral });
      }
    }

    // Validate difficulty only for AI games
    if (!opponent && !['easy', 'medium', 'hard', 'impossible'].includes(difficulty)) {
      return await interaction.reply({ content: '❌ Invalid difficulty level.', flags: MessageFlags.Ephemeral });
    }

    const gameId = `ttt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gameState = {
      id: gameId,
      board: Array(9).fill(null),
      players: {
        X: { id: interaction.user.id, name: interaction.user.username },
        O: opponent ? { id: opponent.id, name: opponent.username } : { id: 'ai', name: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} AI` }
      },
      currentPlayer: 'X',
      status: 'active',
      difficulty,
      isAI: !opponent,
      created: Date.now()
    };

    // Store game state
    tttGames.set(gameId, gameState);

    await sendTicTacToeBoard(interaction, gameState);
  } catch (error) {
    console.error('Error in tictactoe execute:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while starting the game.', flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Sends the Tic-Tac-Toe board and handles game logic.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 * @param {Object} gameState - The current game state.
 */
async function sendTicTacToeBoard(interaction, gameState) {
  try {
    const { board, players, currentPlayer, status, isAI, difficulty } = gameState;

    // Check for winner
    const winner = checkWinner(board);
    if (winner) {
      gameState.status = 'completed';

      if (winner !== 'tie') {
        const winnerPlayer = players[winner];
        if (winnerPlayer.id !== 'ai') {
          await updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
        }
      }

      const resultEmbed = new EmbedBuilder()
        .setTitle('⭕ Tic-Tac-Toe - Game Over!')
        .setColor(winner === 'tie' ? 0xFFA500 : 0x00FF00)
        .setDescription(winner === 'tie' ? '🤝 **It\'s a tie!**' : `🎉 **${players[winner].name} wins!**`)
        .addFields({
          name: 'Final Board',
          value: formatBoard(board),
          inline: false
        });

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [resultEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [resultEmbed] });
      }
      return;
    }

  const embed = new EmbedBuilder()
    .setTitle('⭕ Tic-Tac-Toe')
    .setColor(0x0099FF)
    .setDescription(`${players[currentPlayer].name}'s turn (${currentPlayer})`)
    .addFields({
      name: 'Game Board',
      value: formatBoard(board),
      inline: false
    });

  // Create board buttons
  const buttons = [];
  for (let i = 0; i < 9; i += 3) {
    const row = new ActionRowBuilder();
    for (let j = i; j < i + 3; j++) {
      const position = j;
      const isTaken = board[position] !== null;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${position}_${gameState.id}`)
          .setLabel(isTaken ? board[position] : `${position + 1}`)
          .setStyle(isTaken ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(isTaken || (isAI && currentPlayer === 'O'))
      );
    }
    buttons.push(row);
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: buttons });
  } else {
    await interaction.reply({ embeds: [embed], components: buttons });
  }

  // AI move if it's AI's turn
  if (isAI && currentPlayer === 'O' && status === 'active') {
    setTimeout(async () => {
      const aiMove = getAIMove(board, difficulty);
      if (aiMove !== null) {
        gameState.board[aiMove] = 'O';
        gameState.currentPlayer = 'X';
        // Check for AI win after move
        const aiWinner = checkWinner(gameState.board);
        if (aiWinner) {
          gameState.status = 'completed';

          if (aiWinner !== 'tie') {
            const winnerPlayer = gameState.players[aiWinner];
            if (winnerPlayer.id !== 'ai') {
              await updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
            }
          }

          // Update statistics for both players
          if (gameState.players.X.id !== 'ai') {
            await updateUserStats(gameState.players.X.id, { games: { tictactoe_games: 1 } });
          }
          if (gameState.players.O.id !== 'ai') {
            await updateUserStats(gameState.players.O.id, { games: { tictactoe_games: 1 } });
          }

          const resultEmbed = new EmbedBuilder()
            .setTitle('⭕ Tic-Tac-Toe - Game Over!')
            .setColor(aiWinner === 'tie' ? 0xFFA500 : 0x00FF00)
            .setDescription(aiWinner === 'tie' ? '🤝 **It\'s a tie!**' : `🎉 **${gameState.players[aiWinner].name} wins!**`)
            .addFields({
              name: 'Final Board',
              value: formatBoard(gameState.board),
              inline: false
            });

          // Clean up game state
          tttGames.delete(gameState.id);

          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [resultEmbed], components: [] });
          } else {
            await interaction.reply({ embeds: [resultEmbed] });
          }
          return;
        }
        await sendTicTacToeBoard(interaction, gameState);
      }
    }, 1000);
  }
  } catch (error) {
    console.error('Error in sendTicTacToeBoard:', error);
  }
}

/**
 * Formats the board into a string representation.
 * @param {Array} board - The game board array.
 * @returns {string} Formatted board string.
 */
function formatBoard(board) {
  const symbols = {
    null: '⬜',
    X: '❌',
    O: '⭕'
  };

  let formatted = '';
  for (let i = 0; i < 9; i += 3) {
    formatted += `${symbols[board[i]]} ${symbols[board[i + 1]]} ${symbols[board[i + 2]]}\n`;
  }
  return formatted;
}

/**
 * Checks for a winner or tie on the board.
 * @param {Array} board - The game board array.
 * @returns {string|null} Winner ('X', 'O'), 'tie', or null.
 */
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every(cell => cell !== null)) {
    return 'tie';
  }

  return null;
}

/**
 * Determines the AI's move based on difficulty.
 * @param {Array} board - The game board array.
 * @param {string} difficulty - AI difficulty level.
 * @returns {number|null} The move index or null if no moves available.
 */
function getAIMove(board, difficulty) {
  const availableMoves = board.map((cell, index) => cell === null ? index : null).filter(val => val !== null);

  if (availableMoves.length === 0) return null;

  switch (difficulty) {
    case 'easy':
      // Random move, but block winning moves 30% of the time
      if (Math.random() < 0.3) {
        return findWinningMove(board, 'O') || findBlockingMove(board, 'X') || availableMoves[Math.floor(Math.random() * availableMoves.length)];
      }
      break;

    case 'medium':
      // Block winning moves, make winning moves when possible
      const winningMove = findWinningMove(board, 'O');
      if (winningMove !== null) return winningMove;

      const blockingMove = findBlockingMove(board, 'X');
      if (blockingMove !== null) return blockingMove;
      break;

    case 'hard':
      // Smart AI - use minimax algorithm
      return getBestMove(board, 'O');

    case 'impossible':
      // Perfect AI - always finds best move
      return getBestMove(board, 'O');
  }

  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

/**
 * Finds a winning move for the given player.
 * @param {Array} board - The game board array.
 * @param {string} player - The player ('X' or 'O').
 * @returns {number|null} The winning move index or null.
 */
function findWinningMove(board, player) {
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const testBoard = [...board];
      testBoard[i] = player;
      if (checkWinner(testBoard) === player) {
        return i;
      }
    }
  }
  return null;
}

/**
 * Finds a blocking move against the opponent.
 * @param {Array} board - The game board array.
 * @param {string} opponent - The opponent player.
 * @returns {number|null} The blocking move index or null.
 */
function findBlockingMove(board, opponent) {
  return findWinningMove(board, opponent);
}

/**
 * Gets the best move using minimax algorithm.
 * @param {Array} board - The game board array.
 * @param {string} player - The AI player.
 * @returns {number|null} The best move index.
 */
function getBestMove(board, player) {
  let bestScore = -Infinity;
  let bestMove = null;

  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const testBoard = [...board];
      testBoard[i] = player;
      const score = minimax(testBoard, 0, false, player === 'O' ? 'X' : 'O');

      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }

  return bestMove;
}

/**
 * Minimax algorithm for evaluating board positions.
 * @param {Array} board - The game board array.
 * @param {number} depth - Current depth in recursion.
 * @param {boolean} isMaximizing - Whether maximizing or minimizing.
 * @param {string} aiPlayer - The AI player symbol.
 * @returns {number} The evaluated score.
 */
function minimax(board, depth, isMaximizing, aiPlayer) {
  const humanPlayer = aiPlayer === 'O' ? 'X' : 'O';
  const result = checkWinner(board);

  if (result === aiPlayer) return 10 - depth;
  if (result === humanPlayer) return depth - 10;
  if (result === 'tie') return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const testBoard = [...board];
        testBoard[i] = aiPlayer;
        const score = minimax(testBoard, depth + 1, false, aiPlayer);
        bestScore = Math.max(score, bestScore);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const testBoard = [...board];
        testBoard[i] = humanPlayer;
        const score = minimax(testBoard, depth + 1, true, aiPlayer);
        bestScore = Math.min(score, bestScore);
      }
    }
    return bestScore;
  }
}