import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Displays information about a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to get info about (defaults to yourself)')
      .setRequired(false)
  );

export async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.guild?.members.cache.get(targetUser.id)
      ?? await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    const createdAt = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : 'N/A';

    const roles = member?.roles.cache
      .filter(r => r.id !== interaction.guild?.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `<@&${r.id}>`);
    const rolesDisplay = roles && roles.length > 0
      ? roles.slice(0, 10).join(', ') + (roles.length > 10 ? ` (+${roles.length - 10} more)` : '')
      : 'None';

    const isNitro = targetUser.avatar?.startsWith('a_') ?? false;
    const displayName = member?.displayName ?? targetUser.username;

    const embed = new EmbedBuilder()
      .setTitle(`${displayName}'s Info`)
      .setColor(0x57F287)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🏷️ Username', value: targetUser.tag, inline: true },
        { name: '🆔 User ID', value: targetUser.id, inline: true },
        { name: targetUser.bot ? '🤖 Bot' : '🧑 Human', value: targetUser.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: createdAt, inline: false },
        { name: '📥 Joined Server', value: joinedAt, inline: true },
        { name: '💎 Nitro', value: isNitro ? 'Likely (animated avatar)' : 'Unknown', inline: true },
        { name: `🎭 Roles (${roles?.length ?? 0})`, value: rolesDisplay, inline: false },
      )
      .setFooter({ text: `User Info` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  } catch (error) {
    const errEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Error')
      .setDescription(`Failed to fetch user info: ${error.message}`);
    return interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
