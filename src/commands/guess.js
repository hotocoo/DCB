import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { updateUserStats } from '../achievements.js';
import { guessGames } from '../game-states.js';
import { CommandError, handleCommandError } from '../errorHandler.js';
import { safeInteractionReply, safeInteractionUpdate } from '../interactionHandlers.js';

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
   try {
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
       default:
         throw new CommandError('Invalid difficulty level.', 'INVALID_ARGUMENT');
     }

     // Custom range override with validation
     const customMin = interaction.options.getInteger('custom_min');
     const customMax = interaction.options.getInteger('custom_max');

     if (customMin !== null || customMax !== null) {
       if (customMin === null || customMax === null) {
         throw new CommandError('Both custom minimum and maximum must be provided together.', 'INVALID_ARGUMENT');
       }
       if (customMin >= customMax) {
         throw new CommandError('Minimum must be less than maximum!', 'INVALID_ARGUMENT');
       }
       if (customMax - customMin > 10000) {
         throw new CommandError('Range too large! Maximum range is 10,000.', 'INVALID_ARGUMENT');
       }
       if (customMin < 1 || customMax > 1000000) {
         throw new CommandError('Custom range must be between 1 and 1,000,000.', 'INVALID_ARGUMENT');
       }
       min = customMin;
       max = customMax;
       // Calculate optimal attempts for custom range
       attempts = Math.min(attempts, Math.max(3, Math.floor(Math.log2(max - min + 1)) + 2));
     }

     // Generate secret number
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

     // Store game state
     guessGames.set(gameId, gameState);

     await sendGuessPrompt(interaction, gameState);
   } catch (error) {
     await handleCommandError(interaction, error);
   }
}

async function sendGuessPrompt(interaction, gameState) {
   try {
     const { attempts, attemptsUsed, min, max, guesses } = gameState;

     // Update game state in storage
     guessGames.set(gameState.id, gameState);

     if (attemptsUsed >= attempts) {
       gameState.gameActive = false;
       guessGames.delete(gameState.id); // Clean up completed game
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
         await safeInteractionUpdate(interaction, { embeds: [loseEmbed], components: [] });
       } else {
         await safeInteractionReply(interaction, { embeds: [loseEmbed] });
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
       await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
     } else {
       await safeInteractionReply(interaction, { embeds: [embed], components: [row] });
     }
   } catch (error) {
     console.error('sendGuessPrompt error:', error);
     await handleCommandError(interaction, new CommandError('Failed to update game prompt.', 'UNKNOWN_ERROR', { originalError: error.message }));
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
   try {
     // Validate input
     if (!guess || typeof guess !== 'string') {
       throw new CommandError('Invalid guess input.', 'INVALID_ARGUMENT');
     }

     const guessNum = parseInt(guess.trim());

     if (isNaN(guessNum)) {
       throw new CommandError('Please enter a valid number!', 'INVALID_ARGUMENT');
     }

     if (guessNum < gameState.min || guessNum > gameState.max) {
       throw new CommandError(`Number must be between ${gameState.min} and ${gameState.max}!`, 'INVALID_ARGUMENT');
     }

     gameState.attemptsUsed++;

     let feedback;
     let isCorrect = false;

     if (guessNum === gameState.secretNumber) {
       feedback = '🎉 Correct! You win!';
       isCorrect = true;
       gameState.gameActive = false;

       // Track win with error handling
       try {
         updateUserStats(interaction.user.id, { guess_wins: 1 });
       } catch (statsError) {
         console.error('Failed to update user stats:', statsError);
       }
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
       guessGames.delete(gameState.id); // Clean up completed game
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

       await safeInteractionUpdate(interaction, { embeds: [winEmbed], components: [] });

     } else {
       // Continue game
       await sendGuessPrompt(interaction, gameState);
       await safeInteractionReply(interaction, { content: `**${guessNum}** - ${feedback}`, flags: MessageFlags.Ephemeral });
     }
   } catch (error) {
     console.error('processGuess error:', error);
     await handleCommandError(interaction, error instanceof CommandError ? error :
       new CommandError('Failed to process guess.', 'UNKNOWN_ERROR', { originalError: error.message }));
   }
}