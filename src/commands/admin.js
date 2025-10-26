import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import {
  warnUser,
  muteUser,
  banUser,
  kickUser,
  getUserWarnings,
  getModActions,
  getUserModStats,
  checkAutoMod
} from '../moderation.js';
import { updateUserStats } from '../achievements.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Advanced server administration and moderation tools')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub => sub.setName('warn').setDescription('Warn a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Warning reason').setRequired(true))
    .addStringOption(opt => opt.setName('severity').setDescription('Warning severity').addChoices(
      { name: 'Low', value: 'low' },
      { name: 'Medium', value: 'medium' },
      { name: 'High', value: 'high' }
    ).setRequired(false)))
  .addSubcommand(sub => sub.setName('mute').setDescription('Mute a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Mute reason').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(false)))
  .addSubcommand(sub => sub.setName('unmute').setDescription('Unmute a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Unmute reason').setRequired(false)))
  .addSubcommand(sub => sub.setName('ban').setDescription('Ban a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Ban reason').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in hours (leave empty for permanent)').setRequired(false)))
  .addSubcommand(sub => sub.setName('unban').setDescription('Unban a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to unban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Unban reason').setRequired(false)))
  .addSubcommand(sub => sub.setName('kick').setDescription('Kick a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Kick reason').setRequired(true)))
  .addSubcommand(sub => sub.setName('check').setDescription('Check user moderation status')
    .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true)))
  .addSubcommand(sub => sub.setName('history').setDescription('View moderation history')
    .addIntegerOption(opt => opt.setName('limit').setDescription('Number of actions to show').setRequired(false)))
  .addSubcommand(sub => sub.setName('stats').setDescription('View server moderation statistics'));

