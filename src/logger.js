/**
 * Logger module for Discord bot application.
 * Provides structured logging with file output and console formatting.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Configuration constants for logging.
 */
const LOG_DIR = path.join(process.cwd(), 'logs');
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 100;
const KEEP_RECENT_ENTRIES = 50;

/**
 * ANSI color codes for console output formatting.
 */
const CONSOLE_COLORS = {
  info: '\u001B[36m',    // Cyan
  warn: '\u001B[33m',    // Yellow
  error: '\u001B[31m',   // Red
  success: '\u001B[32m', // Green
  debug: '\u001B[35m'    // Magenta
};

/**
 * Logger class providing structured logging capabilities.
 */
class Logger {
  /**
   * Creates a new Logger instance.
   */
  constructor() {
    this.logBuffer = [];
    this.flushInterval = setInterval(() => this.flushLogs(), FLUSH_INTERVAL_MS);
    // Don't keep the Node event loop alive solely for log flushing —
    // one-shot scripts (CI tests, `node scripts/test-imports.mjs`, etc.)
    // should be able to exit without waiting for the next flush.
    if (typeof this.flushInterval.unref === 'function') this.flushInterval.unref();
    this.ensureLogDirectory();
  }

  /**
   * Ensures the log directory exists.
   */
  ensureLogDirectory() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  /**
   * Gets the current log file path based on today's date.
   * @returns {string} The full path to the current log file.
   */
  getLogFilePath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `bot-${today}.log`);
  }

  /**
   * Formats a log message with timestamp and metadata.
   * @param {string} level - Log level (info, warn, error, etc.)
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   * @returns {string} Formatted log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  /**
   * Writes a message to the log file.
   * @param {string} message - The message to write
   */
  writeToFile(message) {
    try {
      const logFile = this.getLogFilePath();
      fs.appendFileSync(logFile, message + '\n');
    }
    catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Logs a message with specified level and metadata.
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  log(level, message, meta = {}) {
    const formattedMessage = this.formatMessage(level, message, meta);

    // Console output with color formatting
    const color = CONSOLE_COLORS[level] || CONSOLE_COLORS.info;
    console.log(`${color}${formattedMessage}\u001B[0m`);

    // File output (only for important levels to reduce I/O)
    if (['error', 'warn', 'info', 'success'].includes(level)) {
      this.writeToFile(formattedMessage);
    }

    // Buffer for potential batch processing and recent log retrieval
    this.logBuffer.push({
      level,
      message: formattedMessage,
      timestamp: Date.now(),
      meta
    });

    // Prevent memory leaks by limiting buffer size
    if (this.logBuffer.length > MAX_BUFFER_SIZE) {
      this.logBuffer = this.logBuffer.slice(-KEEP_RECENT_ENTRIES);
    }
  }

  /**
   * Logs an info-level message.
   * @param {string} message - The message to log
   * @param {object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  /**
   * Logs a warning message.
   * @param {string} message - The message to log
   * @param {object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  /**
   * Logs an error message with optional error details.
   * @param {string} message - The error message
   * @param {Error|null} error - The error object
   * @param {object} meta - Additional metadata
   */
  error(message, error = null, meta = {}) {
    const errorInfo = error ? {
      ...meta,
      error: error.message,
      stack: error.stack
    } : meta;
    this.log('error', message, errorInfo);
  }

  /**
   * Logs a success message.
   * @param {string} message - The message to log
   * @param {object} meta - Additional metadata
   */
  success(message, meta = {}) {
    this.log('success', message, meta);
  }

  /**
   * Logs a debug message (only if DEBUG=true).
   * @param {string} message - The message to log
   * @param {object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (process.env.DEBUG === 'true') {
      this.log('debug', message, meta);
    }
  }

  /**
   * Flushes buffered logs and manages buffer size.
   */
  flushLogs() {
    // Maintain buffer size to prevent memory leaks
    if (this.logBuffer.length > MAX_BUFFER_SIZE) {
      this.logBuffer = this.logBuffer.slice(-KEEP_RECENT_ENTRIES);
    }
  }

  /**
   * Retrieves recent log entries.
   * @param {number} count - Number of recent entries to retrieve
   * @returns {Array} Array of recent log entries
   */
  getRecentLogs(count = 10) {
    return this.logBuffer.slice(-count);
  }

  /**
   * Logs command execution results.
   * @param {object} interaction - Discord interaction object
   * @param {boolean} success - Whether the command executed successfully
   * @param {Error|null} error - Error object if command failed
   */
  logCommand(interaction, success = true, error = null) {
    // `interaction.commandName` only exists on ChatInputCommand. For
    // button / modal / context-menu interactions we have to use a
    // different identifier (customId) so log lines don't read
    // "Command failed: /undefined".
    const isChatInput = typeof interaction.commandName === 'string';
    const identifier = isChatInput
      ? interaction.commandName
      : (interaction.customId || interaction.constructor.name || 'unknown');
    const verb = isChatInput ? `/${identifier}` : `[${identifier}]`;

    // Modern Discord user objects (post-username-rewrite) no longer
    // expose `discriminator` — guard so the log line still prints
    // something useful.
    const username = interaction.user?.username || 'unknown';
    const discriminator = interaction.user?.discriminator;
    const userTag = discriminator && discriminator !== '0'
      ? `${username}#${discriminator}`
      : username;

    const meta = {
      command: identifier,
      interactionType: interaction.constructor.name,
      user: userTag,
      userId: interaction.user?.id,
      guild: interaction.guild?.name || 'DM',
      guildId: interaction.guild?.id || null,
      channel: interaction.channel?.name || 'Unknown',
      success
    };

    if (success) {
      this.success(`Interaction executed: ${verb}`, meta);
    }
    else {
      this.error(`Interaction failed: ${verb}`, error, meta);
    }
  }

  /**
   * Logs RPG-related events.
   * @param {string} event - Event type
   * @param {object} details - Event details
   * @param {string} userId - User ID associated with the event
   */
  logRPGEvent(event, details, userId) {
    this.info(`RPG Event: ${event}`, { ...details, userId });
  }

  /**
   * Logs achievement unlocks.
   * @param {object} achievement - Achievement object with id, name, points
   * @param {string} userId - User ID who unlocked the achievement
   */
  logAchievement(achievement, userId) {
    this.success(`Achievement Unlocked: ${achievement.name}`, {
      achievement: achievement.id,
      points: achievement.points,
      userId
    });
  }

  /**
   * Cleans up resources on shutdown.
   */
  cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushLogs();
  }
}

