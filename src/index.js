/**
 * Main entry point for the Pulse Bot application.
 * Initializes the client, loads commands, sets up event listeners, and manages bot lifecycle.
 *
 * @fileoverview Main bot entry point with comprehensive error handling and graceful shutdown.
 * @author Pulse Bot Development Team
 * @version 3.0.1
 * @license MIT
 */

import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials, ActivityType } from 'discord.js';

// Core bot modules
import { loadCommands } from './commandLoader.js';
import { handleInteraction } from './interactionHandlers';
import { handleMessage } from './chat.js';
import { logger, logError } from './logger.js';

// Feature modules
import { checkTypingAttempt } from './minigames/typing.js';
import { isOnCooldown, setCooldown } from './cooldowns.js';
import { initializeDatabase } from './storage.js';
import { schedulerManager } from './scheduler.js';

/**
 * @typedef {Object} Command
 * @property {import('discord.js').SlashCommandBuilder} data - The command data structure.
 * @property {(interaction: import('discord.js').CommandInteraction) => Promise<void>} execute - The command execution function.
 */

/**
 * Constants for bot configuration.
 */
const LOGIN_TIMEOUT_MS = 15_000;

/**
 * Validates the Discord token from environment variables.
 * @returns {string} The validated token.
 * @throws {Error} If the token is missing or invalid.
 */
function validateToken() {
  const token = process.env.DISCORD_TOKEN;
  if (!token || token.trim() === '' || token === 'your-discord-bot-token-here') {
    throw new Error(
      'DISCORD_TOKEN is missing or invalid in .env file. Please add a valid Discord bot token from https://discord.com/developers/applications. Update the .env file with: DISCORD_TOKEN=your_actual_token_here'
    );
  }

  // Basic token format validation
  if (!/^[\w-]{24,}\.[\w-]{6,}\.[\w-]{27,}$/.test(token)) {
    logger.warn('DISCORD_TOKEN format appears invalid. Please ensure it is a valid Discord bot token.');
  }

  return token;
}

/**
 * Validates the bot token with enhanced error handling.
 */
let token;
try {
  token = validateToken();
  logger.info('Token validation successful');
}
catch (error) {
  logger.error('Token validation failed', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
}

// BOT_STATUS validation
const botStatus = process.env.BOT_STATUS || 'online';
const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
let status;
if (validStatuses.includes(botStatus.toLowerCase())) {
  status = botStatus.toLowerCase();
}
else {
  console.warn(`Invalid BOT_STATUS: ${botStatus}. Defaulting to 'online'.`);
  status = 'online';
}

// Include necessary intents for bot functionality
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel],
  presence: {
    activities: [{
      name: process.env.BOT_ACTIVITY || 'Playing RPG Adventures',
      type: ActivityType.Playing
    }],
    status: /** @type {import('discord.js').PresenceStatusData} */ (status)
  }
});

// Initialize commands collection with proper typing
client.commands = /** @type {import('discord.js').Collection<string, Command>} */ (new Collection());

// Initialize database connection and commands
let commandStats = { total: 0, loaded: 0 };
(async() => {
  try {
    logger.info('Initializing database connection...');
    await initializeDatabase();
    logger.success('Database initialized successfully');

    // Load commands using the new module
    logger.info('Loading commands...');
    commandStats = await loadCommands(client);
    logger.success(`Loaded ${commandStats.loaded} out of ${commandStats.total} commands successfully`);

    // Initialize scheduler if available
    await schedulerManager.setClient(client);
    logger.success('Scheduler initialized successfully');
  }
  catch (error) {
    logger.error('Failed to initialize database', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
})();

// Event listeners
client.on('error', (error) => {
  logError('Client error occurred', error);
});

client.once('ready', () => {
  const user = client.user;
  if (!user) {
    logger.error('Client user is null after ready event');
    return;
  }

  const stats = {
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
    totalCommands: commandStats.total,
    loadedCommands: client.commands?.size || 0,
    uptime: process.uptime()
  };

  logger.success(`Bot started successfully as ${user.tag}`, stats);

  // Set up graceful shutdown handlers
  process.on('SIGINT', () => gracefulShutdown(client, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(client, 'SIGTERM'));
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    gracefulShutdown(client, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)), { promise: String(promise) });
    gracefulShutdown(client, 'unhandledRejection');
  });

  // Log system information
  logger.info('System information', {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isModalSubmit()) {
    await handleInteraction(interaction, client);
  }
});
/**
 * Handles incoming messages with enhanced error handling and logging.
 * @param {import('discord.js').Message} message - The Discord message object.
 */
