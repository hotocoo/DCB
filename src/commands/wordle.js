import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { wordleGames } from '../game-states.js';
import { updateUserStats } from '../achievements.js';

const WORD_LIST = [
  'HOUSE', 'PLANE', 'TIGER', 'OCEAN', 'FLAME', 'CLOUD', 'BRAIN', 'CHAIR', 'DANCE', 'EAGLE',
  'FLOOD', 'GRACE', 'HEART', 'IMAGE', 'JOINT', 'KNIFE', 'LEMON', 'MUSIC', 'NIGHT', 'OLIVE',
  'PIANO', 'QUEEN', 'RIVER', 'SNAKE', 'TABLE', 'UNCLE', 'VOICE', 'WHEAT', 'YOUTH', 'ZEBRA',
  'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ALIEN', 'ALIGN', 'ALIKE', 'ALIVE', 'ALLOW',
  'ALONE', 'ALONG', 'ALTER', 'AMONG', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY'
];

/**
 * Validates if a word is in the word list.
 * @param {string} word - The word to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidWord(word) {
  return WORD_LIST.includes(word.toUpperCase());
}

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

    // Validate difficulty
    if (!['easy', 'normal', 'hard'].includes(difficulty)) {
      return await interaction.reply({ content: '❌ Invalid difficulty level.', flags: MessageFlags.Ephemeral });
    }

    // Filter words by difficulty
    let availableWords = WORD_LIST;
    if (difficulty === 'easy') {
      availableWords = WORD_LIST.slice(0, 20); // Common words
    } else if (difficulty === 'hard') {
      availableWords = WORD_LIST.slice(30); // Less common words
    }

    if (availableWords.length === 0) {
      return await interaction.reply({ content: '❌ No words available for this difficulty.', flags: MessageFlags.Ephemeral });
    }

    const secretWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    const gameId = `wordle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const gameState = {
      id: gameId,
      secretWord,
      guesses: [],
      maxGuesses: 6,
      currentGuess: '',
      gameActive: true,
      difficulty,
      startTime: Date.now()
    };

    // Store game state globally for button handlers
    wordleGames.set(interaction.user.id, gameState);
    await sendWordleBoard(interaction, gameState);
  } catch (error) {
    console.error('Error in wordle execute:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while starting the game.', flags: MessageFlags.Ephemeral });
    }
  }
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

    // Check if player won
    const lastGuess = guesses[guesses.length - 1];
    if (lastGuess && lastGuess.result.every(r => r === 'correct')) {
      gameState.gameActive = false;
      const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);

      try {
        await updateUserStats(interaction.user.id, { games: { wordle_wins: 1 } });
      } catch (error) {
        console.error('Error updating user stats:', error);
      }

      let performanceMessage;
      if (guesses.length === 1) performanceMessage = '🌟 INCREDIBLE! First try!';
      else if (guesses.length <= 3) performanceMessage = '🎉 Excellent guessing!';
      else if (guesses.length <= 5) performanceMessage = '👍 Good job!';
      else performanceMessage = '😅 Close one!';

      const winEmbed = new EmbedBuilder()
        .setTitle('🎉 Wordle Victory!')
        .setColor(0x00FF00)
        .setDescription(`You guessed **${gameState.secretWord}** in ${guesses.length}/${maxGuesses} attempts!\n\n${performanceMessage}`)
        .addFields({
          name: '📊 Game Stats',
          value: `**Attempts:** ${guesses.length}/${maxGuesses}\n**Time:** ${timeElapsed}s\n**Difficulty:** ${gameState.difficulty.toUpperCase()}`,
          inline: false
        });

      guesses.forEach((guess, index) => {
        const resultStr = guess.result.map(r => {
          switch (r) {
            case 'correct': return '🟩';
            case 'present': return '🟨';
            case 'absent': return '⬛';
            default: return '⬜';
          }
        }).join('');

        winEmbed.addFields({
          name: `Guess ${index + 1}`,
          value: `${guess.word}\n${resultStr}`,
          inline: true
        });
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [winEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [winEmbed] });
      }
      return;
    }

    // Check if game over (too many guesses)
    if (guesses.length >= maxGuesses) {
      gameState.gameActive = false;
      const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);

      const loseEmbed = new EmbedBuilder()
        .setTitle('😔 Wordle - Game Over')
        .setColor(0xFF0000)
        .setDescription(`The word was **${gameState.secretWord}**!\n\nBetter luck next time!`)
        .addFields({
          name: '📊 Final Stats',
          value: `**Attempts:** ${guesses.length}/${maxGuesses}\n**Time:** ${timeElapsed}s`,
          inline: false
        });

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [loseEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [loseEmbed] });
      }
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔤 Wordle Game')
      .setColor(0x0099FF)
      .setDescription(`Guess the 5-letter word!\n\n**Attempts:** ${guesses.length}/${maxGuesses}`)
      .addFields({
        name: 'How to Play',
        value: '🟩 = Correct letter, correct position\n🟨 = Correct letter, wrong position\n⬛ = Letter not in word',
        inline: false
      });

    // Show previous guesses with results
    if (guesses.length > 0) {
      const guessHistory = guesses.map((guess, index) => {
        const resultStr = guess.result.map(r => {
          switch (r) {
            case 'correct': return '🟩';
            case 'present': return '🟨';
            case 'absent': return '⬛';
            default: return '⬜';
          }
        }).join('');

        return `**${index + 1}.** ${guess.word}\n${resultStr}`;
      }).join('\n\n');

      embed.addFields({
        name: 'Previous Guesses',
        value: guessHistory,
        inline: false
      });
    }

    // Create guess button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wordle_guess:${interaction.user.id}`).setLabel('🔤 Make Guess').setStyle(ButtonStyle.Primary)
    );

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    console.error('Error in sendWordleBoard:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while updating the game.', flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Sends the Wordle guess modal.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 * @param {string} gameId - The game ID.
 */
async function sendWordleGuessModal(interaction, gameId) {
  try {
    const modal = new ModalBuilder().setCustomId(`wordle_submit:${gameId}`).setTitle('Wordle Guess');
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
  } catch (error) {
    console.error('Error in sendWordleGuessModal:', error);
    await interaction.reply({ content: '❌ An error occurred while showing the guess modal.', flags: MessageFlags.Ephemeral });
  }
}

/**
 * Checks a Wordle guess against the secret word.
 * @param {string} guess - The player's guess.
 * @param {string} secretWord - The secret word.
 * @returns {Array<string>} Array of result strings ('correct', 'present', 'absent').
 */
function checkWordleGuess(guess, secretWord) {
  const result = new Array(5).fill(null);
  const guessUpper = guess.toUpperCase();
  const secretUpper = secretWord.toUpperCase();
  const secretLetters = secretUpper.split('');

  // First pass: check for correct positions
  for (let i = 0; i < 5; i++) {
    if (guessUpper[i] === secretUpper[i]) {
      result[i] = 'correct';
      secretLetters[i] = null; // Mark as used
    }
  }

  // Second pass: check for present letters (wrong position)
  for (let i = 0; i < 5; i++) {
    if (result[i] !== 'correct') {
      const letter = guessUpper[i];
      const letterIndex = secretLetters.indexOf(letter);

      if (letterIndex !== -1) {
        result[i] = 'present';
        secretLetters[letterIndex] = null; // Mark as used
      } else {
        result[i] = 'absent';
      }
    }
  }

  return result;
}