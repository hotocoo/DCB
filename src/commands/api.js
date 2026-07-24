1|import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
2|
3|import {
4|  getNews,
5|  getRandomJoke,
6|  getCatFact,
7|  getNumberFact,
8|  getDadJoke,
9|  getProgrammingQuote,
10|  getGitHubStats,
11|  getWeather,
12|  setAPIKey,
13|  getAPIKey,
14|  getIntegrationStats,
15|} from '../integrations.js';
16|
17|export const data = new SlashCommandBuilder()
18|  .setName('api')
19|  .setDescription('External API integrations - news, jokes, facts, and more')
20|  .addSubcommand((sub) =>
21|    sub
22|      .setName('news')
23|      .setDescription('Get latest news')
24|      .addStringOption((opt) => opt.setName('query').setDescription('Search topic').setRequired(false)),
25|  )
26|  .addSubcommand((sub) => sub.setName('joke').setDescription('Get a random joke'))
27|  .addSubcommand((sub) => sub.setName('catfact').setDescription('Get a random cat fact'))
28|  .addSubcommand((sub) =>
29|    sub
30|      .setName('numberfact')
31|      .setDescription('Get a fact about a number')
32|      .addIntegerOption((opt) => opt.setName('number').setDescription('Number (1-1000, random if not specified)').setRequired(false)),
33|  )
34|  .addSubcommand((sub) => sub.setName('dadjoke').setDescription('Get a dad joke'))
35|  .addSubcommand((sub) => sub.setName('programquote').setDescription('Get a programming quote'))
36|  .addSubcommand((sub) =>
37|    sub
38|      .setName('github')
39|      .setDescription('Get GitHub user stats')
40|      .addStringOption((opt) => opt.setName('username').setDescription('GitHub username').setRequired(true)),
41|  )
42|  .addSubcommand((sub) =>
43|    sub
44|      .setName('weather')
45|      .setDescription('Get weather info')
46|      .addStringOption((opt) => opt.setName('location').setDescription('Location').setRequired(true)),
47|  )
48|  .addSubcommand((sub) => sub.setName('stats').setDescription('API usage statistics'));
49|
50|export async function execute(interaction) {
51|  try {
52|    // Validate interaction object
53|    if (!interaction || !interaction.user || !interaction.options) {
54|      throw new Error('Invalid interaction object');
55|    }
56|
57|    const sub = interaction.options.getSubcommand();
58|
59|    // Validate subcommand
60|    const validSubcommands = ['news', 'joke', 'catfact', 'numberfact', 'dadjoke', 'programquote', 'github', 'weather', 'stats'];
61|    if (!validSubcommands.includes(sub)) {
62|      return interaction.reply({
63|        content: '❌ Invalid subcommand. Please use a valid API subcommand.',
64|        flags: MessageFlags.Ephemeral,
65|      });
66|    }
67|
68|    switch (sub) {
69|      case 'news': {
70|        const query = interaction.options.getString('query') || 'technology';
71|
72|        // Validate inputs
73|        if (query && query.length > 100) {
74|          return interaction.reply({
75|            content: '❌ Search query is too long. Please keep it under 100 characters.',
76|            flags: MessageFlags.Ephemeral,
77|          });
78|        }
79|
80|        try {
81|          const result = await getNews(query, 5);
82|          if (!result || !result.success) {
83|            return interaction.reply({
84|              content: `❌ ${result?.reason || 'Failed to fetch news. Please try again later.'}`,
85|              flags: MessageFlags.Ephemeral,
86|            });
87|          }
88|
89|          if (!Array.isArray(result.data) || result.data.length === 0) {
90|            return interaction.reply({
91|              content: '❌ No news articles found for this query.',
92|              flags: MessageFlags.Ephemeral,
93|            });
94|          }
95|
96|          const embed = new EmbedBuilder().setTitle(`📰 Latest News: ${query}`).setColor(0x00_99_ff);
97|
98|          for (const [index, article] of result.data.slice(0, 3).entries()) {
99|            if (article && article.title && article.url) {
100|              const title = article.title.slice(0, 256);
101|              const description = article.description
102|                ? article.description.length > 500
103|                  ? article.description.slice(0, 497) + '...'
104|                  : article.description
105|                : 'No description available';
106|              embed.addFields({
107|                name: `${index + 1}. ${title}`,
108|                value: `${description}\n[Read more](${article.url})`,
109|                inline: false,
110|              });
111|            }
112|          }
113|
114|          await interaction.reply({ embeds: [embed] });
115|        } catch (error) {
116|          logger.error('News fetch error:', error instanceof Error ? error : new Error(String(error)));
117|          await interaction.reply({
118|            content: '❌ Failed to fetch news. Please try again later.',
119|            flags: MessageFlags.Ephemeral,
120|          });
121|        }
122|
123|        break;
124|      }
125|      case 'joke': {
126|        try {
127|          const result = await getRandomJoke();
128|          if (!result || !result.success || !result.data) {
129|            return interaction.reply({
130|              content: '❌ Failed to get joke. Please try again later.',
131|              flags: MessageFlags.Ephemeral,
132|            });
133|          }
134|
135|          const jokeData = result.data;
136|          if (!jokeData.setup || !jokeData.punchline) {
137|            throw new Error('Invalid joke data structure');
138|          }
139|
140|          const embed = new EmbedBuilder()
141|            .setTitle('😂 Random Joke')
142|            .setColor(0xff_d7_00)
143|            .setDescription(`**${jokeData.setup}**\n\n${jokeData.punchline}`)
144|            .setFooter({ text: 'Powered by Official Joke API' });
145|
146|          await interaction.reply({ embeds: [embed] });
147|        } catch (error) {
148|          logger.error('Joke fetch error:', error instanceof Error ? error : new Error(String(error)));
149|          await interaction.reply({
150|            content: '❌ Failed to get joke. Please try again later.',
151|            flags: MessageFlags.Ephemeral,
152|          });
153|        }
154|
155|        break;
156|      }
157|      case 'catfact': {
158|        try {
159|          const result = await getCatFact();
160|          if (!result || !result.success || !result.data || !result.data.fact) {
161|            return interaction.reply({
162|              content: '❌ Failed to get cat fact. Please try again later.',
163|              flags: MessageFlags.Ephemeral,
164|            });
165|          }
166|
167|          const embed = new EmbedBuilder()
168|            .setTitle('🐱 Cat Fact')
169|            .setColor(0xff_69_b4)
170|            .setDescription(result.data.fact.length > 2000 ? result.data.fact.slice(0, 1997) + '...' : result.data.fact)
171|            .setFooter({ text: 'Powered by Cat Facts API' });
172|
173|          await interaction.reply({ embeds: [embed] });
174|        } catch (error) {
175|          logger.error('Cat fact fetch error:', error instanceof Error ? error : new Error(String(error)));
176|          await interaction.reply({
177|            content: '❌ Failed to get cat fact. Please try again later.',
178|            flags: MessageFlags.Ephemeral,
179|          });
180|        }
181|
182|        break;
183|      }
184|      case 'numberfact': {
185|        const number = interaction.options.getInteger('number');
186|
187|        // Validate inputs
188|        if (number !== null && (number < 1 || number > 1000)) {
189|          return interaction.reply({
190|            content: '❌ Number must be between 1 and 1000.',
191|            flags: MessageFlags.Ephemeral,
192|          });
193|        }
194|
195|        try {
196|          const result = await getNumberFact(number);
197|          if (!result || !result.success || !result.data) {
198|            return interaction.reply({
199|              content: '❌ Failed to get number fact. Please try again later.',
200|              flags: MessageFlags.Ephemeral,
201|            });
202|          }
203|
204|          const embed = new EmbedBuilder()
205|            .setTitle(`🔢 Fact about ${result.data.number}`)
206|            .setColor(0x99_32_cc)
207|            .setDescription(result.data.text.length > 2000 ? result.data.text.slice(0, 1997) + '...' : result.data.text)
208|            .setFooter({ text: 'Powered by Numbers API' });
209|
210|          await interaction.reply({ embeds: [embed] });
211|        } catch (error) {
212|          logger.error('Number fact fetch error:', error instanceof Error ? error : new Error(String(error)));
213|          await interaction.reply({
214|            content: '❌ Failed to get number fact. Please try again later.',
215|            flags: MessageFlags.Ephemeral,
216|          });
217|        }
218|
219|        break;
220|      }
221|      case 'dadjoke': {
222|        try {
223|          const result = await getDadJoke();
224|          if (!result || !result.success || !result.data || !result.data.joke) {
225|            return interaction.reply({
226|              content: '❌ Failed to get dad joke. Please try again later.',
227|              flags: MessageFlags.Ephemeral,
228|            });
229|          }
230|
231|          const embed = new EmbedBuilder()
232|            .setTitle('👨‍🦳 Dad Joke')
233|            .setColor(0xff_8c_00)
234|            .setDescription(result.data.joke.length > 2000 ? result.data.joke.slice(0, 1997) + '...' : result.data.joke)
235|            .setFooter({ text: 'Powered by Dad Jokes API' });
236|
237|          await interaction.reply({ embeds: [embed] });
238|        } catch (error) {
239|          logger.error('Dad joke fetch error:', error instanceof Error ? error : new Error(String(error)));
240|          await interaction.reply({
241|            content: '❌ Failed to get dad joke. Please try again later.',
242|            flags: MessageFlags.Ephemeral,
243|          });
244|        }
245|
246|        break;
247|      }
248|      case 'programquote': {
249|        try {
250|          const result = await getProgrammingQuote();
251|          if (!result || !result.success || !result.data) {
252|            return interaction.reply({
253|              content: '❌ Failed to get programming quote. Please try again later.',
254|              flags: MessageFlags.Ephemeral,
255|            });
256|          }
257|
258|          const quoteData = result.data;
259|          if (!quoteData.en || !quoteData.author || typeof quoteData.rating !== 'number') {
260|            throw new Error('Invalid quote data structure');
261|          }
262|
263|          const embed = new EmbedBuilder()
264|            .setTitle('💻 Programming Quote')
265|            .setColor(0x4c_af_50)
266|            .addFields(
267|              { name: 'Quote', value: `"${quoteData.en.slice(0, 1000)}"`, inline: false },
268|              { name: 'Author', value: quoteData.author.slice(0, 256), inline: true },
269|              { name: 'Rating', value: `⭐ ${quoteData.rating}`, inline: true },
270|            )
271|            .setFooter({ text: 'Powered by Programming Quotes API' });
272|
273|          await interaction.reply({ embeds: [embed] });
274|        } catch (error) {
275|          logger.error('Programming quote fetch error:', error instanceof Error ? error : new Error(String(error)));
276|          await interaction.reply({
277|            content: '❌ Failed to get programming quote. Please try again later.',
278|            flags: MessageFlags.Ephemeral,
279|          });
280|        }
281|
282|        break;
283|      }
284|      case 'github': {
285|        const username = interaction.options.getString('username');
286|
287|        // Validate inputs
288|        if (!username || username.trim().length === 0) {
289|          return interaction.reply({
290|            content: '❌ Please provide a GitHub username.',
291|            flags: MessageFlags.Ephemeral,
292|          });
293|        }
294|
295|        if (username.length > 39 || !/^[\dA-Za-z](?:[\dA-Za-z]|-(?=[\dA-Za-z])){0,38}$/.test(username)) {
296|          return interaction.reply({
297|            content: '❌ Invalid GitHub username format.',
298|            flags: MessageFlags.Ephemeral,
299|          });
300|        }
301|
302|        try {
303|          const result = await getGitHubStats(username.trim());
304|          if (!result || !result.success || !result.data) {
305|            return interaction.reply({
306|              content: `❌ Failed to get GitHub stats for ${username}. User may not exist.`,
307|              flags: MessageFlags.Ephemeral,
308|            });
309|          }
310|
311|          const userData = result.data;
312|          const embed = new EmbedBuilder()
313|            .setTitle(`🐙 GitHub Stats: ${userData.name || username}`)
314|            .setColor(0x33_33_33)
315|            .setDescription(userData.bio ? userData.bio.slice(0, 500) : 'No bio available')
316|            .addFields(
317|              { name: '📍 Location', value: userData.location || 'Not specified', inline: true },
318|              { name: '📚 Public Repos', value: String(userData.publicRepos || 0), inline: true },
319|              { name: '👥 Followers', value: String(userData.followers || 0), inline: true },
320|              { name: '👤 Following', value: String(userData.following || 0), inline: true },
321|            )
322|            .setFooter({
323|              text: userData.created ? `Account created: ${new Date(userData.created).toLocaleDateString()}` : 'Account creation date unknown',
324|            });
325|
326|          await interaction.reply({ embeds: [embed] });
327|        } catch (error) {
328|          logger.error('GitHub stats fetch error:', error instanceof Error ? error : new Error(String(error)));
329|          await interaction.reply({
330|            content: `❌ Failed to get GitHub stats for ${username}. Please try again later.`,
331|            flags: MessageFlags.Ephemeral,
332|          });
333|        }
334|
335|        break;
336|      }
337|      case 'weather': {
338|        const location = interaction.options.getString('location');
339|
340|        // Validate inputs
341|        if (!location || location.trim().length === 0) {
342|          return interaction.reply({
343|            content: '❌ Please provide a location.',
344|            flags: MessageFlags.Ephemeral,
345|          });
346|        }
347|
348|        if (location.length > 100) {
349|          return interaction.reply({
350|            content: '❌ Location name is too long. Please keep it under 100 characters.',
351|            flags: MessageFlags.Ephemeral,
352|          });
353|        }
354|
355|        try {
356|          const result = await getWeather(location.trim());
357|          if (!result || !result.success || !result.data) {
358|            return interaction.reply({
359|              content: `❌ ${result?.reason || 'Failed to get weather data. Please check the location name.'}`,
360|              flags: MessageFlags.Ephemeral,
361|            });
362|          }
363|
364|          const data = result.data;
365|          // Validate weather data structure
366|          if (!data.name || !data.sys || !data.main || !data.weather || !data.wind) {
367|            throw new Error('Invalid weather data structure');
368|          }
369|
370|          const embed = new EmbedBuilder()
371|            .setTitle(`🌤️ Weather in ${data.name}, ${data.sys.country}`)
372|            .setColor(0x00_99_ff)
373|            .addFields(
374|              { name: '🌡️ Temperature', value: `**${Math.round(data.main.temp)}°C** (Feels like ${Math.round(data.main.feels_like)}°C)`, inline: true },
375|              { name: '💧 Humidity', value: `**${data.main.humidity}%**`, inline: true },
376|              { name: '🌬️ Wind', value: `**${Math.round(data.wind.speed * 3.6)} km/h**`, inline: true },
377|              { name: '🌥️ Conditions', value: `${getWeatherEmoji(data.weather[0].main)} **${data.weather[0].description}**`, inline: true },
378|              { name: '📊 Pressure', value: `**${data.main.pressure} hPa**`, inline: true },
379|              { name: '👁️ Visibility', value: `**${(data.visibility / 1000).toFixed(1)} km**`, inline: true },
380|            )
381|            .setFooter({ text: 'Powered by OpenWeatherMap' })
382|            .setTimestamp();
383|
384|          await interaction.reply({ embeds: [embed] });
385|        } catch (error) {
386|          logger.error('Weather fetch error:', error instanceof Error ? error : new Error(String(error)));
387|          await interaction.reply({
388|            content: '❌ Failed to get weather data. Please try again later.',
389|            flags: MessageFlags.Ephemeral,
390|          });
391|        }
392|
393|        break;
394|      }
395|      case 'stats': {
396|        try {
397|          const stats = getIntegrationStats() || {
398|            apiKeys: 0,
399|            totalUsage: 0,
400|            totalErrors: 0,
401|            cacheSize: 0,
402|          };
403|
404|          const embed = new EmbedBuilder()
405|            .setTitle('🔌 API Integration Statistics')
406|            .setColor(0x99_32_cc)
407|            .setDescription('External service usage and performance')
408|            .addFields(
409|              { name: '🔑 Configured APIs', value: String(stats.apiKeys || 0), inline: true },
410|              { name: '📊 Total Requests', value: String(stats.totalUsage || 0), inline: true },
411|              { name: '❌ Errors', value: String(stats.totalErrors || 0), inline: true },
412|              { name: '💾 Cache Size', value: `${stats.cacheSize || 0} entries`, inline: true },
413|            );
414|
415|          if ((stats.totalUsage || 0) > 0) {
416|            const successRate = ((((stats.totalUsage || 0) - (stats.totalErrors || 0)) / (stats.totalUsage || 1)) * 100).toFixed(1);
417|            embed.addFields({
418|              name: '📈 Success Rate',
419|              value: `${successRate}%`,
420|              inline: true,
421|            });
422|          }
423|
424|          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
425|        } catch (error) {
426|          logger.error('Stats fetch error:', error instanceof Error ? error : new Error(String(error)));
427|          await interaction.reply({
428|            content: '❌ Failed to fetch API statistics. Please try again later.',
429|            flags: MessageFlags.Ephemeral,
430|          });
431|        }
432|
433|        break;
434|      }
435|      // No default
436|    }
437|  } catch (error) {
438|    logger.error('API command error:', error instanceof Error ? error : new Error(String(error)));
439|    try {
440|      if (interaction && typeof interaction.reply === 'function') {
441|        await interaction.reply({
442|          content: '❌ An unexpected error occurred. Please try again later.',
443|          flags: MessageFlags.Ephemeral,
444|        });
445|      }
446|    } catch (replyError) {
447|      logger.error('Failed to send error reply:', replyError instanceof Error ? replyError : new Error(String(replyError)));
448|    }
449|  }
450|}
451|
452|function getWeatherEmoji(condition) {
453|  const emojis = {
454|    Clear: '☀️',
455|    Clouds: '☁️',
456|    Rain: '🌧️',
457|    Drizzle: '🌦️',
458|    Thunderstorm: '⛈️',
459|    Snow: '❄️',
460|    Mist: '🌫️',
461|    Fog: '🌫️',
462|    Haze: '🌫️',
463|  };
464|  return emojis[condition] || '🌤️';
465|}
466|