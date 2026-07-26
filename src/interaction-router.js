import { MessageFlags, ChatInputCommandInteraction } from 'discord.js';
import { logCommandExecution, logError, logger } from './logger.js';
import { CommandError, handleCommandError, safeExecuteCommand, validateRange, validateNotEmpty, createRateLimiter } from './errorHandler.js';
import { inputValidator, sanitizeInput, validateUserId } from './validation.js';
import { isOnCooldown, setCooldown, getFormattedCooldown } from './cooldowns.js';
import { wordleWords } from './wordle-data.js';
import { getCharacter } from './rpg.js';
import { handleButtonInteraction } from './button-handlers.js';
import { handleModalSubmit } from './modal-handlers.js';

const INTERACTION_RATE_LIMIT = 5;
const INTERACTION_RATE_WINDOW = 1e4;
const CIRCUIT_BREAKER_MAX_ATTEMPTS = 3;
const CIRCUIT_BREAKER_CLEANUP_TIME = 5 * 60 * 1e3;
const PROCESSED_INTERACTION_CLEANUP_TIME = 10 * 60 * 1e3;

const interactionRateLimiter = createRateLimiter(INTERACTION_RATE_LIMIT, INTERACTION_RATE_WINDOW, (key) => key);
const circuitBreaker = new Map();
const processedInteractions = new Map();

function checkCircuitBreaker(interactionId) {
  const circuitData = circuitBreaker.get(interactionId);
  if (!circuitData) return true;
  const { attempts, lastAttempt } = circuitData;
  const now = Date.now();
  if (now - lastAttempt > CIRCUIT_BREAKER_CLEANUP_TIME) {
    circuitBreaker.delete(interactionId);
    return true;
  }
  return attempts < CIRCUIT_BREAKER_MAX_ATTEMPTS;
}

function recordErrorAttempt(interactionId) {
  const now = Date.now();
  const circuitData = circuitBreaker.get(interactionId) || { attempts: 0, lastAttempt: now };
  circuitData.attempts += 1;
  circuitData.lastAttempt = now;
  circuitBreaker.set(interactionId, circuitData);
  if (circuitBreaker.size > 1e3) {
    for (const [id, data] of circuitBreaker.entries()) {
      if (now - data.lastAttempt > CIRCUIT_BREAKER_CLEANUP_TIME) {
        circuitBreaker.delete(id);
      }
    }
  }
}

async function safeInteractionReply(interaction, options) {
  const interactionId = interaction.id;
  logger.debug('safeInteractionReply called', {
    interactionType: interaction.constructor.name,
    interactionId,
    userId: interaction.user?.id,
    optionsKeys: Object.keys(options || {}),
  });

  if (!checkCircuitBreaker(interactionId)) {
    logger.error(`Circuit breaker tripped - too many error attempts for interaction ${interactionId}`, new Error('Circuit breaker activated'), {
      interactionId,
      userId: interaction.user?.id,
    });
    return false;
  }

  try {
    await interactionRateLimiter.consume(interaction.user.id);
  } catch (error) {
    if (error instanceof CommandError && error.code === 'RATE_LIMITED') {
      logError('Interaction rate limited', error, {
        userId: interaction.user.id,
        interactionId,
      });
      return false;
    }
  }

  if (processedInteractions.has(interactionId)) {
    logger.warn(`Interaction ${interactionId} already processed, ignoring`, {
      userId: interaction.user.id,
      interactionId,
    });
    return false;
  }

  try {
    validateNotEmpty(interaction, 'interaction');
    validateNotEmpty(interaction.user, 'interaction.user');
    validateUserId(interaction.user.id);

    if (interaction.replied || interaction.deferred) {
      logger.warn(`Interaction ${interactionId} already replied/deferred`, {
        userId: interaction.user.id,
        interactionId,
        replied: interaction.replied,
        deferred: interaction.deferred,
      });
      return false;
    }

    processedInteractions.set(interactionId, Date.now());

    const cutoffTime = Date.now() - PROCESSED_INTERACTION_CLEANUP_TIME;
    for (const [id, timestamp] of processedInteractions.entries()) {
      if (timestamp < cutoffTime) {
        processedInteractions.delete(id);
      }
    }

    if (options && 'content' in options && options.content) {
      options.content = sanitizeInput(options.content);
    }

    logger.debug(`Replying to interaction ${interactionId}`, { interactionId });
    await interaction.reply(options);
    return true;
  } catch (error) {
    recordErrorAttempt(interactionId);
    logger.error(`Failed to reply to interaction ${interactionId}`, error instanceof Error ? error : new Error(String(error)), {
      userId: interaction.user?.id,
      interactionType: interaction?.type,
      interactionId,
      interactionState: {
        replied: interaction?.replied,
        deferred: interaction?.deferred,
      },
    });
    return false;
  }
}

