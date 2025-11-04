import { SlashCommandBuilder } from 'discord.js';

import { safeExecuteCommand, CommandError, validateNotEmpty } from '../errorHandler';

// Game constants
const RPS_CHOICES = ['rock', 'paper', 'scissors'];
const RPS_RULES = {
  rock: { beats: 'scissors', losesTo: 'paper' },
  paper: { beats: 'rock', losesTo: 'scissors' },
  scissors: { beats: 'paper', losesTo: 'rock' }
};

/**
 * Determines the outcome of a rock-paper-scissors game.
 * @param {string} playerChoice - The player's choice
 * @param {string} botChoice - The bot's choice
 * @returns {string} The game result ('win', 'lose', or 'tie')
 */
function determineWinner(playerChoice, botChoice) {
  if (playerChoice === botChoice) {
    return 'tie';
  }

  return RPS_RULES[playerChoice].beats === botChoice ? 'win' : 'lose';
}

/**
 * Formats the result message for the game.
 * @param {string} playerChoice - Player's choice
 * @param {string} botChoice - Bot's choice
 * @param {string} result - Game result
 * @param {string} username - Player's username
 * @returns {string} Formatted message
 */
function formatResultMessage(playerChoice, botChoice, result, username) {
  const resultEmojis = {
    win: '🎉',
    lose: '😢',
    tie: '🤝'
  };

  const resultText = {
    win: 'You win!',
    lose: 'You lose!',
    tie: 'It\'s a tie!'
  };

  return `${username} chose ${playerChoice}, I chose ${botChoice} — ${resultEmojis[result]} ${resultText[result]}`;
}

/**
 * Rock-paper-scissors command data structure.
 */
export const data = new SlashCommandBuilder()
  .setName('rps')
  .setDescription('Play rock-paper-scissors against the bot')
  .addStringOption(opt =>
    opt.setName('choice')
      .setDescription('Your choice')
      .setRequired(true)
      .addChoices(
        { name: 'Rock 🪨', value: 'rock' },
        { name: 'Paper 📄', value: 'paper' },
        { name: 'Scissors ✂️', value: 'scissors' }
      )
  );

/**
 * Executes the rock-paper-scissors command.
 * @param {object} interaction - Discord interaction object
 * @returns {Promise<void>}
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async() => {
    // Validate interaction and user
    validateNotEmpty(interaction, 'interaction');
    validateNotEmpty(interaction.user, 'user');

    // Get and validate player's choice
    const choice = interaction.options.getString('choice');

    if (!choice || typeof choice !== 'string') {
      throw new CommandError('Please select a valid choice.', 'INVALID_ARGUMENT');
    }

    const normalizedChoice = choice.toLowerCase().trim();

    if (!RPS_CHOICES.includes(normalizedChoice)) {
      throw new CommandError(
        'Invalid choice. Please choose rock, paper, or scissors.',
        'INVALID_ARGUMENT'
      );
    }

    // Generate bot's choice with proper randomization
    const botChoice = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];

    // Determine result
    const result = determineWinner(normalizedChoice, botChoice);

    // Format and send response
    const response = formatResultMessage(
      normalizedChoice,
      botChoice,
      result,
      interaction.user.username
    );

    await interaction.reply(response);
  });
}
