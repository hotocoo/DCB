import { SlashCommandBuilder } from 'discord.js';

const answers = [
  'It is certain.', 'Without a doubt.', 'You may rely on it.', 'Ask again later.',
  'Better not tell you now.', 'My reply is no.', 'Very doubtful.', 'Yes definitely.', 'Most likely.',
  'Cannot predict now.', 'Concentrate and ask again.', 'Do not count on it.', 'Outlook good.',
  'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'My sources say no.',
  'As I see it, yes.', 'Outlook not so good.', 'Absolutely.', 'Certainly not.'
];

export const data = new SlashCommandBuilder()
  .setName('8ball')
  .setDescription('Ask the magic 8-ball a question')
  .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true));

export async function execute(interaction) {
  const ans = answers[Math.floor(Math.random() * answers.length)];
  await interaction.reply(`${ans}`);
}
