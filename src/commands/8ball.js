import { SlashCommandBuilder } from 'discord.js';

const answers = [
  'It is certain.', 'Without a doubt.', 'You may rely on it.', 'Ask again later.',
  'Better not tell you now.', 'My reply is no.', 'Very doubtful.'
];

export const data = new SlashCommandBuilder()
  .setName('8ball')
  .setDescription('Ask the magic 8-ball a question')
  .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true));

export async function execute(interaction) {
  const ans = answers[Math.floor(Math.random() * answers.length)];
  await interaction.reply(`${ans}`);
}
