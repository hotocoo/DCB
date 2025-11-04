/**
 * Standardized error handling utilities for Discord bot commands.
 * Provides structured error handling, user-friendly messages, and validation helpers.
 */

import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

import { logError } from './logger.js';

// Type definitions for Discord.js interactions
/**
 * @typedef {import('discord.js').ChatInputCommandInteraction | import('discord.js').ButtonInteraction | import('discord.js').ModalSubmitInteraction} DiscordInteraction
 */
/**
 * @typedef {import('discord.js').Client} DiscordClient
 */
/**
 * @typedef {import('discord.js').User} DiscordUser
 */
/**
 * @typedef {import('discord.js').Guild} DiscordGuild
 */
/**
 * @typedef {import('discord.js').Channel} DiscordChannel
 */
/**
 * @typedef {import('discord.js').Role} DiscordRole
 */
/**
 * @typedef {import('discord.js').GuildMember} DiscordGuildMember
 */
/**
 * @typedef {import('discord.js').Message} DiscordMessage
 */

/**
 * Circuit breaker configuration constants.
 */
const CIRCUIT_BREAKER_MAX_ATTEMPTS = 3;
const CIRCUIT_BREAKER_CLEANUP_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Retry configuration defaults.
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Error codes and their corresponding user-friendly messages.
 */
const ERROR_MESSAGES = {
  COMMAND_ERROR: 'An error occurred while executing this command. Please try again.',
  PERMISSION_DENIED: 'You do not have permission to use this command.',
  INVALID_ARGUMENT: 'Invalid argument provided. Please check the command usage.',
  COOLDOWN_ACTIVE: 'This command is on cooldown. Please wait before using it again.',
  INSUFFICIENT_FUNDS: 'You do not have enough funds to perform this action.',
  USER_NOT_FOUND: 'The specified user was not found.',
  CHANNEL_NOT_FOUND: 'The specified channel was not found.',
  ROLE_NOT_FOUND: 'The specified role was not found.',
  GUILD_ONLY: 'This command can only be used in a server.',
  DM_ONLY: 'This command can only be used in direct messages.',
  MISSING_PERMISSIONS: 'I am missing the required permissions to execute this command.',
  API_ERROR: 'External service is currently unavailable. Please try again later.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again.',
  INVALID_FORMAT: 'Invalid format. Please check the required format for this command.',
  OUT_OF_RANGE: 'Value is out of the allowed range.',
  ALREADY_EXISTS: 'This item already exists.',
  NOT_FOUND: 'The requested item was not found.',
  NETWORK_ERROR: 'Network error occurred. Please check your connection and try again.',
  UNKNOWN_ERROR: 'An unknown error occurred. Please contact support if this persists.'
};

/**
 * Custom error class for command-related errors.
 */
export class CommandError extends Error {
  /**
   * Creates a new CommandError instance.
   * @param {string} message - Error message
   * @param {string} code - Error code from ERROR_MESSAGES
   * @param {object} details - Additional error details
   */
  constructor(message, code = 'COMMAND_ERROR', details = {}) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.details = details;
    this.userMessage = this.getUserFriendlyMessage();
  }

  /**
   * Gets a user-friendly message for the error code.
   * @returns {string} User-friendly error message
   */
  getUserFriendlyMessage() {
    return ERROR_MESSAGES[this.code] || ERROR_MESSAGES.COMMAND_ERROR;
  }
}

/**
 * Handles command errors by logging and responding to the user.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @param {CommandError|Error} error - The error that occurred
 * @param {object} context - Additional context for logging
 * @returns {Promise<void>} Promise resolving to the interaction response
 */
/**
 * Circuit breaker check imported from interactionHandlers.js
 * This prevents recursive error handling loops.
 * @param {string} interactionId - The interaction identifier
 * @returns {Promise<boolean>} True if operation can proceed, false if circuit is broken
 */
async function checkCircuitBreaker(interactionId) {
  try {
    // Dynamic import to avoid circular dependencies
    const { circuitBreakerMap } = await import('./interactionHandlers.js');
    const circuitData = circuitBreakerMap.get(interactionId);
    if (!circuitData) return true;

    const { attempts, lastAttempt } = circuitData;
    const now = Date.now();

    if (now - lastAttempt > CIRCUIT_BREAKER_CLEANUP_TIME) {
      circuitBreakerMap.delete(interactionId);
      return true;
    }

    return attempts < CIRCUIT_BREAKER_MAX_ATTEMPTS;
  }
  catch (error) {
    // If import fails, allow operation to proceed
    console.warn('[CIRCUIT_BREAKER] Failed to access circuit breaker, allowing operation:', error instanceof Error ? error.message : String(error));
    return true;
  }
}

