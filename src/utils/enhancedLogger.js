/**
 * Enhanced logging system with log rotation and filtering
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger as baseLogger } from '../logger.js';

const LOGS_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

/**
 * Ensure logs directory exists
 */
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Get log file path
 * @param {string} type - Log type (error, info, debug)
 * @returns {string} Log file path
 */
function getLogPath(type = 'combined') {
  return path.join(LOGS_DIR, `${type}.log`);
}

/**
 * Rotate log file if needed
 * @param {string} logPath - Path to log file
 */
function rotateLogIfNeeded(logPath) {
  try {
    if (!fs.existsSync(logPath)) {
      return;
    }

    const stats = fs.statSync(logPath);
    if (stats.size < MAX_LOG_SIZE) {
      return;
    }

    // Rotate existing logs
    for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
      const oldPath = `${logPath}.${i}`;
      const newPath = `${logPath}.${i + 1}`;
      
      if (fs.existsSync(oldPath)) {
        if (i === MAX_LOG_FILES - 1) {
          fs.unlinkSync(oldPath); // Delete oldest
        } else {
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    // Rotate current log
    fs.renameSync(logPath, `${logPath}.1`);
    
    baseLogger.info('Log file rotated', { logPath });
  } catch (error) {
    baseLogger.error('Failed to rotate log', error, { logPath });
  }
}

/**
 * Write to log file
 * @param {string} type - Log type
 * @param {string} message - Log message
 */
function writeToLog(type, message) {
  try {
    ensureLogsDir();
    const logPath = getLogPath(type);
    
    rotateLogIfNeeded(logPath);
    
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    
    fs.appendFileSync(logPath, logLine, 'utf8');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

/**
 * Enhanced logger with file output
 */
export class EnhancedLogger {
  constructor(options = {}) {
    this.minLevel = options.minLevel || 'info';
    this.enableFileLogging = options.enableFileLogging !== false;
    this.enableConsoleLogging = options.enableConsoleLogging !== false;
    this.filterSensitive = options.filterSensitive !== false;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Sensitive patterns to filter
    this.sensitivePatterns = [
      /token[=:]\s*['"]?[\w-]{20,}['"]?/gi,
      /api[_-]?key[=:]\s*['"]?[\w-]{20,}['"]?/gi,
      /password[=:]\s*['"]?[^'"]+['"]?/gi,
      /secret[=:]\s*['"]?[\w-]{20,}['"]?/gi,
      /bearer\s+[\w-]+/gi
    ];
  }

  /**
   * Filter sensitive data from message
   * @param {string} message - Log message
   * @returns {string} Filtered message
   */
  filterSensitiveData(message) {
    if (!this.filterSensitive || typeof message !== 'string') {
      return message;
    }

    let filtered = message;
    for (const pattern of this.sensitivePatterns) {
      filtered = filtered.replace(pattern, '[REDACTED]');
    }
    return filtered;
  }

  /**
   * Check if level should be logged
   * @param {string} level - Log level
   * @returns {boolean} True if should log
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.minLevel];
  }

  /**
   * Format log message
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} meta - Metadata
   * @returns {string} Formatted message
   */
  formatMessage(level, message, meta) {
    const filtered = this.filterSensitiveData(message);
    const metaStr = meta && Object.keys(meta).length > 0 
      ? ' ' + JSON.stringify(meta)
      : '';
    return `${filtered}${metaStr}`;
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Error} error - Error object
   * @param {object} meta - Metadata
   */
  error(message, error = null, meta = {}) {
    if (!this.shouldLog('error')) return;

    const errorInfo = error ? ` - ${error.message}\n${error.stack}` : '';
    const fullMessage = this.formatMessage('error', message + errorInfo, meta);

    if (this.enableConsoleLogging) {
      console.error(`[ERROR] ${fullMessage}`);
    }

    if (this.enableFileLogging) {
      writeToLog('error', fullMessage);
      writeToLog('combined', fullMessage);
    }

    baseLogger.error(message, error, meta);
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {object} meta - Metadata
   */
  warn(message, meta = {}) {
    if (!this.shouldLog('warn')) return;

    const fullMessage = this.formatMessage('warn', message, meta);

    if (this.enableConsoleLogging) {
      console.warn(`[WARN] ${fullMessage}`);
    }

    if (this.enableFileLogging) {
      writeToLog('warn', fullMessage);
      writeToLog('combined', fullMessage);
    }

    baseLogger.warn(message, meta);
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {object} meta - Metadata
   */
  info(message, meta = {}) {
    if (!this.shouldLog('info')) return;

    const fullMessage = this.formatMessage('info', message, meta);

    if (this.enableConsoleLogging) {
      console.log(`[INFO] ${fullMessage}`);
    }

    if (this.enableFileLogging) {
      writeToLog('info', fullMessage);
      writeToLog('combined', fullMessage);
    }

    baseLogger.info(message, meta);
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {object} meta - Metadata
   */
  debug(message, meta = {}) {
    if (!this.shouldLog('debug')) return;

    const fullMessage = this.formatMessage('debug', message, meta);

    if (this.enableConsoleLogging) {
      console.log(`[DEBUG] ${fullMessage}`);
    }

    if (this.enableFileLogging) {
      writeToLog('debug', fullMessage);
      writeToLog('combined', fullMessage);
    }

    baseLogger.debug(message, meta);
  }

  /**
   * Clean old log files
   * @param {number} daysToKeep - Number of days to keep logs
   */
  cleanOldLogs(daysToKeep = 7) {
    try {
      ensureLogsDir();
      const files = fs.readdirSync(LOGS_DIR);
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(LOGS_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.info(`Cleaned ${cleaned} old log files`);
      }
    } catch (error) {
      this.error('Failed to clean old logs', error);
    }
  }

  /**
   * Get log statistics
   * @returns {object} Log statistics
   */
  getLogStats() {
    try {
      ensureLogsDir();
      const files = fs.readdirSync(LOGS_DIR);
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        files: []
      };

      for (const file of files) {
        const filePath = path.join(LOGS_DIR, file);
        const fileStats = fs.statSync(filePath);
        
        stats.totalSize += fileStats.size;
        stats.files.push({
          name: file,
          size: fileStats.size,
          sizeMB: (fileStats.size / 1024 / 1024).toFixed(2),
          modified: fileStats.mtime
        });
      }

      stats.totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
      return stats;
    } catch (error) {
      this.error('Failed to get log stats', error);
      return null;
    }
  }
}

// Global enhanced logger instance
export const enhancedLogger = new EnhancedLogger({
  minLevel: process.env.LOG_LEVEL || 'info',
  enableFileLogging: true,
  enableConsoleLogging: true,
  filterSensitive: true
});

// Start periodic log cleanup
let cleanupInterval = null;

/**
 * Start automatic log cleanup
 * @param {number} intervalHours - Cleanup interval in hours
 * @param {number} daysToKeep - Days to keep logs
 */
export function startLogCleanup(intervalHours = 24, daysToKeep = 7) {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  cleanupInterval = setInterval(() => {
    enhancedLogger.cleanOldLogs(daysToKeep);
  }, intervalHours * 60 * 60 * 1000);

  enhancedLogger.info('Log cleanup started', { intervalHours, daysToKeep });
}

/**
 * Stop automatic log cleanup
 */
export function stopLogCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    enhancedLogger.info('Log cleanup stopped');
  }
}

export default EnhancedLogger;
