import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { connect4Games } from '../game-states.js';
import { updateStats } from '../achievements.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('connect4')
  .setDescription('Play Connect Four against a user or AI')
  .addUserOption(opt => opt.setName('opponent').setDescription('Opponent (or bot for AI)').setRequired(false))
  .addStringOption(opt => opt.setName('difficulty').setDescription('AI difficulty').addChoices(
    { name: 'Easy', value: 'easy' }, { name: 'Medium', value: 'medium' }, { name: 'Hard', value: 'hard' }
  ).setRequired(false));

export async function execute(interaction) {
  try {
    await interaction.deferReply();
    const opponent = interaction.options.getUser('opponent');
    const difficulty = interaction.options.getString('difficulty') || 'medium';

    if (opponent && opponent.id === interaction.user.id) {
      return await interaction.editReply({ content: "You can't play against yourself!" });
    }

    const isAI = !opponent || opponent.bot;
    const opponentData = {
      id: (opponent?.id || 'ai'),
      name: opponent?.username || 'AI',
    };

    const gameId = `c4_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    connect4Games.set(gameId, {
      id: gameId,
      board: Array.from({ length: 6 }, () => Array(7).fill(null)),
      red: interaction.user.id,
      yellow: opponentData.id,
      current: 'red',
      status: 'active',
      isAI,
      difficulty,
    });

    await sendBoard(interaction, gameId);
  } catch (error) {
    logger.error('connect4 error:', error);
    try { await interaction.editReply({ content: 'Error starting game.' }); } catch {}
  }
}

async function sendBoard(interaction, gameId) {
  const g = connect4Games.get(gameId);
  if (!g || g.status !== 'active') return;

  const winner = checkWinner(g.board);
  if (winner === 'red' || winner === 'yellow' || winner === 'tie') {
    g.status = 'completed';
    connect4Games.delete(gameId);
    if (winner !== 'tie') try { updateStats(winner === 'red' ? g.red : g.yellow, { games_won: 1 }); } catch {}
    const msg = winner === 'tie' ? "It's a tie!" : `${winner === 'red' ? 'Red' : 'Yellow'} wins!`;
    return await interaction.editReply({ content: `${msg}\n\n${formatBoard(g.board)}`, components: [] });
  }

  // Build players object for button-handler compatibility
  g.players = {
    red: { id: g.red, name: 'Red', symbol: '🔴' },
    yellow: { id: g.yellow, name: g.isAI ? 'AI' : 'Yellow', symbol: '🟡' },
  };
  g.currentPlayer = g.current;

  const turnColor = g.current;
  await interaction.editReply({
    content: `${turnColor === 'red' ? 'Red' : 'Yellow'}'s turn\n\n${formatBoard(g.board)}\nDrop a piece in a column!`,
    components: createButtons(gameId, g),
  });

  if (g.isAI && g.current === 'yellow') {
    setTimeout(() => aiMove(gameId).then(() => sendBoard(interaction, gameId)), 800);
  }
}

export { sendBoard as sendConnect4Board };

function formatBoard(board) {
  const sym = { red: '🔴', yellow: '🟡', null: '⬜' };
  return board.map(row => row.map(c => sym[c]).join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
}

function createButtons(gameId, g) {
  const row = new ActionRowBuilder();
  for (let col = 0; col < 7; col++) {
    const full = g.board[0][col] !== null;
    row.addComponents(new ButtonBuilder()
      .setCustomId(`c4_${col}_${gameId}`)
      .setLabel(`${col + 1}`)
      .setStyle(full ? ButtonStyle.Secondary : (g.current === 'red' ? ButtonStyle.Danger : ButtonStyle.Success))
      .setDisabled(full || (g.isAI && g.current === 'yellow')));
  }
  return [row];
}

function checkWinner(board) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const p = board[r][c]; if (!p) continue;
      for (const [dr, dc] of dirs) {
        let count = 1;
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr][nc] === p) count++;
        }
        if (count >= 4) return p;
      }
    }
  }
  return board[0].every(Boolean) ? 'tie' : null;
}

async function aiMove(gameId) {
  const g = connect4Games.get(gameId); if (!g) return;
  let col;
  switch (g.difficulty) {
    case 'easy': col = Math.floor(Math.random() * 7); break;
    case 'medium': col = getAIMove(g.board, 2); break;
    default: col = getAIMove(g.board, 4); break;
  }
  if (g.board[0][col] === null) dropPiece(g.board, col);
}

function getAIMove(board, depth) {
  let best = -Infinity, bestCol = Math.floor(Math.random() * 7);
  for (let c = 0; c < 7; c++) {
    if (board[0][c] !== null) continue;
    dropPiece(board, c);
    const score = minimax(board, depth, -Infinity, Infinity, false);
    undoDrop(board, c);
    if (score > best) {
      best = score;
      bestCol = c;
    }
  }
  return bestCol;
}

function minimax(board, depth, alpha, beta, isMax) {
  const w = checkWinner(board);
  if (w === 'yellow') return 1000 - depth;
  if (w === 'red') return depth - 1000;
  if (w === 'tie' || depth === 0) return 0;
  if (isMax) {
    let best = -Infinity;
    for (let c = 0; c < 7; c++) {
      if (board[0][c] !== null) continue;
      dropPiece(board, c);
      best = Math.max(best, minimax(board, depth - 1, alpha, beta, false));
      undoDrop(board, c);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let c = 0; c < 7; c++) {
      if (board[0][c] !== null) continue;
      dropPiece(board, c);
      best = Math.min(best, minimax(board, depth - 1, alpha, beta, true));
      undoDrop(board, c);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

async function makeMove(gameId, column) {
  const g = connect4Games.get(gameId);
  if (!g || g.status !== 'active') return false;
  for (let r = 5; r >= 0; r--) {
      if (g.board[r][column] === null) {
        g.board[r][column] = g.currentPlayer;
        g.currentPlayer = g.currentPlayer === 'red' ? 'yellow' : 'red';
        return true;
      }
    }
  return false;
}

function dropPiece(board, col) {
  for (let r = 5; r >= 0; r--) {
      if (board[r][col] === null) {
        board[r][col] = 'yellow';
        return;
      }
    }
}

export { makeMove as makeConnect4Move };

function undoDrop(board, col) {
  for (let r = 0; r < 6; r++) {
    if (board[r][col] !== null) {
      board[r][col] = null;
      return;
    }
  }
}
