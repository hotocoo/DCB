import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle , MessageFlags} from 'discord.js';
import { updateUserStats } from '../achievements.js';

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

export async function execute(interaction) {
  const opponent = interaction.options.getUser('opponent');
  const difficulty = interaction.options.getString('difficulty') || 'medium';

  if (opponent && opponent.id === interaction.user.id) {
    return interaction.reply({ content: '❌ You cannot play against yourself!', flags: MessageFlags.Ephemeral });
  }

  if (opponent && opponent.bot) {
    return interaction.reply({ content: '❌ You cannot challenge bot accounts to Tic-Tac-Toe.', flags: MessageFlags.Ephemeral });
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

  await sendTicTacToeBoard(interaction, gameState);
}

async function sendTicTacToeBoard(interaction, gameState) {
  const { board, players, currentPlayer, status, isAI } = gameState;

  // Check for winner
  const winner = checkWinner(board);
  if (winner) {
    gameState.status = 'completed';

    if (winner !== 'tie') {
      const winnerPlayer = players[winner];
      if (winnerPlayer.id !== 'ai') {
        updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
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
        await sendTicTacToeBoard(interaction, gameState);
      }
    }, 1000);
  }
}

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

function findBlockingMove(board, opponent) {
  return findWinningMove(board, opponent);
}

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