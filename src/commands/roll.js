import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll dice in NdM format, e.g., 2d6')
  .addStringOption(opt => opt.setName('dice').setDescription('Dice expression').setRequired(false));

export async function execute(interaction) {
  const expr = interaction.options.getString('dice') || '1d6';
  const m = expr.match(/(\d+)d(\d+)/i);
  if (!m) return interaction.reply('Invalid format. Use NdM, e.g. 2d6');
  const n = Math.min(100, Number(m[1]));
  const sides = Number(m[2]);
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  await interaction.reply(`${interaction.user.username} rolled ${expr}: [${rolls.join(', ')}] = ${sum}`);
}