client.on('messageCreate', async message => {
  const startTime = Date.now();

  try {
    // Ignore bot messages and system messages
    if (message.author.bot || message.system) {
      return;
    }

    // Check global message cooldown
    const messageCooldown = isOnCooldown(message.author.id, 'message_global');
    if (messageCooldown.onCooldown) {
      logger.debug('Message ignored due to cooldown', {
        userId: message.author.id,
        remainingTime: messageCooldown.remaining
      });
      return;
    }

    // Set message cooldown
    setCooldown(message.author.id, 'message_global');

    // Check typing minigame attempts first
    const attempt = checkTypingAttempt(message.author.id, message.content);
    if (attempt) {
      const response = attempt.ok
        ? `Nice! You typed it correctly: ${attempt.expected}`
        : (attempt.reason === 'timeout'
          ? 'Too slow! The typing challenge expired.'
          : 'Invalid typing attempt.');
      await message.reply({ content: response });
      return;
    }

    // Handle general message processing
    const reply = await handleMessage(message);
    if (reply) {
      await message.reply({ content: reply });
    }

    // Log message processing time for performance monitoring
    const processingTime = Date.now() - startTime;
    if (processingTime > 1000) { // Log slow message processing (>1s)
      logger.warn('Slow message processing detected', {
        processingTime,
        userId: message.author.id,
        messageLength: message.content.length
      });
    }

  }
  catch (error_) {
    const error = error_ instanceof Error ? error_ : new Error(String(error_));
    logError('Message handling failed', error, {
      user: `${message.author.username}#${message.author.discriminator}`,
      userId: message.author.id,
      guild: message.guild?.name || 'DM',
      channel: message.channel.type === 1 ? 'DM' : message.channel?.name || 'Unknown',
      messageLength: message.content.length,
      processingTime: Date.now() - startTime
    });
  }
});

/**
 * Graceful shutdown handler for the bot.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {string} signal - The shutdown signal.
 */
async function gracefulShutdown(client, signal) {
  logger.info(`Received ${signal}, initiating graceful shutdown...`);

  try {
    // Set presence to indicate maintenance
    if (client.user) {
      await client.user.setPresence({
        activities: [{ name: 'Shutting down...', type: ActivityType.Playing }],
        status: 'dnd'
      });
    }

    // Close database connections if applicable
    // Note: Database cleanup would be handled by the storage module

    // Destroy the client after a short delay to allow pending operations
    setTimeout(() => {
      client.destroy();
      logger.info('Bot shutdown complete');
      process.exit(0);
    }, 2000);

  }
  catch (error) {
    logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

/**
 * Initiates the bot login process with timeout protection and enhanced error handling.
 */
(async() => {
  try {
    logger.info('Attempting to login to Discord...');
    const loginPromise = client.login(token);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Discord login timed out after ${LOGIN_TIMEOUT_MS / 1000} seconds. Please check your DISCORD_TOKEN in .env file.`)), LOGIN_TIMEOUT_MS)
    );
    await Promise.race([loginPromise, timeoutPromise]);
    logger.success('Login successful');

  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to login to Discord', err);

    if (err.message.includes('timeout')) {
      logger.error('Login timed out. Please check your internet connection and try again.');
    }
    else if (err.message.includes('Invalid token') || err.message.includes('Incorrect login details')) {
      logger.error('Invalid token provided. Please ensure DISCORD_TOKEN in .env is set to a valid Discord bot token from https://discord.com/developers/applications');
    }
    else if (err.message.includes('Privileged intent')) {
      logger.error('Missing privileged intents. Please enable required intents in your Discord application settings.');
    }
    else {
      logger.error('Unknown login error occurred. Please check your configuration and try again.');
    }

    process.exit(1);
  }
})();
