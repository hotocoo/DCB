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
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max file size
const BACKUP_SUFFIX = '.backup';

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
 * Initializes the database by ensuring the data directory exists.
 */
export function initializeDatabase() {
  ensureDataDirectory();
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
 * Creates a backup of the storage file.
 * @param {string} filename - The filename to backup
 */
function createBackup(filename) {
  const filePath = getFilePath(filename);
  const backupPath = filePath + BACKUP_SUFFIX;

  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, backupPath);
      logger.debug('Created backup', { filePath, backupPath });
    } catch (error) {
      logger.warn('Failed to create backup', error, { filePath, backupPath });
    }
  }
}

/**
 * Validates and sanitizes data before storage.
 * @param {any} data - Data to validate
 * @returns {object} Validated data object
 * @throws {Error} If data is invalid
 */
function validateData(data) {
  if (data === null || data === undefined) {
    return {};
  }

  if (typeof data !== 'object') {
    throw new Error('Data must be an object');
  }

  // Basic sanitization - remove circular references and functions
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (typeof value === 'function') {
      return undefined; // Remove functions
    }
    return value;
  }));
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
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      logger.error('Storage file too large', null, { filePath, size: stats.size, maxSize: MAX_FILE_SIZE });
      return {};
    }

    const data = fs.readFileSync(filePath, DEFAULT_ENCODING);
    if (!data || data.trim() === '') {
      logger.warn('Storage file is empty', { filePath });
      return {};
    }

    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.error('Invalid storage file format', null, { filePath, type: typeof parsed });
      return {};
    }

    return parsed || {};
  } catch (error) {
    logger.error('Failed to read storage file', error, { filePath });
    // Try to restore from backup if available
    const backupPath = filePath + BACKUP_SUFFIX;
    if (fs.existsSync(backupPath)) {
      try {
        logger.info('Attempting to restore from backup', { backupPath });
        const backupData = fs.readFileSync(backupPath, DEFAULT_ENCODING);
        const parsedBackup = JSON.parse(backupData);
        fs.copyFileSync(backupPath, filePath); // Restore backup
        return parsedBackup || {};
      } catch (backupError) {
        logger.error('Failed to restore from backup', backupError, { backupPath });
      }
    }
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
    // Validate data before writing
    const validatedData = validateData(data);

    // Create backup before writing
    createBackup(GUILDS_FILE);

    const jsonString = JSON.stringify(validatedData, null, JSON_INDENT);

    // Check file size before writing
    if (Buffer.byteLength(jsonString, DEFAULT_ENCODING) > MAX_FILE_SIZE) {
      throw new Error(`Data size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`);
    }

    // Write to temporary file first, then rename for atomicity
    const tempPath = filePath + '.tmp';
    console.log(`[STORAGE DEBUG] Writing to storage file: ${filePath}`);
    fs.writeFileSync(tempPath, jsonString, DEFAULT_ENCODING);
    fs.renameSync(tempPath, filePath);

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
 * @returns {boolean} True if successful, false otherwise
 */
export function setGuild(id, data) {
  if (!id || typeof id !== 'string') {
    logger.warn('setGuild called with invalid ID', { id, idType: typeof id });
    return false;
  }

  if (!data || typeof data !== 'object') {
    logger.warn('setGuild called with invalid data', { id, dataType: typeof data });
    return false;
  }

  try {
    const all = readAll();
    all[id] = { ...(typeof all[id] === 'object' && all[id] !== null ? all[id] : {}), ...data, lastUpdated: new Date().toISOString() };
    writeAll(all);

    logger.debug('Updated guild data', { id, dataKeys: Object.keys(data) });
    return true;
  } catch (error) {
    logger.error('Failed to set guild data', error, { id });
    return false;
  }
}
