/**
 * Async file operations utilities with comprehensive error handling
 * Provides safe JSON reading/writing with atomic operations and backup support
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';

const DEFAULT_ENCODING = 'utf8';
const JSON_INDENT = 2;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const BACKUP_SUFFIX = '.backup';

// Concurrent operation locks
const fileLocks = new Map();

/**
 * Acquires a lock for a file path
 * @param {string} filePath - The file path to lock
 * @returns {Promise<Function>} Release function
 */
async function acquireLock(filePath) {
  while (fileLocks.has(filePath)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  const release = () => fileLocks.delete(filePath);
  fileLocks.set(filePath, true);
  return release;
}

/**
 * Safely reads and parses a JSON file with error handling
 * @param {string} filePath - Path to JSON file
 * @param {object} defaultValue - Default value if file doesn't exist or is invalid
 * @returns {Promise<object>} Parsed JSON data
 */
export async function readJSON(filePath, defaultValue = {}) {
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      logger.debug('File does not exist, returning default', { filePath });
      return defaultValue;
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      logger.warn('File is empty, returning default', { filePath });
      return defaultValue;
    }

    if (stats.size > MAX_FILE_SIZE) {
      logger.error('File too large', null, { 
        filePath, 
        size: stats.size, 
        maxSize: MAX_FILE_SIZE 
      });
      return defaultValue;
    }

    // Read file content
    const content = await fs.readFile(filePath, DEFAULT_ENCODING);
    
    if (!content || content.trim() === '') {
      logger.warn('File content is empty', { filePath });
      return defaultValue;
    }

    // Parse JSON with error handling
    try {
      const parsed = JSON.parse(content);
      
      // Validate parsed data is an object
      if (typeof parsed !== 'object' || parsed === null) {
        logger.error('Invalid JSON format - not an object', null, { 
          filePath, 
          type: typeof parsed 
        });
        return defaultValue;
      }

      return parsed;
    } catch (parseError) {
      logger.error('JSON parse error', parseError, { filePath });
      
      // Try to restore from backup
      const backupPath = filePath + BACKUP_SUFFIX;
      try {
        await fs.access(backupPath);
        logger.info('Attempting to restore from backup', { backupPath });
        
        const backupContent = await fs.readFile(backupPath, DEFAULT_ENCODING);
        const parsed = JSON.parse(backupContent);
        
        // Restore the backup to main file
        await fs.copyFile(backupPath, filePath);
        logger.info('Successfully restored from backup', { filePath });
        
        return parsed;
      } catch (backupError) {
        logger.error('Failed to restore from backup', backupError, { backupPath });
        return defaultValue;
      }
    }
  } catch (error) {
    logger.error('Failed to read JSON file', error, { filePath });
    return defaultValue;
  }
}

/**
 * Safely writes data to a JSON file with atomic operations
 * @param {string} filePath - Path to JSON file
 * @param {object} data - Data to write
 * @param {object} options - Write options
 * @returns {Promise<boolean>} Success status
 */
