import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription('Display a user\'s avatar or server icon')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user whose avatar to display (defaults to yourself)')
      .setRequired(false))
  .addBooleanOption(option =>
    option.setName('server')
      .setDescription('Show the server-specific avatar if different')
      .setRequired(false));

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const showServer = interaction.options.getBoolean('server') ?? true;

  const member = (showServer && interaction.guild)
    ? await interaction.guild.members.fetch(target.id).catch(() => null)
    : null;

  const globalAvatar = target.displayAvatarURL({ dynamic: true, size: 4096 });
  const serverAvatar = member?.avatarURL({ dynamic: true, size: 4096 });

  // Check if user has a server-specific avatar that is different
  const hasServerAvatar = serverAvatar && serverAvatar !== globalAvatar;
  const displayAvatar = (hasServerAvatar && showServer) ? serverAvatar : globalAvatar;

  const embed = new EmbedBuilder()
    .setTitle(`🖼️ ${target.displayName}'s Avatar`)
    .setColor(0x57_F2_87)
    .setImage(displayAvatar)
    .setDescription(hasServerAvatar && showServer
      ? '🏰 **Server Avatar** (user has a different global avatar)'
      : '🌐 **Global Avatar**'
    )
    .setFooter({ text: `Requested by ${interaction.user.username}` })
    .setTimestamp();

  // Buttons to open avatar in different sizes
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🔗 Open Full Size')
      .setStyle(ButtonStyle.Link)
      .setURL(displayAvatar),
    new ButtonBuilder()
      .setLabel('512px')
      .setStyle(ButtonStyle.Link)
      .setURL(target.displayAvatarURL({ dynamic: true, size: 512 }))
  );

  // Add toggle button if user has server avatar
  if (hasServerAvatar) {
    const toggleAvatar = showServer ? globalAvatar : serverAvatar;
    row.addComponents(
      new ButtonBuilder()
        .setLabel(showServer ? '🌐 Global Avatar' : '🏰 Server Avatar')
        .setStyle(ButtonStyle.Link)
        .setURL(toggleAvatar)
    );
  }

  await interaction.reply({ embeds: [embed], components: [row] });
}
