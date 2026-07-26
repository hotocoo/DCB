import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

import { sanitizeInput } from '../validation.js';
import { logger } from '../logger.js';

const jokes = [
  ['Why do programmers prefer dark mode?', 'Because light attracts bugs.'],
  ["What's a programmer's favorite hangout?", 'Foo Bar.'],
  ['Why did the developer go broke?', 'Because he used up all his cache.'],
];

export const data = new SlashCommandBuilder()
  .setName('fun')
  .setDescription('Fun commands and jokes')
  .addSubcommand(sc => sc.setName('joke').setDescription('Tell a joke'))
  .addSubcommand(sc => sc.setName('compliment').setDescription('Get a compliment').addUserOption(opt => opt.setName('user').setDescription('Person to compliment').setRequired(false)))
  .addSubcommand(sc => sc.setName('roast').setDescription('Roast someone lightly').addUserOption(opt => opt.setName('user').setDescription('Person to roast').setRequired(false)))
  .addSubcommand(sc => sc.setName('8ball').setDescription('Ask the magic 8-ball')
    .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)));

export async function execute(interaction) {
  try {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'joke': return await doJoke(interaction);
      case 'compliment': return await doCompliment(interaction);
      case 'roast': return await doRoast(interaction);
      case '8ball': return await doEightBall(interaction);
    }
  } catch (error) {
    logger.error('fun error:', error);
    try { await interaction.editReply({ content: 'Something went wrong.' }); } catch {}
  }
}

async function doJoke(i) {
  const [q, a] = jokes[Math.floor(Math.random() * jokes.length)];
  await i.editReply({ content: `${q}\n||${a}||` });
}

const compliments = ["You're awesome!", 'Great person!', 'Your vibe is legendary.', 'Keep being you.'];
async function doCompliment(i) {
  const target = i.options.getUser('user') || i.user;
  await i.editReply({ content: `${target} ${compliments[Math.floor(Math.random() * compliments.length)]}` });
}

const roasts = ["You put the 'no' in awesome.", "I'd roast you but your mom already did.", 'Error 404: talent not found.'];
async function doRoast(i) {
  const target = i.options.getUser('user') || i.user;
  await i.editReply({ content: `${target} ${roasts[Math.floor(Math.random() * roasts.length)]}` });
}

const eightball = ['It is certain.', 'Maybe.', 'No way.', 'Ask again later.', 'Yes!', 'Doubtful.'];
async function doEightBall(i) {
  const q = sanitizeInput(i.options.getString('question'));
  await i.editReply({ content: `🎱 **You asked:** "${q}"\n**Answer:** ${eightball[Math.floor(Math.random() * eightball.length)]}` });
}
