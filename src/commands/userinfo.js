import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { safeExecuteCommand, validateGuild } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Display information about a user')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to look up (defaults to yourself)')
      .setRequired(false)
  );

/**
 * Executes the userinfo command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const target = interaction.options.getUser('user') ?? interaction.user;
    let member = null;

    if (interaction.guild) {
      member = await interaction.guild.members.fetch(target.id).catch(() => null);
    }

    const flags = target.flags?.toArray() ?? [];
    const badges = {
      ActiveDeveloper: '🛠️ Active Developer',
      BugHunterLevel1: '🐛 Bug Hunter',
      BugHunterLevel2: '🐛 Bug Hunter Gold',
      HypeSquadOnlineHouse1: '🏠 HypeSquad Bravery',
      HypeSquadOnlineHouse2: '🏠 HypeSquad Brilliance',
      HypeSquadOnlineHouse3: '🏠 HypeSquad Balance',
      HypeSquadEvents: '🎉 HypeSquad Events',
      Partner: '🤝 Discord Partner',
      PremiumEarlySupporter: '⭐ Early Supporter',
      Staff: '👑 Discord Staff',
      VerifiedBot: '✅ Verified Bot',
      VerifiedDeveloper: '🏅 Verified Developer',
    };
    const userBadges = flags.map(f => badges[f]).filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(`${target.tag}`)
      .setColor(member?.displayColor || 0x5865f2)
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 User ID', value: target.id, inline: true },
        { name: '🤖 Bot', value: target.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`, inline: true },
      );

    if (member) {
      embed.addFields(
        { name: '📥 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true },
        { name: '🎨 Display Name', value: member.displayName, inline: true },
      );

      const topRole = member.roles.highest;
      if (topRole.id !== interaction.guild.id) {
        embed.addFields({ name: '🎭 Highest Role', value: topRole.toString(), inline: true });
      }

      const roleList = member.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .first(10)
        .map(r => r.toString())
        .join(' ');

      if (roleList) {
        embed.addFields({ name: `📋 Roles (${member.roles.cache.size - 1})`, value: roleList || 'None' });
      }
    }

    if (userBadges.length > 0) {
      embed.addFields({ name: '🏆 Badges', value: userBadges.join('\n') });
    }

    embed
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  });
}
