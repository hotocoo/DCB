import { EmbedBuilder } from 'discord.js';
import { logError, logger } from './logger.js';
import { CommandError, safeExecuteCommand } from './errorHandler.js';
import { sanitizeInput, validateUserId } from './validation.js';
import { getCharacter, encounterMonster, fightTurn, applyXp, saveCharacter, addItemToInventory, generateRandomItem, getItemInfo } from './rpg.js';
import { getBalance } from './economy.js';
import { getActiveAuctions } from './trading.js';
import { updateUserStats } from './achievements.js';
import { wordleWords } from './wordle-data.js';

async function handleModalSubmit(interaction, client) {
  const custom = interaction.customId || '';
  try {
    validateNotEmpty(custom, 'modal customId');
    if (custom.startsWith('rpg_reset_confirm:')) {
      const parts = custom.split(':');
      const mode = parts[1] || 'btn';
      const targetUser = parts[2] || interaction.user.id;
      validateUserId(targetUser);
      if (targetUser !== interaction.user.id) {
        throw new CommandError('You cannot confirm reset for another user.', 'PERMISSION_DENIED');
      }
      const text = interaction.fields.getTextInputValue('confirm_text');
      if (!text || text.trim() !== 'RESET') {
        throw new CommandError('Confirmation text did not match. Type RESET to confirm.', 'INVALID_ARGUMENT');
      }
      logger.debug('Modal submit: reset confirmation', { userId: interaction.user.id, mode });
      const className = parts[3] || 'warrior';
      const validation = inputValidator.validateCharacterClass(className);
      if (!validation.valid) {
        throw new CommandError(validation.reason, 'INVALID_ARGUMENT');
      }
      const def = resetCharacter(interaction.user.id, className);
      return await safeInteractionReply(interaction, {
        content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} MP ${def.mp}/${def.maxMp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (custom.startsWith('guess_submit:')) {
      const [, gameId] = custom.split(':');
      logger.debug('Processing guess_submit', { gameId });
      const gameState = guessGames.get(gameId);
      logger.debug('Guess game state lookup', { found: !!gameState, type: typeof gameState });
      if (!gameState) {
        await safeInteractionReply(interaction, { content: '\u274C **Game not found!** The game may have expired.', flags: MessageFlags.Ephemeral });
      }
      if (!gameState.gameActive) {
        await safeInteractionReply(interaction, { content: '\u274C **Game is no longer active!**', flags: MessageFlags.Ephemeral });
      }
      const guess = interaction.fields.getTextInputValue('guess_number');
      logger.debug('Guess input retrieved', { guess, type: typeof guess });
      if (!guess || typeof guess !== 'string') {
        throw new CommandError('Invalid guess input.', 'INVALID_ARGUMENT');
      }
      const guessNum = Number.parseInt(guess.trim());
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
        feedback = '\u{1F389} Correct! You win!';
        isCorrect = true;
        gameState.gameActive = false;
      } else if (guessNum < gameState.secretNumber) {
        feedback = '\u{1F4C8} Too low! Try a higher number.';
      } else {
        feedback = '\u{1F4C9} Too high! Try a lower number.';
      }
      gameState.guesses.push({
        number: guessNum,
        feedback,
        attempt: gameState.attemptsUsed,
      });
      if (isCorrect) {
        guessGames.delete(gameId);
        const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1e3);
        const attemptsUsed = gameState.attemptsUsed;
        let performanceRating;
        if (attemptsUsed === 1) performanceRating = '\u{1F31F} PERFECT! First try!';
        else if (attemptsUsed <= 3) performanceRating = '\u{1F947} Excellent!';
        else if (attemptsUsed <= 5) performanceRating = '\u{1F948} Good job!';
        else if (attemptsUsed <= 7) performanceRating = '\u{1F949} Not bad!';
        else performanceRating = '\u{1F3AF} You got it!';
        const embed = new EmbedBuilder()
          .setTitle('\u{1F389} Congratulations!')
          .setColor(65_280)
          .setDescription(
            `You guessed **${gameState.secretNumber}** correctly!

${performanceRating}`,
          )
          .addFields(
            {
              name: '\u{1F4CA} Game Stats',
              value: `**Attempts:** ${attemptsUsed}/${gameState.attempts}
**Time:** ${timeElapsed}s
**Difficulty:** ${gameState.difficulty.toUpperCase()}`,
              inline: true,
            },
            {
              name: '\u{1F3C6} Performance',
              value: `**Range:** ${gameState.min}-${gameState.max}
**Efficiency:** ${Math.round((1 - (attemptsUsed - 1) / gameState.attempts) * 100)}%`,
              inline: true,
            },
          );
        if (gameState.guesses.length > 0) {
          embed.addFields({
            name: '\u{1F4DD} Guess History',
            value: gameState.guesses.map((g, i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join('\n'),
            inline: false,
          });
        }
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } else {
        const { attempts, attemptsUsed: currentAttemptsUsed, min, max, guesses } = gameState;
        if (currentAttemptsUsed >= attempts) {
          gameState.gameActive = false;
          guessGames.delete(gameId);
          const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1e3);
          const loseEmbed = new EmbedBuilder()
            .setTitle('\u274C Game Over!')
            .setColor(16_711_680)
            .setDescription(
              `The secret number was **${gameState.secretNumber}**!

You used all ${attempts} attempts in ${timeElapsed} seconds.`,
            )
            .addFields({
              name: 'Your Guesses',
              value: guesses.length > 0 ? guesses.map((g, i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join('\n') : 'No guesses made',
              inline: false,
            });
          await safeInteractionUpdate(interaction, { embeds: [loseEmbed], components: [] });
        }
        const embed = new EmbedBuilder()
          .setTitle('\u{1F522} Number Guessing Game')
          .setColor(39_423)
          .setDescription(
            `I'm thinking of a number between **${min}** and **${max}**.

You have **${attempts - currentAttemptsUsed}** attempts remaining.

**${guessNum}** - ${feedback}`,
          )
          .addFields({
            name: 'Previous Guesses',
            value:
              guesses.length > 0
                ? guesses
                    .slice(-5)
                    .map((g, i) => `**${g.number}** - ${g.feedback}`)
                    .join('\n')
                : 'No guesses yet',
            inline: false,
          });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`guess_modal:${gameId}:${min}:${max}`).setLabel('\u{1F522} Make Guess').setStyle(ButtonStyle.Primary),
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      }
    }
    if (custom.startsWith('guess_modal:')) {
      const parts = custom.split(':');
      const [, gameId, minStr, maxStr] = parts;
      const min = minStr ? Number.parseInt(minStr) : 1;
      const max = maxStr ? Number.parseInt(maxStr) : 100;
      if (isNaN(min) || isNaN(max) || min >= max) {
        return safeInteractionReply(interaction, {
          content: '\u274C **Invalid game parameters!** Please start a new game.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const gameState = guessGames.get(gameId);
      if (!gameState) {
        return safeInteractionReply(interaction, {
          content: '\u274C **Game not found!** The game may have expired.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (!gameState.gameActive) {
        return safeInteractionReply(interaction, {
          content: '\u274C **Game is no longer active!**',
          flags: MessageFlags.Ephemeral,
        });
      }
      const modal = new ModalBuilder().setCustomId(`guess_submit:${gameId}`).setTitle('Make Your Guess');
      const guessInput = new TextInputBuilder()
        .setCustomId('guess_number')
        .setLabel(`Guess a number between ${min} and ${max}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(`${min}-${max}`);
      modal.addComponents(guessInput);
      await interaction.showModal(modal);
    }
    throw new CommandError(`Unknown modal type: ${custom}`, 'INVALID_ARGUMENT');
  } catch (error) {
    logger.error('Modal submit error', error instanceof Error ? error : new Error(String(error)), {
      customId: custom,
      userId: interaction.user.id,
    });
    await handleCommandError(
      interaction,
      error instanceof CommandError
        ? error
        : new CommandError('An error occurred while processing the modal.', 'UNKNOWN_ERROR', {
            originalError: error instanceof Error ? error.message : String(error),
          }),
    );
  }
}
