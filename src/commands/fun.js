1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
2|
3|import { CommandError, handleCommandError } from '../errorHandler.js';
4|import { safeInteractionReply, safeInteractionUpdate } from '../interactionHandlers.js';
5|import {
6|  getRandomJoke,
7|  generateStory,
8|  getRiddle,
9|  getFunFact,
10|  getRandomQuote,
11|  magic8Ball,
12|  generateFunName,
13|  getPersonalityQuestion,
14|  updateEntertainmentStats,
15|  createFunChallenge,
16|  getFunLeaderboard,
17|} from '../entertainment.js';
18|
19|export const data = new SlashCommandBuilder()
20|  .setName('fun')
21|  .setDescription('Entertainment and fun commands - jokes, stories, riddles, and more')
22|  .addSubcommand((sub) =>
23|    sub
24|      .setName('joke')
25|      .setDescription('Get a random joke')
26|      .addStringOption((opt) =>
27|        opt
28|          .setName('category')
29|          .setDescription('Joke category')
30|          .addChoices(
31|            { name: 'General', value: 'general' },
32|            { name: 'Programming', value: 'programming' },
33|            { name: 'Dad Jokes', value: 'dad' },
34|            { name: 'Math', value: 'math' },
35|            { name: 'Science', value: 'science' },
36|          )
37|          .setRequired(false),
38|      ),
39|  )
40|  .addSubcommand((sub) =>
41|    sub
42|      .setName('story')
43|      .setDescription('Generate a creative story')
44|      .addStringOption((opt) => opt.setName('prompt').setDescription('Story prompt').setRequired(true))
45|      .addStringOption((opt) =>
46|        opt
47|          .setName('genre')
48|          .setDescription('Story genre')
49|          .addChoices(
50|            { name: 'Fantasy', value: 'fantasy' },
51|            { name: 'Adventure', value: 'adventure' },
52|            { name: 'Mystery', value: 'mystery' },
53|            { name: 'Sci-Fi', value: 'sciFi' },
54|          )
55|          .setRequired(false),
56|      ),
57|  )
58|  .addSubcommand((sub) =>
59|    sub
60|      .setName('riddle')
61|      .setDescription('Get a riddle to solve')
62|      .addStringOption((opt) =>
63|        opt
64|          .setName('difficulty')
65|          .setDescription('Riddle difficulty')
66|          .addChoices({ name: 'Easy', value: 'easy' }, { name: 'Medium', value: 'medium' }, { name: 'Hard', value: 'hard' })
67|          .setRequired(false),
68|      ),
69|  )
70|  .addSubcommand((sub) =>
71|    sub
72|      .setName('fact')
73|      .setDescription('Get a fun fact')
74|      .addStringOption((opt) =>
75|        opt
76|          .setName('category')
77|          .setDescription('Fact category')
78|          .addChoices(
79|            { name: 'Random', value: 'random' },
80|            { name: 'Animals', value: 'animals' },
81|            { name: 'Space', value: 'space' },
82|            { name: 'Science', value: 'science' },
83|            { name: 'History', value: 'history' },
84|          )
85|          .setRequired(false),
86|      ),
87|  )
88|  .addSubcommand((sub) =>
89|    sub
90|      .setName('quote')
91|      .setDescription('Get an inspirational quote')
92|      .addStringOption((opt) =>
93|        opt
94|          .setName('category')
95|          .setDescription('Quote category')
96|          .addChoices(
97|            { name: 'Inspirational', value: 'inspirational' },
98|            { name: 'Motivational', value: 'motivational' },
99|            { name: 'Wisdom', value: 'wisdom' },
100|            { name: 'Humor', value: 'humor' },
101|          )
102|          .setRequired(false),
103|      ),
104|  )
105|  .addSubcommand((sub) =>
106|    sub
107|      .setName('8ball')
108|      .setDescription('Ask the magic 8-ball')
109|      .addStringOption((opt) => opt.setName('question').setDescription('Your question').setRequired(true)),
110|  )
111|  .addSubcommand((sub) =>
112|    sub
113|      .setName('name')
114|      .setDescription('Generate a fun name')
115|      .addStringOption((opt) =>
116|        opt
117|          .setName('type')
118|          .setDescription('Name type')
119|          .addChoices(
120|            { name: 'Superhero', value: 'superhero' },
121|            { name: 'Villain', value: 'villain' },
122|            { name: 'Fantasy', value: 'fantasy' },
123|            { name: 'Sci-Fi', value: 'sciFi' },
124|          )
125|          .setRequired(false),
126|      ),
127|  )
128|  .addSubcommand((sub) =>
129|    sub
130|      .setName('challenge')
131|      .setDescription('Get a fun challenge')
132|      .addStringOption((opt) =>
133|        opt
134|          .setName('type')
135|          .setDescription('Challenge type')
136|          .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' })
137|          .setRequired(false),
138|      ),
139|  )
140|  .addSubcommand((sub) =>
141|    sub
142|      .setName('leaderboard')
143|      .setDescription('View fun leaderboards')
144|      .addStringOption((opt) =>
145|        opt
146|          .setName('category')
147|          .setDescription('Leaderboard category')
148|          .addChoices({ name: 'Jokes Told', value: 'jokes' }, { name: 'Riddles Solved', value: 'riddles' }, { name: 'Stories Generated', value: 'stories' })
149|          .setRequired(false),
150|      ),
151|  );
152|
153|/**
154| * @param {import('discord.js').ChatInputCommandInteraction} interaction
155| */
156|export async function execute(interaction) {
157|  try {
158|    const sub = interaction.options.getSubcommand();
159|
160|    switch (sub) {
161|      case 'joke': {
162|        const category = interaction.options.getString('category') || 'general';
163|        const joke = getRandomJoke(category);
164|
165|        if (!joke || !joke.joke) {
166|          throw new CommandError('Failed to retrieve joke. Please try again.', 'ENTERTAINMENT_ERROR');
167|        }
168|
169|        const embed = new EmbedBuilder()
170|          .setTitle('😂 Random Joke')
171|          .setColor(0xff_d7_00)
172|          .setDescription(joke.joke)
173|          .setFooter({ text: `${category.charAt(0).toUpperCase() + category.slice(1)} Jokes` });
174|
175|        // Track entertainment stats
176|        try {
177|          updateEntertainmentStats(interaction.user.id, 'jokesHeard');
178|        } catch (error) {
179|          logger.warn('Failed to update joke stats:', error instanceof Error ? error.message : String(error));
180|        }
181|
182|        const row = new ActionRowBuilder().addComponents(
183|          new ButtonBuilder().setCustomId(`fun_joke:${category}:${interaction.user.id}`).setLabel('😂 Another Joke').setStyle(ButtonStyle.Primary),
184|          new ButtonBuilder().setCustomId(`fun_rate:${joke.id}:5:${interaction.user.id}`).setLabel('⭐ Rate 5 Stars').setStyle(ButtonStyle.Secondary),
185|        );
186|
187|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
188|
189|        break;
190|      }
191|      case 'story': {
192|        const prompt = interaction.options.getString('prompt');
193|        const genre = interaction.options.getString('genre') || 'fantasy';
194|
195|        if (!prompt || prompt.trim().length === 0) {
196|          throw new CommandError('Story prompt cannot be empty.', 'INVALID_ARGUMENT');
197|        }
198|
199|        if (prompt.length > 500) {
200|          throw new CommandError('Story prompt is too long. Maximum 500 characters allowed.', 'INVALID_ARGUMENT');
201|        }
202|
203|        const story = generateStory(prompt, genre);
204|
205|        if (!story || !story.story) {
206|          throw new CommandError('Failed to generate story. Please try again.', 'ENTERTAINMENT_ERROR');
207|        }
208|
209|        const embed = new EmbedBuilder()
210|          .setTitle(`📖 ${genre.charAt(0).toUpperCase() + genre.slice(1)} Story`)
211|          .setColor(0x99_32_cc)
212|          .setDescription(story.story)
213|          .addFields({
214|            name: '🎯 Prompt',
215|            value: prompt,
216|            inline: false,
217|          });
218|
219|        // Track entertainment stats
220|        try {
221|          updateEntertainmentStats(interaction.user.id, 'storiesGenerated');
222|        } catch (error) {
223|          logger.warn('Failed to update story stats:', error instanceof Error ? error.message : String(error));
224|        }
225|
226|        const row = new ActionRowBuilder().addComponents(
227|          new ButtonBuilder().setCustomId(`fun_story:${genre}:${interaction.user.id}`).setLabel('📖 Another Story').setStyle(ButtonStyle.Primary),
228|          new ButtonBuilder().setCustomId(`fun_share:${story.id}:${interaction.user.id}`).setLabel('📤 Share Story').setStyle(ButtonStyle.Secondary),
229|        );
230|
231|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
232|
233|        break;
234|      }
235|      case 'riddle': {
236|        const difficulty = interaction.options.getString('difficulty') || 'medium';
237|        const riddle = getRiddle(difficulty);
238|
239|        if (!riddle || !riddle.riddle) {
240|          throw new CommandError('Failed to retrieve riddle. Please try again.', 'ENTERTAINMENT_ERROR');
241|        }
242|
243|        const embed = new EmbedBuilder()
244|          .setTitle(`🧩 ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Riddle`)
245|          .setColor(0xff_8c_00)
246|          .setDescription(riddle.riddle)
247|          .setFooter({ text: 'Think hard and reply with your answer!' });
248|
249|        // Track entertainment stats
250|        try {
251|          updateEntertainmentStats(interaction.user.id, 'riddlesAttempted');
252|        } catch (error) {
253|          logger.warn('Failed to update riddle stats:', error instanceof Error ? error.message : String(error));
254|        }
255|
256|        const row = new ActionRowBuilder().addComponents(
257|          new ButtonBuilder()
258|            .setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`)
259|            .setLabel('💡 Show Answer')
260|            .setStyle(ButtonStyle.Primary),
261|          new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel('🧩 Another Riddle').setStyle(ButtonStyle.Secondary),
262|        );
263|
264|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
265|
266|        break;
267|      }
268|      case 'fact': {
269|        const category = interaction.options.getString('category') || 'random';
270|        const fact = getFunFact(category);
271|
272|        if (!fact || !fact.fact) {
273|          throw new CommandError('Failed to retrieve fun fact. Please try again.', 'ENTERTAINMENT_ERROR');
274|        }
275|
276|        const embed = new EmbedBuilder()
277|          .setTitle(`🧠 ${category === 'random' ? 'Random' : category.charAt(0).toUpperCase() + category.slice(1)} Fun Fact`)
278|          .setColor(0x4c_af_50)
279|          .setDescription(fact.fact)
280|          .setFooter({ text: `${fact.category} Facts` });
281|
282|        // Track entertainment stats
283|        try {
284|          updateEntertainmentStats(interaction.user.id, 'factsLearned');
285|        } catch (error) {
286|          logger.warn('Failed to update fact stats:', error instanceof Error ? error.message : String(error));
287|        }
288|
289|        const row = new ActionRowBuilder().addComponents(
290|          new ButtonBuilder().setCustomId(`fun_fact:${category}:${interaction.user.id}`).setLabel('🧠 Another Fact').setStyle(ButtonStyle.Primary),
291|          new ButtonBuilder().setCustomId(`fun_share:${fact.id}:${interaction.user.id}`).setLabel('📤 Share Fact').setStyle(ButtonStyle.Secondary),
292|        );
293|
294|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
295|
296|        break;
297|      }
298|      case 'quote': {
299|        const category = interaction.options.getString('category') || 'inspirational';
300|        const quote = getRandomQuote(category);
301|
302|        if (!quote || !quote.quote || !quote.author) {
303|          throw new CommandError('Failed to retrieve quote. Please try again.', 'ENTERTAINMENT_ERROR');
304|        }
305|
306|        const embed = new EmbedBuilder()
307|          .setTitle(`💬 ${category.charAt(0).toUpperCase() + category.slice(1)} Quote`)
308|          .setColor(0xe9_1e_63)
309|          .addFields(
310|            { name: 'Quote', value: `"${quote.quote}"`, inline: false },
311|            { name: 'Author', value: quote.author, inline: true },
312|            { name: 'Category', value: category, inline: true },
313|          );
314|
315|        const row = new ActionRowBuilder().addComponents(
316|          new ButtonBuilder().setCustomId(`fun_quote:${category}:${interaction.user.id}`).setLabel('💬 Another Quote').setStyle(ButtonStyle.Primary),
317|          new ButtonBuilder().setCustomId(`fun_share:${quote.id}:${interaction.user.id}`).setLabel('📤 Share Quote').setStyle(ButtonStyle.Secondary),
318|        );
319|
320|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
321|
322|        break;
323|      }
324|      case '8ball': {
325|        const question = interaction.options.getString('question');
326|
327|        if (!question || question.trim().length === 0) {
328|          throw new CommandError('8-ball question cannot be empty.', 'INVALID_ARGUMENT');
329|        }
330|
331|        if (question.length > 200) {
332|          throw new CommandError('8-ball question is too long. Maximum 200 characters allowed.', 'INVALID_ARGUMENT');
333|        }
334|
335|        const result = magic8Ball(question);
336|
337|        if (!result || !result.answer) {
338|          throw new CommandError('Failed to get 8-ball response. Please try again.', 'ENTERTAINMENT_ERROR');
339|        }
340|
341|        const embed = new EmbedBuilder()
342|          .setTitle('🔮 Magic 8-Ball')
343|          .setColor(0x9c_27_b0)
344|          .addFields({ name: 'Question', value: question, inline: false }, { name: 'Answer', value: result.answer, inline: false });
345|
346|        const row = new ActionRowBuilder().addComponents(
347|          new ButtonBuilder().setCustomId(`fun_8ball:${interaction.user.id}`).setLabel('🔮 Ask Again').setStyle(ButtonStyle.Primary),
348|        );
349|
350|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
351|
352|        break;
353|      }
354|      case 'name': {
355|        const type = interaction.options.getString('type') || 'superhero';
356|        const name = generateFunName(type);
357|
358|        if (!name || !name.name) {
359|          throw new CommandError('Failed to generate fun name. Please try again.', 'ENTERTAINMENT_ERROR');
360|        }
361|
362|        const embed = new EmbedBuilder()
363|          .setTitle(`🎭 ${type.charAt(0).toUpperCase() + type.slice(1)} Name Generator`)
364|          .setColor(0xff_57_22)
365|          .setDescription(`**Your ${type} name:** ${name.name}`)
366|          .addFields({
367|            name: 'Type',
368|            value: type,
369|            inline: true,
370|          });
371|
372|        const row = new ActionRowBuilder().addComponents(
373|          new ButtonBuilder().setCustomId(`fun_name:${type}:${interaction.user.id}`).setLabel('🎭 Another Name').setStyle(ButtonStyle.Primary),
374|          new ButtonBuilder().setCustomId(`fun_name_random:${interaction.user.id}`).setLabel('🎲 Random Type').setStyle(ButtonStyle.Secondary),
375|        );
376|
377|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
378|
379|        break;
380|      }
381|      case 'challenge': {
382|        const type = interaction.options.getString('type') || 'daily';
383|        const challenge = createFunChallenge(type);
384|
385|        if (!challenge || !challenge.challenge) {
386|          throw new CommandError('Failed to generate challenge. Please try again.', 'ENTERTAINMENT_ERROR');
387|        }
388|
389|        const embed = new EmbedBuilder()
390|          .setTitle(`🎯 ${type.charAt(0).toUpperCase() + type.slice(1)} Challenge`)
391|          .setColor(0xff_c1_07)
392|          .setDescription(challenge.challenge)
393|          .addFields({
394|            name: 'Reward',
395|            value: challenge.reward,
396|            inline: false,
397|          });
398|
399|        const row = new ActionRowBuilder().addComponents(
400|          new ButtonBuilder().setCustomId(`fun_challenge:${type}:${interaction.user.id}`).setLabel('🎯 Accept Challenge').setStyle(ButtonStyle.Primary),
401|          new ButtonBuilder().setCustomId(`fun_challenge_new:${type}:${interaction.user.id}`).setLabel('🔄 New Challenge').setStyle(ButtonStyle.Secondary),
402|        );
403|
404|        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
405|
406|        break;
407|      }
408|      case 'leaderboard': {
409|        const category = interaction.options.getString('category') || 'jokes';
410|
411|        const leaderboard = getFunLeaderboard(category, 10);
412|
413|        if (!Array.isArray(leaderboard)) {
414|          throw new CommandError('Failed to retrieve leaderboard data.', 'ENTERTAINMENT_ERROR');
415|        }
416|
417|        if (leaderboard.length === 0) {
418|          return await safeInteractionReply(interaction, {
419|            content: '🏆 No data available for this leaderboard yet. Be the first to participate!',
420|            flags: MessageFlags.Ephemeral,
421|          });
422|        }
423|
424|        const embed = new EmbedBuilder().setTitle(`🏆 Fun Leaderboard - ${category.charAt(0).toUpperCase() + category.slice(1)}`).setColor(0xff_d7_00);
425|
426|        for (const [index, entry] of leaderboard.entries()) {
427|          if (!entry || typeof entry.score !== 'number') {
428|            logger.warn('Invalid leaderboard entry:', { entry });
429|            continue;
430|          }
431|          const rank = index + 1;
432|          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
433|          embed.addFields({
434|            name: `${medal} #${rank}`,
435|            value: `**${entry.score}** ${category}`,
436|            inline: true,
437|          });
438|        }
439|
440|        await safeInteractionReply(interaction, { embeds: [embed] });
441|
442|        break;
443|      }
444|      // No default
445|    }
446|  } catch (error) {
447|    logger.error('Error in fun command execution:', error instanceof Error ? error : new Error(String(error)));
448|    await handleCommandError(
449|      interaction,
450|      error instanceof CommandError
451|        ? error
452|        : new CommandError(error instanceof Error ? error.message : String(error) || 'An error occurred while processing the fun command.', 'UNKNOWN_ERROR'),
453|    );
454|  }
455|}
456|