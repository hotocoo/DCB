import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { safeExecuteCommand } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("Show a user's avatar in full size")
  .addUserOption(opt =>
    opt.setName('user').setDescription('The user whose avatar to show (defaults to yourself)').setRequired(false)
  );

/**
 * Executes the avatar command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const target = interaction.options.getUser('user') ?? interaction.user;

    const globalAvatar = target.displayAvatarURL({ dynamic: true, size: 4096 });
    let serverAvatar = null;

    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member?.avatar) {
        serverAvatar = member.displayAvatarURL({ dynamic: true, size: 4096 });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Avatar`)
      .setColor(0x5865f2)
      .setImage(serverAvatar ?? globalAvatar)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    const buttons = [
      new ButtonBuilder()
        .setLabel('Open Global Avatar')
        .setStyle(ButtonStyle.Link)
        .setURL(globalAvatar),
    ];

    if (serverAvatar) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Open Server Avatar')
          .setStyle(ButtonStyle.Link)
          .setURL(serverAvatar)
      );
    }

    const row = new ActionRowBuilder().addComponents(...buttons);

    await interaction.reply({ embeds: [embed], components: [row] });
  });
}
