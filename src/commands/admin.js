1|1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } from 'discord.js';
2|2|
3|3|import { warnUser, muteUser, banUser, kickUser, getUserWarnings, getModActions, getUserModStats, checkAutoMod } from '../moderation.js';
4|4|import { updateUserStats } from '../achievements.js';
5|5|
6|6|export const data = new SlashCommandBuilder()
7|7|  .setName('admin')
8|8|  .setDescription('Advanced server administration and moderation tools')
9|9|  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
10|10|  .addSubcommand((sub) =>
11|11|    sub
12|12|      .setName('warn')
13|13|      .setDescription('Warn a user')
14|14|      .addUserOption((opt) => opt.setName('user').setDescription('User to warn').setRequired(true))
15|15|      .addStringOption((opt) => opt.setName('reason').setDescription('Warning reason').setRequired(true))
16|16|      .addStringOption((opt) =>
17|17|        opt
18|18|          .setName('severity')
19|19|          .setDescription('Warning severity')
20|20|          .addChoices({ name: 'Low', value: 'low' }, { name: 'Medium', value: 'medium' }, { name: 'High', value: 'high' })
21|21|          .setRequired(false),
22|22|      ),
23|23|  )
24|24|  .addSubcommand((sub) =>
25|25|    sub
26|26|      .setName('mute')
27|27|      .setDescription('Mute a user')
28|28|      .addUserOption((opt) => opt.setName('user').setDescription('User to mute').setRequired(true))
29|29|      .addStringOption((opt) => opt.setName('reason').setDescription('Mute reason').setRequired(true))
30|30|      .addIntegerOption((opt) => opt.setName('duration').setDescription('Duration in minutes').setRequired(false)),
31|31|  )
32|32|  .addSubcommand((sub) =>
33|33|    sub
34|34|      .setName('unmute')
35|35|      .setDescription('Unmute a user')
36|36|      .addUserOption((opt) => opt.setName('user').setDescription('User to unmute').setRequired(true))
37|37|      .addStringOption((opt) => opt.setName('reason').setDescription('Unmute reason').setRequired(false)),
38|38|  )
39|39|  .addSubcommand((sub) =>
40|40|    sub
41|41|      .setName('ban')
42|42|      .setDescription('Ban a user')
43|43|      .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
44|44|      .addStringOption((opt) => opt.setName('reason').setDescription('Ban reason').setRequired(true))
45|45|      .addIntegerOption((opt) => opt.setName('duration').setDescription('Duration in hours (leave empty for permanent)').setRequired(false)),
46|46|  )
47|47|  .addSubcommand((sub) =>
48|48|    sub
49|49|      .setName('unban')
50|50|      .setDescription('Unban a user')
51|51|      .addUserOption((opt) => opt.setName('user').setDescription('User to unban').setRequired(true))
52|52|      .addStringOption((opt) => opt.setName('reason').setDescription('Unban reason').setRequired(false)),
53|53|  )
54|54|  .addSubcommand((sub) =>
55|55|    sub
56|56|      .setName('kick')
57|57|      .setDescription('Kick a user')
58|58|      .addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(true))
59|59|      .addStringOption((opt) => opt.setName('reason').setDescription('Kick reason').setRequired(true)),
60|60|  )
61|61|  .addSubcommand((sub) =>
62|62|    sub
63|63|      .setName('check')
64|64|      .setDescription('Check user moderation status')
65|65|      .addUserOption((opt) => opt.setName('user').setDescription('User to check').setRequired(true)),
66|66|  )
67|67|  .addSubcommand((sub) =>
68|68|    sub
69|69|      .setName('history')
70|70|      .setDescription('View moderation history')
71|71|      .addIntegerOption((opt) => opt.setName('limit').setDescription('Number of actions to show').setRequired(false)),
72|72|  )
73|73|  .addSubcommand((sub) => sub.setName('stats').setDescription('View server moderation statistics'));
74|74|
75|75|export async function execute(interaction) {
76|76|  try {
77|77|    // Validate interaction object
78|78|    if (!interaction || !interaction.member || !interaction.user || !interaction.guild || !interaction.options) {
79|79|      throw new Error('Invalid interaction object');
80|80|    }
81|81|
82|82|    // Check if user has administrator permissions
83|83|    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
84|84|      return interaction.reply({
85|85|        content: '❌ You need Administrator permissions to use this command.',
86|86|        flags: MessageFlags.Ephemeral,
87|87|      });
88|88|    }
89|89|
90|90|    const sub = interaction.options.getSubcommand();
91|91|    const guildId = interaction.guild.id;
92|92|
93|93|    // Validate subcommand
94|94|    const validSubcommands = ['warn', 'mute', 'unmute', 'ban', 'unban', 'kick', 'check', 'history', 'stats'];
95|95|    if (!validSubcommands.includes(sub)) {
96|96|      return interaction.reply({
97|97|        content: '❌ Invalid subcommand. Please use a valid admin subcommand.',
98|98|        flags: MessageFlags.Ephemeral,
99|99|      });
100|100|    }
101|101|
102|102|    // Validate guild ID
103|103|    if (!guildId || typeof guildId !== 'string') {
104|104|      throw new Error('Invalid guild ID');
105|105|    }
106|106|
107|107|    try {
108|108|      switch (sub) {
109|109|        case 'warn': {
110|110|          const targetUser = interaction.options.getUser('user');
111|111|          const reason = interaction.options.getString('reason');
112|112|          const severity = interaction.options.getString('severity') || 'medium';
113|113|
114|114|          // Validate inputs
115|115|          if (!targetUser || !reason || reason.trim().length === 0) {
116|116|            return interaction.reply({
117|117|              content: '❌ Invalid user or reason provided.',
118|118|              flags: MessageFlags.Ephemeral,
119|119|            });
120|120|          }
121|121|
122|122|          if (!['low', 'medium', 'high'].includes(severity)) {
123|123|            return interaction.reply({
124|124|              content: '❌ Invalid severity. Must be low, medium, or high.',
125|125|              flags: MessageFlags.Ephemeral,
126|126|            });
127|127|          }
128|128|
129|129|          if (targetUser.id === interaction.user.id) {
130|130|            return interaction.reply({
131|131|              content: '❌ You cannot warn yourself!',
132|132|              flags: MessageFlags.Ephemeral,
133|133|            });
134|134|          }
135|135|
136|136|          try {
137|137|            const warning = warnUser(guildId, targetUser.id, interaction.user.id, reason.trim(), severity);
138|138|
139|139|            const embed = new EmbedBuilder()
140|140|              .setTitle('⚠️ User Warned')
141|141|              .setColor(0xff_a5_00)
142|142|              .setDescription(`**${targetUser.username}** has been warned.`)
143|143|              .addFields(
144|144|                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
145|145|                { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
146|146|                { name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
147|147|                { name: '🚨 Severity', value: severity.toUpperCase(), inline: true },
148|148|              );
149|149|
150|150|            // Track moderation achievement
151|151|            updateUserStats(interaction.user.id, { moderation_actions: 1 });
152|152|
153|153|            await interaction.reply({ embeds: [embed] });
154|154|
155|155|            // Send DM to warned user if possible
156|156|            try {
157|157|              await targetUser.send(`⚠️ **Warning from ${interaction.guild.name}:**\n${reason}`);
158|158|            } catch (dmError) {
159|159|              logger.warn('Could not send DM to warned user:', dmError.message);
160|160|            }
161|161|          } catch (warnError) {
162|162|            logger.error('Error warning user:', warnError instanceof Error ? warnError : new Error(String(warnError)));
163|163|            await interaction.reply({
164|164|              content: '❌ Failed to warn user. Please try again.',
165|165|              flags: MessageFlags.Ephemeral,
166|166|            });
167|167|          }
168|168|
169|169|          break;
170|170|        }
171|171|        case 'mute': {
172|172|          const targetUser = interaction.options.getUser('user');
173|173|          const reason = interaction.options.getString('reason');
174|174|          const durationMinutes = interaction.options.getInteger('duration') || 60;
175|175|
176|176|          // Validate inputs
177|177|          if (!targetUser || !reason || reason.trim().length === 0) {
178|178|            return interaction.reply({
179|179|              content: '❌ Invalid user or reason provided.',
180|180|              flags: MessageFlags.Ephemeral,
181|181|            });
182|182|          }
183|183|
184|184|          if (durationMinutes < 1 || durationMinutes > 1440) {
185|185|            // Max 24 hours
186|186|            return interaction.reply({
187|187|              content: '❌ Duration must be between 1 and 1440 minutes (24 hours).',
188|188|              flags: MessageFlags.Ephemeral,
189|189|            });
190|190|          }
191|191|
192|192|          if (targetUser.id === interaction.user.id) {
193|193|            return interaction.reply({
194|194|              content: '❌ You cannot mute yourself!',
195|195|              flags: MessageFlags.Ephemeral,
196|196|            });
197|197|          }
198|198|
199|199|          try {
200|200|            const durationMs = durationMinutes * 60 * 1000;
201|201|            const mute = muteUser(guildId, targetUser.id, interaction.user.id, reason.trim(), durationMs);
202|202|
203|203|            const embed = new EmbedBuilder()
204|204|              .setTitle('🔇 User Muted')
205|205|              .setColor(0xff_6b_6b)
206|206|              .setDescription(`**${targetUser.username}** has been muted for ${durationMinutes} minutes.`)
207|207|              .addFields(
208|208|                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
209|209|                { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
210|210|                { name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
211|211|                { name: '⏰ Duration', value: `${durationMinutes} minutes`, inline: true },
212|212|              );
213|213|
214|214|            await interaction.reply({ embeds: [embed] });
215|215|          } catch (muteError) {
216|216|            logger.error('Error muting user:', muteError instanceof Error ? muteError : new Error(String(muteError)));
217|217|            await interaction.reply({
218|218|              content: '❌ Failed to mute user. Please try again.',
219|219|              flags: MessageFlags.Ephemeral,
220|220|            });
221|221|          }
222|222|
223|223|          break;
224|224|        }
225|225|        case 'unmute': {
226|226|          const targetUser = interaction.options.getUser('user');
227|227|          const reason = interaction.options.getString('reason') || 'Manual unmute';
228|228|
229|229|          // Validate inputs
230|230|          if (!targetUser) {
231|231|            return interaction.reply({
232|232|              content: '❌ Invalid user provided.',
233|233|              flags: MessageFlags.Ephemeral,
234|234|            });
235|235|          }
236|236|
237|237|          try {
238|238|            const { unmuteUser } = await import('../moderation.js');
239|239|            const result = unmuteUser(guildId, targetUser.id, interaction.user.id, reason.trim());
240|240|
241|241|            if (!result) {
242|242|              return interaction.reply({
243|243|                content: '❌ User is not currently muted.',
244|244|                flags: MessageFlags.Ephemeral,
245|245|              });
246|246|            }
247|247|
248|248|            const embed = new EmbedBuilder()
249|249|              .setTitle('🔊 User Unmuted')
250|250|              .setColor(0x00_ff_00)
251|251|              .setDescription(`**${targetUser.username}** has been unmuted.`)
252|252|              .addFields(
253|253|                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
254|254|                { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
255|255|                { name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
256|256|              );
257|257|
258|258|            await interaction.reply({ embeds: [embed] });
259|259|          } catch (unmuteError) {
260|260|            logger.error('Error unmuting user:', unmuteError instanceof Error ? unmuteError : new Error(String(unmuteError)));
261|261|            await interaction.reply({
262|262|              content: '❌ Failed to unmute user. Please try again.',
263|263|              flags: MessageFlags.Ephemeral,
264|264|            });
265|265|          }
266|266|
267|267|          break;
268|268|        }
269|269|        case 'ban': {
270|270|          const targetUser = interaction.options.getUser('user');
271|271|          const reason = interaction.options.getString('reason');
272|272|          const durationHours = interaction.options.getInteger('duration');
273|273|
274|274|          // Validate inputs
275|275|          if (!targetUser || !reason || reason.trim().length === 0) {
276|276|            return interaction.reply({
277|277|              content: '❌ Invalid user or reason provided.',
278|278|              flags: MessageFlags.Ephemeral,
279|279|            });
280|280|          }
281|281|
282|282|          if (durationHours !== null && (durationHours < 1 || durationHours > 168)) {
283|283|            // Max 1 week
284|284|            return interaction.reply({
285|285|              content: '❌ Duration must be between 1 and 168 hours (1 week) or leave empty for permanent.',
286|286|              flags: MessageFlags.Ephemeral,
287|287|            });
288|288|          }
289|289|
290|290|          if (targetUser.id === interaction.user.id) {
291|291|            return interaction.reply({
292|292|              content: '❌ You cannot ban yourself!',
293|293|              flags: MessageFlags.Ephemeral,
294|294|            });
295|295|          }
296|296|
297|297|          try {
298|298|            const durationMs = durationHours ? durationHours * 60 * 60 * 1000 : null;
299|299|            const ban = banUser(guildId, targetUser.id, interaction.user.id, reason.trim(), durationMs);
300|300|
301|301|            const embed = new EmbedBuilder()
302|302|              .setTitle('🔨 User Banned')
303|303|              .setColor(0xff_00_00)
304|304|              .setDescription(`**${targetUser.username}** has been ${durationMs ? 'temporarily ' : 'permanently '}banned.`)
305|305|              .addFields(
306|306|                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
307|307|                { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
308|308|                { name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
309|309|                { name: '⏰ Duration', value: durationMs ? `${durationHours} hours` : 'Permanent', inline: true },
310|310|              );
311|311|
312|312|            await interaction.reply({ embeds: [embed] });
313|313|          } catch (banError) {
314|314|            logger.error('Error banning user:', banError instanceof Error ? banError : new Error(String(banError)));
315|315|            await interaction.reply({
316|316|              content: '❌ Failed to ban user. Please try again.',
317|317|              flags: MessageFlags.Ephemeral,
318|318|            });
319|319|          }
320|320|
321|321|          break;
322|322|        }
323|323|        case 'unban': {
324|324|          const targetUser = interaction.options.getUser('user');
325|325|          const reason = interaction.options.getString('reason') || 'Manual unban';
326|326|
327|327|          // Validate inputs
328|328|          if (!targetUser) {
329|329|            return interaction.reply({
330|330|              content: '❌ Invalid user provided.',
331|331|              flags: MessageFlags.Ephemeral,
332|332|            });
333|333|          }
334|334|
335|335|          try {
336|336|            const { unbanUser } = await import('../moderation.js');
337|337|            const result = unbanUser(guildId, targetUser.id, interaction.user.id, reason.trim());
338|338|
339|339|            if (!result) {
340|340|              return interaction.reply({
341|341|                content: '❌ User is not currently banned.',
342|342|                flags: MessageFlags.Ephemeral,
343|343|              });
344|344|            }
345|345|
346|346|            const embed = new EmbedBuilder()
347|347|              .setTitle('✅ User Unbanned')
348|348|              .setColor(0x00_ff_00)
349|349|              .setDescription(`**${targetUser.username}** has been unbanned.`)
350|350|              .addFields(
351|351|                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
352|352|                { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
353|353|                { name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
354|354|              );
355|355|
356|356|            await interaction.reply({ embeds: [embed] });
357|357|          } catch (unbanError) {
358|            logger.error('Error unbanning user:', unbanError instanceof Error ? unbanError : new Error(String(unbanError)));
359|359|            await interaction.reply({
360|360|              content: '❌ Failed to unban user. Please try again.',
361|361|              flags: MessageFlags.Ephemeral,
362|362|            });
363|363|          }
364|364|
365|365|          break;
366|366|        }
367|367|        case 'kick': {
368|368|          const targetUser = interaction.options.getUser('user');
369|369|          const reason = interaction.options.getString('reason');
370|370|
371|371|          // Validate inputs
372|372|          if (!targetUser || !reason || reason.trim().length === 0) {
373|373|            return interaction.reply({
374|374|              content: '❌ Invalid user or reason provided.',
375|375|              flags: MessageFlags.Ephemeral,
376|376|            });
377|377|          }
378|378|
379|379|          if (targetUser.id === interaction.user.id) {
380|380|            return interaction.reply({
381|381|              content: '❌ You cannot kick yourself!',
382|382|              flags: MessageFlags.Ephemeral,
383|383|            });
384|384|          }
385|385|
386|386|          try {
387|387|            const kick = kickUser(guildId, targetUser.id, interaction.user.id, reason.trim());
388|388|
389|389|            const embed = new EmbedBuilder()
390|390|              .setTitle('👢 User Kicked')
391|391|              .setColor(0xff_8c_00)
392|392|              .setDescription(`**${targetUser.username}** has been kicked from the server.`)
393|393|              .addFields(
394|394|                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
395|395|                { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
396|396|                { name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
397|397|              );
398|398|
399|399|            await interaction.reply({ embeds: [embed] });
400|400|          } catch (kickError) {
401|            logger.error('Error kicking user:', kickError instanceof Error ? kickError : new Error(String(kickError)));
402|402|            await interaction.reply({
403|403|              content: '❌ Failed to kick user. Please try again.',
404|404|              flags: MessageFlags.Ephemeral,
405|405|            });
406|406|          }
407|407|
408|408|          break;
409|409|        }
410|410|        case 'check': {
411|411|          const targetUser = interaction.options.getUser('user');
412|412|
413|413|          // Validate inputs
414|414|          if (!targetUser) {
415|415|            return interaction.reply({
416|416|              content: '❌ Invalid user provided.',
417|417|              flags: MessageFlags.Ephemeral,
418|418|            });
419|419|          }
420|420|
421|421|          try {
422|422|            const warnings = getUserWarnings(guildId, targetUser.id) || [];
423|423|            const modStats = getUserModStats(guildId, targetUser.id) || {
424|424|              risk_level: 'low',
425|425|              warnings: 0,
426|426|              kicks: 0,
427|427|              mutes: 0,
428|428|              bans: 0,
429|429|              total_actions: 0,
430|430|            };
431|431|
432|432|            const embed = new EmbedBuilder()
433|433|              .setTitle(`🔍 Moderation Check - ${targetUser.username}`)
434|434|              .setColor(
435|435|                modStats.risk_level === 'critical'
436|436|                  ? 0xff_00_00
437|437|                  : modStats.risk_level === 'high'
438|438|                    ? 0xff_a5_00
439|439|                    : modStats.risk_level === 'medium'
440|440|                      ? 0xff_ff_00
441|441|                      : 0x00_ff_00,
442|442|              )
443|443|              .setThumbnail(targetUser.displayAvatarURL())
444|444|              .setDescription(`**Risk Level:** ${modStats.risk_level.toUpperCase()}`)
445|445|              .addFields(
446|446|                { name: '⚠️ Warnings', value: String(modStats.warnings || 0), inline: true },
447|447|                { name: '👢 Kicks', value: String(modStats.kicks || 0), inline: true },
448|448|                { name: '🔇 Mutes', value: String(modStats.mutes || 0), inline: true },
449|449|                { name: '🔨 Bans', value: String(modStats.bans || 0), inline: true },
450|450|                { name: '📊 Total Actions', value: String(modStats.total_actions || 0), inline: true },
451|451|              );
452|452|
453|453|            if (Array.isArray(warnings) && warnings.length > 0) {
454|454|              const recentWarnings = warnings.filter((w) => w && w.active).slice(0, 3);
455|455|              if (recentWarnings.length > 0) {
456|456|                const warningList = recentWarnings
457|457|                  .map(
458|458|                    (w) =>
459|459|                      `⚠️ **${(w.severity || 'medium').toUpperCase()}** - ${w.reason || 'No reason'} (${w.timestamp ? new Date(w.timestamp).toLocaleDateString() : 'Unknown date'})`,
460|460|                  )
461|461|                  .join('\n');
462|462|
463|463|                embed.addFields({
464|464|                  name: '📋 Recent Warnings',
465|465|                  value: warningList.length > 1024 ? warningList.slice(0, 1021) + '...' : warningList,
466|466|                  inline: false,
467|467|                });
468|468|              }
469|469|            }
470|470|
471|471|            // Add action buttons based on current status
472|472|            const row = new ActionRowBuilder();
473|473|            try {
474|474|              const { isUserMuted, isUserBanned } = await import('../moderation.js');
475|475|
476|476|              if (isUserMuted(guildId, targetUser.id)) {
477|477|                row.addComponents(
478|478|                  new ButtonBuilder().setCustomId(`admin_unmute:${targetUser.id}:${guildId}`).setLabel('🔊 Unmute').setStyle(ButtonStyle.Success),
479|479|                );
480|480|              } else {
481|481|                row.addComponents(
482|482|                  new ButtonBuilder().setCustomId(`admin_warn:${targetUser.id}:${guildId}`).setLabel('⚠️ Warn').setStyle(ButtonStyle.Secondary),
483|483|                );
484|484|              }
485|485|
486|486|              if (isUserBanned(guildId, targetUser.id)) {
487|487|                row.addComponents(
488|488|                  new ButtonBuilder().setCustomId(`admin_unban:${targetUser.id}:${guildId}`).setLabel('✅ Unban').setStyle(ButtonStyle.Success),
489|489|                );
490|490|              } else {
491|491|                row.addComponents(new ButtonBuilder().setCustomId(`admin_mute:${targetUser.id}:${guildId}`).setLabel('🔇 Mute').setStyle(ButtonStyle.Danger));
492|492|              }
493|493|            } catch (importError) {
494|              logger.error('Error importing moderation functions:', importError instanceof Error ? importError : new Error(String(importError)));
495|495|            }
496|496|
497|497|            await interaction.reply({ embeds: [embed], components: row.components.length > 0 ? [row] : [] });
498|498|          } catch (checkError) {
499|            logger.error('Error checking user moderation status:', checkError instanceof Error ? checkError : new Error(String(checkError)));
500|500|            await interaction.reply({
501|