/**
 * @param {DiscordInteraction} interaction
 * @param {CommandError|Error} error
 * @param {object} context
 */
export async function handleCommandError(interaction, error, context = {}) {
  const interactionId = interaction?.id;

  // Check circuit breaker before attempting error response
  if (interactionId && !(await checkCircuitBreaker(interactionId))) {
    console.error('[HANDLE_COMMAND_ERROR] Circuit breaker tripped for interaction, skipping error response');
    logError('Circuit breaker tripped - cannot send error response', new Error('Circuit breaker activated'), {
      originalCommand: 'commandName' in interaction ? interaction.commandName : undefined,
      originalError: error instanceof Error ? error.message : String(error),
      interactionId
    });
    return;
  }

  // Log the error with structured information
  logError('Command error occurred', error, {
    command: 'commandName' in interaction ? interaction.commandName : undefined,
    user: interaction?.user?.id,
    guild: interaction?.guild?.id,
    code: 'code' in error ? error.code : undefined,
    details: 'details' in error ? error.details : undefined,
    ...context
  });

  // Determine user message based on environment
  let userMessage = ('userMessage' in error ? error.userMessage : undefined) || error.message;

  if (process.env.NODE_ENV === 'development') {
    userMessage = `❌ **Error:** ${error.message}\n\n**Code:** ${'code' in error ? error.code : 'N/A'}\n**Details:** ${JSON.stringify('details' in error ? error.details : {}, null, 2)}`;
  }

  const responseOptions = {
    content: userMessage,
    ephemeral: true
  };

  // Add helpful hints for common errors
  const hints = {
    PERMISSION_DENIED: '\n\n💡 *Make sure you have the required permissions or roles.*',
    COOLDOWN_ACTIVE: '\n\n💡 *You can use other commands while waiting.*',
    INVALID_ARGUMENT: '\n\n💡 *Use `/help` for command usage information.*',
    INSUFFICIENT_FUNDS: '\n\n💡 *Earn more gold through work, businesses, or trading.*'
  };

  if ('code' in error && error.code && error.code in hints) {
    // @ts-ignore
    responseOptions.content += hints[error.code];
  }

  // Send appropriate response based on interaction state with enhanced error handling
  try {
    console.error('[HANDLE_COMMAND_ERROR] Attempting to send error response');
    console.error('[HANDLE_COMMAND_ERROR] Interaction state before response:', {
      id: interaction?.id,
      replied: interaction?.replied,
      deferred: interaction?.deferred,
      type: interaction?.type,
      commandName: 'commandName' in interaction ? interaction.commandName : undefined
    });

    // Check for DiscordAPIError[10062]: Unknown interaction specifically
    if (interaction && !interaction.replied && !interaction.deferred) {
      try {
        console.error('[HANDLE_COMMAND_ERROR] Using reply');
        await interaction.reply(responseOptions);
        return;
      }
      catch (replyError) {
        if (replyError instanceof Error && 'code' in replyError && replyError.code === 10_062) {
          console.error('[HANDLE_COMMAND_ERROR] Interaction already expired/replied, cannot send error response');
          logError('Cannot send error response - interaction expired', replyError, {
            originalCommand: 'commandName' in interaction ? interaction.commandName : undefined,
            originalError: error instanceof Error ? error.message : String(error),
            interactionId: interaction?.id
          });
          return;
        }
        throw replyError; // Re-throw other errors
      }
    }
    else if (interaction && (interaction.replied || interaction.deferred)) {
      try {
        console.error('[HANDLE_COMMAND_ERROR] Using followUp');
        await interaction.followUp(responseOptions);
        return;
      }
      catch (followUpError) {
        if (followUpError instanceof Error && 'code' in followUpError && followUpError.code === 10_062) {
          console.error('[HANDLE_COMMAND_ERROR] Interaction already expired, cannot send followUp error response');
          logError('Cannot send followUp error response - interaction expired', followUpError, {
            originalCommand: 'commandName' in interaction ? interaction.commandName : undefined,
            originalError: error instanceof Error ? error.message : String(error),
            interactionId: interaction?.id
          });
          return;
        }
        throw followUpError; // Re-throw other errors
      }
    }
    else {
      console.error('[HANDLE_COMMAND_ERROR] Interaction object invalid or already handled');
      logError('Invalid interaction state for error response', new Error('Invalid interaction object'), {
        originalCommand: 'commandName' in interaction ? interaction.commandName : undefined,
        originalError: error instanceof Error ? error.message : String(error),
        interactionId: interaction?.id,
        interactionExists: !!interaction
      });
      return;
    }
  }
  catch (responseError) {
    console.error('[HANDLE_COMMAND_ERROR] Failed to send error response:', responseError instanceof Error ? responseError.message : String(responseError));
    console.error('[HANDLE_COMMAND_ERROR] Response error details:', {
      responseError: responseError instanceof Error ? responseError.message : String(responseError),
      stack: responseError instanceof Error ? responseError.stack : undefined,
      interactionId: interaction?.id,
      originalError: error instanceof Error ? error.message : String(error),
      errorCode: responseError instanceof Error && 'code' in responseError ? responseError.code : undefined
    });

    // If we can't send a response, log it and continue - don't attempt to log error response failure recursively
    logError('Failed to send error response to user', responseError instanceof Error ? responseError : new Error(String(responseError)), {
      originalCommand: 'commandName' in interaction ? interaction.commandName : undefined,
      originalError: error instanceof Error ? error.message : String(error),
      interactionReplied: interaction?.replied,
      interactionDeferred: interaction?.deferred,
      errorCode: responseError instanceof Error && 'code' in responseError ? responseError.code : undefined
    });
  }
}