async function handleInteraction(interaction, client) {
  const startTime = Date.now();

  try {
    validateNotEmpty(interaction, 'interaction');
    validateNotEmpty(interaction.user, 'interaction.user');
    validateUserId(interaction.user.id);

    try {
      await interactionRateLimiter.consume(interaction.user.id);
    } catch (error) {
      if (error instanceof CommandError && error.code === 'RATE_LIMITED') {
        logError('Global interaction rate limited', error, {
          userId: interaction.user.id,
          interactionType: interaction.type,
        });
        return await safeInteractionReply(interaction, {
          content: '\u23F0 **Rate Limited!** Please slow down and try again in a moment.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const globalCooldown = isOnCooldown(interaction.user.id, 'command_global');
    if (globalCooldown.onCooldown) {
      return await safeInteractionReply(interaction, {
        content: `\u23F0 **Cooldown Active!** Please wait ${getFormattedCooldown(globalCooldown.remaining)} before using another command.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    setCooldown(interaction.user.id, 'command_global');

    if (interaction.isModalSubmit()) {
      await safeExecuteCommand(interaction, () => handleModalSubmit(interaction, client), {
        interactionType: 'modal_submit',
        customId: interaction.customId,
      });
      return;
    }

    if (interaction.isButton()) {
      await safeExecuteCommand(interaction, () => handleButtonInteraction(interaction, client), {
        interactionType: 'button',
        customId: interaction.customId,
      });
      return;
    }

    if (interaction.isChatInputCommand()) {
      const commandCooldown = isOnCooldown(interaction.user.id, interaction.commandName);
      if (commandCooldown.onCooldown) {
        return await safeInteractionReply(interaction, {
          content: `\u23F0 **${interaction.commandName} is on cooldown!** Please wait ${getFormattedCooldown(commandCooldown.remaining)}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        throw new CommandError(`Unknown command: ${interaction.commandName}`, 'INVALID_ARGUMENT');
      }

      if (interaction.commandName === 'explore') {
        const char = getCharacter(interaction.user.id);
        const level = char && typeof char.lvl === 'number' && char.lvl != null ? validateRange(char.lvl, 1, 100, 'character level') : 1;
        const adaptiveCooldown = Math.max(5e3, 3e4 - (level - 1) * 1e3);
        setCooldown(interaction.user.id, 'rpg_explore', adaptiveCooldown);
      }

      const validationResult = inputValidator.validateCommandInput(interaction);
      if (!validationResult.valid) {
        throw new CommandError(validationResult.reason, 'INVALID_ARGUMENT');
      }

      await safeExecuteCommand(interaction, () => command.execute(interaction), {
        interactionType: 'chat_input_command',
        commandName: interaction.commandName,
      });

      setCooldown(interaction.user.id, interaction.commandName);
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logError('[HANDLE_INTERACTION] Error in handleInteraction', error instanceof Error ? error : new Error(String(error)), {
      id: interaction?.id,
      replied: interaction?.replied,
      deferred: interaction?.deferred,
      type: interaction?.type,
      command: interaction instanceof ChatInputCommandInteraction ? interaction.commandName : 'unknown',
      userId: interaction?.user?.id,
    });

    await handleCommandError(
      interaction,
      error instanceof CommandError
        ? error
        : new CommandError(error instanceof Error ? error.message : 'Unknown error occurred', 'UNKNOWN_ERROR', {
            originalError: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            executionTime,
          }),
      {
        command: interaction instanceof ChatInputCommandInteraction ? interaction.commandName : 'unknown',
        userId: interaction?.user?.id,
        guild: interaction?.guild?.name || 'DM',
        channel: interaction?.channel && 'name' in interaction.channel ? interaction.channel.name : 'Unknown',
        executionTime,
      },
    );

    logCommandExecution(interaction, false, error instanceof Error ? error : new Error(String(error)));
  }
}

export { handleInteraction, safeInteractionReply };
