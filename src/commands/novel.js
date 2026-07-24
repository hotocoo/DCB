1|import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
2|
3|import { createNovel, listNovels, getNovel, generateChapter } from '../novel.js';
4|import { CommandError, handleCommandError } from '../errorHandler.js';
5|
6|export const data = new SlashCommandBuilder()
7|  .setName('novel')
8|  .setDescription('Light novel features')
9|  .addSubcommand((sub) =>
10|    sub
11|      .setName('create')
12|      .setDescription('Create a new novel')
13|      .addStringOption((opt) => opt.setName('title').setDescription('Title'))
14|      .addStringOption((opt) => opt.setName('prompt').setDescription('Initial prompt/context')),
15|  )
16|  .addSubcommand((sub) => sub.setName('list').setDescription('List novels'))
17|  .addSubcommand((sub) =>
18|    sub
19|      .setName('read')
20|      .setDescription('Read a novel')
21|      .addStringOption((opt) => opt.setName('id').setDescription('Novel ID').setRequired(true))
22|      .addIntegerOption((opt) => opt.setName('chapter').setDescription('Chapter number')),
23|  )
24|  .addSubcommand((sub) =>
25|    sub
26|      .setName('next')
27|      .setDescription('Generate next chapter')
28|      .addStringOption((opt) => opt.setName('id').setDescription('Novel ID').setRequired(true)),
29|  );
30|
31|export async function execute(interaction) {
32|  try {
33|    const sub = interaction.options.getSubcommand();
34|    const userId = interaction.user.id;
35|
36|    // Input validation
37|    if (!userId) {
38|      throw new CommandError('Invalid user ID', 'VALIDATION_ERROR');
39|    }
40|
41|    if (sub === 'create') {
42|      const title = interaction.options.getString('title');
43|      const prompt = interaction.options.getString('prompt');
44|
45|      // Validate inputs
46|      if (!title || title.trim().length === 0) {
47|        return interaction.reply({
48|          content: '❌ Novel title cannot be empty.',
49|          flags: MessageFlags.Ephemeral,
50|        });
51|      }
52|
53|      if (title.length > 100) {
54|        return interaction.reply({
55|          content: '❌ Novel title must be 100 characters or less.',
56|          flags: MessageFlags.Ephemeral,
57|        });
58|      }
59|
60|      if (prompt && prompt.length > 500) {
61|        return interaction.reply({
62|          content: '❌ Initial prompt must be 500 characters or less.',
63|          flags: MessageFlags.Ephemeral,
64|        });
65|      }
66|
67|      const novel = createNovel(userId, title.trim(), prompt?.trim() || '');
68|      const embed = new EmbedBuilder()
69|        .setTitle('📖 Novel Created')
70|        .setColor(0x00_ff_00)
71|        .setDescription(`**${novel.title}**\n\nID: \`${novel.id}\`\nAuthor: ${interaction.user.username}`)
72|        .addFields({
73|          name: 'Next Steps',
74|          value: 'Use `/novel next` to generate the first chapter!',
75|        });
76|
77|      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
78|    }
79|
80|    if (sub === 'list') {
81|      const novels = listNovels();
82|      if (!novels || novels.length === 0) {
83|        return interaction.reply({
84|          content: '📚 No novels have been created yet.',
85|          flags: MessageFlags.Ephemeral,
86|        });
87|      }
88|
89|      const embed = new EmbedBuilder().setTitle('📚 Available Novels').setColor(0x00_99_ff).setDescription(novels.join('\n\n'));
90|
91|      return interaction.reply({ embeds: [embed] });
92|    }
93|
94|    if (sub === 'read') {
95|      const id = interaction.options.getString('id');
96|      const chapter = interaction.options.getInteger('chapter') || 1;
97|
98|      // Validate inputs
99|      if (!id || id.trim().length === 0) {
100|        return interaction.reply({
101|          content: '❌ Novel ID is required.',
102|          flags: MessageFlags.Ephemeral,
103|        });
104|      }
105|
106|      if (chapter < 1) {
107|        return interaction.reply({
108|          content: '❌ Chapter number must be 1 or greater.',
109|          flags: MessageFlags.Ephemeral,
110|        });
111|      }
112|
113|      const novel = getNovel(id.trim());
114|      if (!novel) {
115|        return interaction.reply({
116|          content: '❌ Novel not found. Check the ID and try again.',
117|          flags: MessageFlags.Ephemeral,
118|        });
119|      }
120|
121|      const chap = novel.chapters[chapter - 1];
122|      if (!chap) {
123|        return interaction.reply({
124|          content: `❌ Chapter ${chapter} not found. This novel has ${novel.chapters.length} chapters.\n\nUse \`/novel next\` to generate more chapters!`,
125|          flags: MessageFlags.Ephemeral,
126|        });
127|      }
128|
129|      const embed = new EmbedBuilder()
130|        .setTitle(`📖 ${novel.title}`)
131|        .setColor(0x99_32_cc)
132|        .setDescription(`**Chapter ${chap.index}**\n\n${chap.text}`)
133|        .setFooter({ text: `Novel ID: ${novel.id} • Total Chapters: ${novel.chapters.length}` });
134|
135|      return interaction.reply({ embeds: [embed] });
136|    }
137|
138|    if (sub === 'next') {
139|      const id = interaction.options.getString('id');
140|
141|      // Validate inputs
142|      if (!id || id.trim().length === 0) {
143|        return interaction.reply({
144|          content: '❌ Novel ID is required.',
145|          flags: MessageFlags.Ephemeral,
146|        });
147|      }
148|
149|      const novel = getNovel(id.trim());
150|      if (!novel) {
151|        return interaction.reply({
152|          content: '❌ Novel not found. Check the ID and try again.',
153|          flags: MessageFlags.Ephemeral,
154|        });
155|      }
156|
157|      await interaction.deferReply();
158|
159|      try {
160|        const chapter = await generateChapter(interaction.guildId, id.trim());
161|        if (!chapter) {
162|          return interaction.editReply({
163|            content: '❌ Failed to generate chapter. Please try again later.',
164|          });
165|        }
166|
167|        const embed = new EmbedBuilder()
168|          .setTitle(`📝 Chapter ${chapter.index} Generated`)
169|          .setColor(0x00_ff_00)
170|          .setDescription(`**${novel.title}**\n\n${chapter.text}`)
171|          .setFooter({ text: `Novel ID: ${novel.id} • Use /novel read to view full context` });
172|
173|        return interaction.editReply({ embeds: [embed] });
174|      } catch (error) {
175|        logger.error('Chapter generation error:', error instanceof Error ? error : new Error(String(error)));
176|        return interaction.editReply({
177|          content: '❌ An error occurred while generating the chapter. Please try again.',
178|        });
179|      }
180|    }
181|  } catch (error) {
182|    return handleCommandError(interaction, error);
183|  }
184|}
185|