import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

import { guessGames } from '../game-states.js';
import { updateStats } from '../achievements.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('guess')
  .setDescription('Guess the number game')
  .addNumberOption(opt => opt.setName('min').setDescription('Minimum number').setRequired(false).setMinValue(1))
  .addNumberOption(opt => opt.setName('max').setDescription('Maximum number').setRequired(false).setMaxValue(9999));

export async function execute(interaction) {
  try {
    await interaction.deferReply();
    const min = interaction.options.getNumber('min') || 1;
    const max = interaction.options.getNumber('max') || 100;

    if (max <= min) return await interaction.editReply({ content: 'Max must be greater than min!' });

    const target = Math.floor(Math.random() * (max - min)) + min;
    const game = { target, attempts: 0 };
    guessGames.set(interaction.user.id, game);

    await interaction.editReply({
      content: `🎯 Guessing game started!\nI'm thinking of a number between ${min} and ${max}.\nSend your guess as a message. Type "quit" to stop.`
    });
  } catch (error) {
    logger.error('guess error:', error);
    try { await interaction.editReply({ content: 'Error starting game.' }); } catch {}
  }
}

export async function handleGuess(message) {
  const game = guessGames.get(message.author.id);
  if (!game) return;

  if (message.content.toLowerCase() === 'quit') {
    guessGames.delete(message.author.id);
    await message.channel.send('Game ended.');
    return;
  }

  const guess = parseInt(message.content, 10);
  if (isNaN(guess)) return;

  game.attempts++;

  if (guess === game.target) {
    guessGames.delete(message.author.id);
    try { updateStats(message.author.id, { games_won: 1 }); } catch {}
    await message.channel.send(`🎉 Correct! The number was ${game.target}. You guessed it in ${game.attempts} attempt(s)!`);
  } else if (guess < game.target) {
    await message.reply('Too low!');
  } else {
    await message.reply('Too high!');
  }
}
