import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("Displays a user's avatar")
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user whose avatar to show (defaults to yourself)')
      .setRequired(false)
  );

export async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.guild?.members.cache.get(targetUser.id)
      ?? await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    const globalAvatar = targetUser.displayAvatarURL({ size: 1024, forceStatic: false });
    const isAnimated = targetUser.avatar?.startsWith('a_') ?? false;

    const links = [
      `[PNG](${targetUser.displayAvatarURL({ size: 1024, extension: 'png' })})`,
      `[JPG](${targetUser.displayAvatarURL({ size: 1024, extension: 'jpg' })})`,
      `[WEBP](${targetUser.displayAvatarURL({ size: 1024, extension: 'webp' })})`,
    ];
    if (isAnimated) {
      links.push(`[GIF](${targetUser.displayAvatarURL({ size: 1024, extension: 'gif' })})`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username}'s Avatar`)
      .setColor(0x58_65_F2)
      .setImage(globalAvatar)
      .addFields({ name: '🔗 Links', value: links.join(' | '), inline: false });

    const guildAvatar = member?.avatarURL({ size: 1024, forceStatic: false });
    if (guildAvatar && guildAvatar !== globalAvatar) {
      embed.addFields({ name: '🏠 Guild Avatar', value: `[View](${guildAvatar})`, inline: false });
      embed.setThumbnail(guildAvatar);
    }

    embed.setFooter({ text: `Avatar${isAnimated ? ' · Animated' : ''}` }).setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
  catch (error) {
    const errEmbed = new EmbedBuilder()
      .setColor(0xFF_00_00)
      .setTitle('Error')
      .setDescription(`Failed to fetch avatar: ${error.message}`);
    return interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
