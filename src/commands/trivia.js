1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
2|
3|import { updateUserStats } from '../achievements.js';
4|import { safeExecuteCommand, CommandError, validateRange } from '../errorHandler.js';
5|
6|const triviaQuestions = [
7|  {
8|    question: 'What is the capital of France?',
9|    options: ['London', 'Berlin', 'Paris', 'Madrid'],
10|    correct: 2,
11|    category: 'Geography',
12|  },
13|  {
14|    question: 'Which planet is known as the Red Planet?',
15|    options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
16|    correct: 1,
17|    category: 'Science',
18|  },
19|  {
20|    question: 'What is 2 + 2 × 3?',
21|    options: ['8', '10', '12', '14'],
22|    correct: 0,
23|    category: 'Math',
24|  },
25|  {
26|    question: 'Who painted the Mona Lisa?',
27|    options: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Michelangelo'],
28|    correct: 2,
29|    category: 'Art',
30|  },
31|  {
32|    question: 'What is the largest mammal in the world?',
33|    options: ['African Elephant', 'Blue Whale', 'Giraffe', 'Hippopotamus'],
34|    correct: 1,
35|    category: 'Nature',
36|  },
37|  {
38|    question: 'In which year did World War II end?',
39|    options: ['1944', '1945', '1946', '1947'],
40|    correct: 1,
41|    category: 'History',
42|  },
43|  {
44|    question: 'What is the chemical symbol for gold?',
45|    options: ['Go', 'Gd', 'Au', 'Ag'],
46|    correct: 2,
47|    category: 'Science',
48|  },
49|  {
50|    question: "Which programming language is known as the 'mother of all languages'?",
51|    options: ['Python', 'C', 'Assembly', 'Java'],
52|    correct: 1,
53|    category: 'Technology',
54|  },
55|];
56|
57|export const data = new SlashCommandBuilder()
58|  .setName('trivia')
59|  .setDescription('Start an interactive trivia quiz game')
60|  .addIntegerOption((option) =>
61|    option.setName('questions').setDescription('Number of questions (1-10, default: 5)').setMinValue(1).setMaxValue(10).setRequired(false),
62|  )
63|  .addStringOption((option) =>
64|    option
65|      .setName('category')
66|      .setDescription('Trivia category')
67|      .addChoices(
68|        { name: 'All Categories', value: 'all' },
69|        { name: 'Geography', value: 'Geography' },
70|        { name: 'Science', value: 'Science' },
71|        { name: 'Math', value: 'Math' },
72|        { name: 'Art', value: 'Art' },
73|        { name: 'Nature', value: 'Nature' },
74|        { name: 'History', value: 'History' },
75|        { name: 'Technology', value: 'Technology' },
76|      )
77|      .setRequired(false),
78|  );
79|
80|export async function execute(interaction) {
81|  const questionCount = interaction.options.getInteger('questions') || 5;
82|  const category = interaction.options.getString('category') || 'all';
83|
84|  // Validate question count
85|  validateRange(questionCount, 1, 10, 'question count');
86|
87|  // Filter questions by category if specified
88|  let availableQuestions = triviaQuestions;
89|  if (category !== 'all') {
90|    const validCategories = ['Geography', 'Science', 'Math', 'Art', 'Nature', 'History', 'Technology'];
91|    if (!validCategories.includes(category)) {
92|      throw new CommandError('Invalid category specified.', 'INVALID_ARGUMENT');
93|    }
94|    availableQuestions = triviaQuestions.filter((q) => q.category === category);
95|  }
96|
97|  if (availableQuestions.length < questionCount) {
98|    throw new CommandError(
99|      `Not enough questions available in ${category === 'all' ? 'all categories' : category} category. Available: ${availableQuestions.length}, Requested: ${questionCount}`,
100|      'INVALID_ARGUMENT',
101|    );
102|  }
103|
104|  if (availableQuestions.length === 0) {
105|    throw new CommandError('No questions available in the selected category.', 'NOT_FOUND');
106|  }
107|
108|  // Select random questions
109|  const selectedQuestions = [];
110|  const usedIndices = new Set();
111|
112|  try {
113|    while (selectedQuestions.length < questionCount && usedIndices.size < availableQuestions.length) {
114|      const randomIndex = Math.floor(Math.random() * availableQuestions.length);
115|      if (!usedIndices.has(randomIndex)) {
116|        usedIndices.add(randomIndex);
117|        selectedQuestions.push(availableQuestions[randomIndex]);
118|      }
119|    }
120|
121|    if (selectedQuestions.length < questionCount) {
122|      throw new CommandError('Failed to select sufficient unique questions.', 'COMMAND_ERROR');
123|    }
124|  } catch (error) {
125|    throw new CommandError(`Failed to prepare trivia questions: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
126|  }
127|
128|  // Import trivia games map
129|  const { triviaGames } = await import('../game-states.js');
130|
131|  // Generate unique game ID
132|  const gameId = `trivia_${interaction.user.id}_${Date.now()}`;
133|
134|  const gameState = {
135|    userId: interaction.user.id,
136|    questions: selectedQuestions,
137|    currentQuestion: 0,
138|    score: 0,
139|    answers: [],
140|    startTime: Date.now(),
141|    gameActive: true,
142|  };
143|
144|  // Store game state
145|  triviaGames.set(gameId, gameState);
146|
147|  await sendQuestion(interaction, gameState);
148|}
149|
150|async function sendQuestion(interaction, gameState) {
151|  const question = gameState.questions[gameState.currentQuestion];
152|
153|  if (!question) {
154|    await sendResults(interaction, gameState);
155|    return;
156|  }
157|
158|  const embed = new EmbedBuilder()
159|    .setTitle(`🧠 Trivia Quiz - Question ${gameState.currentQuestion + 1}/${gameState.questions.length}`)
160|    .setDescription(`**${question.question}**`)
161|    .setColor(0x00_99_ff)
162|    .addFields({
163|      name: 'Category',
164|      value: question.category,
165|      inline: true,
166|    })
167|    .setFooter({ text: `Score: ${gameState.score}/${gameState.currentQuestion}` })
168|    .setTimestamp();
169|
170|  const buttons = question.options.map((option, index) =>
171|    new ButtonBuilder()
172|      .setCustomId(`trivia_${index}`)
173|      .setLabel(`${String.fromCharCode(65 + index)}) ${option}`)
174|      .setStyle(ButtonStyle.Primary),
175|  );
176|
177|  const rows = [];
178|  for (let i = 0; i < buttons.length; i += 2) {
179|    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 2));
180|    rows.push(row);
181|  }
182|
183|  const filter = (i) => i.customId.startsWith('trivia_') && i.user.id === interaction.user.id;
184|  const collector = interaction.channel.createMessageComponentCollector({
185|    componentType: ComponentType.Button,
186|    filter,
187|    time: 30_000,
188|    max: 1,
189|  });
190|
191|  collector.on('collect', async (i) => {
192|    try {
193|      const selectedAnswer = Number.parseInt(i.customId.split('_')[1]);
194|
195|      if (isNaN(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= question.options.length) {
196|        await i.reply({ content: 'Invalid answer selection.', flags: MessageFlags.Ephemeral });
197|        return;
198|      }
199|
200|      const isCorrect = selectedAnswer === question.correct;
201|
202|      if (isCorrect) {
203|        gameState.score++;
204|      }
205|
206|      gameState.answers.push({
207|        question: question.question,
208|        selectedAnswer: selectedAnswer,
209|        correctAnswer: question.correct,
210|        isCorrect: isCorrect,
211|        userChoice: question.options[selectedAnswer],
212|        correctChoice: question.options[question.correct],
213|      });
214|
215|      gameState.currentQuestion++;
216|
217|      // Send feedback and next question
218|      const feedbackEmbed = new EmbedBuilder()
219|        .setTitle(isCorrect ? '✅ Correct!' : '❌ Incorrect!')
220|        .setDescription(
221|          `**${question.question}**\n\nYour answer: **${question.options[selectedAnswer]}**\nCorrect answer: **${question.options[question.correct]}**`,
222|        )
223|        .setColor(isCorrect ? 0x00_ff_00 : 0xff_00_00)
224|        .setFooter({ text: `Score: ${gameState.score}/${gameState.currentQuestion}` });
225|
226|      await i.reply({ embeds: [feedbackEmbed], flags: MessageFlags.Ephemeral });
227|
228|      // Wait a moment before sending next question
229|      setTimeout(() => {
230|        sendQuestion(interaction, gameState);
231|      }, 2000);
232|    } catch (error) {
233|      logger.error('Error in trivia collector:', error instanceof Error ? error : new Error(String(error)));
234|      await i.reply({ content: 'An error occurred while processing your answer.', flags: MessageFlags.Ephemeral });
235|    }
236|  });
237|
238|  collector.on('end', async (collected) => {
239|    if (collected.size === 0) {
240|      const timeoutEmbed = new EmbedBuilder()
241|        .setTitle("⏰ Time's Up!")
242|        .setDescription("You didn't answer in time. Moving to next question...")
243|        .setColor(0xff_a5_00);
244|
245|      await interaction.followUp({ embeds: [timeoutEmbed], flags: MessageFlags.Ephemeral });
246|
247|      gameState.answers.push({
248|        question: question.question,
249|        selectedAnswer: null,
250|        correctAnswer: question.correct,
251|        isCorrect: false,
252|        timeout: true,
253|      });
254|
255|      gameState.currentQuestion++;
256|
257|      setTimeout(() => {
258|        sendQuestion(interaction, gameState);
259|      }, 2000);
260|    }
261|  });
262|
263|  if (interaction.replied || interaction.deferred) {
264|    await interaction.followUp({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
265|  } else {
266|    await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
267|  }
268|}
269|
270|async function sendResults(interaction, gameState) {
271|  const totalTime = Math.round((Date.now() - gameState.startTime) / 1000);
272|  const percentage = Math.round((gameState.score / gameState.questions.length) * 100);
273|
274|  let resultMessage = '';
275|  if (percentage >= 90) resultMessage = "🏆 Outstanding! You're a trivia master!";
276|  else if (percentage >= 70) resultMessage = '🥇 Great job! You know your stuff!';
277|  else if (percentage >= 50) resultMessage = '🥈 Not bad! Keep practicing!';
278|  else resultMessage = '📚 Keep learning and try again!';
279|
280|  // Track trivia achievements
281|  try {
282|    const correctAnswers = gameState.answers.filter((a) => a.isCorrect).length;
283|    updateUserStats(interaction.user.id, {
284|      trivia_correct: correctAnswers,
285|      features_tried: 1,
286|    });
287|  } catch (error) {
288|    logger.warn('Failed to update trivia achievements:', { message: error?.message });
289|  }
290|
291|  const embed = new EmbedBuilder()
292|    .setTitle('🎯 Trivia Quiz Complete!')
293|    .setDescription(`${resultMessage}\n\n**Final Score: ${gameState.score}/${gameState.questions.length} (${percentage}%)**\n⏱️ Time: ${totalTime}s`)
294|    .setColor(percentage >= 70 ? 0x00_ff_00 : percentage >= 50 ? 0xff_a5_00 : 0xff_00_00)
295|    .setTimestamp();
296|
297|  // Add detailed results
298|  for (const [index, answer] of gameState.answers.entries()) {
299|    const emoji = answer.isCorrect ? '✅' : answer.timeout ? '⏰' : '❌';
300|    const status = answer.isCorrect ? 'Correct' : answer.timeout ? 'Timeout' : 'Incorrect';
301|    embed.addFields({
302|      name: `Q${index + 1}: ${status}`,
303|      value: `${emoji} **${answer.question}**\n${answer.isCorrect ? 'Your answer: ' + answer.userChoice : `Your answer: ${answer.userChoice}\nCorrect: ${answer.correctChoice}`}`,
304|      inline: false,
305|    });
306|  }
307|
308|  if (interaction.replied || interaction.deferred) {
309|    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
310|  } else {
311|    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
312|  }
313|}
314|
315|export async function safeExecute(interaction) {
316|  return safeExecuteCommand(interaction, execute);
317|}
318|