/**
 * Safely executes a command function with error handling.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @param {Function} commandFunction - The command function to execute
 * @param {object} context - Additional context for error handling
 * @returns {Promise<any>} Promise resolving to command result or error response
 */
export async function safeExecuteCommand(interaction, commandFunction, context = {}) {
  try {
    return await commandFunction(interaction);
  }
  catch (error) {
    // Log immediately before any interaction attempts
    console.error('[SAFE_EXECUTE_COMMAND] Error occurred:', error instanceof Error ? error.message : String(error));
    console.error('[SAFE_EXECUTE_COMMAND] Error stack:', error instanceof Error ? error.stack : undefined);
    console.error('[SAFE_EXECUTE_COMMAND] Interaction state:', {
      id: interaction?.id,
      replied: interaction?.replied,
      deferred: interaction?.deferred,
      type: interaction?.type,
      commandName: 'commandName' in interaction ? interaction.commandName : undefined
    });

    if (error instanceof CommandError) {
      await handleCommandError(interaction, error, context);
    }
    else {
      // Wrap unknown errors in CommandError for consistency
      const commandError = new CommandError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'UNKNOWN_ERROR',
        { originalError: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }
      );
      await handleCommandError(interaction, commandError, context);
    }
  }
}

/**
 * Validation helpers for common Discord entities and values.
 */

/**
 * Validates and retrieves a user by ID.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @param {string} userId - User ID to validate
 * @returns {DiscordUser} Discord user object
 * @throws {CommandError} If user is not found or ID is invalid
 */
export function validateUser(interaction, userId) {
  if (!userId) {
    throw new CommandError('User ID is required.', 'INVALID_ARGUMENT');
  }

  const user = interaction.client.users.cache.get(userId) ||
                interaction.guild?.members.cache.get(userId)?.user;

  if (!user) {
    throw new CommandError('User not found.', 'USER_NOT_FOUND');
  }

  return user;
}

/**
 * Validates and retrieves a channel by ID.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @param {string} channelId - Channel ID to validate
 * @returns {DiscordChannel} Discord channel object
 * @throws {CommandError} If channel is not found or ID is invalid
 */
export function validateChannel(interaction, channelId) {
  if (!channelId) {
    throw new CommandError('Channel ID is required.', 'INVALID_ARGUMENT');
  }

  const channel = interaction.client.channels.cache.get(channelId) ||
                   interaction.guild?.channels.cache.get(channelId);

  if (!channel) {
    throw new CommandError('Channel not found.', 'CHANNEL_NOT_FOUND');
  }

  return channel;
}

/**
 * Validates and retrieves a role by ID.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @param {string} roleId - Role ID to validate
 * @returns {DiscordRole} Discord role object
 * @throws {CommandError} If role is not found or ID is invalid
 */
export function validateRole(interaction, roleId) {
  if (!roleId) {
    throw new CommandError('Role ID is required.', 'INVALID_ARGUMENT');
  }

  const role = interaction.guild?.roles.cache.get(roleId);

  if (!role) {
    throw new CommandError('Role not found.', 'ROLE_NOT_FOUND');
  }

  return role;
}

/**
 * Validates that the command is being used in a guild.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @returns {DiscordGuild} Discord guild object
 * @throws {CommandError} If command is not used in a guild
 */
export function validateGuild(interaction) {
  if (!interaction.guild) {
    throw new CommandError('This command can only be used in a server.', 'GUILD_ONLY');
  }

  return interaction.guild;
}

