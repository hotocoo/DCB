import { getDb } from './database.js';
import { logger } from './logger.js';

/**
 * Cooldown system backed by SQLite.
 * 
 * Design: all cooldowns stored in DB for crash consistency, but cleaned up
 * aggressively every minute to keep the table small. No more JSON file I/O.
 */

// Default cooldown configurations (in milliseconds)
const DEFAULT_COOLDOWNS = {
  // Command cooldowns
  rpg_explore: 30_000,
  rpg_fight: 10_000,
  rpg_boss: 300_000,
  guild_create: 3_600_000,
  guild_join: 60_000,
  trade_offer: 30_000,
  auction_create: 600_000,

  // Game cooldowns
  trivia_game: 60_000,
  hangman_game: 30_000,
  memory_game: 45_000,
  coin_flip: 5_000,
  weather_check: 10_000,

  // Button cooldowns
  button_explore: 5_000,
  button_combat: 3_000,
  button_inventory: 2_000,
  button_guild: 3_000,
  button_trade: 5_000,
  button_music: 2_000,

  // Chat cooldowns
  ai_chat: 3_000,
  ai_chat_dm: 5_000,

  // Global cooldowns
  command_global: 1_000,
  message_global: 2_000,
};

class CooldownManager {
  constructor() {
    this.cleanup(); // Remove any stale entries on startup
  }

  // Check if user is on cooldown for specific action
  isOnCooldown(userId, action, customCooldown = null) {
    const now = Date.now();
    const cooldown = customCooldown || DEFAULT_COOLDOWNS[action] || 5_000;

    try {
      const db = getDb();
      const row = db.prepare(
        "SELECT expires_at FROM cooldowns WHERE user_id = ? AND action = ?"
      ).get(userId, action);

      if (row && now < row.expires_at) {
        return { onCooldown: true, remaining: row.expires_at - now, cooldown };
      }
      return { onCooldown: false, remaining: 0, cooldown };
    } catch (error) {
      logger.error('Failed to check cooldown', error instanceof Error ? error : new Error(String(error)));
      return { onCooldown: false, remaining: 0, cooldown };
    }
  }

  // Set cooldown for user action
  setCooldown(userId, action, customCooldown = null) {
    const now = Date.now();
    const cooldown = customCooldown || DEFAULT_COOLDOWNS[action] || 5_000;
    const endTime = now + cooldown;

    try {
      const db = getDb();
      db.prepare(
        "INSERT OR REPLACE INTO cooldowns (user_id, action, expires_at) VALUES (?, ?, ?)"
      ).run(userId, action, endTime);
      return endTime;
    } catch (error) {
      logger.error('Failed to set cooldown', error instanceof Error ? error : new Error(String(error)));
      return endTime;
    }
  }

  // Get remaining cooldown time formatted
  getFormattedCooldown(remaining) {
    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Advanced cooldown management
  setContextCooldown(userId, context, action, cooldown) {
    const key = `${userId}_${context}_${action}`;
    return this.setCooldown(key.split('_')[0], `${context}:${action}`, cooldown);
  }

  isOnContextCooldown(userId, context, action) {
    const result = this.isOnCooldown(userId, `${context}:${action}`);
    return result.onCooldown ? { onCooldown: true, remaining: result.remaining } : { onCooldown: false };
  }

  // Cooldown exemptions for VIP users or special roles (placeholder for premium features)
  checkCooldownExemption(userId, _guildId, _action) {
    return false;
  }

  // Bulk cooldown management
  getAllUserCooldowns(userId) {
    const now = Date.now();
    const cooldowns = {};

    try {
      const db = getDb();
      for (const row of db.prepare(
        "SELECT action, expires_at FROM cooldowns WHERE user_id = ? AND expires_at > ?"
      ).all(userId, now)) {
        cooldowns[row.action] = { remaining: row.expires_at - now, endTime: row.expires_at };
      }
    } catch (error) {
      logger.error('Failed to get user cooldowns', error instanceof Error ? error : new Error(String(error)));
    }

    return cooldowns;
  }

  clearUserCooldowns(userId) {
    try {
      const db = getDb();
      db.prepare("DELETE FROM cooldowns WHERE user_id = ?").run(userId);
      return true;
    } catch (error) {
      logger.error('Failed to clear user cooldowns', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  // Adaptive cooldowns based on usage patterns
  getAdaptiveCooldown(userId, action, baseCooldown) {
    const exemptions = this.checkCooldownExemption(userId, null, action);
    if (exemptions) return Math.floor(baseCooldown * 0.5);
    return baseCooldown;
  }

  // Cooldown statistics and analytics
  getCooldownStats() {
    const now = Date.now();
    let total = 0;

    try {
      const db = getDb();
      const row = db.prepare("SELECT COUNT(*) AS c FROM cooldowns WHERE expires_at > ?").get(now);
      total = row?.c || 0;
    } catch (error) {
      logger.error('Failed to get cooldown stats', error instanceof Error ? error : new Error(String(error)));
    }

    return { memory: 0, persistent: total, total };
  }

  // Cleanup expired cooldowns
  cleanup() {
    try {
      const db = getDb();
      db.prepare("DELETE FROM cooldowns WHERE expires_at <= ?").run(Date.now());
    } catch (error) {
      logger.error('Failed to cleanup cooldowns', error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Function to determine button cooldown type based on customId
  getButtonCooldownType(customId) {
    if (!customId) return 'button_explore';

    const [action] = customId.split(':');

    if (action.startsWith('explore_')) return 'button_explore';
    if (action.startsWith('combat_')) return 'button_combat';
    if (action.startsWith('inventory_')) return 'button_inventory';
    if (action.startsWith('guild_')) return 'button_guild';
    if (action.startsWith('trade_')) return 'button_trade';
    if (action.startsWith('music_')) return 'button_music';

    return 'button_explore';
  }
}

// Export singleton instance
export const cooldownManager = new CooldownManager();

// Convenience functions
export function isOnCooldown(userId, action, customCooldown = null) {
  return cooldownManager.isOnCooldown(userId, action, customCooldown);
}

export function setCooldown(userId, action, customCooldown = null) {
  return cooldownManager.setCooldown(userId, action, customCooldown);
}

export function getFormattedCooldown(remaining) {
  return cooldownManager.getFormattedCooldown(remaining);
}

export function setContextCooldown(userId, context, action, cooldown) {
  return cooldownManager.setContextCooldown(userId, context, action, cooldown);
}

export function isOnContextCooldown(userId, context, action) {
  return cooldownManager.isOnContextCooldown(userId, context, action);
}

export function getAllUserCooldowns(userId) {
  return cooldownManager.getAllUserCooldowns(userId);
}

export function clearUserCooldowns(userId) {
  return cooldownManager.clearUserCooldowns(userId);
}

export function getAdaptiveCooldown(userId, action, baseCooldown) {
  return cooldownManager.getAdaptiveCooldown(userId, action, baseCooldown);
}

export function getCooldownStats() {
  return cooldownManager.getCooldownStats();
}

export function getButtonCooldownType(customId) {
  return cooldownManager.getButtonCooldownType(customId);
}

// Auto-cleanup every minute. unref() so this timer doesn't keep the event loop alive.
const cooldownCleanupInterval = setInterval(() => {
  cooldownManager.cleanup();
}, 60_000);
if (typeof cooldownCleanupInterval.unref === 'function') cooldownCleanupInterval.unref();
