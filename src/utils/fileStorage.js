/**
 * File storage utilities for async JSON operations with error handling
 * @fileoverview Centralized file I/O operations to replace synchronous patterns
 * @module utils/fileStorage
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

import { logger } from '../logger.js';

/**
 * Maximum file size (50MB)
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * File lock manager to prevent race conditions
 */
const fileLocks = new Map();

/**
 * Acquires a lock for a file path
 * @param {string} filePath - Path to lock
 * @returns {Promise<() => void>} Release function
 */
async function acquireLock(filePath) {
  while (fileLocks.has(filePath)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  fileLocks.set(filePath, true);

  return () => {
    fileLocks.delete(filePath);
  };
}

/**
 * Safely reads and parses a JSON file with error handling
 * @param {string} filePath - Path to JSON file
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {Promise<*>} Parsed JSON data or default value
 */
export async function readJSON(filePath, defaultValue = null) {
  const release = await acquireLock(filePath);

  try {
    // Check if file exists
    try {
      await fs.access(filePath);
    }
    catch {
      logger.debug(`File not found, returning default: ${filePath}`);
      return defaultValue;
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      logger.error(`File too large: ${filePath} (${stats.size} bytes)`);
      return defaultValue;
    }

    // Read and parse file
    const data = await fs.readFile(filePath);
    return JSON.parse(data);

  }
  catch (error) {
    logger.error(`Failed to read JSON file: ${filePath}`, error);
    return defaultValue;
  }
  finally {
    release();
  }
}

/**
 * Safely writes data to a JSON file with atomic writes
 * @param {string} filePath - Path to JSON file
 * @param {*} data - Data to write
 * @param {Object} options - Write options
 * @param {boolean} options.pretty - Pretty print JSON (default: true)
 * @returns {Promise<boolean>} Success status
 */
export async function writeJSON(filePath, data, options = { pretty: true }) {
  const release = await acquireLock(filePath);

  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write to temporary file first (atomic write)
    const tempPath = `${filePath}.tmp`;
    const jsonString = options.pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    await fs.writeFile(tempPath, jsonString, 'utf8');

    // Rename temp file to actual file (atomic operation)
    await fs.rename(tempPath, filePath);

    return true;

  }
  catch (error) {
    logger.error(`Failed to write JSON file: ${filePath}`, error);

    // Clean up temp file if it exists
    try {
      await fs.unlink(`${filePath}.tmp`);
    }
    catch {
      // Ignore cleanup errors
    }

    return false;
  }
  finally {
    release();
  }
}

/**
 * Lists all JSON files in a directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>} Array of file paths
 */
export async function listJSONFiles(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    const files = await fs.readdir(dirPath);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(dirPath, file));
  }
  catch (error) {
    logger.error(`Failed to list JSON files in: ${dirPath}`, error);
    return [];
  }
}

/**
 * Creates a backup of a JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {Promise<string|null>} Backup file path or null on failure
 */
export async function backupJSON(filePath) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    const fsPromises = await import('fs/promises');
    await fsPromises.copyFile(filePath, backupPath);
    logger.info(`Created backup: ${backupPath}`);
    return backupPath;
  } catch (error) {
    logger.error(`Failed to backup JSON file: ${filePath}`, error);
    return null;
  }
}

export default {
  readJSON,
  writeJSON,
  listJSONFiles,
  backupJSON
};
