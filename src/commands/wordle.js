import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} from 'discord.js';

import { wordleGames } from '../game-states.js';
import { updateUserStats } from '../achievements.js';
import { logError } from '../logger.js';

const WORD_LIST = [
  'HOUSE', 'PLANE', 'TIGER', 'OCEAN', 'FLAME', 'CLOUD', 'BRAIN', 'CHAIR', 'DANCE', 'EAGLE',
  'FLOOD', 'GRACE', 'HEART', 'IMAGE', 'JOINT', 'KNIFE', 'LEMON', 'MUSIC', 'NIGHT', 'OLIVE',
  'PIANO', 'QUEEN', 'RIVER', 'SNAKE', 'TABLE', 'UNCLE', 'VOICE', 'WHEAT', 'YOUTH', 'ZEBRA',
  'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ALIEN', 'ALIGN', 'ALIKE', 'ALIVE', 'ALLOW',
  'ALONE', 'ALONG', 'ALTER', 'AMONG', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY'
];

const VALID_DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const MAX_GUESSES = 6;

export const data = new SlashCommandBuilder()
  .setName('wordle')
  .setDescription('Play Wordle - guess the 5-letter word')
  .addStringOption(option =>
    option.setName('difficulty')
      .setDescription('Word difficulty')
      .addChoices(
        { name: 'Easy (Common words)', value: 'easy' },
        { name: 'Normal (Mixed words)', value: 'normal' },
        { name: 'Hard (Uncommon words)', value: 'hard' }
      )
      .setRequired(false));

/**
 * Executes the Wordle command.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 */
