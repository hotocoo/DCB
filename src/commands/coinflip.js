import { SlashCommandBuilder } from 'discord.js';

const sides = ['Heads', 'Tails'];
const coins = ['🪙', '💰', '🥇'];

export const data = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Flip a coin and get heads or tails')
  .addIntegerOption(option =>
    option.setName('count')
      .setDescription('Number of coins to flip (1-10)')
      .setMinValue(1)
      .setMaxValue(10)
      .setRequired(false));

export async function execute(interaction) {
  const count = interaction.options.getInteger('count') || 1;
  const results = [];

  for (let i = 0; i < count; i++) {
    const result = sides[Math.floor(Math.random() * sides.length)];
    const coin = coins[Math.floor(Math.random() * coins.length)];
    results.push(`${coin} ${result}`);
  }

  const headsCount = results.filter(r => r.includes('Heads')).length;
  const tailsCount = results.filter(r => r.includes('Tails')).length;

  let response = `**Coin Flip${count > 1 ? 's' : ''}:**\n${results.join('\n')}\n\n`;
  response += `**Results:** ${headsCount} Heads, ${tailsCount} Tails`;

  if (count === 1) {
    response = `**Coin Flip:** ${results[0]}\n\n**Result:** ${headsCount > tailsCount ? '🟢 Heads!' : '🔴 Tails!'}`;
  }

  await interaction.reply({ content: response });
}
