import { SlashCommandBuilder } from 'discord.js';

import { safeExecuteCommand, CommandError, validateNotEmpty } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('echo')
  .setDescription('Echoes the provided text')
  .addStringOption((opt) => opt.setName('text').setDescription('Text to echo').setRequired(true));

export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const text = interaction.options.getString('text');
    validateNotEmpty(text, 'text');
    if (text.length > 2000) {
      throw new CommandError('Text is too long. Discord message limit is 2000 characters.', 'TEXT_TOO_LONG');
    }
    await interaction.reply(text);
  });
}
