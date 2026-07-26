/**
 * Main entry point for the Athena Discord bot.
 * Initializes the client, loads commands, sets up event listeners, and manages bot lifecycle.
 *
 * @fileoverview Main bot entry point with comprehensive error handling and graceful shutdown.
 * @author watchandnotlearn
 * @version 0.1.4
 * @license MIT
 */

import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials, ActivityType } from 'discord.js';

// Core bot modules
import { loadCommands } from './commandLoader.js';
import { handleInteraction } from './interactionHandlers.js';
import { handleMessage } from './chat.js';
import { logger, logError } from './logger.js';
import { checkTypingAttempt } from './minigames/typing.js';
import { isOnCooldown, setCooldown } from './cooldowns.js';
import { initializeDatabase, shutdownDatabase } from './storage.js';
import { schedulerManager } from './scheduler.js';
import { guessGames } from './game-states.js';

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
      'DISCORD_TOKEN is missing or invalid in .env file. Please add a valid Discord bot token from https://discord.com/developers/applications. Update the .env file with: DISCORD_TOKEN=your_actual_token_here',
    );
  }

  // Fast-fail on known test/dummy tokens so the bot doesn't make a
  // doomed network round-trip to Discord. Real bot tokens have 3 base64
  // segments separated by dots, each with the right base64 alphabet;
  // any "test_*" or "dummy_*" or "fake_*" string is clearly a stub.
  if (/^(test|dummy|fake|placeholder|sample|xxx|your)[_-]?/i.test(token)) {
    throw new Error(
      `DISCORD_TOKEN looks like a placeholder (${token.slice(0, 12)}...). ` +
        'Replace it in .env with a real bot token before running the bot. ' +
        'See https://discord.com/developers/applications',
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
} catch (error) {
  logger.error('Token validation failed', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
}

// BOT_STATUS validation
const botStatus = process.env.BOT_STATUS || 'online';
const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
let status;
if (validStatuses.includes(botStatus.toLowerCase())) {
  status = botStatus.toLowerCase();
} else {
  logger.warn(`Invalid BOT_STATUS: ${botStatus}. Defaulting to 'online'.`);
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
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel],
  presence: {
    activities: [
      {
        name: process.env.BOT_ACTIVITY || 'Playing RPG Adventures',
        type: ActivityType.Playing,
      },
    ],
    status: /** @type {import('discord.js').PresenceStatusData} */ (status),
  },
});

// Initialize commands collection with proper typing
client.commands = /** @type {import('discord.js').Collection<string, Command>} */ (new Collection());

/**
 * Bootstrap sequence: initialize DB → load commands → init scheduler.
 * This promise must be awaited before calling client.login() to avoid a race
 * where interactions arrive before commands are registered in-memory.
 */
let bootstrapPromise;
let commandStats = { total: 0, loaded: 0 };

try {
  // Initialize database connection
  logger.info('Initializing database connection...');
  await initializeDatabase();
  logger.success('Database initialized successfully');

  // Load commands using the new module
  logger.info('Loading commands...');
  commandStats = await loadCommands(client);
  logger.success(`Loaded ${commandStats.loaded} out of ${commandStats.total} commands successfully`);

  if (commandStats.loaded === 0 && commandStats.total > 0) {
    logger.error('No commands were loaded successfully. Bot may not respond to commands.');
  }
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error('Failed during bootstrap', err);
  process.exit(1);
}

// Initialize scheduler after commands are loaded
try {
  await schedulerManager.setClient(client);
  logger.success('Scheduler initialized successfully');
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error('Failed to initialize scheduler', err);
  // Non-fatal: bot can run without scheduler
}

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
    uptime: process.uptime(),
  };

  logger.success(`Bot started successfully as ${user.tag}`, stats);

  // Log system information
  logger.info('System information', {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

// Set up graceful shutdown handlers ONCE at module load. Placing them
// inside the `ready` callback (as a previous version did) would re-add
// listeners on every re-ready and leak handlers over the process
// lifetime. We use a guard so hot-reload (`node --watch`) doesn't add
// duplicate listeners either.
if (!process[Symbol.for('athena.shutdown.handlersInstalled')]) {
  process[Symbol.for('athena.shutdown.handlersInstalled')] = true;
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
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) {
    return;
  }

  // CRITICAL: wrap in try/catch so interaction errors don't become unhandled rejections
  // and crash the entire bot. Previously, a single failed interaction would trigger
  // gracefulShutdown via the process.on('unhandledRejection') handler at line 184.
  try {
    await handleInteraction(interaction, client);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    const _cmd = /** @type {any} */ (interaction);
    logError('Interaction handling failed', err, {
      userId: interaction.user?.id,
      commandName: _cmd.commandName || 'button/modal',
      customId: _cmd.customId,
      guildId: interaction.guild?.id,
      interactionType: interaction.constructor.name,
    });

    // Acknowledge/reply with error if the interaction hasn't been responded to yet.
    // Discord enforces a 3s reply window — after that we can only followUp or edit.
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ An error occurred while processing your request.',
          flags: 64, // Ephemeral
        });
      } else if (!interaction.replied && interaction.deferred) {
        await interaction.followUp({
          content: '❌ An error occurred while processing your request.',
          flags: 64, // Ephemeral
        });
      }
    } catch (replyErr) {
      logger.error('Failed to send error reply for interaction', replyErr instanceof Error ? replyErr : new Error(String(replyErr)));
    }
  }
});

