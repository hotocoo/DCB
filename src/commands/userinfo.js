import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Display detailed information about a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to look up (defaults to yourself)')
      .setRequired(false));

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;

  // Fetch the full user to get banner/accent color
  const fullUser = await target.fetch().catch(() => target);

  // Get guild member if in a server
  const member = interaction.guild
    ? await interaction.guild.members.fetch(target.id).catch(() => null)
    : null;

  const createdAt = Math.floor(target.createdTimestamp / 1000);
  const joinedAt = member ? Math.floor(member.joinedTimestamp / 1000) : null;

  const badges = [];
  const flags = fullUser.flags?.toArray() ?? [];
  const badgeMap = {
    Staff: '👨‍💼 Discord Staff',
    Partner: '🤝 Partnered Server Owner',
    Hypesquad: '🏅 HypeSquad Events',
    BugHunterLevel1: '🐛 Bug Hunter Level 1',
    BugHunterLevel2: '🐛 Bug Hunter Level 2',
    HypeSquadOnlineHouse1: '🏠 HypeSquad Bravery',
    HypeSquadOnlineHouse2: '🏠 HypeSquad Brilliance',
    HypeSquadOnlineHouse3: '🏠 HypeSquad Balance',
    PremiumEarlySupporter: '💎 Early Supporter',
    VerifiedBot: '✅ Verified Bot',
    VerifiedDeveloper: '👨‍💻 Verified Bot Developer',
    CertifiedModerator: '🛡️ Discord Certified Moderator',
    ActiveDeveloper: '💻 Active Developer'
  };

  for (const flag of flags) {
    if (badgeMap[flag]) badges.push(badgeMap[flag]);
  }
  if (target.bot) badges.push('🤖 Bot');

  const roles = member
    ? member.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r.toString())
    : [];

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${target.displayName}`)
    .setColor(member?.displayHexColor || fullUser.accentColor || 0x57_F2_87)
    .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '🏷️ Username', value: `${target.username}${target.discriminator !== '0' ? `#${target.discriminator}` : ''}`, inline: true },
      { name: '🆔 User ID', value: target.id, inline: true },
      { name: '📅 Account Created', value: `<t:${createdAt}:R>`, inline: true }
    );

  if (joinedAt) {
    embed.addFields({ name: '📥 Joined Server', value: `<t:${joinedAt}:R>`, inline: true });
  }

  if (member?.nickname) {
    embed.addFields({ name: '🎭 Nickname', value: member.nickname, inline: true });
  }

  if (member?.presence) {
    const statusEmojis = { online: '🟢', idle: '🌙', dnd: '🔴', offline: '⚫' };
    const status = member.presence.status;
    embed.addFields({ name: '🟢 Status', value: `${statusEmojis[status] || '⚫'} ${status.charAt(0).toUpperCase() + status.slice(1)}`, inline: true });
  }

  if (badges.length > 0) {
    embed.addFields({ name: '🏅 Badges', value: badges.join('\n'), inline: false });
  }

  if (roles.length > 0) {
    const roleText = roles.length > 15
      ? `${roles.slice(0, 15).join(', ')} (+${roles.length - 15} more)`
      : roles.join(', ');
    embed.addFields({ name: `🎭 Roles (${roles.length})`, value: roleText, inline: false });
  }

  if (member?.isBoosting()) {
    const boostingSince = Math.floor(member.premiumSinceTimestamp / 1000);
    embed.addFields({ name: '🚀 Boosting Since', value: `<t:${boostingSince}:R>`, inline: true });
  }

  if (fullUser.banner) {
    embed.setImage(fullUser.bannerURL({ size: 512 }));
  }

  embed
    .setFooter({ text: `Requested by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
