1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
2|
3|import { updateUserStats } from '../achievements.js';
4|import { tttGames } from '../game-states.js';
5|
6|export const data = new SlashCommandBuilder()
7|  .setName('tictactoe')
8|  .setDescription('Play Tic-Tac-Toe against another player or AI')
9|  .addUserOption((option) => option.setName('opponent').setDescription('Player to challenge (leave empty for AI)').setRequired(false))
10|  .addStringOption((option) =>
11|    option
12|      .setName('difficulty')
13|      .setDescription('AI difficulty (if playing against AI)')
14|      .addChoices(
15|        { name: 'Easy', value: 'easy' },
16|        { name: 'Medium', value: 'medium' },
17|        { name: 'Hard', value: 'hard' },
18|        { name: 'Impossible', value: 'impossible' },
19|      )
20|      .setRequired(false),
21|  );
22|
23|/**
24| * Executes the Tic-Tac-Toe command.
25| * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
26| */
27|export async function execute(interaction) {
28|  try {
29|    const opponent = interaction.options.getUser('opponent');
30|    const difficulty = interaction.options.getString('difficulty') || 'medium';
31|
32|    // Validate opponent input
33|    if (opponent) {
34|      if (opponent.id === interaction.user.id) {
35|        return await interaction.reply({ content: '❌ You cannot play against yourself!', flags: MessageFlags.Ephemeral });
36|      }
37|      if (opponent.bot) {
38|        return await interaction.reply({ content: '❌ You cannot challenge bot accounts to Tic-Tac-Toe.', flags: MessageFlags.Ephemeral });
39|      }
40|    }
41|
42|    // Validate difficulty only for AI games
43|    if (!opponent && !['easy', 'medium', 'hard', 'impossible'].includes(difficulty)) {
44|      return await interaction.reply({ content: '❌ Invalid difficulty level.', flags: MessageFlags.Ephemeral });
45|    }
46|
47|    const gameId = `ttt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
48|    const gameState = {
49|      id: gameId,
50|      board: Array.from({ length: 9 }).fill(null),
51|      players: {
52|        X: { id: interaction.user.id, name: interaction.user.username },
53|        O: opponent ? { id: opponent.id, name: opponent.username } : { id: 'ai', name: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} AI` },
54|      },
55|      currentPlayer: 'X',
56|      status: 'active',
57|      difficulty,
58|      isAI: !opponent,
59|      created: Date.now(),
60|    };
61|
62|    // Store game state
63|    tttGames.set(gameId, gameState);
64|
65|    await sendTicTacToeBoard(interaction, gameState);
66|  } catch (error) {
67|    logger.error('Error in tictactoe execute:', error instanceof Error ? error : new Error(String(error)));
68|    if (!interaction.replied && !interaction.deferred) {
69|      await interaction.reply({ content: '❌ An error occurred while starting the game.', flags: MessageFlags.Ephemeral });
70|    }
71|  }
72|}
73|
74|/**
75| * Sends the Tic-Tac-Toe board and handles game logic.
76| * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
77| * @param {Object} gameState - The current game state.
78| */
79|async function sendTicTacToeBoard(interaction, gameState) {
80|  try {
81|    const { board, players, currentPlayer, status, isAI, difficulty } = gameState;
82|
83|    // Check for winner
84|    const winner = checkWinner(board);
85|    if (winner) {
86|      gameState.status = 'completed';
87|
88|      if (winner !== 'tie') {
89|        const winnerPlayer = players[winner];
90|        if (winnerPlayer.id !== 'ai') {
91|          await updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
92|        }
93|      }
94|
95|      const resultEmbed = new EmbedBuilder()
96|        .setTitle('⭕ Tic-Tac-Toe - Game Over!')
97|        .setColor(winner === 'tie' ? 0xff_a5_00 : 0x00_ff_00)
98|        .setDescription(winner === 'tie' ? "🤝 **It's a tie!**" : `🎉 **${players[winner].name} wins!**`)
99|        .addFields({
100|          name: 'Final Board',
101|          value: formatBoard(board),
102|          inline: false,
103|        });
104|
105|      if (interaction.replied || interaction.deferred) {
106|        await interaction.editReply({ embeds: [resultEmbed], components: [] });
107|      } else {
108|        await interaction.reply({ embeds: [resultEmbed] });
109|      }
110|      return;
111|    }
112|
113|    const embed = new EmbedBuilder()
114|      .setTitle('⭕ Tic-Tac-Toe')
115|      .setColor(0x00_99_ff)
116|      .setDescription(`${players[currentPlayer].name}'s turn (${currentPlayer})`)
117|      .addFields({
118|        name: 'Game Board',
119|        value: formatBoard(board),
120|        inline: false,
121|      });
122|
123|    // Create board buttons
124|    const buttons = [];
125|    for (let i = 0; i < 9; i += 3) {
126|      const row = new ActionRowBuilder();
127|      for (let j = i; j < i + 3; j++) {
128|        const position = j;
129|        const isTaken = board[position] !== null;
130|
131|        row.addComponents(
132|          new ButtonBuilder()
133|            .setCustomId(`ttt_${position}_${gameState.id}`)
134|            .setLabel(isTaken ? board[position] : `${position + 1}`)
135|            .setStyle(isTaken ? ButtonStyle.Secondary : ButtonStyle.Primary)
136|            .setDisabled(isTaken || (isAI && currentPlayer === 'O')),
137|        );
138|      }
139|      buttons.push(row);
140|    }
141|
142|    if (interaction.replied || interaction.deferred) {
143|      await interaction.editReply({ embeds: [embed], components: buttons });
144|    } else {
145|      await interaction.reply({ embeds: [embed], components: buttons });
146|    }
147|
148|    // AI move if it's AI's turn
149|    if (isAI && currentPlayer === 'O' && status === 'active') {
150|      setTimeout(async () => {
151|        const aiMove = getAIMove(board, difficulty);
152|        if (aiMove !== null) {
153|          gameState.board[aiMove] = 'O';
154|          gameState.currentPlayer = 'X';
155|          // Check for AI win after move
156|          const aiWinner = checkWinner(gameState.board);
157|          if (aiWinner) {
158|            gameState.status = 'completed';
159|
160|            if (aiWinner !== 'tie') {
161|              const winnerPlayer = gameState.players[aiWinner];
162|              if (winnerPlayer.id !== 'ai') {
163|                await updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
164|              }
165|            }
166|
167|            // Update statistics for both players
168|            if (gameState.players.X.id !== 'ai') {
169|              await updateUserStats(gameState.players.X.id, { games: { tictactoe_games: 1 } });
170|            }
171|            if (gameState.players.O.id !== 'ai') {
172|              await updateUserStats(gameState.players.O.id, { games: { tictactoe_games: 1 } });
173|            }
174|
175|            const resultEmbed = new EmbedBuilder()
176|              .setTitle('⭕ Tic-Tac-Toe - Game Over!')
177|              .setColor(aiWinner === 'tie' ? 0xff_a5_00 : 0x00_ff_00)
178|              .setDescription(aiWinner === 'tie' ? "🤝 **It's a tie!**" : `🎉 **${gameState.players[aiWinner].name} wins!**`)
179|              .addFields({
180|                name: 'Final Board',
181|                value: formatBoard(gameState.board),
182|                inline: false,
183|              });
184|
185|            // Clean up game state
186|            tttGames.delete(gameState.id);
187|
188|            if (interaction.replied || interaction.deferred) {
189|              await interaction.editReply({ embeds: [resultEmbed], components: [] });
190|            } else {
191|              await interaction.reply({ embeds: [resultEmbed] });
192|            }
193|            return;
194|          }
195|          await sendTicTacToeBoard(interaction, gameState);
196|        }
197|      }, 1000);
198|    }
199|  } catch (error) {
200|    logger.error('Error in sendTicTacToeBoard:', error instanceof Error ? error : new Error(String(error)));
201|  }
202|}
203|
204|/**
205| * Formats the board into a string representation.
206| * @param {Array} board - The game board array.
207| * @returns {string} Formatted board string.
208| */
209|function formatBoard(board) {
210|  const symbols = {
211|    null: '⬜',
212|    X: '❌',
213|    O: '⭕',
214|  };
215|
216|  let formatted = '';
217|  for (let i = 0; i < 9; i += 3) {
218|    formatted += `${symbols[board[i]]} ${symbols[board[i + 1]]} ${symbols[board[i + 2]]}\n`;
219|  }
220|  return formatted;
221|}
222|
223|/**
224| * Checks for a winner or tie on the board.
225| * @param {Array} board - The game board array.
226| * @returns {string|null} Winner ('X', 'O'), 'tie', or null.
227| */
228|function checkWinner(board) {
229|  const lines = [
230|    [0, 1, 2],
231|    [3, 4, 5],
232|    [6, 7, 8], // Rows
233|    [0, 3, 6],
234|    [1, 4, 7],
235|    [2, 5, 8], // Columns
236|    [0, 4, 8],
237|    [2, 4, 6], // Diagonals
238|  ];
239|
240|  for (const [a, b, c] of lines) {
241|    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
242|      return board[a];
243|    }
244|  }
245|
246|  if (board.every((cell) => cell !== null)) {
247|    return 'tie';
248|  }
249|
250|  return null;
251|}
252|
253|/**
254| * Determines the AI's move based on difficulty.
255| * @param {Array} board - The game board array.
256| * @param {string} difficulty - AI difficulty level.
257| * @returns {number|null} The move index or null if no moves available.
258| */
259|function getAIMove(board, difficulty) {
260|  const availableMoves = board.map((cell, index) => (cell === null ? index : null)).filter((val) => val !== null);
261|
262|  if (availableMoves.length === 0) return null;
263|
264|  switch (difficulty) {
265|    case 'easy': {
266|      // Random move, but block winning moves 30% of the time
267|      if (Math.random() < 0.3) {
268|        return findWinningMove(board, 'O') || findBlockingMove(board, 'X') || availableMoves[Math.floor(Math.random() * availableMoves.length)];
269|      }
270|      break;
271|    }
272|
273|    case 'medium': {
274|      // Block winning moves, make winning moves when possible
275|      const winningMove = findWinningMove(board, 'O');
276|      if (winningMove !== null) return winningMove;
277|
278|      const blockingMove = findBlockingMove(board, 'X');
279|      if (blockingMove !== null) return blockingMove;
280|      break;
281|    }
282|
283|    case 'hard': {
284|      // Smart AI - use minimax algorithm
285|      return getBestMove(board, 'O');
286|    }
287|
288|    case 'impossible': {
289|      // Perfect AI - always finds best move
290|      return getBestMove(board, 'O');
291|    }
292|  }
293|
294|  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
295|}
296|
297|/**
298| * Finds a winning move for the given player.
299| * @param {Array} board - The game board array.
300| * @param {string} player - The player ('X' or 'O').
301| * @returns {number|null} The winning move index or null.
302| */
303|function findWinningMove(board, player) {
304|  for (let i = 0; i < 9; i++) {
305|    if (board[i] === null) {
306|      const testBoard = [...board];
307|      testBoard[i] = player;
308|      if (checkWinner(testBoard) === player) {
309|        return i;
310|      }
311|    }
312|  }
313|  return null;
314|}
315|
316|/**
317| * Finds a blocking move against the opponent.
318| * @param {Array} board - The game board array.
319| * @param {string} opponent - The opponent player.
320| * @returns {number|null} The blocking move index or null.
321| */
322|function findBlockingMove(board, opponent) {
323|  return findWinningMove(board, opponent);
324|}
325|
326|/**
327| * Gets the best move using minimax algorithm.
328| * @param {Array} board - The game board array.
329| * @param {string} player - The AI player.
330| * @returns {number|null} The best move index.
331| */
332|function getBestMove(board, player) {
333|  let bestScore = Number.NEGATIVE_INFINITY;
334|  let bestMove = null;
335|
336|  for (let i = 0; i < 9; i++) {
337|    if (board[i] === null) {
338|      const testBoard = [...board];
339|      testBoard[i] = player;
340|      const score = minimax(testBoard, 0, false, player === 'O' ? 'X' : 'O');
341|
342|      if (score > bestScore) {
343|        bestScore = score;
344|        bestMove = i;
345|      }
346|    }
347|  }
348|
349|  return bestMove;
350|}
351|
352|/**
353| * Minimax algorithm for evaluating board positions.
354| * @param {Array} board - The game board array.
355| * @param {number} depth - Current depth in recursion.
356| * @param {boolean} isMaximizing - Whether maximizing or minimizing.
357| * @param {string} aiPlayer - The AI player symbol.
358| * @returns {number} The evaluated score.
359| */
360|function minimax(board, depth, isMaximizing, aiPlayer) {
361|  const humanPlayer = aiPlayer === 'O' ? 'X' : 'O';
362|  const result = checkWinner(board);
363|
364|  if (result === aiPlayer) return 10 - depth;
365|  if (result === humanPlayer) return depth - 10;
366|  if (result === 'tie') return 0;
367|
368|  if (isMaximizing) {
369|    let bestScore = Number.NEGATIVE_INFINITY;
370|    for (let i = 0; i < 9; i++) {
371|      if (board[i] === null) {
372|        const testBoard = [...board];
373|        testBoard[i] = aiPlayer;
374|        const score = minimax(testBoard, depth + 1, false, aiPlayer);
375|        bestScore = Math.max(score, bestScore);
376|      }
377|    }
378|    return bestScore;
379|  } else {
380|    let bestScore = Number.POSITIVE_INFINITY;
381|    for (let i = 0; i < 9; i++) {
382|      if (board[i] === null) {
383|        const testBoard = [...board];
384|        testBoard[i] = humanPlayer;
385|        const score = minimax(testBoard, depth + 1, true, aiPlayer);
386|        bestScore = Math.min(score, bestScore);
387|      }
388|    }
389|    return bestScore;
390|  }
391|}
392|
393|export { sendTicTacToeBoard, checkWinner, formatBoard, getAIMove };
394|