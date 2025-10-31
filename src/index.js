/**
 * Main entry point for the Discord bot application.
 * Initializes the client, loads commands, and sets up event listeners.
 */

import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';

// Core bot modules
import { loadCommands } from './commandLoader.js';
import { handleInteraction } from './interactionHandlers.js';
import { handleMessage } from './chat.js';
import { logger, logError } from './logger.js';

// Feature modules
import { checkTypingAttempt } from './minigames/typing.js';
import { getActiveAuctions } from './trading.js';
import { isOnCooldown, setCooldown } from './cooldowns.js';
import { wordleGames, hangmanGames, guessGames, combatGames, explorationGames } from './game-states.js';
import { getCharacter } from './rpg.js';

/**
 * Constants for bot configuration.
 */
const LOGIN_TIMEOUT_MS = 10000;

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
  return token;
}

/**
 * Validates the bot token.
 */
let token;
try {
  token = validateToken();
} catch (error) {
  logger.error('Token validation failed', error);
  process.exit(1);
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
});

// Initialize commands collection
client.commands = new Collection();

// Load commands using the new module
await loadCommands(client);

// Event listeners
client.on('error', (error) => {
  logError('Client error occurred', error);
});

client.once('ready', () => {
  logger.success(`Bot started successfully as ${client.user.tag}`, {
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0)
  });
  // TODO: Uncomment when scheduler is implemented
  // schedulerManager.setClient(client);
});

client.on('interactionCreate', async interaction => {
  await handleInteraction(interaction, client);
});
/**
 * Handles incoming messages.
 * @param {Message} message - The Discord message object.
 */
client.on('messageCreate', async message => {
  try {
    // Check global message cooldown
    const messageCooldown = isOnCooldown(message.author.id, 'message_global');
    if (messageCooldown.onCooldown) {
      return; // Silently ignore messages during cooldown
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

    // Handle general message processing
    const reply = await handleMessage(message);
    if (reply) {
      await message.reply({ content: reply });
    }
  } catch (err) {
    logError('Message handling failed', err, {
      user: `${message.author.username}#${message.author.discriminator}`,
      userId: message.author.id,
      guild: message.guild?.name || 'DM',
      channel: message.channel?.name || 'Unknown',
      messageLength: message.content.length
    });
  }
});

/**
 * Initiates the bot login process with timeout protection.
 */
(async () => {
  try {
    logger.info('Attempting to login to Discord...');
    const loginPromise = client.login(token);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Discord login timed out after 10 seconds. Please check your DISCORD_TOKEN in .env file.')), LOGIN_TIMEOUT_MS)
    );
    await Promise.race([loginPromise, timeoutPromise]);
    logger.success('Login successful');
  } catch (error) {
    logger.error('Failed to login to Discord', error);
    if (error.message.includes('timeout') || error.message.includes('Invalid token')) {
      logger.error('Please ensure DISCORD_TOKEN in .env is set to a valid Discord bot token from https://discord.com/developers/applications');
    }
    process.exit(1);
  }
})();
