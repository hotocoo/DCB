import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import {
  getOrCreateProfile,
  updateProfile,
  getProfileAnalytics,
  compareProfiles,
  searchProfiles,
  getLeaderboard,
  generateProfileInsights,
  checkMilestones
} from '../profiles.js';
import { safeExecuteCommand, CommandError, validateUser, validateRange, validateNotEmpty } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Advanced user profile management and statistics')
  .addSubcommand(sub => sub.setName('view').setDescription('View your profile').addUserOption(opt => opt.setName('user').setDescription('User to view (defaults to yourself)')))
  .addSubcommand(sub => sub.setName('edit').setDescription('Edit your profile settings'))
  .addSubcommand(sub => sub.setName('compare').setDescription('Compare profiles with another user').addUserOption(opt => opt.setName('user').setDescription('User to compare with').setRequired(true)))
  .addSubcommand(sub => sub.setName('search').setDescription('Search for user profiles').addStringOption(opt => opt.setName('query').setDescription('Search term').setRequired(true)))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('View leaderboards').addStringOption(opt => opt.setName('category').setDescription('Category').setRequired(true)).addStringOption(opt => opt.setName('stat').setDescription('Statistic').setRequired(true)))
  .addSubcommand(sub => sub.setName('insights').setDescription('Get AI-powered profile insights'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'view') {
    const targetUser = interaction.options.getUser('user');
    const viewUserId = targetUser?.id || userId;

    // Validate target user if specified
    if (targetUser) {
      validateUser(interaction, targetUser.id);
    }

    const viewUsername = targetUser?.username || interaction.user.username;

    try {
      const profile = getOrCreateProfile(viewUserId, viewUsername);
      if (!profile) {
        throw new CommandError('Failed to retrieve profile data.', 'NOT_FOUND');
      }
    const analytics = getProfileAnalytics(viewUserId);
    const insights = generateProfileInsights(viewUserId);

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${profile.displayName}'s Profile`)
      .setColor(profile.customization.border_color)
      .setDescription(profile.bio || 'No bio set.')
      .setThumbnail(interaction.user.displayAvatarURL());

    // Add profile customization
    if (profile.customization.profile_banner) {
      embed.setImage(profile.customization.profile_banner);
    }

    // Add title if set
    if (profile.customization.title) {
      embed.setAuthor({ name: profile.customization.title });
    }

    // Add statistics based on privacy settings
    if (profile.customization.show_statistics) {
      embed.addFields(
        {
          name: '🏆 Level & Engagement',
          value: `**Level:** ${analytics.totalLevel || 1}\n**Engagement:** ${analytics.engagementLevel}\n**Activity Score:** ${Math.round(analytics.activityScore)}/100`,
          inline: true
        },
        {
          name: '🎯 Most Active',
          value: `**Category:** ${analytics.mostActiveCategory.toUpperCase()}\n**Playtime:** ${analytics.totalPlayTime}h\n**Account Age:** ${analytics.accountAge} days`,
          inline: true
        },
        {
          name: '📈 Key Stats',
          value: `**Commands:** ${profile.statistics.activity.commands_used}\n**Messages:** ${profile.statistics.activity.messages_sent}\n**Achievements:** ${profile.achievements.length}`,
          inline: true
        }
      );
    }

    // Add badges if enabled
    if (profile.customization.show_badges && profile.badges.length > 0) {
      const badgeText = profile.badges.slice(0, 5).map(badge => badge.icon || '🏆').join(' ');
      embed.addFields({
        name: '🏅 Recent Badges',
        value: badgeText,
        inline: false
      });
    }

    // Add insights
    if (insights.length > 0) {
      embed.addFields({
        name: '💡 Profile Insights',
        value: insights.slice(0, 3).join('\n'),
        inline: false
      });
    }

    // Add profile action buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`profile_edit:${viewUserId}`).setLabel('✏️ Edit Profile').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`profile_refresh:${viewUserId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`profile_compare:${viewUserId}:${userId}`).setLabel('⚖️ Compare').setStyle(ButtonStyle.Secondary)
    );

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      throw new CommandError(`Failed to display profile: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

  } else if (sub === 'edit') {
    // Show profile editing interface
    const modal = new ModalBuilder().setCustomId(`profile_edit_modal:${userId}`).setTitle('Edit Profile');
    const displayNameInput = new TextInputBuilder().setCustomId('display_name').setLabel('Display Name').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Your display name');
    const bioInput = new TextInputBuilder().setCustomId('bio').setLabel('Bio').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Tell us about yourself...');
    const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Profile Title').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Adventurer Extraordinaire');

    modal.addComponents({ type: 1, components: [displayNameInput] });
    modal.addComponents({ type: 1, components: [bioInput] });
    modal.addComponents({ type: 1, components: [titleInput] });

    await interaction.showModal(modal);
    return;

  } else if (sub === 'compare') {
    const otherUser = interaction.options.getUser('user');

    if (!otherUser) {
      throw new CommandError('You must specify a user to compare with.', 'INVALID_ARGUMENT');
    }

    validateUser(interaction, otherUser.id);

    if (otherUser.id === userId) {
      return interaction.reply({ content: '❌ You cannot compare your profile with yourself!', flags: MessageFlags.Ephemeral });
    }

    try {
      const comparison = compareProfiles(userId, otherUser.id);
      if (!comparison) {
        throw new CommandError('Failed to compare profiles.', 'COMMAND_ERROR');
      }

    const embed = new EmbedBuilder()
      .setTitle('⚖️ Profile Comparison')
      .setColor(0x0099FF)
      .setDescription(`Comparing **${interaction.user.username}** vs **${otherUser.username}**`);

    // Add comparison results
    const categories = ['rpg', 'games', 'social', 'activity'];
    categories.forEach(category => {
      const categoryComparison = comparison.comparison[category];
      const leadingStats = [];

      for (const [stat, data] of Object.entries(categoryComparison)) {
        if (data.difference !== 0) {
          const leader = data.difference > 0 ? 'You' : otherUser.username;
          leadingStats.push(`${stat}: ${leader} (+${Math.abs(data.difference)})`);
        }
      }

      if (leadingStats.length > 0) {
        embed.addFields({
          name: category.toUpperCase(),
          value: leadingStats.slice(0, 3).join('\n'),
          inline: true
        });
      }
    });

    const winner = comparison.winner === 'user1' ? 'You' : comparison.winner === 'user2' ? otherUser.username : 'Tie';
    embed.addFields({
      name: '🏆 Overall Winner',
      value: winner,
      inline: false
    });

    } catch (error) {
      throw new CommandError(`Failed to compare profiles: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (sub === 'search') {
    const query = interaction.options.getString('query');

    validateNotEmpty(query, 'search query');
    validateRange(query.length, 2, 100, 'query length');

    try {
      const results = searchProfiles(query, 5);
      if (!Array.isArray(results)) {
        throw new CommandError('Failed to search profiles.', 'COMMAND_ERROR');
      }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Search Results for "${query}"`)
      .setColor(0x0099FF);

    results.forEach((profile, index) => {
      embed.addFields({
        name: `${index + 1}. ${profile.displayName}`,
        value: `**Level:** ${getUserLevel(profile)}\n**Achievements:** ${profile.achievements.length}\n**Bio:** ${profile.bio || 'No bio'}`,
        inline: false
      });
    });

    } catch (error) {
      throw new CommandError(`Failed to search profiles: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (sub === 'leaderboard') {
    const category = interaction.options.getString('category');
    const stat = interaction.options.getString('stat');

    validateNotEmpty(category, 'category');
    validateNotEmpty(stat, 'stat');

    const validCategories = ['rpg', 'games', 'social', 'activity'];
    const validStats = {
      rpg: ['total_level', 'bosses_defeated', 'items_collected'],
      games: ['trivia_correct', 'hangman_wins', 'memory_games_completed'],
      social: ['guilds_created', 'trades_completed', 'reputation'],
      activity: ['commands_used', 'messages_sent', 'streak_days']
    };

    if (!validCategories.includes(category)) {
      throw new CommandError('Invalid category. Use: rpg, games, social, activity', 'INVALID_ARGUMENT');
    }

    if (!validStats[category]?.includes(stat)) {
      throw new CommandError(`Invalid stat for ${category}. Available: ${validStats[category].join(', ')}`, 'INVALID_ARGUMENT');
    }

    try {
      const leaderboard = getLeaderboard(category, stat, 10);
      if (!Array.isArray(leaderboard)) {
        throw new CommandError('Failed to retrieve leaderboard data.', 'COMMAND_ERROR');
      }

      if (leaderboard.length === 0) {
        return interaction.reply({ content: '📊 No data available for this leaderboard yet.', flags: MessageFlags.Ephemeral });
      }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${category.toUpperCase()} Leaderboard - ${stat.replace('_', ' ').toUpperCase()}`)
      .setColor(0xFFD700);

    leaderboard.forEach((entry, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
      embed.addFields({
        name: `${medal} #${rank} - ${entry.displayName}`,
        value: `**Value:** ${entry.value}\n**Level:** ${entry.level}`,
        inline: true
      });
    });

    } catch (error) {
      throw new CommandError(`Failed to retrieve leaderboard: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'insights') {
    try {
      const insights = generateProfileInsights(userId);
      if (!Array.isArray(insights)) {
        throw new CommandError('Failed to generate profile insights.', 'COMMAND_ERROR');
      }

      if (insights.length === 0) {
        return interaction.reply({ content: '💡 Start using more bot features to get personalized insights!', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('💡 Profile Insights')
        .setColor(0x9932CC)
        .setDescription('AI-powered analysis of your bot usage patterns:');

      insights.forEach((insight, index) => {
        embed.addFields({
          name: `Insight #${index + 1}`,
          value: insight,
          inline: false
        });
      });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      throw new CommandError(`Failed to generate insights: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }
  }
}

export async function safeExecute(interaction) {
  return safeExecuteCommand(interaction, execute);
}

// Helper function for user level calculation
function getUserLevel(profile) {
  if (!profile || !profile.achievements || !profile.statistics) {
    return 1;
  }

  const achievementsPoints = (profile.achievements.length || 0) * 10;
  const rpgPoints = profile.statistics.rpg?.total_level || 0;
  const triviaPoints = profile.statistics.games?.trivia_correct || 0;
  const reputationPoints = profile.statistics.social?.reputation || 0;

  const totalPoints = achievementsPoints + rpgPoints + triviaPoints + reputationPoints;
  return Math.max(1, Math.floor(totalPoints / 100) + 1);
}