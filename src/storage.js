/**
 * Storage utilities for Discord bot data persistence.
 * Provides JSON file-based storage with error handling and validation.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Configuration constants for storage.
 */
const DATA_DIR = path.join(process.cwd(), 'data');
const GUILDS_FILE = 'guilds.json';
const DEFAULT_ENCODING = 'utf8';
const JSON_INDENT = 2;

/**
 * Ensures the data directory exists.
 */
function ensureDataDirectory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      logger.info('Created data directory', { path: DATA_DIR });
    }
  } catch (error) {
    logger.error('Failed to create data directory', error, { path: DATA_DIR });
    throw error;
  }
}

/**
 * Gets the full path to a storage file.
 * @param {string} filename - The filename
 * @returns {string} Full path to the file
 */
function getFilePath(filename) {
  return path.join(DATA_DIR, filename);
}

/**
 * Reads all data from the guilds storage file.
 * @returns {object} The stored data object
 */
export function readAll() {
  ensureDataDirectory();
  const filePath = getFilePath(GUILDS_FILE);

  if (!fs.existsSync(filePath)) {
    logger.debug('Storage file does not exist, returning empty object', { filePath });
    return {};
  }

  try {
    const data = fs.readFileSync(filePath, DEFAULT_ENCODING);
    const parsed = JSON.parse(data);
    return parsed || {};
  } catch (error) {
    logger.error('Failed to read storage file', error, { filePath });
    // Return empty object instead of crashing
    return {};
  }
}

/**
 * Writes all data to the guilds storage file.
 * @param {object} data - The data object to write
 */
export function writeAll(data) {
  ensureDataDirectory();
  const filePath = getFilePath(GUILDS_FILE);

  try {
    const jsonString = JSON.stringify(data, null, JSON_INDENT);
    fs.writeFileSync(filePath, jsonString, DEFAULT_ENCODING);
    logger.debug('Successfully wrote to storage file', { filePath, size: jsonString.length });
  } catch (error) {
    logger.error('Failed to write storage file', error, { filePath });
    throw error;
  }
}

/**
 * Gets guild data by ID.
 * @param {string} id - Guild ID
 * @returns {object|null} Guild data or null if not found
 */
export function getGuild(id) {
  if (!id) {
    logger.warn('getGuild called with empty ID');
    return null;
  }

  const all = readAll();
  const guildData = all[id] || null;

  logger.debug('Retrieved guild data', { id, found: !!guildData });
  return guildData;
}

/**
 * Sets guild data by ID.
 * @param {string} id - Guild ID
 * @param {object} data - Guild data to store
 */
export function setGuild(id, data) {
  if (!id) {
    logger.warn('setGuild called with empty ID');
    return;
  }

  if (!data || typeof data !== 'object') {
    logger.warn('setGuild called with invalid data', { id, dataType: typeof data });
    return;
  }

  const all = readAll();
  all[id] = { ...(all[id] || {}), ...data };
  writeAll(all);

  logger.debug('Updated guild data', { id, dataKeys: Object.keys(data) });
}
