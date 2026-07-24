1|import { SlashCommandBuilder, MessageFlags } from 'discord.js';
2|
3|import { startTypingGame, checkTypingAttempt } from '../minigames/typing.js';
4|import { CommandError, handleCommandError } from '../errorHandler.js';
5|
6|const sessions = new Map(); // In-memory storage for game sessions
7|
8|// Constants for game configuration
9|const GUESS_GAME_RANGE = { min: 1, max: 100 };
10|const TYPING_GAME_DURATION = 6000; // 6 seconds in milliseconds
11|
12|export const data = new SlashCommandBuilder()
13|  .setName('minigame')
14|  .setDescription('Play a quick minigame')
15|  .addSubcommand((sub) =>
16|    sub
17|      .setName('guess')
18|      .setDescription('Start or guess the number')
19|      .addIntegerOption((opt) => opt.setName('number').setDescription('Your guess').setRequired(false)),
20|  )
21|  .addSubcommand((sub) =>
22|    sub
23|      .setName('type')
24|      .setDescription('Start a typing challenge')
25|      .addStringOption((opt) => opt.setName('novel').setDescription('Novel ID to source sentence from')),
26|  );
27|
28|export async function execute(interaction) {
29|  try {
30|    const sub = interaction.options.getSubcommand();
31|    const user = interaction.user.id;
32|
33|    // Input validation
34|    if (!user) {
35|      throw new CommandError('Invalid user ID', 'VALIDATION_ERROR');
36|    }
37|
38|    if (sub === 'guess') {
39|      const guess = interaction.options.getInteger('number');
40|
41|      // Check if user has an active game
42|      const hasActiveGame = sessions.has(user) && typeof sessions.get(user) === 'number';
43|      const isFirstGuess = !sessions.has(user) || typeof sessions.get(user) === 'object';
44|
45|      if (isFirstGuess) {
46|        // Start new game
47|        const target = Math.floor(Math.random() * (GUESS_GAME_RANGE.max - GUESS_GAME_RANGE.min + 1)) + GUESS_GAME_RANGE.min;
48|        sessions.set(user, target);
49|        return interaction.reply({
50|          content: `🎯 I have picked a number between ${GUESS_GAME_RANGE.min} and ${GUESS_GAME_RANGE.max}. Try \`/minigame guess <number>\` to guess!`,
51|          flags: MessageFlags.Ephemeral,
52|        });
53|      }
54|
55|      if (hasActiveGame) {
56|        const target = sessions.get(user);
57|
58|        if (!guess) {
59|          return interaction.reply({
60|            content: '❌ You need to provide a number to guess.',
61|            flags: MessageFlags.Ephemeral,
62|          });
63|        }
64|
65|        // Validate guess range
66|        if (guess < GUESS_GAME_RANGE.min || guess > GUESS_GAME_RANGE.max) {
67|          return interaction.reply({
68|            content: `❌ Please guess a number between ${GUESS_GAME_RANGE.min} and ${GUESS_GAME_RANGE.max}.`,
69|            flags: MessageFlags.Ephemeral,
70|          });
71|        }
72|
73|        if (guess === target) {
74|          sessions.delete(user);
75|          return interaction.reply(`🎉 ${interaction.user.username}, correct! You guessed ${target}!`);
76|        }
77|
78|        const hint = guess < target ? 'higher' : 'lower';
79|        return interaction.reply({
80|          content: `❌ Nope — try ${hint}.`,
81|          flags: MessageFlags.Ephemeral,
82|        });
83|      }
84|    }
85|
86|    if (sub === 'type') {
87|      const novelId = interaction.options.getString('novel');
88|      let sentence;
89|
90|      if (novelId) {
91|        try {
92|          const { getNovel } = await import('../novel.js');
93|          const novel = getNovel(novelId);
94|          if (novel && novel.chapters && novel.chapters.length > 0) {
95|            const text = novel.chapters.at(-1).text;
96|            const sentences = text.split(/[!.?]\s+/).filter(Boolean);
97|            if (sentences.length > 0) {
98|              sentence = sentences[Math.floor(Math.random() * sentences.length)].trim();
99|            }
100|          } else {
101|            return interaction.reply({
102|              content: '❌ Novel not found or has no chapters.',
103|              flags: MessageFlags.Ephemeral,
104|            });
105|          }
106|        } catch (error) {
107|          logger.error('Failed to load novel for typing:', error instanceof Error ? error : new Error(String(error)));
108|          return interaction.reply({
109|            content: '❌ Failed to load novel data.',
110|            flags: MessageFlags.Ephemeral,
111|          });
112|        }
113|      }
114|
115|      const gameData = startTypingGame(user, 6, sentence);
116|      if (!gameData || !gameData.sentence) {
117|        throw new CommandError('Failed to start typing game', 'GAME_ERROR');
118|      }
119|
120|      sessions.set(user, { type: 'typing', sentence: gameData.sentence, endAt: Date.now() + TYPING_GAME_DURATION });
121|      return interaction.reply({
122|        content: `⌨️ Type this exactly within ${TYPING_GAME_DURATION / 1000} seconds:\n\`${gameData.sentence}\``,
123|        ephemeral: false,
124|      });
125|    }
126|  } catch (error) {
127|    return handleCommandError(interaction, error);
128|  }
129|}
130|