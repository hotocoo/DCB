/**
 * Standardized error handling utilities for Discord bot commands.
 * Provides structured error handling, user-friendly messages, and validation helpers.
 */

import { logError } from './logger.js';

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
 * @param {object} interaction - Discord interaction object
 * @param {CommandError|Error} error - The error that occurred
 * @param {object} context - Additional context for logging
 * @returns {Promise} Promise resolving to the interaction response
 */
/**
 * Circuit breaker check imported from interactionHandlers.js
 * This prevents recursive error handling loops.
 * @param {string} interactionId - The interaction identifier
 * @returns {boolean} True if operation can proceed, false if circuit is broken
 */
function checkCircuitBreaker(interactionId) {
  try {
    // Dynamic import to avoid circular dependencies
    const { circuitBreakerMap } = require('./interactionHandlers.js');
    const circuitData = circuitBreakerMap.get(interactionId);
    if (!circuitData) return true;

    const { attempts, lastAttempt } = circuitData;
    const now = Date.now();
    const CIRCUIT_BREAKER_CLEANUP_TIME = 5 * 60 * 1000; // 5 minutes

    if (now - lastAttempt > CIRCUIT_BREAKER_CLEANUP_TIME) {
      circuitBreakerMap.delete(interactionId);
      return true;
    }

    const CIRCUIT_BREAKER_MAX_ATTEMPTS = 3;
    return attempts < CIRCUIT_BREAKER_MAX_ATTEMPTS;
  } catch (error) {
    // If import fails, allow operation to proceed
    console.warn('[CIRCUIT_BREAKER] Failed to access circuit breaker, allowing operation:', error.message);
    return true;
  }
}

export async function handleCommandError(interaction, error, context = {}) {
   const interactionId = interaction?.id;

   // Check circuit breaker before attempting error response
   if (interactionId && !checkCircuitBreaker(interactionId)) {
     console.error('[HANDLE_COMMAND_ERROR] Circuit breaker tripped for interaction, skipping error response');
     logError('Circuit breaker tripped - cannot send error response', new Error('Circuit breaker activated'), {
       originalCommand: interaction?.commandName,
       originalError: error.message,
       interactionId
     });
     return;
   }

   // Log the error with structured information
   logError('Command error occurred', error, {
     command: interaction?.commandName,
     user: interaction?.user?.id,
     guild: interaction?.guild?.id,
     code: error.code,
     details: error.details,
     ...context
   });

   // Determine user message based on environment
   let userMessage = error.userMessage || error.message;

   if (process.env.NODE_ENV === 'development') {
     userMessage = `❌ **Error:** ${error.message}\n\n**Code:** ${error.code}\n**Details:** ${JSON.stringify(error.details, null, 2)}`;
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

   if (hints[error.code]) {
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
       commandName: interaction?.commandName
     });

     // Check for DiscordAPIError[10062]: Unknown interaction specifically
     if (interaction && !interaction.replied && !interaction.deferred) {
       try {
         console.error('[HANDLE_COMMAND_ERROR] Using reply');
         await interaction.reply(responseOptions);
         return;
       } catch (replyError) {
         if (replyError.code === 10062) {
           console.error('[HANDLE_COMMAND_ERROR] Interaction already expired/replied, cannot send error response');
           logError('Cannot send error response - interaction expired', replyError, {
             originalCommand: interaction?.commandName,
             originalError: error.message,
             interactionId: interaction?.id
           });
           return;
         }
         throw replyError; // Re-throw other errors
       }
     } else if (interaction && (interaction.replied || interaction.deferred)) {
       try {
         console.error('[HANDLE_COMMAND_ERROR] Using followUp');
         await interaction.followUp(responseOptions);
         return;
       } catch (followUpError) {
         if (followUpError.code === 10062) {
           console.error('[HANDLE_COMMAND_ERROR] Interaction already expired, cannot send followUp error response');
           logError('Cannot send followUp error response - interaction expired', followUpError, {
             originalCommand: interaction?.commandName,
             originalError: error.message,
             interactionId: interaction?.id
           });
           return;
         }
         throw followUpError; // Re-throw other errors
       }
     } else {
       console.error('[HANDLE_COMMAND_ERROR] Interaction object invalid or already handled');
       logError('Invalid interaction state for error response', new Error('Invalid interaction object'), {
         originalCommand: interaction?.commandName,
         originalError: error.message,
         interactionId: interaction?.id,
         interactionExists: !!interaction
       });
       return;
     }
   } catch (responseError) {
     console.error('[HANDLE_COMMAND_ERROR] Failed to send error response:', responseError.message);
     console.error('[HANDLE_COMMAND_ERROR] Response error details:', {
       responseError: responseError.message,
       stack: responseError.stack,
       interactionId: interaction?.id,
       originalError: error.message,
       errorCode: responseError.code
     });

     // If we can't send a response, log it and continue - don't attempt to log error response failure recursively
     logError('Failed to send error response to user', responseError, {
       originalCommand: interaction?.commandName,
       originalError: error.message,
       interactionReplied: interaction?.replied,
       interactionDeferred: interaction?.deferred,
       errorCode: responseError.code
     });
   }
 }

