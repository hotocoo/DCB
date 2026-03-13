import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { safeExecuteCommand, validateGuild } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Display detailed information about this server');

/**
 * Executes the serverinfo command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    validateGuild(interaction);
    const guild = interaction.guild;

    await guild.fetch();

    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;
    const textChannels = channels.filter(c => c.type === 0).size;
    const voiceChannels = channels.filter(c => c.type === 2).size;
    const categoryChannels = channels.filter(c => c.type === 4).size;
    const forumChannels = channels.filter(c => c.type === 15).size;
    const roles = guild.roles.cache.filter(r => r.id !== guild.id);
    const emojis = guild.emojis.cache;
    const staticEmojis = emojis.filter(e => !e.animated).size;
    const animatedEmojis = emojis.filter(e => e.animated).size;
    const boosters = guild.premiumSubscriptionCount || 0;
    const boostTier = guild.premiumTier;

    const verificationLevels = {
      0: 'None',
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Very High',
    };

    const boostTierLabel = boostTier === 0 ? 'No Boost' : `Tier ${boostTier}`;

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} — Server Info`)
      .setColor(0x5865f2)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 Server ID', value: guild.id, inline: true },
        { name: '👑 Owner', value: owner ? `${owner.user.tag}` : 'Unknown', inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Members', value: `**${guild.memberCount}** total`, inline: true },
        { name: '🚀 Boost', value: `${boostTierLabel} (${boosters} boosts)`, inline: true },
        { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] ?? 'Unknown', inline: true },
        {
          name: '📢 Channels',
          value: `💬 Text: ${textChannels}\n🔊 Voice: ${voiceChannels}\n📁 Categories: ${categoryChannels}${forumChannels ? `\n🗂️ Forums: ${forumChannels}` : ''}`,
          inline: true,
        },
        {
          name: '🎭 Roles',
          value: `${roles.size} roles`,
          inline: true,
        },
        {
          name: '😄 Emojis',
          value: `${staticEmojis} static • ${animatedEmojis} animated`,
          inline: true,
        },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 }));
    }

    await interaction.reply({ embeds: [embed] });
  });
}
