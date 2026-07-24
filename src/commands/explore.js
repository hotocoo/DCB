1|import fs from 'node:fs';
2|import path from 'node:path';
3|
4|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
5|
6|import { exploreLocation, unlockLocation, enterDungeon, discoverLocation, getLocations } from '../locations.js';
7|import { narrate } from '../rpg.js';
8|import { safeExecuteCommand, CommandError, validateNotEmpty, validateRange } from '../errorHandler.js';
9|
10|// RPG data file path
11|const FILE = path.join(process.cwd(), 'data', 'rpg.json');
12|
13|// in-memory cache to reduce fs reads/writes
14|let cache = null;
15|// simple per-user locks to avoid concurrent writes
16|const locks = new Set();
17|
18|function ensureDir() {
19|  const dir = path.dirname(FILE);
20|  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
21|}
22|
23|function readAll() {
24|  ensureDir();
25|  if (!fs.existsSync(FILE)) return {};
26|  try {
27|    const raw = JSON.parse(fs.readFileSync(FILE)) || {};
28|    // migrate / ensure defaults for older characters
29|    for (const k of Object.keys(raw)) {
30|      const c = raw[k] || {};
31|      if (c.dailyExplorations === undefined) c.dailyExplorations = 0;
32|      if (c.lastDailyReset === undefined) c.lastDailyReset = Date.now();
33|      if (c.sessionXpGained === undefined) c.sessionXpGained = 0;
34|      if (c.lastSessionReset === undefined) c.lastSessionReset = Date.now();
35|      raw[k] = c;
36|    }
37|    cache = raw;
38|    return raw;
39|  } catch (error) {
40|    logger.error('Failed to read rpg storage', error instanceof Error ? error : new Error(String(error)));
41|    return {};
42|  }
43|}
44|
45|function writeAll(obj) {
46|  ensureDir();
47|  try {
48|    // atomic write: write to temp file then rename
49|    const tmp = `${FILE}.tmp`;
50|    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
51|    fs.renameSync(tmp, FILE);
52|    cache = obj;
53|  } catch (error) {
54|    logger.error('Failed to write RPG data:', error instanceof Error ? error : new Error(String(error)));
55|    // Attempt to restore from cache if available
56|    if (cache) {
57|      console.log('Restoring from cache after write failure');
58|    } else {
59|      throw new Error(`Failed to save RPG data: ${error.message}`);
60|    }
61|  }
62|}
63|
64|// Function to check daily exploration limit
65|function checkDailyLimit(userId) {
66|  const all = cache || readAll();
67|  const char = all[userId];
68|  if (!char) return { allowed: false, reason: 'no_character' };
69|
70|  const now = Date.now();
71|  const dayInMs = 24 * 60 * 60 * 1000;
72|
73|  // Check if we need to reset daily count
74|  if (now - (char.lastDailyReset || 0) >= dayInMs) {
75|    char.dailyExplorations = 0;
76|    char.lastDailyReset = now;
77|    writeAll(all);
78|  }
79|
80|  const maxDaily = 10; // 10 explorations per day
81|  const used = char.dailyExplorations || 0;
82|  const allowed = used < maxDaily;
83|
84|  return {
85|    allowed,
86|    used,
87|    max: maxDaily,
88|    remaining: maxDaily - used,
89|    resetTime: char.lastDailyReset,
90|  };
91|}
92|
93|// Function to increment daily exploration count
94|function incrementDailyExploration(userId) {
95|  const all = cache || readAll();
96|  const char = all[userId];
97|  if (!char) return { success: false, reason: 'no_character' };
98|
99|  // Check daily limit first
100|  const check = checkDailyLimit(userId);
101|  if (!check.allowed) {
102|    return { success: false, reason: 'daily_limit_reached' };
103|  }
104|
105|  char.dailyExplorations = (char.dailyExplorations || 0) + 1;
106|  writeAll(all);
107|
108|  return { success: true, newCount: char.dailyExplorations };
109|}
110|
111|// Function to check session XP cap
112|function checkSessionXpCap(userId) {
113|  const all = cache || readAll();
114|  const char = all[userId];
115|  if (!char) return { allowed: false, reason: 'no_character' };
116|
117|  const now = Date.now();
118|  const sessionDurationMs = 24 * 60 * 60 * 1000; // 24 hours
119|
120|  // Check if we need to reset session XP
121|  if (now - (char.lastSessionReset || 0) >= sessionDurationMs) {
122|    char.sessionXpGained = 0;
123|    char.lastSessionReset = now;
124|    writeAll(all);
125|  }
126|
127|  const maxSessionXp = 1000; // 1000 XP per session
128|  const used = char.sessionXpGained || 0;
129|  const allowed = used < maxSessionXp;
130|
131|  return {
132|    allowed,
133|    used,
134|    max: maxSessionXp,
135|    remaining: maxSessionXp - used,
136|    resetTime: char.lastSessionReset,
137|  };
138|}
139|
140|export const data = new SlashCommandBuilder()
141|  .setName('explore')
142|  .setDescription('Explore epic RPG locations and dungeons')
143|  .addSubcommand((sub) => sub.setName('locations').setDescription('View available locations'))
144|  .addSubcommand((sub) =>
145|    sub
146|      .setName('discover')
147|      .setDescription('Discover new locations')
148|      .addStringOption((opt) => opt.setName('location').setDescription('Location to discover').setRequired(true)),
149|  )
150|  .addSubcommand((sub) =>
151|    sub
152|      .setName('enter')
153|      .setDescription('Enter a location for adventure')
154|      .addStringOption((opt) => opt.setName('location').setDescription('Location to explore').setRequired(true)),
155|  );
156|
157|export async function execute(interaction) {
158|  return safeExecuteCommand(
159|    interaction,
160|    async () => {
161|      const sub = interaction.options.getSubcommand();
162|      const userId = interaction.user.id;
163|
164|      switch (sub) {
165|        case 'locations': {
166|          const locations = getLocations();
167|          const availableLocations = Object.values(locations).filter((loc) => loc.unlocked);
168|
169|          if (availableLocations.length === 0) {
170|            return interaction.reply({
171|              content:
172|                '🏕️ No locations available yet. Start your adventure by exploring the Whispering Woods!\nUse `/explore discover location:whispering_woods`',
173|              flags: MessageFlags.Ephemeral,
174|            });
175|          }
176|
177|          const dailyCheck = checkDailyLimit(userId);
178|          const sessionCheck = checkSessionXpCap(userId);
179|
180|          const embed = new EmbedBuilder().setTitle('🗺️ Available Locations').setColor(0x00_99_ff).setDescription('Choose your adventure!');
181|
182|          for (const location of availableLocations) {
183|            embed.addFields({
184|              name: `${location.emoji} ${location.name} (Level ${location.level})`,
185|              value: `**Type:** ${location.type}\n**Description:** ${location.description}\n**Rewards:** ${location.rewards.xp} XP, ${location.rewards.gold} gold`,
186|              inline: false,
187|            });
188|          }
189|
190|          // Add usage info
191|          embed.addFields({
192|            name: '📊 Daily Usage',
193|            value: dailyCheck.allowed
194|              ? `Explorations: ${dailyCheck.remaining} remaining`
195|              : `Explorations: ${dailyCheck.used}/${dailyCheck.max} (limit reached)`,
196|            inline: true,
197|          });
198|
199|          embed.addFields({
200|            name: '⭐ Session XP',
201|            value: sessionCheck.allowed ? `XP: ${sessionCheck.remaining} remaining` : `XP: ${sessionCheck.used}/${sessionCheck.max} (cap reached)`,
202|            inline: true,
203|          });
204|
205|          const row = new ActionRowBuilder().addComponents(
206|            new ButtonBuilder().setCustomId(`explore_unlock:${userId}`).setLabel('🔓 Discover More').setStyle(ButtonStyle.Primary),
207|            new ButtonBuilder().setCustomId(`explore_map:${userId}`).setLabel('🗺️ View Map').setStyle(ButtonStyle.Secondary),
208|          );
209|
210|          await interaction.reply({ embeds: [embed], components: [row] });
211|
212|          break;
213|        }
214|        case 'discover': {
215|          const locationName = interaction.options.getString('location');
216|
217|          validateNotEmpty(locationName, 'location name');
218|
219|          const result = discoverLocation(userId, locationName);
220|
221|          if (!result.success) {
222|            throw new CommandError(result.reason, 'COMMAND_ERROR');
223|          }
224|
225|          const { location, requirements, canUnlock } = result;
226|
227|          if (canUnlock) {
228|            const unlockResult = unlockLocation(userId, locationName);
229|            if (unlockResult.success) {
230|              const embed = new EmbedBuilder()
231|                .setTitle('🎉 Location Discovered!')
232|                .setColor(location.color)
233|                .setDescription(unlockResult.message)
234|                .addFields(
235|                  { name: '📍 Location', value: location.name, inline: true },
236|                  { name: '🏆 Level', value: location.level, inline: true },
237|                  { name: '🎯 Type', value: location.type, inline: true },
238|                );
239|
240|              await interaction.reply({ embeds: [embed] });
241|            } else {
242|              throw new CommandError(unlockResult.reason || 'Failed to unlock location', 'COMMAND_ERROR');
243|            }
244|          } else {
245|            const embed = new EmbedBuilder()
246|              .setTitle('🔒 Location Locked')
247|              .setColor(0xff_a5_00)
248|              .setDescription(`**${location.name}** is not yet available.`)
249|              .addFields({
250|                name: 'Requirements',
251|                value: `🏆 **Level ${requirements.level || 'Any'}**\n⭐ **Achievement: ${requirements.achievements?.join(', ') || 'None'}**`,
252|                inline: false,
253|              });
254|
255|            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
256|          }
257|
258|          break;
259|        }
260|        case 'enter': {
261|          const locationName = interaction.options.getString('location');
262|
263|          validateNotEmpty(locationName, 'location name');
264|
265|          // Check daily limit
266|          const dailyCheck = checkDailyLimit(userId);
267|          if (!dailyCheck.allowed) {
268|            const resetHours = Math.ceil(24 - (Date.now() - (dailyCheck.resetTime || Date.now())) / 3_600_000);
269|            throw new CommandError(
270|              `Daily exploration limit reached! You have used ${dailyCheck.used}/${dailyCheck.max} explorations today. Reset in ${resetHours} hours.`,
271|              'COMMAND_ERROR',
272|            );
273|          }
274|
275|          // Check session XP cap
276|          const sessionCheck = checkSessionXpCap(userId);
277|          if (!sessionCheck.allowed) {
278|            const resetHours = Math.ceil(24 - (Date.now() - (sessionCheck.resetTime || Date.now())) / 3_600_000);
279|            throw new CommandError(
280|              `Session XP cap reached! You have gained ${sessionCheck.used}/${sessionCheck.max} XP this session. Reset in ${resetHours} hours.`,
281|              'COMMAND_ERROR',
282|            );
283|          }
284|
285|          const result = exploreLocation(userId, locationName);
286|
287|          if (!result.success) {
288|            throw new CommandError(result.reason, 'COMMAND_ERROR');
289|          }
290|
291|          // Increment daily exploration count
292|          const incrementResult = incrementDailyExploration(userId);
293|          if (!incrementResult.success) {
294|            throw new CommandError(incrementResult.reason || 'Failed to update exploration count', 'COMMAND_ERROR');
295|          }
296|
297|          const { location, encounter, narrative } = result;
298|
299|          // Generate AI narrative for the location entry
300|          let locationNarrative;
301|          try {
302|            locationNarrative = await narrate(
303|              interaction.guildId,
304|              `${location.ai_prompt} An adventurer enters this mystical place.`,
305|              `You enter ${location.name}. ${narrative.entry}`,
306|            );
307|          } catch (narrativeError) {
308|            logger.warn('[EXPLORE] AI narrative generation failed, using fallback:', { message: narrativeError?.message });
309|            locationNarrative = `You enter ${location.name}. ${narrative.entry}`;
310|          }
311|
312|          const embed = new EmbedBuilder()
313|            .setTitle(`${location.emoji} ${location.name}`)
314|            .setColor(location.color)
315|            .setDescription(locationNarrative)
316|            .addFields(
317|              { name: '🎯 Encounter Type', value: encounter.type.replace('_', ' ').toUpperCase(), inline: true },
318|              { name: '⚔️ Difficulty', value: `Level ${encounter.difficulty}`, inline: true },
319|              { name: '💎 Potential Rewards', value: `${encounter.rewards.xp} XP, ${encounter.rewards.gold} gold`, inline: true },
320|              { name: '📊 Daily Explorations', value: `${dailyCheck.remaining - 1} remaining`, inline: true },
321|              { name: '⭐ Session XP', value: `${sessionCheck.remaining} remaining`, inline: true },
322|            );
323|
324|          // Add exploration action buttons
325|          const row = new ActionRowBuilder().addComponents(
326|            new ButtonBuilder().setCustomId(`explore_continue:${locationName}:${userId}`).setLabel('⚔️ Continue Adventure').setStyle(ButtonStyle.Primary),
327|            new ButtonBuilder().setCustomId(`explore_leave:${locationName}:${userId}`).setLabel('🏃 Leave Location').setStyle(ButtonStyle.Secondary),
328|          );
329|
330|          await interaction.reply({ embeds: [embed], components: [row] });
331|
332|          break;
333|        }
334|        // No default
335|      }
336|    },
337|    {
338|      command: 'explore',
339|    },
340|  );
341|}
342|