/**
 * Voice state change handler — leaves empty voice channels.
 * Prevents bot from staying connected forever when users disconnect.
 */
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guildId = newState.guild.id;
    const channel = newState.channel;

    // If user left a voice channel entirely and was the only one there (besides bot), leave too.
    if (!channel && oldState.channel) {
      const memberCount = oldState.channel.members.filter((m) => !m.user.bot).size;
      if (memberCount === 0) {
        logger.info('Leaving empty voice channel', { guildId, channelId: oldState.channel.id });
        // Use dynamic import to avoid tight coupling; music module exports cleanup functions.
        try {
          const { stop } = await import('./music.js');
          await stop(guildId);
        } catch (_ignore) { /* music module not available or no active player */ }
      }
    }
  } catch (error) {
    logger.error('Voice state update handler failed', error instanceof Error ? error : new Error(String(error)));
  }
});
/**
 * Handles incoming messages with enhanced error handling and logging.
 * @param {import('discord.js').Message} message - The Discord message object.
 */
client.on('messageCreate', async (message) => {
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
        remainingTime: messageCooldown.remaining,
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
        : attempt.reason === 'timeout'
          ? 'Too slow! The typing challenge expired.'
          : 'Invalid typing attempt.';
      await message.reply({ content: response });
      return;
    }

    // Handle number guessing game messages
    try {
      if (guessGames.has(message.author.id)) {
        const { handleGuess } = await import('./commands/guess.js');
        if (handleGuess) {
          const handled = await handleGuess(message);
          if (handled !== undefined) return;
        }
      }
    } catch (_ignore) { /* games optional */ }

    // Handle general message processing
    const reply = await handleMessage(message);
    if (reply) {
      await message.reply({ content: reply });
    }

    // Record messages_sent stat for bot_friend achievement (only real user messages, not bots/system).
    try {
      const { updateUserStats } = await import('./achievements.js');
      updateUserStats(message.author.id, { messages_sent: 1 });
    } catch (_ignore) { /* achievements optional */ }

    // Log message processing time for performance monitoring
    const processingTime = Date.now() - startTime;
    if (processingTime > 1000) {
      // Log slow message processing (>1s)
      logger.warn('Slow message processing detected', {
        processingTime,
        userId: message.author.id,
        messageLength: message.content.length,
      });
    }
  } catch (error_) {
    const error = error_ instanceof Error ? error_ : new Error(String(error_));
    logError('Message handling failed', error, {
      user: `${message.author.username}#${message.author.discriminator}`,
      userId: message.author.id,
      guild: message.guild?.name || 'DM',
      channel: message.channel.type === 1 ? 'DM' : message.channel?.name || 'Unknown',
      messageLength: message.content.length,
      processingTime: Date.now() - startTime,
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
        status: 'dnd',
      });
    }

    // Flush the logger's file-writer/buffer before tearing down.
    logger.cleanup();

    // Close database connection to ensure writes are flushed
    try { await shutdownDatabase(); } catch (_ignore) {}

    // Destroy the client after a short delay to allow pending operations
    setTimeout(() => {
      client.destroy();
      logger.info('Bot shutdown complete');
      process.exit(0);
    }, 2000);
  } catch (error) {
    logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

/**
 * Initiates the bot login process with timeout protection and enhanced error handling.
 */
(async () => {
  try {
    logger.info('Attempting to login to Discord...');
    const loginPromise = client.login(token);
    const timeoutPromise = new Promise((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`Discord login timed out after ${LOGIN_TIMEOUT_MS / 1000} seconds. Please check your DISCORD_TOKEN in .env file.`)),
        LOGIN_TIMEOUT_MS,
      ),
    );
    await Promise.race([loginPromise, timeoutPromise]);
    logger.success('Login successful');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to login to Discord', err);

    if (err.message.includes('timeout')) {
      logger.error('Login timed out. Please check your internet connection and try again.');
    } else if (err.message.includes('Invalid token') || err.message.includes('Incorrect login details')) {
      logger.error(
        'Invalid token provided. Please ensure DISCORD_TOKEN in .env is set to a valid Discord bot token from https://discord.com/developers/applications',
      );
    } else if (err.message.includes('Privileged intent')) {
      logger.error('Missing privileged intents. Please enable required intents in your Discord application settings.');
    } else {
      logger.error('Unknown login error occurred. Please check your configuration and try again.');
    }

    process.exit(1);
  }
})();