/**
 * Validates that the user has the required permissions.
 * @param {DiscordInteraction} interaction - Discord interaction object
 * @param {Array<string>} permissions - Array of permission strings
 * @throws {CommandError} If user lacks required permissions
 */
export function validatePermissions(interaction, permissions) {
  if (!interaction.member) {
    throw new CommandError('Unable to verify permissions.', 'PERMISSION_DENIED');
  }

  const memberPermissions = interaction.member?.permissions;
  const missingPermissions = permissions.filter(perm => {
    // @ts-ignore
    const permBit = PermissionFlagsBits[perm];
    if (typeof memberPermissions === 'string') {
      // Permissions string - not supported for checking individual permissions
      return true; // Assume missing if we can't check
    }
    else if (memberPermissions instanceof PermissionsBitField) {
      return !memberPermissions.has(permBit);
    }
    return true; // Fallback
  });

  if (missingPermissions.length > 0) {
    throw new CommandError(
      `Missing permissions: ${missingPermissions.join(', ')}`,
      'PERMISSION_DENIED',
      { required: permissions, missing: missingPermissions }
    );
  }
}

/**
 * Validates that a value is within a specified range.
 * @param {number} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {number} The validated value
 * @throws {CommandError} If value is out of range
 */
export function validateRange(value, min, max, fieldName = 'value') {
  if (value < min || value > max) {
    throw new CommandError(
      `${fieldName} must be between ${min} and ${max}.`,
      'OUT_OF_RANGE',
      { value, min, max }
    );
  }

  return value;
}

/**
 * Validates that a value is not empty.
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {any} The validated value
 * @throws {CommandError} If value is empty
 */
export function validateNotEmpty(value, fieldName = 'field') {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new CommandError(`${fieldName} cannot be empty.`, 'INVALID_ARGUMENT');
  }

  return value;
}

/**
 * Rate limiting helper for controlling request frequency.
 * @param {number} points - Number of requests allowed
 * @param {number} duration - Time window in milliseconds
 * @param {Function} keyGenerator - Optional function to generate keys
 * @returns {object} Rate limiter object with consume method
 */
export function createRateLimiter(points, duration, keyGenerator) {
  const requests = new Map();

  return {
    /**
     * Consumes a request point for the given key.
     * @param {string} key - Identifier for rate limiting
     * @throws {CommandError} If rate limit is exceeded
     */
    async consume(key) {
      const now = Date.now();
      const userKey = keyGenerator ? keyGenerator(key) : key;
      const userRequests = requests.get(userKey) || [];

      // Remove requests outside the current time window
      const validRequests = userRequests.filter((/** @type {number} */ time) => now - time < duration);

      if (validRequests.length >= points) {
        const resetTime = validRequests[0] + duration;
        throw new CommandError(
          'Rate limit exceeded. Please slow down.',
          'RATE_LIMITED',
          {
            points,
            duration,
            remaining: Math.ceil((resetTime - now) / 1000)
          }
        );
      }

      validRequests.push(now);
      requests.set(userKey, validRequests);

      return true;
    }
  };
}

/**
 * Retry helper for async operations with exponential backoff.
 * @param {Function} operation - Async function to retry
 * @param {number} [maxRetries=DEFAULT_MAX_RETRIES] - Maximum number of retry attempts
 * @param {number} [delay=DEFAULT_RETRY_DELAY] - Base delay between retries in milliseconds
 * @returns {Promise<any>} Promise resolving to operation result
 * @throws {CommandError} If all retries are exhausted
 */
export async function retryAsync(operation, maxRetries = DEFAULT_MAX_RETRIES, delay = DEFAULT_RETRY_DELAY) {
  if (typeof operation !== 'function') {
    throw new CommandError('Operation must be a function.', 'INVALID_ARGUMENT');
  }

  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new CommandError('maxRetries must be a non-negative integer.', 'INVALID_ARGUMENT');
  }

  if (!Number.isFinite(delay) || delay < 0) {
    throw new CommandError('delay must be a non-negative number.', 'INVALID_ARGUMENT');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    }
    catch (error) {
      if (attempt === maxRetries) {
        throw new CommandError(
          `Operation failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
          'API_ERROR',
          { originalError: error instanceof Error ? error.message : String(error), attempts: maxRetries }
        );
      }

      // Log retry attempt using logger instead of console.log
      logError(`Retry attempt ${attempt} failed, retrying in ${delay * attempt}ms`, error instanceof Error ? error : new Error(String(error)), {
        attempt,
        maxRetries,
        delay: delay * attempt
      });
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}