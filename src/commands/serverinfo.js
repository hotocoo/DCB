import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Display detailed information about this server');

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
  }

  // Fetch full guild data to get accurate counts
  const fullGuild = await guild.fetch();

  const channels = guild.channels.cache;
  const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
  const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
  const categoryChannels = channels.filter(c => c.type === ChannelType.GuildCategory).size;
  const forumChannels = channels.filter(c => c.type === ChannelType.GuildForum).size;
  const stageChannels = channels.filter(c => c.type === ChannelType.GuildStageVoice).size;

  const roles = guild.roles.cache;
  const totalRoles = roles.size - 1; // Exclude @everyone

  const emojis = guild.emojis.cache;
  const staticEmojis = emojis.filter(e => !e.animated).size;
  const animatedEmojis = emojis.filter(e => e.animated).size;

  const members = guild.members.cache;
  const onlineMembers = members.filter(m => m.presence?.status === 'online').size;
  const botMembers = members.filter(m => m.user.bot).size;
  const humanMembers = fullGuild.memberCount - botMembers;

  const verificationLevels = {
    0: 'None',
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Very High'
  };

  const boostTiers = { 0: 'None', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

  const createdAt = Math.floor(guild.createdTimestamp / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`🏰 ${guild.name}`)
    .setColor(0x57_F2_87)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: '🆔 Server ID', value: guild.id, inline: true },
      { name: '📅 Created', value: `<t:${createdAt}:R>`, inline: true },
      { name: '👥 Members', value: `**${fullGuild.memberCount}** total\n👤 ${humanMembers} humans\n🤖 ${botMembers} bots`, inline: true },
      { name: '📊 Channels', value: `💬 ${textChannels} text\n🔊 ${voiceChannels} voice\n📁 ${categoryChannels} categories${forumChannels > 0 ? `\n💬 ${forumChannels} forum` : ''}${stageChannels > 0 ? `\n🎤 ${stageChannels} stage` : ''}`, inline: true },
      { name: '🎭 Roles', value: `**${totalRoles}** roles`, inline: true },
      { name: '😀 Emojis', value: `**${emojis.size}** total\n🖼️ ${staticEmojis} static\n✨ ${animatedEmojis} animated`, inline: true },
      { name: '🚀 Boosts', value: `${boostTiers[guild.premiumTier] || 'None'}\n**${guild.premiumSubscriptionCount || 0}** boosts`, inline: true },
      { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] || 'Unknown', inline: true }
    )
    .setImage(guild.bannerURL({ size: 512 }) || null)
    .setFooter({ text: `Requested by ${interaction.user.username}` })
    .setTimestamp();

  if (guild.description) {
    embed.setDescription(guild.description);
  }

  await interaction.reply({ embeds: [embed] });
}
