import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { safeExecuteCommand, CommandError, validateNotEmpty, validateRange } from '../errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName('hangman')
  .setDescription('Play a game of Hangman!')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new Hangman game'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('guess')
      .setDescription('Guess a letter in the Hangman game')
      .addStringOption(option =>
        option
          .setName('letter')
          .setDescription('The letter to guess')
          .setRequired(true)));

export async function execute(interaction) {
  return safeExecuteCommand(interaction, async() => {
    const subcommand = interaction.options.getSubcommand();

    const drawHangman = (wrongGuesses) => {
      const stages = [
        '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
        '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
        '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
        '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
        '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
        '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
        '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
      ];
      return stages[wrongGuesses];
    };

    if (subcommand === 'start') {
      const words = readFileSync(path.join(__dirname, '../../data/words.txt'), 'utf8')
        .split('\n')
        .filter(word => word.trim().length > 0);

      if (words.length === 0) {
        return await interaction.reply({ content: 'No words available for Hangman.', flags: MessageFlags.Ephemeral });
      }

      const randomWord = words[Math.floor(Math.random() * words.length)];
      const gameState = {
        word: randomWord.toLowerCase(),
        guessedLetters: new Set(),
        wrongGuesses: 0,
        maxWrongGuesses: 6,
        isGameOver: false,
        isWon: false
      };

      const displayWord = () => {
        return gameState.word.split('').map(letter => gameState.guessedLetters.has(letter) ? letter : '_').join(' ');
      };

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Hangman Game')
        .setDescription(`**Word:** ${displayWord()}\n**Wrong Guesses:** ${gameState.wrongGuesses}/${gameState.maxWrongGuesses}\n${drawHangman(gameState.wrongGuesses)}`)
        .setFooter({ text: 'Guess a letter using /hangman guess <letter>' });

      await interaction.reply({ embeds: [embed] });

      // Store game state
      if (!interaction.client.games) {
        interaction.client.games = new Map();
      }
      interaction.client.games.set(interaction.user.id, gameState);
    }

    else if (subcommand === 'guess') {
      const guess = interaction.options.getString('letter').toLowerCase();

      // Validate input
      validateNotEmpty(guess, 'letter');
      validateRange(guess.length, 1, 1, 'letter length');
      if (!/^[a-z]$/.test(guess)) {
        throw new CommandError('Please guess a single letter (a-z).', 'INVALID_ARGUMENT');
      }

      const gameState = interaction.client.games.get(interaction.user.id);
      if (!gameState || gameState.isGameOver) {
        throw new CommandError('No active game found. Start a new game with /hangman start.', 'NOT_FOUND');
      }

      if (gameState.guessedLetters.has(guess)) {
        throw new CommandError('You have already guessed that letter.', 'INVALID_ARGUMENT');
      }

      gameState.guessedLetters.add(guess);

      if (!gameState.word.includes(guess)) {
        gameState.wrongGuesses++;
      }

      // Check for win or loss
      const currentDisplay = gameState.word.split('').map(letter => gameState.guessedLetters.has(letter) ? letter : '_').join(' ');
      if (currentDisplay.replaceAll(/\s/g, '') === gameState.word) {
        gameState.isWon = true;
        gameState.isGameOver = true;
      }
      else if (gameState.wrongGuesses >= gameState.maxWrongGuesses) {
        gameState.isGameOver = true;
      }

      const updatedEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(gameState.isGameOver ? (gameState.isWon ? 'You Won!' : 'You Lost!') : 'Hangman Game')
        .setDescription(`**Word:** ${currentDisplay}\n**Wrong Guesses:** ${gameState.wrongGuesses}/${gameState.maxWrongGuesses}\n${drawHangman(gameState.wrongGuesses)}`)
        .setFooter({ text: gameState.isGameOver ? 'Game Over' : 'Guess a letter using /hangman guess <letter>' });

      await interaction.reply({ embeds: [updatedEmbed] });

      if (gameState.isGameOver) {
        interaction.client.games.delete(interaction.user.id);
      }
    }
  },
  {
    command: 'hangman'
  });
}