export async function execute(interaction) {
  // Check if user has administrator permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  if (sub === 'warn') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const severity = interaction.options.getString('severity') || 'medium';

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot warn yourself!', ephemeral: true });
    }

    const warning = warnUser(guildId, targetUser.id, interaction.user.id, reason, severity);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ User Warned')
      .setColor(0xFFA500)
      .setDescription(`**${targetUser.username}** has been warned.`)
      .addFields(
        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
        { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: true },
        { name: '🚨 Severity', value: severity.toUpperCase(), inline: true }
      );

    // Track moderation achievement
    updateUserStats(interaction.user.id, { moderation_actions: 1 });

    await interaction.reply({ embeds: [embed] });

    // Send DM to warned user if possible
    try {
      await targetUser.send(`⚠️ **Warning from ${interaction.guild.name}:**\n${reason}`);
    } catch (error) {
      // User has DMs disabled, ignore
    }

  } else if (sub === 'mute') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const durationMinutes = interaction.options.getInteger('duration') || 60;
    const durationMs = durationMinutes * 60 * 1000;

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot mute yourself!', ephemeral: true });
    }

    const mute = muteUser(guildId, targetUser.id, interaction.user.id, reason, durationMs);

    const embed = new EmbedBuilder()
      .setTitle('🔇 User Muted')
      .setColor(0xFF6B6B)
      .setDescription(`**${targetUser.username}** has been muted for ${durationMinutes} minutes.`)
      .addFields(
        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
        { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: true },
        { name: '⏰ Duration', value: `${durationMinutes} minutes`, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'unmute') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Manual unmute';

    const { unmuteUser } = await import('../moderation.js');
    const result = unmuteUser(guildId, targetUser.id, interaction.user.id, reason);

    if (!result) {
      return interaction.reply({ content: '❌ User is not currently muted.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔊 User Unmuted')
      .setColor(0x00FF00)
      .setDescription(`**${targetUser.username}** has been unmuted.`)
      .addFields(
        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
        { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'ban') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const durationHours = interaction.options.getInteger('duration');
    const durationMs = durationHours ? durationHours * 60 * 60 * 1000 : null;

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot ban yourself!', ephemeral: true });
    }

    const ban = banUser(guildId, targetUser.id, interaction.user.id, reason, durationMs);

    const embed = new EmbedBuilder()
      .setTitle('🔨 User Banned')
      .setColor(0xFF0000)
      .setDescription(`**${targetUser.username}** has been ${durationMs ? 'temporarily ' : 'permanently '}banned.`)
      .addFields(
        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
        { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: true },
        { name: '⏰ Duration', value: durationMs ? `${durationHours} hours` : 'Permanent', inline: true }
      );

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'unban') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Manual unban';

    const { unbanUser } = await import('../moderation.js');
    const result = unbanUser(guildId, targetUser.id, interaction.user.id, reason);

    if (!result) {
      return interaction.reply({ content: '❌ User is not currently banned.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ User Unbanned')
      .setColor(0x00FF00)
      .setDescription(`**${targetUser.username}** has been unbanned.`)
      .addFields(
        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
        { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'kick') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot kick yourself!', ephemeral: true });
    }

    const kick = kickUser(guildId, targetUser.id, interaction.user.id, reason);

    const embed = new EmbedBuilder()
      .setTitle('👢 User Kicked')
      .setColor(0xFF8C00)
      .setDescription(`**${targetUser.username}** has been kicked from the server.`)
      .addFields(
        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
        { name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'check') {
    const targetUser = interaction.options.getUser('user');
    const warnings = getUserWarnings(guildId, targetUser.id);
    const modStats = getUserModStats(guildId, targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Moderation Check - ${targetUser.username}`)
      .setColor(modStats.risk_level === 'critical' ? 0xFF0000 :
               modStats.risk_level === 'high' ? 0xFFA500 :
               modStats.risk_level === 'medium' ? 0xFFFF00 : 0x00FF00)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(`**Risk Level:** ${modStats.risk_level.toUpperCase()}`)
      .addFields(
        { name: '⚠️ Warnings', value: modStats.warnings, inline: true },
        { name: '👢 Kicks', value: modStats.kicks, inline: true },
        { name: '🔇 Mutes', value: modStats.mutes, inline: true },
        { name: '🔨 Bans', value: modStats.bans, inline: true },
        { name: '📊 Total Actions', value: modStats.total_actions, inline: true }
      );

    if (warnings.length > 0) {
      const recentWarnings = warnings.filter(w => w.active).slice(0, 3);
      const warningList = recentWarnings.map(w =>
        `⚠️ **${w.severity.toUpperCase()}** - ${w.reason} (${new Date(w.timestamp).toLocaleDateString()})`
      ).join('\n');

      embed.addFields({
        name: '📋 Recent Warnings',
        value: warningList,
        inline: false
      });
    }

    // Add action buttons based on current status
    const row = new ActionRowBuilder();
    const { isUserMuted, isUserBanned } = await import('../moderation.js');

    if (isUserMuted(guildId, targetUser.id)) {
      row.addComponents(new ButtonBuilder().setCustomId(`admin_unmute:${targetUser.id}:${guildId}`).setLabel('🔊 Unmute').setStyle(ButtonStyle.Success));
    } else {
      row.addComponents(new ButtonBuilder().setCustomId(`admin_warn:${targetUser.id}:${guildId}`).setLabel('⚠️ Warn').setStyle(ButtonStyle.Secondary));
    }

    if (isUserBanned(guildId, targetUser.id)) {
      row.addComponents(new ButtonBuilder().setCustomId(`admin_unban:${targetUser.id}:${guildId}`).setLabel('✅ Unban').setStyle(ButtonStyle.Success));
    } else {
      row.addComponents(new ButtonBuilder().setCustomId(`admin_mute:${targetUser.id}:${guildId}`).setLabel('🔇 Mute').setStyle(ButtonStyle.Danger));
    }

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'history') {
    const limit = interaction.options.getInteger('limit') || 20;
    const modActions = getModActions(guildId, limit);

    if (modActions.length === 0) {
      return interaction.reply({ content: '📋 No moderation actions found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Moderation History')
      .setColor(0x0099FF)
      .setDescription(`Recent ${modActions.length} moderation actions`);

    modActions.forEach((action, index) => {
      const timestamp = new Date(action.timestamp).toLocaleString();
      const actionEmoji = {
        warn: '⚠️',
        mute: '🔇',
        unmute: '🔊',
        ban: '🔨',
        unban: '✅',
        kick: '👢'
      }[action.action] || '📝';

      embed.addFields({
        name: `${actionEmoji} ${action.action.toUpperCase()} #${index + 1}`,
        value: `**Target:** <@${action.targetUserId}>\n**Moderator:** <@${action.moderatorId}>\n**Reason:** ${action.reason}\n**Time:** ${timestamp}`,
        inline: false
      });
    });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'stats') {
    const modActions = getModActions(guildId, 100);

    // Calculate statistics
    const actionCounts = {};
    const modCounts = {};
    let totalActions = 0;

    modActions.forEach(action => {
      actionCounts[action.action] = (actionCounts[action.action] || 0) + 1;
      modCounts[action.moderatorId] = (modCounts[action.moderatorId] || 0) + 1;
      totalActions++;
    });

    const embed = new EmbedBuilder()
      .setTitle('📊 Server Moderation Statistics')
      .setColor(0x0099FF)
      .setDescription(`Analysis of moderation activities in ${interaction.guild.name}`)
      .addFields(
        { name: '📈 Total Actions', value: totalActions, inline: true },
        { name: '📅 Period', value: 'Last 100 actions', inline: true },
        { name: '👮‍♂️ Active Moderators', value: Object.keys(modCounts).length, inline: true }
      );

    // Action breakdown
    const actionBreakdown = Object.entries(actionCounts)
      .map(([action, count]) => `${action}: ${count}`)
      .join('\n');

    embed.addFields({
      name: '📋 Action Breakdown',
      value: actionBreakdown || 'No actions',
      inline: false
    });

    // Top moderators
    const topMods = Object.entries(modCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([modId, count]) => `<@${modId}>: ${count} actions`)
      .join('\n');

    embed.addFields({
      name: '🏆 Top Moderators',
      value: topMods || 'No moderators',
      inline: false
    });

    await interaction.reply({ embeds: [embed] });
  }
}