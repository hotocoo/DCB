import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
// import { getUserAchievements, getAllAchievements, getAchievementLeaderboard, updateUserStats, ACHIEVEMENT_RARITIES } from '../achievements.js';

export const data = new SlashCommandBuilder()
  .setName('achievements')
  .setDescription('View achievements, stats, and leaderboards')
  .addSubcommand(sub => sub.setName('view').setDescription('View your achievements'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('View achievement leaderboard'))
  .addSubcommand(sub => sub.setName('stats').setDescription('View detailed statistics'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'view') {
    // const userAchievements = getUserAchievements(userId);
    // const allAchievements = getAllAchievements();
    const userAchievements = [];
    const allAchievements = {};

    // Group achievements by category
    const achievementsByCategory = {};
    userAchievements.forEach(achievement => {
      if (!achievementsByCategory[achievement.category]) {
        achievementsByCategory[achievement.category] = [];
      }
      achievementsByCategory[achievement.category].push(achievement);
    });

    // Calculate completion stats
    const totalAchievements = Object.keys(allAchievements).length;
    const earnedCount = userAchievements.length;
    const completionPercentage = Math.round((earnedCount / totalAchievements) * 100);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${interaction.user.username}'s Achievements`)
      .setColor(0xFFD700)
      .setDescription(`**Progress:** ${earnedCount}/${totalAchievements} (${completionPercentage}%)\n**Achievement Points:** ${userAchievements.reduce((sum, a) => sum + a.points, 0)}`)
      .setThumbnail(interaction.user.displayAvatarURL());

    // Add category sections
    const categoryEmojis = {
      rpg: '🎮',
      games: '🎯',
      social: '🤝',
      special: '⭐',
      fun: '🎪'
    };

    for (const [category, achievements] of Object.entries(achievementsByCategory)) {
      const categoryEmoji = categoryEmojis[category] || '🏆';
      const achievementList = achievements
        .sort((a, b) => b.points - a.points)
        .map(a => `${a.icon} **${a.name}** (${a.points} pts)`)
        .join('\n');

      embed.addFields({
        name: `${categoryEmoji} ${category.toUpperCase()} (${achievements.length})`,
        value: achievementList || 'No achievements yet',
        inline: false
      });
    }

    // Add unearned achievements preview
    const unearnedAchievements = Object.values(allAchievements).filter(a => !userAchievements.find(ua => ua.id === a.id));
    if (unearnedAchievements.length > 0) {
      const nextAchievements = unearnedAchievements
        .sort((a, b) => a.points - b.points)
        .slice(0, 3);

      embed.addFields({
        name: '🎯 Next Challenges',
        value: nextAchievements.map(a => `${a.icon} ${a.name} (${a.points} pts)`).join('\n'),
        inline: false
      });
    }

    // Add achievement action buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`achievements_refresh:${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`achievements_leaderboard:${userId}`).setLabel('🏅 Leaderboard').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'leaderboard') {
    // const leaderboard = getAchievementLeaderboard(10);
    const leaderboard = [];

    if (leaderboard.length === 0) {
      return interaction.reply({ content: '📊 No achievement data available yet. Be the first to earn achievements!', ephemeral: true });
    }

    const userRank = leaderboard.findIndex(entry => entry.userId === userId) + 1;

    const embed = new EmbedBuilder()
      .setTitle('🏅 Achievement Leaderboard')
      .setColor(0xFFD700)
      .setDescription(`**Your Rank:** ${userRank > 0 ? `#${userRank}` : 'Not ranked yet'}`);

    const leaderboardText = leaderboard.map((entry, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
      return `${medal} **#${rank}** - ${entry.total_points} pts (Level ${entry.level})`;
    }).join('\n');

    embed.addFields({
      name: '🏆 Top Achievers',
      value: leaderboardText,
      inline: false
    });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'stats') {
    // const userStats = updateUserStats(userId, {});
    const userStats = { userData: null, newAchievements: [] };

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${interaction.user.username}'s Statistics`)
      .setColor(0x0099FF)
      .setDescription('Your detailed activity statistics!')
      .addFields(
        { name: '🎮 Commands Used', value: '0 (temporarily disabled)', inline: true },
        { name: '🏆 Achievements Earned', value: '0 (temporarily disabled)', inline: true },
        { name: '⭐ Achievement Points', value: '0 (temporarily disabled)', inline: true },
        { name: '💰 Gold Earned', value: '0 (temporarily disabled)', inline: true },
        { name: '⚔️ Battles Fought', value: '0 (temporarily disabled)', inline: true },
        { name: '🎯 Games Played', value: '0 (temporarily disabled)', inline: true },
        { name: '📅 Member Since', value: 'Today', inline: true },
        { name: '🏅 Level', value: '1 (temporarily disabled)', inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}