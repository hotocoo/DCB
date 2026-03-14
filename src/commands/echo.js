import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { sanitizeInput } from '../validation.js';

export const data = new SlashCommandBuilder()
  .setName('echo')
  .setDescription('Echoes the provided text back to you')
  .addStringOption(opt =>
    opt.setName('text')
      .setDescription('Text to echo (max 2000 characters)')
      .setRequired(true)
      .setMaxLength(2000))
  .addBooleanOption(opt =>
    opt.setName('embed')
      .setDescription('Show as an embed (default: false)')
      .setRequired(false))
  .addBooleanOption(opt =>
    opt.setName('ephemeral')
      .setDescription('Only you can see the response (default: false)')
      .setRequired(false));

/**
 * Executes the echo command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    const rawText = interaction.options.getString('text', true);
    const useEmbed = interaction.options.getBoolean('embed') ?? false;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    // Sanitize to prevent abuse
    const text = sanitizeInput(rawText);

    if (!text || text.trim().length === 0) {
      return interaction.reply({
        content: '❌ Cannot echo empty or invalid content.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (useEmbed) {
      const embed = new EmbedBuilder()
        .setColor(0x00_99_FF)
        .setDescription(text)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    }

    return interaction.reply({ content: text, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
  }
  catch (error) {
    console.error('Echo command error:', error);
    return interaction.reply({
      content: '❌ Failed to echo the message. Please try again.',
      flags: MessageFlags.Ephemeral
    });
  }
}
