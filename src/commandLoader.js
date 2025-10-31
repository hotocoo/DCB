/**
 * Command loader module for Discord bot.
 * Dynamically loads command modules from the commands directory.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { logger } from './logger.js';

/**
 * Supported command file extensions.
 */
const COMMAND_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/**
 * Loads all command modules from the commands directory.
 * @param {object} client - Discord client instance
 * @returns {Promise<number>} Number of successfully loaded commands
 */
export async function loadCommands(client) {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  let loadedCount = 0;

  logger.info('Loading commands', { path: commandsPath });

  if (!fs.existsSync(commandsPath)) {
    logger.warn('Commands directory does not exist', { path: commandsPath });
    return loadedCount;
  }

  try {
    const files = fs.readdirSync(commandsPath).filter(file =>
      COMMAND_EXTENSIONS.some(ext => file.endsWith(ext))
    );

    logger.info('Found command files', { count: files.length, files });

    for (const file of files) {
      await loadCommandFile(client, commandsPath, file, loadedCount++);
    }

    logger.success('Commands loaded successfully', { loadedCount });
  } catch (error) {
    logger.error('Failed to load commands', error, { path: commandsPath });
  }

  return loadedCount;
}

/**
 * Loads a single command file and registers it with the client.
 * @param {object} client - Discord client instance
 * @param {string} commandsPath - Path to commands directory
 * @param {string} file - Command file name
 * @param {number} index - Index for logging purposes
 */
async function loadCommandFile(client, commandsPath, file, index) {
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
      return;
    }

    const commandName = commandModule.data.name;
    client.commands.set(commandName, {
      data: commandModule.data,
      execute: commandModule.execute
    });

    logger.debug('Command loaded', { name: commandName, file, index });
  } catch (error) {
    logger.error('Failed to load command file', error, { file, filePath });
  }
}