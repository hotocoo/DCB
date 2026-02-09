/**
 * Centralized configuration management
 * @fileoverview All environment variables and configuration in one place
 * @module utils/config
 */

import 'dotenv/config';

/**
 * Parse integer from environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {number} defaultValue - Default value
 * @returns {number} Parsed integer value
 */
function getInt(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean value
 */
function getBool(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get string from environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {string} defaultValue - Default value
 * @returns {string} String value
 */
function getString(key, defaultValue = '') {
  return process.env[key] || defaultValue;
}

/**
 * Application configuration
 */
export const config = {
  // Discord configuration
  discord: {
    token: getString('DISCORD_TOKEN'),
    clientId: getString('CLIENT_ID'),
    guildId: getString('GUILD_ID'),
    botStatus: getString('BOT_STATUS', 'online'),
    botActivity: getString('BOT_ACTIVITY', 'Playing RPG Adventures')
  },

  // AI configuration
  ai: {
    openaiApiKey: getString('OPENAI_API_KEY'),
    localModelUrl: getString('LOCAL_MODEL_URL'),
    localModelApi: getString('LOCAL_MODEL_API', 'openai-compatible'),
    defaultModel: getString('DEFAULT_AI_MODEL', 'gpt-3.5-turbo'),
    maxTokens: getInt('AI_MAX_TOKENS', 2000),
    temperature: Number.parseFloat(getString('AI_TEMPERATURE', '0.7')),
    timeout: getInt('AI_TIMEOUT', 30000)
  },

  // External APIs
  api: {
    openWeatherKey: getString('OPENWEATHER_API_KEY'),
    spotifyClientId: getString('SPOTIFY_CLIENT_ID'),
    spotifyClientSecret: getString('SPOTIFY_CLIENT_SECRET'),
    youtubeApiKey: getString('YOUTUBE_API_KEY')
  },

  // Database configuration
  database: {
    url: getString('DATABASE_URL', './data/bot.db'),
    maxConnections: getInt('DB_MAX_CONNECTIONS', 10),
    backupInterval: getInt('DB_BACKUP_INTERVAL', 24),
    enableWal: getBool('DB_ENABLE_WAL', true),
    busyTimeout: getInt('DB_BUSY_TIMEOUT', 5000)
  },

  // Performance configuration
  performance: {
    loginTimeout: getInt('LOGIN_TIMEOUT_MS', 15000),
    maxFileSize: getInt('MAX_FILE_SIZE', 50 * 1024 * 1024),
    cacheExpiry: getInt('CACHE_EXPIRY_MS', 3600000),
    messageProcessingLimit: getInt('MESSAGE_PROCESSING_LIMIT', 1000)
  },

  // Rate limiting
  rateLimit: {
    commandsPerMinute: getInt('COMMANDS_PER_MINUTE', 60),
    messagesPerMinute: getInt('MESSAGES_PER_MINUTE', 120),
    apiCallsPerMinute: getInt('API_CALLS_PER_MINUTE', 100)
  },

  // Economy system
  economy: {
    startingGold: getInt('STARTING_GOLD', 1000),
    dailyReward: getInt('DAILY_REWARD', 100),
    maxBusinesses: getInt('MAX_BUSINESSES', 5),
    taxRate: Number.parseFloat(getString('TAX_RATE', '0.05'))
  },

  // RPG system
  rpg: {
    startingLevel: getInt('RPG_STARTING_LEVEL', 1),
    maxLevel: getInt('RPG_MAX_LEVEL', 100),
    expMultiplier: Number.parseFloat(getString('RPG_EXP_MULTIPLIER', '1.0'))
  },

  // Logging
  logging: {
    level: getString('LOG_LEVEL', 'info'),
    enableFileLogging: getBool('ENABLE_FILE_LOGGING', true),
    maxLogFiles: getInt('MAX_LOG_FILES', 10),
    maxLogSize: getInt('MAX_LOG_SIZE', 10 * 1024 * 1024)
  },

  // Feature flags
  features: {
    enableMusic: getBool('ENABLE_MUSIC', true),
    enableRPG: getBool('ENABLE_RPG', true),
    enableEconomy: getBool('ENABLE_ECONOMY', true),
    enableAI: getBool('ENABLE_AI', true),
    enableModeration: getBool('ENABLE_MODERATION', true),
    enableGames: getBool('ENABLE_GAMES', true)
  },

  // Environment
  env: {
    isProduction: getString('NODE_ENV', 'development') === 'production',
    isDevelopment: getString('NODE_ENV', 'development') === 'development',
    nodeVersion: process.version,
    platform: process.platform
  }
};

/**
 * Validates required configuration values
 * @throws {Error} If required values are missing
 */
export function validateConfig() {
  const errors = [];

  if (!config.discord.token) {
    errors.push('DISCORD_TOKEN is required');
  }

  if (!config.discord.clientId) {
    errors.push('CLIENT_ID is required');
  }

  if (config.features.enableAI && !config.ai.openaiApiKey && !config.ai.localModelUrl) {
    errors.push('Either OPENAI_API_KEY or LOCAL_MODEL_URL is required when AI is enabled');
  }

  if (errors.length > 0) {
    throw new Error(\`Configuration validation failed:\\n\${errors.join('\\n')}\`);
  }
}

export default config;