/**
 * Safely executes a command function with error handling.
 * @param {object} interaction - Discord interaction object
 * @param {Function} commandFunction - The command function to execute
 * @param {object} context - Additional context for error handling
 * @returns {Promise} Promise resolving to command result or error response
 */
export async function safeExecuteCommand(interaction, commandFunction, context = {}) {
  try {
    return await commandFunction(interaction);
  } catch (error) {
    // Log immediately before any interaction attempts
    console.error('[SAFE_EXECUTE_COMMAND] Error occurred:', error.message);
    console.error('[SAFE_EXECUTE_COMMAND] Error stack:', error.stack);
    console.error('[SAFE_EXECUTE_COMMAND] Interaction state:', {
      id: interaction?.id,
      replied: interaction?.replied,
      deferred: interaction?.deferred,
      type: interaction?.type,
      commandName: interaction?.commandName
    });

    if (error instanceof CommandError) {
      await handleCommandError(interaction, error, context);
    } else {
      // Wrap unknown errors in CommandError for consistency
      const commandError = new CommandError(
        error.message || 'Unknown error occurred',
        'UNKNOWN_ERROR',
        { originalError: error.message, stack: error.stack }
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
 * @param {object} interaction - Discord interaction object
 * @param {string} userId - User ID to validate
 * @returns {object} Discord user object
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
 * @param {object} interaction - Discord interaction object
 * @param {string} channelId - Channel ID to validate
 * @returns {object} Discord channel object
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
 * @param {object} interaction - Discord interaction object
 * @param {string} roleId - Role ID to validate
 * @returns {object} Discord role object
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
 * @param {object} interaction - Discord interaction object
 * @returns {object} Discord guild object
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
 * @param {object} interaction - Discord interaction object
 * @param {Array<string>} permissions - Array of permission strings
 * @throws {CommandError} If user lacks required permissions
 */
export function validatePermissions(interaction, permissions) {
  if (!interaction.member) {
    throw new CommandError('Unable to verify permissions.', 'PERMISSION_DENIED');
  }

  const missingPermissions = permissions.filter(perm =>
    !interaction.member.permissions.has(perm)
  );

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
      const validRequests = userRequests.filter(time => now - time < duration);

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
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} delay - Base delay between retries in milliseconds
 * @returns {Promise} Promise resolving to operation result
 * @throws {CommandError} If all retries are exhausted
 */
export async function retryAsync(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw new CommandError(
          `Operation failed after ${maxRetries} attempts: ${error.message}`,
          'API_ERROR',
          { originalError: error.message, attempts: maxRetries }
        );
      }

      // Log retry attempt (using console.log for simplicity, could use logger)
      console.log(`Attempt ${attempt} failed, retrying in ${delay * attempt}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}