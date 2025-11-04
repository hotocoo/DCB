import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import { getUserAchievements, getAllAchievements, getAchievementLeaderboard, updateUserStats } from '../achievements.js';

export const data = new SlashCommandBuilder()
  .setName('achievements')
  .setDescription('View achievements, stats, and leaderboards')
  .addSubcommand(sub => sub.setName('view').setDescription('View your achievements'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('View achievement leaderboard'))
  .addSubcommand(sub => sub.setName('stats').setDescription('View detailed statistics'));

export async function execute(interaction) {
  try {
    // Validate interaction object
    if (!interaction || !interaction.user || !interaction.options) {
      throw new Error('Invalid interaction object');
    }

    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Validate subcommand
    const validSubcommands = ['view', 'leaderboard', 'stats'];
    if (!validSubcommands.includes(sub)) {
      return interaction.reply({
        content: '❌ Invalid subcommand. Please use view, leaderboard, or stats.',
        flags: MessageFlags.Ephemeral
      });
    }

    switch (sub) {
      case 'view': {
        try {
          const userAchievements = getUserAchievements(userId) || [];
          const allAchievements = getAllAchievements() || {};

          // Group achievements by category with validation
          const achievementsByCategory = {};
          if (Array.isArray(userAchievements)) {
            for (const achievement of userAchievements) {
              if (achievement && achievement.category && typeof achievement.category === 'string') {
                if (!achievementsByCategory[achievement.category]) {
                  achievementsByCategory[achievement.category] = [];
                }
                achievementsByCategory[achievement.category].push(achievement);
              }
            }
          }

          // Calculate completion stats with safe division
          const totalAchievements = Object.keys(allAchievements).length;
          const earnedCount = Array.isArray(userAchievements) ? userAchievements.length : 0;
          const completionPercentage = totalAchievements > 0 ? Math.round((earnedCount / totalAchievements) * 100) : 0;
          const totalPoints = Array.isArray(userAchievements) ?
            userAchievements.reduce((sum, a) => sum + (a?.points || 0), 0) : 0;

          const embed = new EmbedBuilder()
            .setTitle(`🏆 ${interaction.user.username}'s Achievements`)
            .setColor(0xFF_D7_00)
            .setDescription(`**Progress:** ${earnedCount}/${totalAchievements} (${completionPercentage}%)\n**Achievement Points:** ${totalPoints}`)
            .setThumbnail(interaction.user.displayAvatarURL());

          // Add category sections with validation
          const categoryEmojis = {
            rpg: '🎮',
            games: '🎯',
            social: '🤝',
            special: '⭐',
            fun: '🎪'
          };

          for (const [category, achievements] of Object.entries(achievementsByCategory)) {
            if (!Array.isArray(achievements)) continue;

            const categoryEmoji = categoryEmojis[category] || '🏆';
            const achievementList = achievements
              .filter(a => a && a.icon && a.name && typeof a.points === 'number')
              .sort((a, b) => (b.points || 0) - (a.points || 0))
              .map(a => `${a.icon} **${a.name}** (${a.points} pts)`)
              .join('\n');

            if (achievementList) {
              embed.addFields({
                name: `${categoryEmoji} ${category.toUpperCase()} (${achievements.length})`,
                value: achievementList.length > 1024 ? achievementList.slice(0, 1021) + '...' : achievementList,
                inline: false
              });
            }
          }

          // Add unearned achievements preview with validation
          const allAchievementsArray = Object.values(allAchievements).filter(a => a && a.id);
          const unearnedAchievements = allAchievementsArray.filter(a =>
            !userAchievements.some(ua => ua && ua.id === a.id)
          );

          if (unearnedAchievements.length > 0) {
            const nextAchievements = unearnedAchievements
              .filter(a => a && typeof a.points === 'number')
              .sort((a, b) => (a.points || 0) - (b.points || 0))
              .slice(0, 3);

            if (nextAchievements.length > 0) {
              const nextList = nextAchievements.map(a => `${a.icon || '🏆'} ${a.name || 'Unknown'} (${a.points || 0} pts)`).join('\n');
              embed.addFields({
                name: '🎯 Next Challenges',
                value: nextList.length > 1024 ? nextList.slice(0, 1021) + '...' : nextList,
                inline: false
              });
            }
          }

          // Add achievement action buttons
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`achievements_refresh:${userId}`)
              .setLabel('🔄 Refresh')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`achievements_leaderboard:${userId}`)
              .setLabel('🏅 Leaderboard')
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.reply({ embeds: [embed], components: [row] });

        }
        catch (error) {
          console.error('Error fetching achievements:', error);
          await interaction.reply({
            content: '❌ Failed to load achievements. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'leaderboard': {
        try {
          const leaderboard = getAchievementLeaderboard(10) || [];

          if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
            return interaction.reply({
              content: '📊 No achievement data available yet. Be the first to earn achievements!',
              flags: MessageFlags.Ephemeral
            });
          }

          const userRank = leaderboard.findIndex(entry => entry && entry.userId === userId) + 1;

          const embed = new EmbedBuilder()
            .setTitle('🏅 Achievement Leaderboard')
            .setColor(0xFF_D7_00)
            .setDescription(`**Your Rank:** ${userRank > 0 ? `#${userRank}` : 'Not ranked yet'}`);

          const leaderboardText = leaderboard.slice(0, 10).map((entry, index) => {
            if (!entry || typeof entry.total_points !== 'number') return null;
            const rank = index + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
            const level = entry.level || 1;
            return `${medal} **#${rank}** - ${entry.total_points} pts (Level ${level})`;
          }).filter(Boolean).join('\n');

          if (leaderboardText) {
            embed.addFields({
              name: '🏆 Top Achievers',
              value: leaderboardText.length > 1024 ? leaderboardText.slice(0, 1021) + '...' : leaderboardText,
              inline: false
            });
          }

          await interaction.reply({ embeds: [embed] });

        }
        catch (error) {
          console.error('Error fetching leaderboard:', error);
          await interaction.reply({
            content: '❌ Failed to load leaderboard. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'stats': {
        try {
          const userStats = updateUserStats(userId, {}) || { userData: null, newAchievements: [] };

          const embed = new EmbedBuilder()
            .setTitle(`📊 ${interaction.user.username}'s Statistics`)
            .setColor(0x00_99_FF)
            .setDescription('Your detailed activity statistics!');

          // Safely extract stats with defaults
          const stats = {
            commands_used: userStats.userData?.commands_used || 0,
            achievements_earned: Array.isArray(userStats.userData?.achievements) ? userStats.userData.achievements.length : 0,
            achievement_points: userStats.userData?.achievement_points || 0,
            gold_earned: userStats.userData?.gold_earned || 0,
            battles_fought: userStats.userData?.battles_fought || 0,
            games_played: userStats.userData?.games_played || 0,
            member_since: userStats.userData?.member_since ? new Date(userStats.userData.member_since).toLocaleDateString() : 'Unknown',
            level: userStats.userData?.level || 1
          };

          embed.addFields(
            { name: '🎮 Commands Used', value: stats.commands_used.toString(), inline: true },
            { name: '🏆 Achievements Earned', value: stats.achievements_earned.toString(), inline: true },
            { name: '⭐ Achievement Points', value: stats.achievement_points.toString(), inline: true },
            { name: '💰 Gold Earned', value: stats.gold_earned.toString(), inline: true },
            { name: '⚔️ Battles Fought', value: stats.battles_fought.toString(), inline: true },
            { name: '🎯 Games Played', value: stats.games_played.toString(), inline: true },
            { name: '📅 Member Since', value: stats.member_since, inline: true },
            { name: '🏅 Level', value: stats.level.toString(), inline: true }
          );

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        }
        catch (error) {
          console.error('Error fetching stats:', error);
          await interaction.reply({
            content: '❌ Failed to load statistics. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
    // No default
    }

  }
  catch (error) {
    console.error('Achievement command error:', error);
    try {
      if (interaction && typeof interaction.reply === 'function') {
        await interaction.reply({
          content: '❌ An unexpected error occurred. Please try again later.',
          flags: MessageFlags.Ephemeral
        });
      }
    }
    catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}