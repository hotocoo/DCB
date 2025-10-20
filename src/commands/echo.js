import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('echo')
  .setDescription('Echoes the provided text')
  .addStringOption(opt => opt.setName('text').setDescription('Text to echo').setRequired(true));

export async function execute(interaction) {
  const text = interaction.options.getString('text');
  await interaction.reply(text);
}
