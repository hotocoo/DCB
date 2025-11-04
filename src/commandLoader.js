/**
 * Command loader module for Discord bot.
 * Dynamically loads command modules from the commands directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { logger } from './logger.js';

/**
 * Supported command file extensions.
 */
const COMMAND_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/**
 * Loads all command modules from the commands directory.
 * @param {import('discord.js').Client} client - Discord client instance
 * @returns {Promise<{total: number, loaded: number}>} Object with total command files found and successfully loaded commands
 */
export async function loadCommands(client) {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  let loadedCount = 0;
  let total = 0;

  logger.info('Loading commands', { path: commandsPath });

  if (!fs.existsSync(commandsPath)) {
    logger.warn('Commands directory does not exist', { path: commandsPath });
    return { total: 0, loaded: 0 };
  }

  try {
    const files = fs.readdirSync(commandsPath).filter(file =>
      COMMAND_EXTENSIONS.some(ext => file.endsWith(ext))
    );

    total = files.length;
    logger.info('Found command files', { count: total, files });

    for (const file of files) {
      if (await loadCommandFile(client, commandsPath, file)) {
        loadedCount++;
      }
    }

    logger.success('Commands loaded successfully', { total, loaded: loadedCount });
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to load commands', err, { path: commandsPath });
  }

  return { total, loaded: loadedCount };
}

/**
 * Loads a single command file and registers it with the client.
 * @param {import('discord.js').Client} client - Discord client instance
 * @param {string} commandsPath - Path to commands directory
 * @param {string} file - Command file name
 * @returns {Promise<boolean>} Success status of command loading
 */
async function loadCommandFile(client, commandsPath, file) {
  const filePath = path.join(commandsPath, file);

  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const commandModule = await import(moduleUrl);

    if (!commandModule.data || !commandModule.execute) {
      logger.warn('Command file missing required exports', {
        file,
        hasData: !!commandModule.data,
        hasExecute: !!commandModule.execute
      });
      return false;
    }

    const commandName = commandModule.data.name;
    client.commands.set(commandName, {
      data: commandModule.data,
      execute: commandModule.execute
    });

    logger.debug('Command loaded', { name: commandName, file });
    return true;
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to load command file', err, { file, filePath });
    return false;
  }
}