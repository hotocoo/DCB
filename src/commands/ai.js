1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
2|
3|import {
4|  generateResponse,
5|  analyzeSentiment,
6|  generateSummary,
7|  translateText,
8|  getAvailableModels,
9|  getAvailablePersonalities,
10|  clearUserHistory,
11|  generateIdeas,
12|  generateCodeSnippet,
13|  generateRecommendations,
14|} from '../aiassistant.js';
15|import { logger } from '../logger.js';
16|
17|export const data = new SlashCommandBuilder()
18|  .setName('ai')
19|  .setDescription('Advanced AI assistant with multiple models and personalities')
20|  .addSubcommand((sub) =>
21|    sub
22|      .setName('chat')
23|      .setDescription('Chat with AI assistant')
24|      .addStringOption((opt) => opt.setName('message').setDescription('Your message').setRequired(true))
25|      .addStringOption((opt) =>
26|        opt
27|          .setName('model')
28|          .setDescription('AI model to use')
29|          .addChoices(
30|            { name: 'Creative Writer', value: 'creative' },
31|            { name: 'Technical Expert', value: 'technical' },
32|            { name: 'Helpful Assistant', value: 'helpful' },
33|            { name: 'Comedy Bot', value: 'funny' },
34|            { name: 'Teacher Bot', value: 'educational' },
35|          )
36|          .setRequired(false),
37|      )
38|      .addStringOption((opt) =>
39|        opt
40|          .setName('personality')
41|          .setDescription('AI personality')
42|          .addChoices(
43|            { name: 'Professional', value: 'professional' },
44|            { name: 'Friendly', value: 'friendly' },
45|            { name: 'Energetic', value: 'energetic' },
46|            { name: 'Wise Mentor', value: 'wise' },
47|          )
48|          .setRequired(false),
49|      ),
50|  )
51|  .addSubcommand((sub) =>
52|    sub
53|      .setName('analyze')
54|      .setDescription('Analyze text sentiment')
55|      .addStringOption((opt) => opt.setName('text').setDescription('Text to analyze').setRequired(true)),
56|  )
57|  .addSubcommand((sub) =>
58|    sub
59|      .setName('summarize')
60|      .setDescription('Summarize text')
61|      .addStringOption((opt) => opt.setName('text').setDescription('Text to summarize').setRequired(true))
62|      .addIntegerOption((opt) => opt.setName('length').setDescription('Max summary length').setRequired(false)),
63|  )
64|  .addSubcommand((sub) =>
65|    sub
66|      .setName('translate')
67|      .setDescription('Translate text')
68|      .addStringOption((opt) => opt.setName('text').setDescription('Text to translate').setRequired(true))
69|      .addStringOption((opt) => opt.setName('language').setDescription('Target language').setRequired(true)),
70|  )
71|  .addSubcommand((sub) =>
72|    sub
73|      .setName('ideas')
74|      .setDescription('Generate ideas')
75|      .addStringOption((opt) => opt.setName('topic').setDescription('Topic for ideas').setRequired(true))
76|      .addIntegerOption((opt) => opt.setName('count').setDescription('Number of ideas').setRequired(false)),
77|  )
78|  .addSubcommand((sub) =>
79|    sub
80|      .setName('code')
81|      .setDescription('Generate code')
82|      .addStringOption((opt) => opt.setName('language').setDescription('Programming language').setRequired(true))
83|      .addStringOption((opt) => opt.setName('description').setDescription('Code description').setRequired(true)),
84|  )
85|  .addSubcommand((sub) => sub.setName('models').setDescription('List available AI models'))
86|  .addSubcommand((sub) => sub.setName('personalities').setDescription('List available personalities'))
87|  .addSubcommand((sub) => sub.setName('recommend').setDescription('Get personalized recommendations'))
88|  .addSubcommand((sub) => sub.setName('clear').setDescription('Clear conversation history'));
89|
90|export async function execute(interaction) {
91|  try {
92|    // Validate interaction object
93|    if (!interaction || !interaction.user || !interaction.options) {
94|      throw new Error('Invalid interaction object');
95|    }
96|
97|    const sub = interaction.options.getSubcommand();
98|
99|    // Validate subcommand
100|    const validSubcommands = ['chat', 'analyze', 'summarize', 'translate', 'ideas', 'code', 'models', 'personalities', 'recommend', 'clear'];
101|    if (!validSubcommands.includes(sub)) {
102|      return interaction.reply({
103|        content: '❌ Invalid subcommand. Please use a valid AI subcommand.',
104|        flags: MessageFlags.Ephemeral,
105|      });
106|    }
107|
108|    switch (sub) {
109|      case 'chat': {
110|        const message = interaction.options.getString('message');
111|        const model = interaction.options.getString('model') || 'helpful';
112|        const personality = interaction.options.getString('personality') || 'friendly';
113|
114|        // Validate inputs
115|        if (!message || message.trim().length === 0) {
116|          return interaction.reply({
117|            content: '❌ Please provide a message to send to the AI.',
118|            flags: MessageFlags.Ephemeral,
119|          });
120|        }
121|
122|        if (message.length > 2000) {
123|          return interaction.reply({
124|            content: '❌ Message is too long. Please keep it under 2000 characters.',
125|            flags: MessageFlags.Ephemeral,
126|          });
127|        }
128|
129|        const validModels = ['creative', 'technical', 'helpful', 'funny', 'educational'];
130|        if (!validModels.includes(model)) {
131|          return interaction.reply({
132|            content: '❌ Invalid model. Please choose from: creative, technical, helpful, funny, educational.',
133|            flags: MessageFlags.Ephemeral,
134|          });
135|        }
136|
137|        const validPersonalities = ['professional', 'friendly', 'energetic', 'wise'];
138|        if (!validPersonalities.includes(personality)) {
139|          return interaction.reply({
140|            content: '❌ Invalid personality. Please choose from: professional, friendly, energetic, wise.',
141|            flags: MessageFlags.Ephemeral,
142|          });
143|        }
144|
145|        try {
146|          const response = await generateResponse(interaction.user.id, message.trim(), {
147|            model,
148|            personality,
149|            guildId: interaction.guild?.id,
150|          });
151|
152|          if (!response || typeof response !== 'string') {
153|            throw new Error('Invalid AI response');
154|          }
155|
156|          const embed = new EmbedBuilder()
157|            .setTitle(`🤖 ${model.charAt(0).toUpperCase() + model.slice(1)} AI Response`)
158|            .setColor(0x00_99_ff)
159|            .setDescription(response.length > 4000 ? response.slice(0, 3997) + '...' : response)
160|            .addFields({ name: 'Model', value: model, inline: true }, { name: 'Personality', value: personality, inline: true });
161|
162|          const row = new ActionRowBuilder().addComponents(
163|            new ButtonBuilder()
164|              .setCustomId(`ai_chat:${model}:${personality}:${interaction.user.id}`)
165|              .setLabel('💬 Continue Chat')
166|              .setStyle(ButtonStyle.Primary),
167|            new ButtonBuilder().setCustomId(`ai_clear:${interaction.user.id}`).setLabel('🗑️ Clear History').setStyle(ButtonStyle.Secondary),
168|          );
169|
170|          await interaction.reply({ embeds: [embed], components: [row] });
171|        } catch (error) {
172|          logger.error('AI chat error:', error instanceof Error ? error : new Error(String(error)));
173|          await interaction.reply({
174|            content: '❌ Failed to generate AI response. Please try again.',
175|            flags: MessageFlags.Ephemeral,
176|          });
177|        }
178|
179|        break;
180|      }
181|      case 'analyze': {
182|        const text = interaction.options.getString('text');
183|
184|        // Validate inputs
185|        if (!text || text.trim().length === 0) {
186|          return interaction.reply({
187|            content: '❌ Please provide text to analyze.',
188|            flags: MessageFlags.Ephemeral,
189|          });
190|        }
191|
192|        if (text.length > 1000) {
193|          return interaction.reply({
194|            content: '❌ Text is too long. Please keep it under 1000 characters.',
195|            flags: MessageFlags.Ephemeral,
196|          });
197|        }
198|
199|        try {
200|          const sentiment = await analyzeSentiment(text.trim());
201|
202|          if (!sentiment || !['positive', 'negative', 'neutral'].includes(sentiment)) {
203|            throw new Error('Invalid sentiment result');
204|          }
205|
206|          const embed = new EmbedBuilder()
207|            .setTitle('📊 Sentiment Analysis')
208|            .setColor(sentiment === 'positive' ? 0x00_ff_00 : sentiment === 'negative' ? 0xff_00_00 : 0xff_ff_00)
209|            .setDescription(`**Text:** ${text.length > 500 ? text.slice(0, 497) + '...' : text}`)
210|            .addFields({
211|              name: 'Sentiment',
212|              value: sentiment.toUpperCase(),
213|              inline: false,
214|            });
215|
216|          await interaction.reply({ embeds: [embed] });
217|        } catch (error) {
218|          logger.error('Sentiment analysis error:', error instanceof Error ? error : new Error(String(error)));
219|          await interaction.reply({
220|            content: '❌ Failed to analyze sentiment.',
221|            flags: MessageFlags.Ephemeral,
222|          });
223|        }
224|
225|        break;
226|      }
227|      case 'summarize': {
228|        const text = interaction.options.getString('text');
229|        const maxLength = interaction.options.getInteger('length') || 200;
230|
231|        // Validate inputs
232|        if (!text || text.trim().length === 0) {
233|          return interaction.reply({
234|            content: '❌ Please provide text to summarize.',
235|            flags: MessageFlags.Ephemeral,
236|          });
237|        }
238|
239|        if (text.length < 50) {
240|          return interaction.reply({
241|            content: '❌ Text is too short to summarize. Please provide at least 50 characters.',
242|            flags: MessageFlags.Ephemeral,
243|          });
244|        }
245|
246|        if (maxLength < 50 || maxLength > 1000) {
247|          return interaction.reply({
248|            content: '❌ Summary length must be between 50 and 1000 characters.',
249|            flags: MessageFlags.Ephemeral,
250|          });
251|        }
252|
253|        try {
254|          const summary = await generateSummary(text.trim(), maxLength);
255|
256|          if (!summary || typeof summary !== 'string') {
257|            throw new Error('Invalid summary result');
258|          }
259|
260|          const embed = new EmbedBuilder()
261|            .setTitle('📝 Text Summary')
262|            .setColor(0x99_32_cc)
263|            .setDescription(summary.length > 4000 ? summary.slice(0, 3997) + '...' : summary)
264|            .addFields(
265|              {
266|                name: 'Original Length',
267|                value: `${text.length} characters`,
268|                inline: true,
269|              },
270|              {
271|                name: 'Summary Length',
272|                value: `${summary.length} characters`,
273|                inline: true,
274|              },
275|            );
276|
277|          await interaction.reply({ embeds: [embed] });
278|        } catch (error) {
279|          logger.error('Summarization error:', error instanceof Error ? error : new Error(String(error)));
280|          await interaction.reply({
281|            content: '❌ Failed to summarize text.',
282|            flags: MessageFlags.Ephemeral,
283|          });
284|        }
285|
286|        break;
287|      }
288|      case 'translate': {
289|        const text = interaction.options.getString('text');
290|        const language = interaction.options.getString('language');
291|
292|        // Validate inputs
293|        if (!text || text.trim().length === 0) {
294|          return interaction.reply({
295|            content: '❌ Please provide text to translate.',
296|            flags: MessageFlags.Ephemeral,
297|          });
298|        }
299|
300|        if (!language || language.trim().length === 0) {
301|          return interaction.reply({
302|            content: '❌ Please specify a target language.',
303|            flags: MessageFlags.Ephemeral,
304|          });
305|        }
306|
307|        if (text.length > 1000) {
308|          return interaction.reply({
309|            content: '❌ Text is too long. Please keep it under 1000 characters.',
310|            flags: MessageFlags.Ephemeral,
311|          });
312|        }
313|
314|        try {
315|          const translation = await translateText(text.trim(), language.trim());
316|
317|          if (!translation || typeof translation !== 'string') {
318|            throw new Error('Invalid translation result');
319|          }
320|
321|          const embed = new EmbedBuilder()
322|            .setTitle('🌐 Translation')
323|            .setColor(0x4c_af_50)
324|            .addFields(
325|              { name: 'Original', value: text.length > 1024 ? text.slice(0, 1021) + '...' : text, inline: false },
326|              {
327|                name: `Translated (${language.toUpperCase()})`,
328|                value: translation.length > 1024 ? translation.slice(0, 1021) + '...' : translation,
329|                inline: false,
330|              },
331|            );
332|
333|          await interaction.reply({ embeds: [embed] });
334|        } catch (error) {
335|          logger.error('Translation error:', error instanceof Error ? error : new Error(String(error)));
336|          await interaction.reply({
337|            content: '❌ Failed to translate text.',
338|            flags: MessageFlags.Ephemeral,
339|          });
340|        }
341|
342|        break;
343|      }
344|      case 'ideas': {
345|        const topic = interaction.options.getString('topic');
346|        const count = interaction.options.getInteger('count') || 5;
347|
348|        // Validate inputs
349|        if (!topic || topic.trim().length === 0) {
350|          return interaction.reply({
351|            content: '❌ Please provide a topic for idea generation.',
352|            flags: MessageFlags.Ephemeral,
353|          });
354|        }
355|
356|        if (count < 1 || count > 10) {
357|          return interaction.reply({
358|            content: '❌ Number of ideas must be between 1 and 10.',
359|            flags: MessageFlags.Ephemeral,
360|          });
361|        }
362|
363|        if (topic.length > 100) {
364|          return interaction.reply({
365|            content: '❌ Topic is too long. Please keep it under 100 characters.',
366|            flags: MessageFlags.Ephemeral,
367|          });
368|        }
369|
370|        try {
371|          const ideas = await generateIdeas(topic.trim(), count);
372|
373|          if (!Array.isArray(ideas) || ideas.length === 0) {
374|            throw new Error('Invalid ideas result');
375|          }
376|
377|          const validIdeas = ideas.filter((idea) => idea && typeof idea === 'string').slice(0, count);
378|          const embed = new EmbedBuilder()
379|            .setTitle(`💡 Ideas for "${topic}"`)
380|            .setColor(0xff_98_00)
381|            .setDescription(validIdeas.map((idea, index) => `${index + 1}. ${idea.slice(0, 200)}`).join('\n'));
382|
383|          await interaction.reply({ embeds: [embed] });
384|        } catch (error) {
385|          logger.error('Idea generation error:', error instanceof Error ? error : new Error(String(error)));
386|          await interaction.reply({
387|            content: '❌ Failed to generate ideas.',
388|            flags: MessageFlags.Ephemeral,
389|          });
390|        }
391|
392|        break;
393|      }
394|      case 'code': {
395|        const language = interaction.options.getString('language');
396|        const description = interaction.options.getString('description');
397|
398|        // Validate inputs
399|        if (!language || language.trim().length === 0) {
400|          return interaction.reply({
401|            content: '❌ Please specify a programming language.',
402|            flags: MessageFlags.Ephemeral,
403|          });
404|        }
405|
406|        if (!description || description.trim().length === 0) {
407|          return interaction.reply({
408|            content: '❌ Please provide a description for the code.',
409|            flags: MessageFlags.Ephemeral,
410|          });
411|        }
412|
413|        if (language.length > 20 || description.length > 500) {
414|          return interaction.reply({
415|            content: '❌ Language or description is too long.',
416|            flags: MessageFlags.Ephemeral,
417|          });
418|        }
419|
420|        try {
421|          const code = await generateCodeSnippet(language.trim(), description.trim());
422|
423|          if (!code || typeof code !== 'string') {
424|            throw new Error('Invalid code result');
425|          }
426|
427|          const embed = new EmbedBuilder()
428|            .setTitle(`💻 ${language.toUpperCase()} Code`)
429|            .setColor(0x33_33_33)
430|            .setDescription('```' + language.toLowerCase() + '\n' + (code.length > 1500 ? code.slice(0, 1497) + '...' : code) + '\n```')
431|            .addFields({
432|              name: 'Description',
433|              value: description.length > 1024 ? description.slice(0, 1021) + '...' : description,
434|              inline: false,
435|            });
436|
437|          await interaction.reply({ embeds: [embed] });
438|        } catch (error) {
439|          logger.error('Code generation error:', error instanceof Error ? error : new Error(String(error)));
440|          await interaction.reply({
441|            content: '❌ Failed to generate code.',
442|            flags: MessageFlags.Ephemeral,
443|          });
444|        }
445|
446|        break;
447|      }
448|      case 'models': {
449|        try {
450|          const models = getAvailableModels();
451|
452|          if (!Array.isArray(models)) {
453|            throw new TypeError('Invalid models data');
454|          }
455|
456|          const embed = new EmbedBuilder().setTitle('🤖 Available AI Models').setColor(0x00_99_ff);
457|
458|          const validModels = models.filter((model) => model && model.name && model.description).slice(0, 10);
459|          for (const model of validModels) {
460|            embed.addFields({
461|              name: model.name.slice(0, 256),
462|              value: model.description.slice(0, 1024),
463|              inline: false,
464|            });
465|          }
466|
467|          await interaction.reply({ embeds: [embed] });
468|        } catch (error) {
469|          logger.error('Error fetching models:', error instanceof Error ? error : new Error(String(error)));
470|          await interaction.reply({
471|            content: '❌ Failed to fetch available models.',
472|            flags: MessageFlags.Ephemeral,
473|          });
474|        }
475|
476|        break;
477|      }
478|      case 'personalities': {
479|        try {
480|          const personalities = getAvailablePersonalities();
481|
482|          if (!Array.isArray(personalities)) {
483|            throw new TypeError('Invalid personalities data');
484|          }
485|
486|          const embed = new EmbedBuilder().setTitle('🎭 Available Personalities').setColor(0xe9_1e_63);
487|
488|          const validPersonalities = personalities.filter((p) => p && p.name && p.style).slice(0, 10);
489|          for (const personality of validPersonalities) {
490|            embed.addFields({
491|              name: personality.name.slice(0, 256),
492|              value: `Style: ${personality.style.slice(0, 768)}`,
493|              inline: false,
494|            });
495|          }
496|
497|          await interaction.reply({ embeds: [embed] });
498|        } catch (error) {
499|          logger.error('Error fetching personalities:', error instanceof Error ? error : new Error(String(error)));
500|          await interaction.reply({
501|