export async function writeJSON(filePath, data, options = {}) {
  const { createBackup = true, validate = true } = options;
  const release = await acquireLock(filePath);

  try {
    // Validate data
    if (validate) {
      if (data === null || data === undefined) {
        throw new Error('Data cannot be null or undefined');
      }
      
      if (typeof data !== 'object') {
        throw new TypeError('Data must be an object');
      }
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Create backup if requested and file exists
    if (createBackup) {
      try {
        await fs.access(filePath);
        const backupPath = filePath + BACKUP_SUFFIX;
        await fs.copyFile(filePath, backupPath);
        logger.debug('Created backup', { filePath, backupPath });
      } catch {
        // File doesn't exist, no backup needed
      }
    }

    // Serialize data
    const jsonString = JSON.stringify(data, null, JSON_INDENT);

    // Check size
    if (Buffer.byteLength(jsonString, DEFAULT_ENCODING) > MAX_FILE_SIZE) {
      throw new Error(`Data size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`);
    }

    // Atomic write: write to temp file, then rename
    const tempPath = filePath + '.tmp';
    await fs.writeFile(tempPath, jsonString, DEFAULT_ENCODING);
    await fs.rename(tempPath, filePath);

    logger.debug('Successfully wrote JSON file', { 
      filePath, 
      size: jsonString.length 
    });

    return true;
  } catch (error) {
    logger.error('Failed to write JSON file', error, { filePath });
    throw error;
  } finally {
    release();
  }
}

/**
 * Synchronously reads JSON with error handling (for legacy code)
 * @param {string} filePath - Path to JSON file
 * @param {object} defaultValue - Default value on error
 * @returns {object} Parsed JSON data
 */
export function readJSONSync(filePath, defaultValue = {}) {
  try {
    if (!fsSync.existsSync(filePath)) {
      return defaultValue;
    }

    const stats = fsSync.statSync(filePath);
    if (stats.size === 0 || stats.size > MAX_FILE_SIZE) {
      return defaultValue;
    }

    const content = fsSync.readFileSync(filePath, DEFAULT_ENCODING);
    if (!content || content.trim() === '') {
      return defaultValue;
    }

    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) {
        return defaultValue;
      }
      return parsed;
    } catch (parseError) {
      logger.error('JSON parse error (sync)', parseError, { filePath });
      
      // Try backup
      const backupPath = filePath + BACKUP_SUFFIX;
      if (fsSync.existsSync(backupPath)) {
        try {
          const backupContent = fsSync.readFileSync(backupPath, DEFAULT_ENCODING);
          const parsed = JSON.parse(backupContent);
          fsSync.copyFileSync(backupPath, filePath);
          return parsed;
        } catch {
          return defaultValue;
        }
      }
      
      return defaultValue;
    }
  } catch (error) {
    logger.error('Failed to read JSON file (sync)', error, { filePath });
    return defaultValue;
  }
}

/**
 * Synchronously writes JSON with error handling (for legacy code)
 * @param {string} filePath - Path to JSON file
 * @param {object} data - Data to write
 * @param {object} options - Write options
 * @returns {boolean} Success status
 */
export function writeJSONSync(filePath, data, options = {}) {
  const { createBackup = true } = options;

  try {
    // Validate
    if (typeof data !== 'object' || data === null) {
      throw new TypeError('Data must be an object');
    }

    // Ensure directory
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }

    // Create backup
    if (createBackup && fsSync.existsSync(filePath)) {
      const backupPath = filePath + BACKUP_SUFFIX;
      fsSync.copyFileSync(filePath, backupPath);
    }

    // Serialize
    const jsonString = JSON.stringify(data, null, JSON_INDENT);

    if (Buffer.byteLength(jsonString, DEFAULT_ENCODING) > MAX_FILE_SIZE) {
      throw new Error(`Data size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`);
    }

    // Atomic write
    const tempPath = filePath + '.tmp';
    fsSync.writeFileSync(tempPath, jsonString, DEFAULT_ENCODING);
    fsSync.renameSync(tempPath, filePath);

    return true;
  } catch (error) {
    logger.error('Failed to write JSON file (sync)', error, { filePath });
    return false;
  }
}

/**
 * Creates a simple LRU cache with size limit
 * @param {number} maxSize - Maximum cache size
 * @returns {object} Cache instance
 */
export function createLRUCache(maxSize = 100) {
  const cache = new Map();
  const accessOrder = [];

  return {
    get(key) {
      if (cache.has(key)) {
        // Move to end (most recent)
        const index = accessOrder.indexOf(key);
        if (index > -1) {
          accessOrder.splice(index, 1);
        }
        accessOrder.push(key);
        return cache.get(key);
      }
      return undefined;
    },

    set(key, value) {
      if (cache.has(key)) {
        // Update existing
        const index = accessOrder.indexOf(key);
        if (index > -1) {
          accessOrder.splice(index, 1);
        }
      } else if (cache.size >= maxSize) {
        // Evict oldest
        const oldest = accessOrder.shift();
        cache.delete(oldest);
      }

      cache.set(key, value);
      accessOrder.push(key);
    },

    has(key) {
      return cache.has(key);
    },

    delete(key) {
      const index = accessOrder.indexOf(key);
      if (index > -1) {
        accessOrder.splice(index, 1);
      }
      return cache.delete(key);
    },

    clear() {
      cache.clear();
      accessOrder.length = 0;
    },

    get size() {
      return cache.size;
    }
  };
}

/**
 * Debounce function to limit execution rate
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle function to limit execution frequency
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit = 1000) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export default {
  readJSON,
  writeJSON,
  readJSONSync,
  writeJSONSync,
  createLRUCache,
  debounce,
  throttle
};