export async function execute(interaction) {
  try {
    const difficulty = interaction.options.getString('difficulty') || 'normal';

    if (!VALID_DIFFICULTIES.has(difficulty)) {
      return await interaction.reply({
        content: '❌ Invalid difficulty level.',
        flags: MessageFlags.Ephemeral
      });
    }

    const availableWords = pickWordPool(difficulty);
    if (availableWords.length === 0) {
      return await interaction.reply({
        content: '❌ No words available for this difficulty.',
        flags: MessageFlags.Ephemeral
      });
    }

    const secretWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    const gameId = `wordle_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const gameState = {
      id: gameId,
      secretWord,
      guesses: [],
      maxGuesses: MAX_GUESSES,
      currentGuess: '',
      gameActive: true,
      difficulty,
      startTime: Date.now()
    };

    wordleGames.set(interaction.user.id, gameState);
    await sendWordleBoard(interaction, gameState);
  }
  catch (error) {
    logError('Error in wordle execute', error, { userId: interaction.user.id });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while starting the game.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

function pickWordPool(difficulty) {
  if (difficulty === 'easy') return WORD_LIST.slice(0, 20);
  if (difficulty === 'hard') return WORD_LIST.slice(30);
  return WORD_LIST;
}

const RESULT_EMOJI = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛'
};

function resultToString(result) {
  return result.map(r => Object.hasOwn(RESULT_EMOJI, r) ? RESULT_EMOJI[r] : '⬜').join('');
}

function performanceMessage(guessCount) {
  if (guessCount === 1) return '🌟 INCREDIBLE! First try!';
  if (guessCount <= 3) return '🎉 Excellent guessing!';
  if (guessCount <= 5) return '👍 Good job!';
  return '😅 Close one!';
}

/**
 * Sends the Wordle board and handles game logic.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 * @param {Object} gameState - The current game state.
 */
async function sendWordleBoard(interaction, gameState) {
  try {
    const { guesses, maxGuesses, gameActive } = gameState;

    if (!gameActive) return;

    const lastGuess = guesses.at(-1);
    if (lastGuess?.result.every(r => r === 'correct')) {
      return await handleWin(interaction, gameState);
    }

    if (guesses.length >= maxGuesses) {
      return await handleLoss(interaction, gameState);
    }

    await sendActiveBoard(interaction, gameState);
  }
  catch (error) {
    logError('Error in sendWordleBoard', error, { userId: interaction.user.id });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while updating the game.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

async function handleWin(interaction, gameState) {
  const {
    guesses, maxGuesses, startTime, difficulty, secretWord
  } = gameState;
  gameState.gameActive = false;
  const timeElapsed = Math.round((Date.now() - startTime) / 1000);

  try {
    await updateUserStats(interaction.user.id, { games: { wordle_wins: 1 } });
  }
  catch (error) {
    logError('Error updating user stats', error, { userId: interaction.user.id });
  }

  const winEmbed = new EmbedBuilder()
    .setTitle('🎉 Wordle Victory!')
    .setColor(0x00_FF_00)
    .setDescription(
      `You guessed **${secretWord}** in ${guesses.length}/${maxGuesses} attempts!\n\n` +
      performanceMessage(guesses.length)
    )
    .addFields({
      name: '📊 Game Stats',
      value:
        `**Attempts:** ${guesses.length}/${maxGuesses}\n` +
        `**Time:** ${timeElapsed}s\n**Difficulty:** ${difficulty.toUpperCase()}`,
      inline: false
    });

  for (const [index, guess] of guesses.entries()) {
    winEmbed.addFields({
      name: `Guess ${index + 1}`,
      value: `${guess.word}\n${resultToString(guess.result)}`,
      inline: true
    });
  }

  await replyOrEdit(interaction, { embeds: [winEmbed], components: [] });
}

async function handleLoss(interaction, gameState) {
  const { guesses, maxGuesses, startTime, secretWord } = gameState;
  gameState.gameActive = false;
  const timeElapsed = Math.round((Date.now() - startTime) / 1000);

  const loseEmbed = new EmbedBuilder()
    .setTitle('😔 Wordle - Game Over')
    .setColor(0xFF_00_00)
    .setDescription(`The word was **${secretWord}**!\n\nBetter luck next time!`)
    .addFields({
      name: '📊 Final Stats',
      value: `**Attempts:** ${guesses.length}/${maxGuesses}\n**Time:** ${timeElapsed}s`,
      inline: false
    });

  await replyOrEdit(interaction, { embeds: [loseEmbed], components: [] });
}

async function sendActiveBoard(interaction, gameState) {
  const { guesses, maxGuesses } = gameState;

  const embed = new EmbedBuilder()
    .setTitle('🔤 Wordle Game')
    .setColor(0x00_99_FF)
    .setDescription(`Guess the 5-letter word!\n\n**Attempts:** ${guesses.length}/${maxGuesses}`)
    .addFields({
      name: 'How to Play',
      value:
        '🟩 = Correct letter, correct position\n' +
        '🟨 = Correct letter, wrong position\n' +
        '⬛ = Letter not in word',
      inline: false
    });

  if (guesses.length > 0) {
    const guessHistory = guesses.map((guess, index) =>
      `**${index + 1}.** ${guess.word}\n${resultToString(guess.result)}`
    ).join('\n\n');

    embed.addFields({
      name: 'Previous Guesses',
      value: guessHistory,
      inline: false
    });
  }

  const guessBtn = new ButtonBuilder()
    .setCustomId(`wordle_guess:${interaction.user.id}`)
    .setLabel('🔤 Make Guess')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(guessBtn);

  await replyOrEdit(interaction, { embeds: [embed], components: [row] });
}

async function replyOrEdit(interaction, options) {
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(options);
  } else {
    await interaction.reply(options);
  }
}

/**
 * Sends the Wordle guess modal.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 * @param {string} gameId - The game ID.
 */
export async function sendWordleGuessModal(interaction, gameId) {
  try {
    const modal = new ModalBuilder()
      .setCustomId(`wordle_submit:${gameId}`)
      .setTitle('Wordle Guess');
    const guessInput = new TextInputBuilder()
      .setCustomId('word_guess')
      .setLabel('Enter a 5-letter word')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('HOUSE')
      .setMinLength(5)
      .setMaxLength(5);

    modal.addComponents({ type: 1, components: [guessInput] });
    await interaction.showModal(modal);
  }
  catch (error) {
    logError('Error in sendWordleGuessModal', error, { userId: interaction.user.id });
    await interaction.reply({
      content: '❌ An error occurred while showing the guess modal.',
      flags: MessageFlags.Ephemeral
    });
  }
}
