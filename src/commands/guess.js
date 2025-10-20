import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { updateUserStats } from '../achievements.js';

export const data = new SlashCommandBuilder()
  .setName('guess')
  .setDescription('Play number guessing game with multiple difficulty levels')
  .addStringOption(option =>
    option.setName('difficulty')
      .setDescription('Game difficulty')
      .addChoices(
        { name: 'Easy (1-50, 10 attempts)', value: 'easy' },
        { name: 'Medium (1-100, 8 attempts)', value: 'medium' },
        { name: 'Hard (1-200, 6 attempts)', value: 'hard' },
        { name: 'Expert (1-500, 5 attempts)', value: 'expert' },
        { name: 'Master (1-1000, 4 attempts)', value: 'master' }
      )
      .setRequired(false))
  .addIntegerOption(option =>
    option.setName('custom_min')
      .setDescription('Custom minimum number')
      .setRequired(false))
  .addIntegerOption(option =>
    option.setName('custom_max')
      .setDescription('Custom maximum number')
      .setRequired(false));

export async function execute(interaction) {
  let min = 1;
  let max = 100;
  let attempts = 10;
  const difficulty = interaction.options.getString('difficulty') || 'medium';

  // Set difficulty parameters
  switch (difficulty) {
    case 'easy':
      min = 1; max = 50; attempts = 10;
      break;
    case 'medium':
      min = 1; max = 100; attempts = 8;
      break;
    case 'hard':
      min = 1; max = 200; attempts = 6;
      break;
    case 'expert':
      min = 1; max = 500; attempts = 5;
      break;
    case 'master':
      min = 1; max = 1000; attempts = 4;
      break;
  }

  // Custom range override
  const customMin = interaction.options.getInteger('custom_min');
  const customMax = interaction.options.getInteger('custom_max');

  if (customMin !== null && customMax !== null) {
    if (customMin >= customMax) {
      return interaction.reply({ content: '❌ Minimum must be less than maximum!', ephemeral: true });
    }
    if (customMax - customMin > 10000) {
      return interaction.reply({ content: '❌ Range too large! Maximum range is 10,000.', ephemeral: true });
    }
    min = customMin;
    max = customMax;
    attempts = Math.min(attempts, Math.max(3, Math.floor(Math.log2(max - min + 1)) + 2));
  }

  const secretNumber = Math.floor(Math.random() * (max - min + 1)) + min;
  const gameId = `guess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const gameState = {
    id: gameId,
    secretNumber,
    min,
    max,
    attempts,
    attemptsUsed: 0,
    guesses: [],
    gameActive: true,
    difficulty,
    startTime: Date.now()
  };

  await sendGuessPrompt(interaction, gameState);
}

async function sendGuessPrompt(interaction, gameState) {
  const { attempts, attemptsUsed, min, max, guesses } = gameState;

  if (attemptsUsed >= attempts) {
    gameState.gameActive = false;
    const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);

    const loseEmbed = new EmbedBuilder()
      .setTitle('❌ Game Over!')
      .setColor(0xFF0000)
      .setDescription(`The secret number was **${gameState.secretNumber}**!\n\nYou used all ${attempts} attempts in ${timeElapsed} seconds.`)
      .addFields({
        name: 'Your Guesses',
        value: guesses.length > 0 ? guesses.map((g, i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join('\n') : 'No guesses made',
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
    .setTitle('🔢 Number Guessing Game')
    .setColor(0x0099FF)
    .setDescription(`I'm thinking of a number between **${min}** and **${max}**.\n\nYou have **${attempts - attemptsUsed}** attempts remaining.`)
    .addFields({
      name: 'Previous Guesses',
      value: guesses.length > 0 ?
        guesses.slice(-5).map((g, i) => `**${g.number}** - ${g.feedback}`).join('\n') :
        'No guesses yet',
      inline: false
    });

  // Create guess button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`guess_modal:${gameState.id}:${min}:${max}`).setLabel('🔢 Make Guess').setStyle(ButtonStyle.Primary)
  );

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [row] });
  } else {
    await interaction.reply({ embeds: [embed], components: [row] });
  }
}

async function sendGuessModal(interaction, gameState) {
  const modal = new ModalBuilder().setCustomId(`guess_submit:${gameState.id}`).setTitle('Make Your Guess');
  const guessInput = new TextInputBuilder()
    .setCustomId('guess_number')
    .setLabel(`Number between ${gameState.min} and ${gameState.max}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder(`${Math.floor((gameState.min + gameState.max) / 2)}`);

  modal.addComponents({ type: 1, components: [guessInput] });
  await interaction.showModal(modal);
}

async function processGuess(interaction, gameState, guess) {
  const guessNum = parseInt(guess);

  if (isNaN(guessNum)) {
    return interaction.reply({ content: '❌ Please enter a valid number!', ephemeral: true });
  }

  if (guessNum < gameState.min || guessNum > gameState.max) {
    return interaction.reply({
      content: `❌ Number must be between ${gameState.min} and ${gameState.max}!`,
      ephemeral: true
    });
  }

  gameState.attemptsUsed++;

  let feedback;
  let isCorrect = false;

  if (guessNum === gameState.secretNumber) {
    feedback = '🎉 Correct! You win!';
    isCorrect = true;
    gameState.gameActive = false;

    // Track win
    updateUserStats(interaction.user.id, { guess_wins: 1 });
  } else if (guessNum < gameState.secretNumber) {
    feedback = '📈 Too low! Try a higher number.';
  } else {
    feedback = '📉 Too high! Try a lower number.';
  }

  // Store guess with feedback
  gameState.guesses.push({
    number: guessNum,
    feedback,
    attempt: gameState.attemptsUsed
  });

  if (isCorrect) {
    const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);
    const attemptsUsed = gameState.attemptsUsed;

    let performanceRating;
    if (attemptsUsed === 1) performanceRating = '🌟 PERFECT! First try!';
    else if (attemptsUsed <= 3) performanceRating = '🥇 Excellent!';
    else if (attemptsUsed <= 5) performanceRating = '🥈 Good job!';
    else if (attemptsUsed <= 7) performanceRating = '🥉 Not bad!';
    else performanceRating = '🎯 You got it!';

    const winEmbed = new EmbedBuilder()
      .setTitle('🎉 Congratulations!')
      .setColor(0x00FF00)
      .setDescription(`You guessed **${gameState.secretNumber}** correctly!\n\n${performanceRating}`)
      .addFields(
        {
          name: '📊 Game Stats',
          value: `**Attempts:** ${attemptsUsed}/${gameState.attempts}\n**Time:** ${timeElapsed}s\n**Difficulty:** ${gameState.difficulty.toUpperCase()}`,
          inline: true
        },
        {
          name: '🏆 Performance',
          value: `**Range:** ${gameState.min}-${gameState.max}\n**Efficiency:** ${Math.round((1 - (attemptsUsed - 1) / gameState.attempts) * 100)}%`,
          inline: true
        }
      );

    if (gameState.guesses.length > 0) {
      winEmbed.addFields({
        name: '📝 Guess History',
        value: gameState.guesses.map((g, i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join('\n'),
        inline: false
      });
    }

    await interaction.update({ embeds: [winEmbed], components: [] });

  } else {
    // Continue game
    await sendGuessPrompt(interaction, gameState);
    await interaction.reply({ content: `**${guessNum}** - ${feedback}`, ephemeral: true });
  }
}