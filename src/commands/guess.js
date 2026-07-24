1|import {
2|  SlashCommandBuilder,
3|  EmbedBuilder,
4|  ActionRowBuilder,
5|  ButtonBuilder,
6|  ButtonStyle,
7|  ModalBuilder,
8|  TextInputBuilder,
9|  TextInputStyle,
10|  MessageFlags,
11|} from 'discord.js';
12|
13|import { updateUserStats } from '../achievements.js';
14|import { guessGames } from '../game-states.js';
15|import { CommandError, handleCommandError } from '../errorHandler.js';
16|import { safeInteractionReply, safeInteractionUpdate } from '../interactionHandlers.js';
17|/** @typedef {import('../types.d').Guess} Guess */
18|/** @typedef {import('../types.d').GuessGameState} GuessGameState */
19|
20|export const data = new SlashCommandBuilder()
21|  .setName('guess')
22|  .setDescription('Play number guessing game with multiple difficulty levels')
23|  .addStringOption((option) =>
24|    option
25|      .setName('difficulty')
26|      .setDescription('Game difficulty')
27|      .addChoices(
28|        { name: 'Easy (1-50, 10 attempts)', value: 'easy' },
29|        { name: 'Medium (1-100, 8 attempts)', value: 'medium' },
30|        { name: 'Hard (1-200, 6 attempts)', value: 'hard' },
31|        { name: 'Expert (1-500, 5 attempts)', value: 'expert' },
32|        { name: 'Master (1-1000, 4 attempts)', value: 'master' },
33|      )
34|      .setRequired(false),
35|  )
36|  .addIntegerOption((option) => option.setName('custom_min').setDescription('Custom minimum number').setRequired(false))
37|  .addIntegerOption((option) => option.setName('custom_max').setDescription('Custom maximum number').setRequired(false));
38|
39|/**
40| * @param {import('discord.js').ChatInputCommandInteraction} interaction
41| */
42|export async function execute(interaction) {
43|  try {
44|    let min = 1;
45|    let max = 100;
46|    let attempts = 10;
47|    const difficulty = interaction.options.getString('difficulty') || 'medium';
48|
49|    // Set difficulty parameters
50|    switch (difficulty) {
51|      case 'easy': {
52|        min = 1;
53|        max = 50;
54|        attempts = 10;
55|        break;
56|      }
57|      case 'medium': {
58|        min = 1;
59|        max = 100;
60|        attempts = 8;
61|        break;
62|      }
63|      case 'hard': {
64|        min = 1;
65|        max = 200;
66|        attempts = 6;
67|        break;
68|      }
69|      case 'expert': {
70|        min = 1;
71|        max = 500;
72|        attempts = 5;
73|        break;
74|      }
75|      case 'master': {
76|        min = 1;
77|        max = 1000;
78|        attempts = 4;
79|        break;
80|      }
81|      default: {
82|        throw new CommandError('Invalid difficulty level.', 'INVALID_ARGUMENT');
83|      }
84|    }
85|
86|    // Custom range override with validation
87|    const customMin = interaction.options.getInteger('custom_min');
88|    const customMax = interaction.options.getInteger('custom_max');
89|
90|    if (customMin !== null || customMax !== null) {
91|      if (customMin === null || customMax === null) {
92|        throw new CommandError('Both custom minimum and maximum must be provided together.', 'INVALID_ARGUMENT');
93|      }
94|      if (customMin >= customMax) {
95|        throw new CommandError('Minimum must be less than maximum!', 'INVALID_ARGUMENT');
96|      }
97|      if (customMax - customMin > 10_000) {
98|        throw new CommandError('Range too large! Maximum range is 10,000.', 'INVALID_ARGUMENT');
99|      }
100|      if (customMin < 1 || customMax > 1_000_000) {
101|        throw new CommandError('Custom range must be between 1 and 1,000,000.', 'INVALID_ARGUMENT');
102|      }
103|      min = customMin;
104|      max = customMax;
105|      // Calculate optimal attempts for custom range
106|      attempts = Math.min(attempts, Math.max(3, Math.floor(Math.log2(max - min + 1)) + 2));
107|    }
108|
109|    // Generate secret number
110|    const secretNumber = Math.floor(Math.random() * (max - min + 1)) + min;
111|    const gameId = `guess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
112|
113|    const gameState = {
114|      id: gameId,
115|      secretNumber,
116|      min,
117|      max,
118|      attempts,
119|      attemptsUsed: 0,
120|      guesses: [],
121|      gameActive: true,
122|      difficulty,
123|      startTime: Date.now(),
124|    };
125|
126|    // Store game state
127|    guessGames.set(gameId, gameState);
128|
129|    await sendGuessPrompt(interaction, gameState);
130|  } catch (error) {
131|    await handleCommandError(interaction, /** @type {Error | CommandError} */ (error));
132|  }
133|}
134|
135|/**
136| * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').ButtonInteraction | import('discord.js').ModalSubmitInteraction} interaction
137| * @param {GuessGameState} gameState
138| */
139|async function sendGuessPrompt(interaction, gameState) {
140|  try {
141|    const { attempts, attemptsUsed, min, max, guesses } = gameState;
142|
143|    // Update game state in storage
144|    guessGames.set(gameState.id, gameState);
145|
146|    if (attemptsUsed >= attempts) {
147|      gameState.gameActive = false;
148|      guessGames.delete(gameState.id); // Clean up completed game
149|      const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);
150|
151|      const loseEmbed = new EmbedBuilder()
152|        .setTitle('❌ Game Over!')
153|        .setColor(0xff_00_00)
154|        .setDescription(`The secret number was **${gameState.secretNumber}**!\n\nYou used all ${attempts} attempts in ${timeElapsed} seconds.`)
155|        .addFields({
156|          name: 'Your Guesses',
157|          value:
158|            guesses.length > 0
159|              ? guesses.map(/** @param {Guess} g */ (g, /** @param {number} i */ i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join('\n')
160|              : 'No guesses made',
161|          inline: false,
162|        });
163|
164|      if (interaction.replied || interaction.deferred) {
165|        await safeInteractionUpdate(interaction, { embeds: [loseEmbed], components: [] });
166|      } else {
167|        await safeInteractionReply(interaction, { embeds: [loseEmbed] });
168|      }
169|      return;
170|    }
171|
172|    const embed = new EmbedBuilder()
173|      .setTitle('🔢 Number Guessing Game')
174|      .setColor(0x00_99_ff)
175|      .setDescription(`I'm thinking of a number between **${min}** and **${max}**.\n\nYou have **${attempts - attemptsUsed}** attempts remaining.`)
176|      .addFields({
177|        name: 'Previous Guesses',
178|        value:
179|          guesses.length > 0
180|            ? guesses
181|                .slice(-5)
182|                .map(/** @param {Guess} g */ (g, /** @param {number} i */ i) => `**${g.number}** - ${g.feedback}`)
183|                .join('\n')
184|            : 'No guesses yet',
185|        inline: false,
186|      });
187|
188|    // Create guess button
189|    const row = new ActionRowBuilder().addComponents(
190|      new ButtonBuilder().setCustomId(`guess_modal:${gameState.id}:${min}:${max}`).setLabel('🔢 Make Guess').setStyle(ButtonStyle.Primary),
191|    );
192|
193|    if (interaction.replied || interaction.deferred) {
194|      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
195|    } else {
196|      await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
197|    }
198|  } catch (error) {
199|    logger.error('sendGuessPrompt error:', error instanceof Error ? error : new Error(String(error)));
200|    await handleCommandError(interaction, new CommandError('Failed to update game prompt.', 'UNKNOWN_ERROR', { originalError: String(error) }));
201|  }
202|}
203|
204|/**
205| * @param {import('discord.js').ButtonInteraction} interaction
206| * @param {GuessGameState} gameState
207| */
208|async function sendGuessModal(interaction, gameState) {
209|  const modal = new ModalBuilder().setCustomId(`guess_submit:${gameState.id}`).setTitle('Make Your Guess');
210|  const guessInput = new TextInputBuilder()
211|    .setCustomId('guess_number')
212|    .setLabel(`Number between ${gameState.min} and ${gameState.max}`)
213|    .setStyle(TextInputStyle.Short)
214|    .setRequired(true)
215|    .setPlaceholder(`${Math.floor((gameState.min + gameState.max) / 2)}`);
216|
217|  modal.addComponents(guessInput);
218|  await interaction.showModal(modal);
219|}
220|
221|/**
222| * @param {import('discord.js').ModalSubmitInteraction} interaction
223| * @param {GuessGameState} gameState
224| * @param {string} guess
225| */
226|async function processGuess(interaction, gameState, guess) {
227|  try {
228|    // Validate input
229|    if (!guess || typeof guess !== 'string') {
230|      throw new CommandError('Invalid guess input.', 'INVALID_ARGUMENT');
231|    }
232|
233|    const guessNum = Number.parseInt(guess.trim());
234|
235|    if (isNaN(guessNum)) {
236|      throw new CommandError('Please enter a valid number!', 'INVALID_ARGUMENT');
237|    }
238|
239|    if (guessNum < gameState.min || guessNum > gameState.max) {
240|      throw new CommandError(`Number must be between ${gameState.min} and ${gameState.max}!`, 'INVALID_ARGUMENT');
241|    }
242|
243|    gameState.attemptsUsed++;
244|
245|    let feedback;
246|    let isCorrect = false;
247|
248|    if (guessNum === gameState.secretNumber) {
249|      feedback = '🎉 Correct! You win!';
250|      isCorrect = true;
251|      gameState.gameActive = false;
252|
253|      // Track win with error handling
254|      try {
255|        updateUserStats(interaction.user.id, { guess_wins: 1 });
256|      } catch (statsError) {
257|        logger.error('Failed to update user stats:', statsError instanceof Error ? statsError : new Error(String(statsError)));
258|      }
259|    } else if (guessNum < gameState.secretNumber) {
260|      feedback = '📈 Too low! Try a higher number.';
261|    } else {
262|      feedback = '📉 Too high! Try a lower number.';
263|    }
264|
265|    // Store guess with feedback
266|    gameState.guesses.push({
267|      number: guessNum,
268|      feedback,
269|      attempt: gameState.attemptsUsed,
270|    });
271|
272|    if (isCorrect) {
273|      guessGames.delete(gameState.id); // Clean up completed game
274|      const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);
275|      const attemptsUsed = gameState.attemptsUsed;
276|
277|      let performanceRating;
278|      if (attemptsUsed === 1) performanceRating = '🌟 PERFECT! First try!';
279|      else if (attemptsUsed <= 3) performanceRating = '🥇 Excellent!';
280|      else if (attemptsUsed <= 5) performanceRating = '🥈 Good job!';
281|      else if (attemptsUsed <= 7) performanceRating = '🥉 Not bad!';
282|      else performanceRating = '🎯 You got it!';
283|
284|      const winEmbed = new EmbedBuilder()
285|        .setTitle('🎉 Congratulations!')
286|        .setColor(0x00_ff_00)
287|        .setDescription(`You guessed **${gameState.secretNumber}** correctly!\n\n${performanceRating}`)
288|        .addFields(
289|          {
290|            name: '📊 Game Stats',
291|            value: `**Attempts:** ${attemptsUsed}/${gameState.attempts}\n**Time:** ${timeElapsed}s\n**Difficulty:** ${gameState.difficulty.toUpperCase()}`,
292|            inline: true,
293|          },
294|          {
295|            name: '🏆 Performance',
296|            value: `**Range:** ${gameState.min}-${gameState.max}\n**Efficiency:** ${Math.round((1 - (attemptsUsed - 1) / gameState.attempts) * 100)}%`,
297|            inline: true,
298|          },
299|        );
300|
301|      if (gameState.guesses.length > 0) {
302|        winEmbed.addFields({
303|          name: '📝 Guess History',
304|          value: gameState.guesses.map(/** @param {Guess} g */ (g, /** @param {number} i */ i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join('\n'),
305|          inline: false,
306|        });
307|      }
308|
309|      await safeInteractionUpdate(interaction, { embeds: [winEmbed], components: [] });
310|    } else {
311|      // Continue game
312|      await sendGuessPrompt(interaction, gameState);
313|      await safeInteractionReply(interaction, { content: `**${guessNum}** - ${feedback}`, flags: MessageFlags.Ephemeral });
314|    }
315|  } catch (error) {
316|    logger.error('processGuess error:', error instanceof Error ? error : new Error(String(error)));
317|    await handleCommandError(
318|      interaction,
319|      error instanceof CommandError ? error : new CommandError('Failed to process guess.', 'UNKNOWN_ERROR', { originalError: String(error) }),
320|    );
321|  }
322|}
323|