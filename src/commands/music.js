1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
2|
3|import {
4|  searchSongs,
5|  play,
6|  pause,
7|  resume,
8|  skip,
9|  stop,
10|  getQueue,
11|  getMusicStats,
12|  getLyrics,
13|  getRadioStations,
14|  setVolume,
15|  shuffleQueue,
16|  clearQueue,
17|  back,
18|  setLoop,
19|  getLoop,
20|} from '../music.js';
21|import { CommandError, handleCommandError } from '../errorHandler.js';
22|import { logger } from '../logger.js';
23|
24|export const data = new SlashCommandBuilder()
25|  .setName('music')
26|  .setDescription('🎵 Athena Music System - YouTube & Spotify Priority!')
27|  .addSubcommand((sub) =>
28|    sub
29|      .setName('play')
30|      .setDescription('🎵 Play any song instantly')
31|      .addStringOption((opt) => opt.setName('query').setDescription('Song name or URL').setRequired(true)),
32|  )
33|  .addSubcommand((sub) =>
34|    sub
35|      .setName('search')
36|      .setDescription('🔍 Search millions of songs')
37|      .addStringOption((opt) => opt.setName('query').setDescription('Search term').setRequired(true)),
38|  )
39|  .addSubcommand((sub) => sub.setName('back').setDescription('⬅️ Go back to previous song'))
40|  .addSubcommand((sub) =>
41|    sub
42|      .setName('loop')
43|      .setDescription('🔄 Set loop mode')
44|      .addStringOption((opt) =>
45|        opt
46|          .setName('mode')
47|          .setDescription('Loop mode')
48|          .addChoices({ name: 'None', value: 'none' }, { name: 'Single', value: 'single' }, { name: 'Queue', value: 'queue' })
49|          .setRequired(true),
50|      ),
51|  )
52|  .addSubcommand((sub) => sub.setName('skip').setDescription('⏭️ Skip to next song'))
53|  .addSubcommand((sub) => sub.setName('pause').setDescription('⏸️ Pause current song'))
54|  .addSubcommand((sub) => sub.setName('resume').setDescription('▶️ Resume paused song'))
55|  .addSubcommand((sub) => sub.setName('stop').setDescription('⏹️ Stop music and leave voice'))
56|  .addSubcommand((sub) => sub.setName('queue').setDescription('📋 View music queue'))
57|  .addSubcommand((sub) => sub.setName('nowplaying').setDescription('🎵 Show currently playing'))
58|  .addSubcommand((sub) => sub.setName('shuffle').setDescription('🔀 Shuffle queue'))
59|  .addSubcommand((sub) =>
60|    sub
61|      .setName('volume')
62|      .setDescription('🔊 Set volume (0-200)')
63|      .addIntegerOption((opt) => opt.setName('level').setDescription('Volume level').setRequired(true)),
64|  )
65|  .addSubcommand((sub) =>
66|    sub
67|      .setName('lyrics')
68|      .setDescription('📝 Get song lyrics')
69|      .addStringOption((opt) => opt.setName('song').setDescription('Song name').setRequired(true)),
70|  )
71|  .addSubcommand((sub) =>
72|    sub
73|      .setName('radio')
74|      .setDescription('📻 Play radio stations')
75|      .addStringOption((opt) =>
76|        opt
77|          .setName('station')
78|          .setDescription('Radio station')
79|          .addChoices(
80|            { name: '🎵 Lo-fi Hip Hop', value: 'lofi' },
81|            { name: '🎸 Rock Classics', value: 'rock' },
82|            { name: '🎶 Electronic', value: 'electronic' },
83|            { name: '🎷 Smooth Jazz', value: 'jazz' },
84|            { name: '🎼 Classical', value: 'classical' },
85|          )
86|          .setRequired(true),
87|      ),
88|  );
89|
90|export async function execute(interaction) {
91|  try {
92|    logger.info(`[MUSIC] Command executed: ${interaction.options.getSubcommand()} by ${interaction.user.username} in ${interaction.guild?.name || 'DM'}`);
93|    const sub = interaction.options.getSubcommand();
94|
95|    // Input validation
96|    if (!interaction.user?.id) {
97|      throw new CommandError('Invalid user', 'VALIDATION_ERROR');
98|    }
99|
100|    if (!interaction.guild?.id && sub !== 'lyrics') {
101|      return interaction.reply({
102|        content: '❌ Music commands can only be used in servers.',
103|        flags: MessageFlags.Ephemeral,
104|      });
105|    }
106|
107|    switch (sub) {
108|      case 'play': {
109|        const query = interaction.options.getString('query');
110|
111|        // Voice channel validation
112|        const voiceChannel = interaction.member.voice?.channel;
113|        if (!voiceChannel) {
114|          return interaction.reply({
115|            content: '🎵 **You must be in a voice channel to play music!**',
116|            flags: MessageFlags.Ephemeral,
117|          });
118|        }
119|
120|        // Bot permissions
121|        const botPermissions = voiceChannel.permissionsFor(interaction.guild.members.me);
122|        if (!botPermissions.has('Connect') || !botPermissions.has('Speak')) {
123|          return interaction.reply({
124|            content: '❌ **I need "Connect" and "Speak" permissions in your voice channel.**',
125|            flags: MessageFlags.Ephemeral,
126|          });
127|        }
128|
129|        // Defer reply to prevent timeout (fixes "Unknown interaction" errors)
130|        await interaction.deferReply();
131|        logger.info('Deferred music play interaction', {
132|          guildId: interaction.guild.id,
133|          userId: interaction.user.id,
134|          query: query.slice(0, 100), // Log first 100 chars for privacy
135|          timestamp: new Date().toISOString(),
136|        });
137|
138|        try {
139|          // Search for the song
140|          const songs = await searchSongs(query, 1);
141|          if (songs.length === 0) {
142|            let noResultsMessage = '❌ **No results found for that query.**';
143|
144|            // Provide more specific messaging for URL queries
145|            if (query.includes('spotify.com')) {
146|              noResultsMessage =
147|                '❌ **Track unavailable on Spotify**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
148|            } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
149|              noResultsMessage =
150|                '❌ **Video unavailable**\n\n📹 The requested video is not available, private, or has been deleted.\n🔍 Try searching for the song title instead of using the direct URL.';
151|            } else if (query.includes('deezer.com')) {
152|              noResultsMessage =
153|                '❌ **Track unavailable on Deezer**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
154|            } else {
155|              noResultsMessage = '❌ **No results found**\n\n🔍 No tracks found for your search query.\n💡 Try different keywords or check the spelling.';
156|            }
157|
158|            return interaction.reply({
159|              content: noResultsMessage,
160|              flags: MessageFlags.Ephemeral,
161|            });
162|          }
163|
164|          const song = songs[0];
165|
166|          // Play the song
167|          const result = await play(interaction.guild.id, voiceChannel, song);
168|          if (!result.success) {
169|            let errorMessage = '❌ **Failed to play music**';
170|
171|            // Provide specific error messages based on error type
172|            switch (result.errorType) {
173|              case 'validation_failed': {
174|                if (song.source === 'spotify') {
175|                  errorMessage += '\n\n🎵 **Track unavailable on Spotify**\nThe requested track is no longer available or has no preview.';
176|                } else if (song.source === 'deezer') {
177|                  errorMessage += '\n\n🎵 **Track unavailable on Deezer**\nThe requested track is no longer available or has no preview.';
178|                } else {
179|                  errorMessage += '\n\n📹 **Video unavailable or deleted**\nThe requested video is no longer available on YouTube.';
180|                }
181|                break;
182|              }
183|              case 'stream_creation': {
184|                errorMessage += '\n\n🔊 **Audio stream error**\nThere was an issue creating the audio stream for this track.';
185|                break;
186|              }
187|              case 'connection_failed': {
188|                errorMessage += '\n\n🔗 **Voice connection error**\nFailed to establish a stable connection to the voice channel.';
189|                break;
190|              }
191|              case 'skipped_to_next': {
192|                errorMessage += '\n\n⏭️ **Skipped to next song**\nThe current song failed and has been skipped.';
193|                // Don't reply with error for this case, let the next song play
194|                return;
195|              }
196|              case 'stopped': {
197|                errorMessage += '\n\n⏹️ **Playback stopped**\nNo more songs in the queue.';
198|                break;
199|              }
200|              case 'no_preview': {
201|                errorMessage += '\n\n🎵 **No preview available**\nThis Spotify track does not have a preview clip.';
202|                break;
203|              }
204|              case 'spotify_stream': {
205|                errorMessage += '\n\n🎵 **Spotify stream error**\nFailed to play the preview clip.';
206|                break;
207|              }
208|              case 'deezer_stream': {
209|                errorMessage += '\n\n🎵 **Deezer stream error**\nFailed to play the preview clip.';
210|                break;
211|              }
212|              default: {
213|                errorMessage += `: ${result.error}`;
214|              }
215|            }
216|
217|            return interaction.reply({
218|              content: errorMessage,
219|              flags: MessageFlags.Ephemeral,
220|            });
221|          }
222|
223|          // Create success embed with detailed info
224|          const embed = new EmbedBuilder()
225|            .setTitle('🎵 Now Playing')
226|            .setColor(0x00_ff_00)
227|            .setDescription(`**${song.title}** by **${song.artist}**`)
228|            .addFields(
229|              { name: '⏱️ Duration', value: song.duration, inline: true },
230|              { name: '🔊 Volume', value: `${getMusicStats(interaction.guild.id).volume}%`, inline: true },
231|              { name: '👤 Requested by', value: interaction.user.username, inline: true },
232|            )
233|            .setThumbnail(song.thumbnail || 'https://i.imgur.com/SjIgjlE.png');
234|
235|          switch (song.source) {
236|            case 'spotify': {
237|              embed.addFields({ name: 'ℹ️ Note', value: 'Playing 30-second preview from Spotify', inline: false });
238|
239|              break;
240|            }
241|            case 'deezer': {
242|              embed.addFields({ name: 'ℹ️ Note', value: 'Playing 30-second preview from Deezer (Legacy)', inline: false });
243|
244|              break;
245|            }
246|            case 'youtube': {
247|              embed.addFields({ name: 'ℹ️ Note', value: 'Playing full track from YouTube', inline: false });
248|
249|              break;
250|            }
251|            // No default
252|          }
253|
254|          const row = new ActionRowBuilder().addComponents(
255|            new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
256|            new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
257|            new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
258|            new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
259|          );
260|
261|          logger.debug(`[MUSIC] Editing deferred reply for interaction: ${interaction.id} with success embed`);
262|          logger.info('Music play command successful', {
263|            guildId: interaction.guild.id,
264|            userId: interaction.user.id,
265|            songTitle: song.title,
266|            songSource: song.source,
267|            timestamp: new Date().toISOString(),
268|          });
269|
270|          await interaction.editReply({ embeds: [embed], components: [row] });
271|        } catch (error) {
272|          logger.error('Play command error:', error instanceof Error ? error : new Error(String(error)));
273|          logger.error('Music play command failed', {
274|            guildId: interaction.guild.id,
275|            userId: interaction.user.id,
276|            query: query.slice(0, 100),
277|            error: error.message,
278|            stack: error.stack,
279|            timestamp: new Date().toISOString(),
280|          });
281|
282|          // Check if interaction was already deferred
283|          await (interaction.deferred
284|            ? interaction.editReply({
285|                content: '❌ **An error occurred while playing music.**',
286|                embeds: [],
287|                components: [],
288|              })
289|            : interaction.reply({
290|                content: '❌ **An error occurred while playing music.**',
291|                flags: MessageFlags.Ephemeral,
292|              }));
293|        }
294|
295|        break;
296|      }
297|      case 'search': {
298|        const query = interaction.options.getString('query');
299|
300|        try {
301|          const results = await searchSongs(query, 5);
302|          if (results.length === 0) {
303|            let noResultsMessage = '❌ **No search results found**';
304|
305|            // Provide more specific messaging for URL queries
306|            if (query.includes('spotify.com')) {
307|              noResultsMessage =
308|                '❌ **Track unavailable on Spotify**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
309|            } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
310|              noResultsMessage =
311|                '❌ **Video unavailable**\n\n📹 The requested video is not available, private, or has been deleted.\n🔍 Try searching for the song title instead of using the direct URL.';
312|            } else if (query.includes('deezer.com')) {
313|              noResultsMessage =
314|                '❌ **Track unavailable on Deezer**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
315|            } else {
316|              noResultsMessage =
317|                '❌ **No search results found**\n\n🔍 No tracks found for your search query.\n💡 Try different keywords or check the spelling.';
318|            }
319|
320|            return interaction.reply({ content: noResultsMessage, flags: MessageFlags.Ephemeral });
321|          }
322|
323|          const embed = new EmbedBuilder()
324|            .setTitle(`🔍 Search Results for "${query}"`)
325|            .setColor(0x00_99_ff)
326|            .setDescription('Click the buttons below to play songs!');
327|
328|          for (const [index, song] of results.entries()) {
329|            embed.addFields({
330|              name: `${index + 1}. ${song.title}`,
331|              value: `👤 ${song.artist} • ⏱️ ${song.duration}`,
332|              inline: false,
333|            });
334|          }
335|
336|          // Create play buttons for each result
337|          const rows = [];
338|          for (let i = 0; i < results.length; i += 2) {
339|            const row = new ActionRowBuilder();
340|            for (let j = i; j < i + 2 && j < results.length; j++) {
341|              row.addComponents(
342|                new ButtonBuilder()
343|                  .setCustomId(`music_play:${j}:${query}`)
344|                  .setLabel(`Play ${j + 1}`)
345|                  .setStyle(ButtonStyle.Primary),
346|              );
347|            }
348|            rows.push(row);
349|          }
350|
351|          await interaction.reply({ embeds: [embed], components: rows });
352|        } catch (error) {
353|          logger.error('Search command error:', error instanceof Error ? error : new Error(String(error)));
354|          await interaction.reply({ content: '❌ Failed to search songs.', flags: MessageFlags.Ephemeral });
355|        }
356|
357|        break;
358|      }
359|      case 'back': {
360|        try {
361|          const previousSong = back(interaction.guild.id);
362|          if (previousSong) {
363|            const embed = new EmbedBuilder()
364|              .setTitle('⬅️ Back to Previous Song')
365|              .setColor(0xff_a5_00)
366|              .setDescription(`**Now Playing:** ${previousSong.title} by ${previousSong.artist}`)
367|              .addFields(
368|                { name: '⏱️ Duration', value: previousSong.duration, inline: true },
369|                { name: '👤 Requested by', value: interaction.user.username, inline: true },
370|              )
371|              .setThumbnail(previousSong.thumbnail || 'https://i.imgur.com/SjIgjlE.png');
372|
373|            const row = new ActionRowBuilder().addComponents(
374|              new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
375|              new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
376|              new ButtonBuilder().setCustomId(`music_back:${interaction.guild.id}`).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
377|              new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
378|              new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
379|            );
380|
381|            await interaction.reply({ embeds: [embed], components: [row] });
382|          } else {
383|            await interaction.reply({ content: '❌ No previous song in history.', flags: MessageFlags.Ephemeral });
384|          }
385|        } catch (error) {
386|          logger.error('Back command error:', error instanceof Error ? error : new Error(String(error)));
387|          await interaction.reply({ content: '❌ Failed to go back.', flags: MessageFlags.Ephemeral });
388|        }
389|
390|        break;
391|      }
392|      case 'loop': {
393|        const mode = interaction.options.getString('mode');
394|
395|        try {
396|          setLoop(interaction.guild.id, mode);
397|          const embed = new EmbedBuilder()
398|            .setTitle('🔄 Loop Mode Set')
399|            .setColor(0x99_32_cc)
400|            .setDescription(`Loop mode set to **${mode.charAt(0).toUpperCase() + mode.slice(1)}**`);
401|          await interaction.reply({ embeds: [embed] });
402|        } catch (error) {
403|          logger.error('Loop command error:', error instanceof Error ? error : new Error(String(error)));
404|          await interaction.reply({ content: '❌ Failed to set loop mode.', flags: MessageFlags.Ephemeral });
405|        }
406|
407|        break;
408|      }
409|      case 'skip': {
410|        try {
411|          const nextSong = skip(interaction.guild.id);
412|          if (nextSong) {
413|            const embed = new EmbedBuilder()
414|              .setTitle('⏭️ Song Skipped')
415|              .setColor(0xff_a5_00)
416|              .setDescription(`**Now Playing:** ${nextSong.title} by ${nextSong.artist}`)
417|              .addFields(
418|                { name: '⏱️ Duration', value: nextSong.duration, inline: true },
419|                { name: '👤 Requested by', value: interaction.user.username, inline: true },
420|              )
421|              .setThumbnail(nextSong.thumbnail || 'https://i.imgur.com/SjIgjlE.png');
422|
423|            const row = new ActionRowBuilder().addComponents(
424|              new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
425|              new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
426|              new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
427|              new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
428|            );
429|
430|            await interaction.reply({ embeds: [embed], components: [row] });
431|          } else {
432|            await interaction.reply({ content: '❌ No songs in queue to skip.', flags: MessageFlags.Ephemeral });
433|          }
434|        } catch (error) {
435|          logger.error('Skip command error:', error instanceof Error ? error : new Error(String(error)));
436|          await interaction.reply({ content: '❌ Failed to skip song.', flags: MessageFlags.Ephemeral });
437|        }
438|
439|        break;
440|      }
441|      case 'pause': {
442|        try {
443|          const success = pause(interaction.guild.id);
444|          if (success) {
445|            const embed = new EmbedBuilder()
446|              .setTitle('⏸️ Music Paused')
447|              .setColor(0xff_ff_00)
448|              .setDescription('Music has been paused. Use `/music resume` to continue.');
449|            await interaction.reply({ embeds: [embed] });
450|          } else {
451|            await interaction.reply({ content: '❌ No music is currently playing.', flags: MessageFlags.Ephemeral });
452|          }
453|        } catch (error) {
454|          logger.error('Pause command error:', error instanceof Error ? error : new Error(String(error)));
455|          await interaction.reply({ content: '❌ Failed to pause music.', flags: MessageFlags.Ephemeral });
456|        }
457|
458|        break;
459|      }
460|      case 'resume': {
461|        try {
462|          const success = resume(interaction.guild.id);
463|          if (success) {
464|            const embed = new EmbedBuilder().setTitle('▶️ Music Resumed').setColor(0x00_ff_00).setDescription('Music is now playing!');
465|            await interaction.reply({ embeds: [embed] });
466|          } else {
467|            await interaction.reply({ content: '❌ No paused music to resume.', flags: MessageFlags.Ephemeral });
468|          }
469|        } catch (error) {
470|          logger.error('Resume command error:', error instanceof Error ? error : new Error(String(error)));
471|          await interaction.reply({ content: '❌ Failed to resume music.', flags: MessageFlags.Ephemeral });
472|        }
473|
474|        break;
475|      }
476|      case 'stop': {
477|        try {
478|          const success = stop(interaction.guild.id);
479|          if (success) {
480|            const embed = new EmbedBuilder().setTitle('⏹️ Music Stopped').setColor(0xff_00_00).setDescription('Music stopped and left voice channel.');
481|            await interaction.reply({ embeds: [embed] });
482|          } else {
483|            await interaction.reply({ content: '❌ No music is currently playing.', flags: MessageFlags.Ephemeral });
484|          }
485|        } catch (error) {
486|          logger.error('Stop command error:', error instanceof Error ? error : new Error(String(error)));
487|          await interaction.reply({ content: '❌ Failed to stop music.', flags: MessageFlags.Ephemeral });
488|        }
489|
490|        break;
491|      }
492|      case 'queue': {
493|        try {
494|          const queue = getQueue(interaction.guild.id);
495|          const stats = getMusicStats(interaction.guild.id);
496|          const current = stats.currentlyPlaying;
497|
498|          let description = '';
499|          if (current) {
500|            description += `**Currently Playing:** ${current.title} by ${current.artist}\n\n`;
501|