import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { loadCommands } from './commandLoader.js';
import { handleInteraction } from './interactionHandlers.js';

console.log('Starting bot...');
import { handleMessage } from './chat.js';
console.log('Imported handleMessage from chat.js');
import { checkTypingAttempt } from './minigames/typing.js';
console.log('Imported checkTypingAttempt from minigames/typing.js');
import { logger, logCommandExecution, logError } from './logger.js';
console.log('Imported logger from logger.js');
import { getLocations } from './locations.js';
console.log('Imported getLocations from locations.js');
// import { schedulerManager } from './scheduler.js';

console.log('All imports successful');
console.log('Logger available:', typeof logger.info === 'function');
import { getActiveAuctions } from './trading.js';
import { isOnCooldown, setCooldown, getFormattedCooldown, getButtonCooldownType } from './cooldowns.js';
import { wordleGames, hangmanGames, guessGames, combatGames, explorationGames } from './game-states.js';
import { getCharacter } from './rpg.js';


const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || TOKEN.trim() === '' || TOKEN === 'your-discord-bot-token-here') {
  console.error('DISCORD_TOKEN is missing or invalid in .env file.');
  console.error('Please add a valid Discord bot token from https://discord.com/developers/applications');
  console.error('Update the .env file with: DISCORD_TOKEN=your_actual_token_here');
  process.exit(1);
}

console.log('About to create client');

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

console.log('Client created successfully');
console.log('About to add event listeners');

console.log('About to add event listeners');
client.commands = new Collection();
console.log('Commands collection created');


// Load commands using the new module
await loadCommands(client);

client.on('error', (error) => {
  logError('Client error occurred', error);
});
console.log('Error listener added');

client.once('ready', () => {
  console.log(`Bot ready as ${client.user.tag}`);
  logger.success(`Bot started successfully as ${client.user.tag}`, {
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0)
  });
  // schedulerManager.setClient(client);
});
console.log('Ready listener added');

client.on('interactionCreate', async interaction => {
  await handleInteraction(interaction, client);
});
console.log('Interaction listener added');

console.log('About to add message listener');
client.on('messageCreate', async message => {
  try {
    // Check global message cooldown
    const messageCooldown = isOnCooldown(message.author.id, 'message_global');
    if (messageCooldown.onCooldown) {
      return; // Silently ignore messages during cooldown
    }

    // Set message cooldown
    setCooldown(message.author.id, 'message_global');

    // First, check typing minigame attempts
    const attempt = checkTypingAttempt(message.author.id, message.content);
    if (attempt) {
      if (attempt.ok) await message.reply({ content: `Nice! You typed it correctly: ${attempt.expected}` });
      else if (attempt.reason === 'timeout') await message.reply({ content: 'Too slow! The typing challenge expired.' });
      return;
    }

    const reply = await handleMessage(message);
    if (reply) await message.reply({ content: reply });
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

console.log('All event listeners added, about to start login process');
(async () => {
  try {
    console.log('About to attempt login');
    logger.info('Attempting to login to Discord...');
    // Add timeout to prevent hanging on invalid token
    const loginPromise = client.login(TOKEN);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Discord login timed out after 10 seconds. Please check your DISCORD_TOKEN in .env file.')), 10000));
    await Promise.race([loginPromise, timeoutPromise]);
    logger.success('Login successful');
  } catch (error) {
    console.error('Login failed:', error.message);
    logError('Failed to login to Discord', error);
    if (error.message.includes('timeout') || error.message.includes('Invalid token')) {
      console.error('Please ensure DISCORD_TOKEN in .env is set to a valid Discord bot token from https://discord.com/developers/applications');
    }
    process.exit(1);
  }
})();
