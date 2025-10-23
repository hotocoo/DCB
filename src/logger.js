import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);

class Logger {
  constructor() {
    this.ensureLogDirectory();
    this.logBuffer = [];
    this.flushInterval = setInterval(() => this.flushLogs(), 5000); // Flush every 5 seconds
  }

  ensureLogDirectory() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(LOG_FILE, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, meta = {}) {
    const formattedMessage = this.formatMessage(level, message, meta);

    // Console output with colors
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      success: '\x1b[32m', // Green
      debug: '\x1b[35m'    // Magenta
    };

    const color = colors[level] || colors.info;
    console.log(`${color}${formattedMessage}\x1b[0m`);

    // File output (only for important levels)
    if (['error', 'warn', 'info'].includes(level)) {
      this.writeToFile(formattedMessage);
    }

    // Buffer for potential batch processing
    this.logBuffer.push({ level, message: formattedMessage, timestamp: Date.now() });
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  error(message, error = null, meta = {}) {
    const errorInfo = error ? {
      ...meta,
      error: error.message,
      stack: error.stack
    } : meta;
    this.log('error', message, errorInfo);
  }

  success(message, meta = {}) {
    this.log('success', message, meta);
  }

  debug(message, meta = {}) {
    if (process.env.DEBUG === 'true') {
      this.log('debug', message, meta);
    }
  }

  flushLogs() {
    // Process any buffered logs if needed
    if (this.logBuffer.length > 100) {
      this.logBuffer = this.logBuffer.slice(-50); // Keep only last 50 entries
    }
  }

  getRecentLogs(count = 10) {
    return this.logBuffer.slice(-count);
  }

  // Command execution logging
  logCommand(interaction, success = true, error = null) {
    const meta = {
      command: interaction.commandName,
      user: `${interaction.user.username}#${interaction.user.discriminator}`,
      userId: interaction.user.id,
      guild: interaction.guild?.name || 'DM',
      guildId: interaction.guild?.id || null,
      channel: interaction.channel?.name || 'Unknown',
      success
    };

    if (success) {
      this.success(`Command executed: /${interaction.commandName}`, meta);
    } else {
      this.error(`Command failed: /${interaction.commandName}`, error, meta);
    }
  }

  // RPG event logging
  logRPGEvent(event, details, userId) {
    this.info(`RPG Event: ${event}`, { ...details, userId });
  }

  // Achievement logging
  logAchievement(achievement, userId) {
    this.success(`Achievement Unlocked: ${achievement.name}`, {
      achievement: achievement.id,
      points: achievement.points,
      userId
    });
  }

  cleanup() {
    clearInterval(this.flushInterval);
    this.flushLogs();
  }
}

// Export singleton instance
export const logger = new Logger();

// Convenience functions for common logging patterns
export function logCommandExecution(interaction, success = true, error = null) {
  logger.logCommand(interaction, success, error);
}

export function logError(message, error, context = {}) {
  logger.error(message, error, context);
}

export function logRPGEvent(event, details, userId) {
  logger.logRPGEvent(event, details, userId);
}

export function logAchievement(achievement, userId) {
  logger.logAchievement(achievement, userId);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  logger.cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  logger.cleanup();
  process.exit(0);
});