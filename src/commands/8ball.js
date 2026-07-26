import { SlashCommandBuilder } from 'discord.js';

import { logger } from '../logger.js';

const answers = [
  'It is certain.',
  'Without a doubt.',
  'You may rely on it.',
  'Ask again later.',
  'Better not tell you now.',
  'My reply is no.',
  'Very doubtful.',
  'Yes definitely.',
  'Most likely.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  'Do not count on it.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'My sources say no.',
  'As I see it, yes.',
  'Outlook not so good.',
  'Absolutely.',
  'Certainly not.',
];

export const data = new SlashCommandBuilder()
  .setName('8ball')
  .setDescription('Ask the magic 8-ball a question')
  .addStringOption((opt) => opt.setName('question').setDescription('Your question').setRequired(true));

export async function execute(interaction) {
  try {
    const question = interaction.options.getString('question');
    if (!question || question.trim().length === 0) {
      return await interaction.reply({ content: '❌ Please ask a question.', flags: 64 });
    }

    const ans = answers[Math.floor(Math.random() * answers.length)];
    await interaction.reply(`🎱 ${ans}`);
  } catch (error) {
    logger.error('Error in /8ball:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Something went wrong.', flags: 64 });
      }
    } catch (_) {}
  }
}
