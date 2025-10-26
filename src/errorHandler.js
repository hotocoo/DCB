// Standardized error handling utilities for commands
export class CommandError extends Error {
  constructor(message, code = 'COMMAND_ERROR', details = {}) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.details = details;
    this.userMessage = this.getUserFriendlyMessage();
  }

  getUserFriendlyMessage() {
    const messages = {
      'COMMAND_ERROR': 'An error occurred while executing this command. Please try again.',
      'PERMISSION_DENIED': 'You do not have permission to use this command.',
      'INVALID_ARGUMENT': 'Invalid argument provided. Please check the command usage.',
      'COOLDOWN_ACTIVE': 'This command is on cooldown. Please wait before using it again.',
      'INSUFFICIENT_FUNDS': 'You do not have enough funds to perform this action.',
      'USER_NOT_FOUND': 'The specified user was not found.',
      'CHANNEL_NOT_FOUND': 'The specified channel was not found.',
      'ROLE_NOT_FOUND': 'The specified role was not found.',
      'GUILD_ONLY': 'This command can only be used in a server.',
      'DM_ONLY': 'This command can only be used in direct messages.',
      'MISSING_PERMISSIONS': 'I am missing the required permissions to execute this command.',
      'API_ERROR': 'External service is currently unavailable. Please try again later.',
      'RATE_LIMITED': 'Too many requests. Please slow down and try again.',
      'INVALID_FORMAT': 'Invalid format. Please check the required format for this command.',
      'OUT_OF_RANGE': 'Value is out of the allowed range.',
      'ALREADY_EXISTS': 'This item already exists.',
      'NOT_FOUND': 'The requested item was not found.',
      'NETWORK_ERROR': 'Network error occurred. Please check your connection and try again.',
      'UNKNOWN_ERROR': 'An unknown error occurred. Please contact support if this persists.'
    };

    return messages[this.code] || messages['COMMAND_ERROR'];
  }
}

export function handleCommandError(interaction, error, context = {}) {
  console.error('Command error occurred:', {
    command: interaction?.commandName,
    user: interaction?.user?.id,
    guild: interaction?.guild?.id,
    error: error.message,
    code: error.code,
    details: error.details,
    context
  });

  let userMessage = error.userMessage || error.message;

  // Provide development-friendly messages in development mode
  if (process.env.NODE_ENV === 'development') {
    userMessage = `❌ **Error:** ${error.message}\n\n**Code:** ${error.code}\n**Details:** ${JSON.stringify(error.details, null, 2)}`;
  }

  const responseOptions = {
    content: userMessage,
    ephemeral: true
  };

  // Add helpful hints for common errors
  if (error.code === 'PERMISSION_DENIED') {
    responseOptions.content += '\n\n💡 *Make sure you have the required permissions or roles.*';
  } else if (error.code === 'COOLDOWN_ACTIVE') {
    responseOptions.content += '\n\n💡 *You can use other commands while waiting.*';
  } else if (error.code === 'INVALID_ARGUMENT') {
    responseOptions.content += '\n\n💡 *Use `/help` for command usage information.*';
  } else if (error.code === 'INSUFFICIENT_FUNDS') {
    responseOptions.content += '\n\n💡 *Earn more gold through work, businesses, or trading.*';
  }

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(responseOptions);
  } else {
    return interaction.reply(responseOptions);
  }
}

export async function safeExecuteCommand(interaction, commandFunction, context = {}) {
  try {
    return await commandFunction(interaction);
  } catch (error) {
    if (error instanceof CommandError) {
      await handleCommandError(interaction, error, context);
    } else {
      // Wrap unknown errors in CommandError
      const commandError = new CommandError(
        error.message || 'Unknown error occurred',
        'UNKNOWN_ERROR',
        { originalError: error.message, stack: error.stack }
      );
      await handleCommandError(interaction, commandError, context);
    }
  }
}

// Common validation helpers
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

export function validateGuild(interaction) {
  if (!interaction.guild) {
    throw new CommandError('This command can only be used in a server.', 'GUILD_ONLY');
  }

  return interaction.guild;
}

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

  return true;
}

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

export function validateNotEmpty(value, fieldName = 'field') {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new CommandError(`${fieldName} cannot be empty.`, 'INVALID_ARGUMENT');
  }

  return value;
}

// Rate limiting helper
export function createRateLimiter(points, duration, keyGenerator) {
  const requests = new Map();

  return {
    async consume(key) {
      const now = Date.now();
      const userKey = keyGenerator ? keyGenerator(key) : key;
      const userRequests = requests.get(userKey) || [];

      // Remove old requests outside the window
      const validRequests = userRequests.filter(time => now - time < duration);

      if (validRequests.length >= points) {
        throw new CommandError(
          'Rate limit exceeded. Please slow down.',
          'RATE_LIMITED',
          { points, duration, remaining: Math.ceil((validRequests[0] + duration - now) / 1000) }
        );
      }

      validRequests.push(now);
      requests.set(userKey, validRequests);

      return true;
    }
  };
}

// Retry helper for API calls
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

      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}