import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Shows help about the bot');

export async function execute(interaction) {
  const helpText = `Commands:\n` +
    `/ping - show latency\n` +
    `/echo <text> - echo text\n` +
    `/help - this message\n\n` +
    `DM or mention the bot to have a chat (local model or OpenAI will be used if configured).`;

  await interaction.reply({ content: helpText, ephemeral: true });
}
