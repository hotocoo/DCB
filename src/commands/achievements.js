1|import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
2|
3|import { getUserAchievements, getAllAchievements, getAchievementLeaderboard, updateUserStats } from '../achievements.js';
4|
5|export const data = new SlashCommandBuilder()
6|  .setName('achievements')
7|  .setDescription('View achievements, stats, and leaderboards')
8|  .addSubcommand((sub) => sub.setName('view').setDescription('View your achievements'))
9|  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View achievement leaderboard'))
10|  .addSubcommand((sub) => sub.setName('stats').setDescription('View detailed statistics'));
11|
12|export async function execute(interaction) {
13|  try {
14|    // Validate interaction object
15|    if (!interaction || !interaction.user || !interaction.options) {
16|      throw new Error('Invalid interaction object');
17|    }
18|
19|    const sub = interaction.options.getSubcommand();
20|    const userId = interaction.user.id;
21|
22|    // Validate subcommand
23|    const validSubcommands = ['view', 'leaderboard', 'stats'];
24|    if (!validSubcommands.includes(sub)) {
25|      return interaction.reply({
26|        content: '❌ Invalid subcommand. Please use view, leaderboard, or stats.',
27|        flags: MessageFlags.Ephemeral,
28|      });
29|    }
30|
31|    switch (sub) {
32|      case 'view': {
33|        try {
34|          const userAchievements = getUserAchievements(userId) || [];
35|          const allAchievements = getAllAchievements() || {};
36|
37|          // Group achievements by category with validation
38|          const achievementsByCategory = {};
39|          if (Array.isArray(userAchievements)) {
40|            for (const achievement of userAchievements) {
41|              if (achievement && achievement.category && typeof achievement.category === 'string') {
42|                if (!achievementsByCategory[achievement.category]) {
43|                  achievementsByCategory[achievement.category] = [];
44|                }
45|                achievementsByCategory[achievement.category].push(achievement);
46|              }
47|            }
48|          }
49|
50|          // Calculate completion stats with safe division
51|          const totalAchievements = Object.keys(allAchievements).length;
52|          const earnedCount = Array.isArray(userAchievements) ? userAchievements.length : 0;
53|          const completionPercentage = totalAchievements > 0 ? Math.round((earnedCount / totalAchievements) * 100) : 0;
54|          const totalPoints = Array.isArray(userAchievements) ? userAchievements.reduce((sum, a) => sum + (a?.points || 0), 0) : 0;
55|
56|          const embed = new EmbedBuilder()
57|            .setTitle(`🏆 ${interaction.user.username}'s Achievements`)
58|            .setColor(0xff_d7_00)
59|            .setDescription(`**Progress:** ${earnedCount}/${totalAchievements} (${completionPercentage}%)\n**Achievement Points:** ${totalPoints}`)
60|            .setThumbnail(interaction.user.displayAvatarURL());
61|
62|          // Add category sections with validation
63|          const categoryEmojis = {
64|            rpg: '🎮',
65|            games: '🎯',
66|            social: '🤝',
67|            special: '⭐',
68|            fun: '🎪',
69|          };
70|
71|          for (const [category, achievements] of Object.entries(achievementsByCategory)) {
72|            if (!Array.isArray(achievements)) continue;
73|
74|            const categoryEmoji = categoryEmojis[category] || '🏆';
75|            const achievementList = achievements
76|              .filter((a) => a && a.icon && a.name && typeof a.points === 'number')
77|              .sort((a, b) => (b.points || 0) - (a.points || 0))
78|              .map((a) => `${a.icon} **${a.name}** (${a.points} pts)`)
79|              .join('\n');
80|
81|            if (achievementList) {
82|              embed.addFields({
83|                name: `${categoryEmoji} ${category.toUpperCase()} (${achievements.length})`,
84|                value: achievementList.length > 1024 ? achievementList.slice(0, 1021) + '...' : achievementList,
85|                inline: false,
86|              });
87|            }
88|          }
89|
90|          // Add unearned achievements preview with validation
91|          const allAchievementsArray = Object.values(allAchievements).filter((a) => a && a.id);
92|          const unearnedAchievements = allAchievementsArray.filter((a) => !userAchievements.some((ua) => ua && ua.id === a.id));
93|
94|          if (unearnedAchievements.length > 0) {
95|            const nextAchievements = unearnedAchievements
96|              .filter((a) => a && typeof a.points === 'number')
97|              .sort((a, b) => (a.points || 0) - (b.points || 0))
98|              .slice(0, 3);
99|
100|            if (nextAchievements.length > 0) {
101|              const nextList = nextAchievements.map((a) => `${a.icon || '🏆'} ${a.name || 'Unknown'} (${a.points || 0} pts)`).join('\n');
102|              embed.addFields({
103|                name: '🎯 Next Challenges',
104|                value: nextList.length > 1024 ? nextList.slice(0, 1021) + '...' : nextList,
105|                inline: false,
106|              });
107|            }
108|          }
109|
110|          // Add achievement action buttons
111|          const row = new ActionRowBuilder().addComponents(
112|            new ButtonBuilder().setCustomId(`achievements_refresh:${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
113|            new ButtonBuilder().setCustomId(`achievements_leaderboard:${userId}`).setLabel('🏅 Leaderboard').setStyle(ButtonStyle.Secondary),
114|          );
115|
116|          await interaction.reply({ embeds: [embed], components: [row] });
117|        } catch (error) {
118|          logger.error('Error fetching achievements:', error instanceof Error ? error : new Error(String(error)));
119|          await interaction.reply({
120|            content: '❌ Failed to load achievements. Please try again later.',
121|            flags: MessageFlags.Ephemeral,
122|          });
123|        }
124|
125|        break;
126|      }
127|      case 'leaderboard': {
128|        try {
129|          const leaderboard = getAchievementLeaderboard(10) || [];
130|
131|          if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
132|            return interaction.reply({
133|              content: '📊 No achievement data available yet. Be the first to earn achievements!',
134|              flags: MessageFlags.Ephemeral,
135|            });
136|          }
137|
138|          const userRank = leaderboard.findIndex((entry) => entry && entry.userId === userId) + 1;
139|
140|          const embed = new EmbedBuilder()
141|            .setTitle('🏅 Achievement Leaderboard')
142|            .setColor(0xff_d7_00)
143|            .setDescription(`**Your Rank:** ${userRank > 0 ? `#${userRank}` : 'Not ranked yet'}`);
144|
145|          const leaderboardText = leaderboard
146|            .slice(0, 10)
147|            .map((entry, index) => {
148|              if (!entry || typeof entry.total_points !== 'number') return null;
149|              const rank = index + 1;
150|              const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
151|              const level = entry.level || 1;
152|              return `${medal} **#${rank}** - ${entry.total_points} pts (Level ${level})`;
153|            })
154|            .filter(Boolean)
155|            .join('\n');
156|
157|          if (leaderboardText) {
158|            embed.addFields({
159|              name: '🏆 Top Achievers',
160|              value: leaderboardText.length > 1024 ? leaderboardText.slice(0, 1021) + '...' : leaderboardText,
161|              inline: false,
162|            });
163|          }
164|
165|          await interaction.reply({ embeds: [embed] });
166|        } catch (error) {
167|          logger.error('Error fetching leaderboard:', error instanceof Error ? error : new Error(String(error)));
168|          await interaction.reply({
169|            content: '❌ Failed to load leaderboard. Please try again later.',
170|            flags: MessageFlags.Ephemeral,
171|          });
172|        }
173|
174|        break;
175|      }
176|      case 'stats': {
177|        try {
178|          const userStats = updateUserStats(userId, {}) || { userData: null, newAchievements: [] };
179|
180|          const embed = new EmbedBuilder()
181|            .setTitle(`📊 ${interaction.user.username}'s Statistics`)
182|            .setColor(0x00_99_ff)
183|            .setDescription('Your detailed activity statistics!');
184|
185|          // Safely extract stats with defaults
186|          const stats = {
187|            commands_used: userStats.userData?.commands_used || 0,
188|            achievements_earned: Array.isArray(userStats.userData?.achievements) ? userStats.userData.achievements.length : 0,
189|            achievement_points: userStats.userData?.achievement_points || 0,
190|            gold_earned: userStats.userData?.gold_earned || 0,
191|            battles_fought: userStats.userData?.battles_fought || 0,
192|            games_played: userStats.userData?.games_played || 0,
193|            member_since: userStats.userData?.member_since ? new Date(userStats.userData.member_since).toLocaleDateString() : 'Unknown',
194|            level: userStats.userData?.level || 1,
195|          };
196|
197|          embed.addFields(
198|            { name: '🎮 Commands Used', value: stats.commands_used.toString(), inline: true },
199|            { name: '🏆 Achievements Earned', value: stats.achievements_earned.toString(), inline: true },
200|            { name: '⭐ Achievement Points', value: stats.achievement_points.toString(), inline: true },
201|            { name: '💰 Gold Earned', value: stats.gold_earned.toString(), inline: true },
202|            { name: '⚔️ Battles Fought', value: stats.battles_fought.toString(), inline: true },
203|            { name: '🎯 Games Played', value: stats.games_played.toString(), inline: true },
204|            { name: '📅 Member Since', value: stats.member_since, inline: true },
205|            { name: '🏅 Level', value: stats.level.toString(), inline: true },
206|          );
207|
208|          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
209|        } catch (error) {
210|          logger.error('Error fetching stats:', error instanceof Error ? error : new Error(String(error)));
211|          await interaction.reply({
212|            content: '❌ Failed to load statistics. Please try again later.',
213|            flags: MessageFlags.Ephemeral,
214|          });
215|        }
216|
217|        break;
218|      }
219|      // No default
220|    }
221|  } catch (error) {
222|    logger.error('Achievement command error:', error instanceof Error ? error : new Error(String(error)));
223|    try {
224|      if (interaction && typeof interaction.reply === 'function') {
225|        await interaction.reply({
226|          content: '❌ An unexpected error occurred. Please try again later.',
227|          flags: MessageFlags.Ephemeral,
228|        });
229|      }
230|    } catch (replyError) {
231|      logger.error('Failed to send error reply:', replyError instanceof Error ? replyError : new Error(String(replyError)));
232|    }
233|  }
234|}
235|