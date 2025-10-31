/**
 * Command deployment script for Discord bot.
 * Registers slash commands with Discord's API.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';
import { logger } from './logger.js';

/**
 * Supported command file extensions.
 */
const COMMAND_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/**
 * Validates required environment variables.
 * @returns {object} Validated environment configuration
 * @throws {Error} If required environment variables are missing
 */
function validateEnvironment() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN and CLIENT_ID must be set in environment variables');
  }

  return { token, clientId, guildId };
}

/**
 * Loads command data from all command files.
 * @returns {Array} Array of command data objects
 */
async function loadCommandData() {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commands = [];

  logger.info('Loading command data for deployment', { path: commandsPath });

  try {
    const files = fs.readdirSync(commandsPath).filter(file =>
      COMMAND_EXTENSIONS.some(ext => file.endsWith(ext))
    );

    for (const file of files) {
      try {
        const filePath = path.join(commandsPath, file);
        const { data } = await import(filePath);

        if (data && typeof data.toJSON === 'function') {
          commands.push(data.toJSON());
          logger.debug('Loaded command data', { file, name: data.name });
        } else {
          logger.warn('Command file missing data export or toJSON method', { file });
        }
      } catch (error) {
        logger.error('Failed to load command data', error, { file });
      }
    }

    logger.info('Command data loaded', { count: commands.length });
  } catch (error) {
    logger.error('Failed to read commands directory', error, { path: commandsPath });
    throw error;
  }

  return commands;
}

/**
 * Deploys commands to Discord.
 * @param {Array} commands - Command data to deploy
 * @param {object} config - Environment configuration
 */
async function deployCommands(commands, { token, clientId, guildId }) {
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      logger.info('Registering guild-specific commands', { guildId, commandCount: commands.length });
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      logger.success('Guild commands registered successfully');
    } else {
      logger.info('Registering global commands', { commandCount: commands.length });
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.success('Global commands registered successfully');
    }
  } catch (error) {
    logger.error('Failed to register commands', error);
    throw error;
  }
}

/**
 * Main deployment function.
 */
async function main() {
  try {
    const config = validateEnvironment();
    const commands = await loadCommandData();

    if (commands.length === 0) {
      logger.warn('No commands to deploy');
      return;
    }

    await deployCommands(commands, config);
  } catch (error) {
    logger.error('Command deployment failed', error);
    process.exit(1);
  }
}

// Execute deployment
main();
