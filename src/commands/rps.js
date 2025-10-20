import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('rps')
  .setDescription('Play rock-paper-scissors')
  .addStringOption(opt => opt.setName('choice').setDescription('rock|paper|scissors').setRequired(true));

export async function execute(interaction) {
  const choice = interaction.options.getString('choice').toLowerCase();
  const choices = ['rock', 'paper', 'scissors'];
  if (!choices.includes(choice)) return interaction.reply('Choose rock, paper, or scissors.');
  const bot = choices[Math.floor(Math.random() * 3)];
  let result = 'tie';
  if ((choice === 'rock' && bot === 'scissors') || (choice === 'paper' && bot === 'rock') || (choice === 'scissors' && bot === 'paper')) result = 'you win';
  else if (choice !== bot) result = 'you lose';
  await interaction.reply(`You chose ${choice}, I chose ${bot} — ${result}`);
}