// Export singleton instance
export const logger = new Logger();

// Convenience functions for common logging patterns
/**
 * Convenience function for logging command execution.
 * @param {object} interaction - Discord interaction object
 * @param {boolean} success - Whether the command succeeded
 * @param {Error|null} error - Error object if failed
 */
export function logCommandExecution(interaction, success = true, error = null) {
  logger.logCommand(interaction, success, error);
}

/**
 * Convenience function for logging errors.
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {object} context - Additional context
 */
export function logError(message, error, context = {}) {
  logger.error(message, error, context);
}

/**
 * Convenience function for logging RPG events.
 * @param {string} event - Event type
 * @param {object} details - Event details
 * @param {string} userId - User ID
 */
export function logRPGEvent(event, details, userId) {
  logger.logRPGEvent(event, details, userId);
}

/**
 * Convenience function for logging achievements.
 * @param {object} achievement - Achievement object
 * @param {string} userId - User ID
 */
export function logAchievement(achievement, userId) {
  logger.logAchievement(achievement, userId);
}

// NOTE: Process signal handlers are intentionally NOT registered here.
// The bot's main entry point (src/index.js) owns SIGINT/SIGTERM/uncaughtException
// via its gracefulShutdown() flow — registering here too would bypass the
// Discord client teardown and database cleanup that index.js coordinates.
