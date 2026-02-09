import fs from 'node:fs';
import path from 'node:path';

const COOLDOWNS_FILE = path.join(process.cwd(), 'data', 'cooldowns.json');

// Advanced Cooldown Management System
class CooldownManager {
  constructor() {
    this.ensureStorage();
    this.loadCooldowns();
    // Performance: Use nested Map structure for O(1) user lookups
    this.tempCooldowns = new Map(); // Map<userId, Map<action, endTime>>
    this.userCooldowns = new Map(); // Organized by user for fast access
  }

  ensureStorage() {
    const dir = path.dirname(COOLDOWNS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(COOLDOWNS_FILE)) {
      fs.writeFileSync(COOLDOWNS_FILE, JSON.stringify({}));
    }
  }

  loadCooldowns() {
    try {
      const data = JSON.parse(fs.readFileSync(COOLDOWNS_FILE));
      this.persistentCooldowns = data;
    }
    catch (error) {
      console.error('Failed to load cooldowns:', error);
      this.persistentCooldowns = {};
    }
  }

  saveCooldowns() {
    try {
      fs.writeFileSync(COOLDOWNS_FILE, JSON.stringify(this.persistentCooldowns, null, 2));
    }
    catch (error) {
      console.error('Failed to save cooldowns:', error);
    }
  }

  // Default cooldown configurations (in milliseconds)
  getDefaultCooldowns() {
    return {
      // Command cooldowns
      'rpg_explore': 30_000,      // 30 seconds between explorations
      'rpg_fight': 10_000,        // 10 seconds between fights
      'rpg_boss': 300_000,        // 5 minutes between boss fights
      'guild_create': 3_600_000,   // 1 hour between guild creation
      'guild_join': 60_000,       // 1 minute between guild joins
      'trade_offer': 30_000,      // 30 seconds between trade offers
      'auction_create': 600_000,  // 10 minutes between auction creation

      // Game cooldowns
      'trivia_game': 60_000,      // 1 minute between trivia games
      'hangman_game': 30_000,     // 30 seconds between hangman games
      'memory_game': 45_000,      // 45 seconds between memory games
      'coin_flip': 5000,         // 5 seconds between coin flips
      'weather_check': 10_000,    // 10 seconds between weather checks

      // Button cooldowns
      'button_explore': 5000,    // 5 seconds between button presses for exploration
      'button_combat': 3000,     // 3 seconds between combat button presses
      'button_inventory': 2000,  // 2 seconds between inventory button presses
      'button_guild': 3000,      // 3 seconds between guild button presses
      'button_trade': 5000,      // 5 seconds between trade button presses
      'button_music': 2000,      // 2 seconds between music button presses

      // Chat cooldowns
      'ai_chat': 3000,           // 3 seconds between AI messages
      'ai_chat_dm': 5000,        // 5 seconds for DMs (more lenient)

      // Global cooldowns
      'command_global': 1000,    // 1 second global command cooldown
      'message_global': 2000,    // 2 seconds global message cooldown
    };
  }

  // Check if user is on cooldown for specific action
  isOnCooldown(userId, action, customCooldown = null) {
    const now = Date.now();
    const cooldown = customCooldown || this.getDefaultCooldowns()[action] || 5000;

    // Check in-memory cooldowns first (more recent)
    const memoryKey = `${userId}_${action}`;
    const memoryCooldown = this.tempCooldowns.get(memoryKey);

    if (memoryCooldown && now < memoryCooldown) {
      return {
        onCooldown: true,
        remaining: memoryCooldown - now,
        cooldown: cooldown
      };
    }

    // Check persistent cooldowns
    const persistentKey = `${userId}_${action}`;
    const persistentCooldown = this.persistentCooldowns[persistentKey];

    if (persistentCooldown && now < persistentCooldown) {
      return {
        onCooldown: true,
        remaining: persistentCooldown - now,
        cooldown: cooldown
      };
    }

    return {
      onCooldown: false,
      remaining: 0,
      cooldown: cooldown
    };
  }

  // Set cooldown for user action
  setCooldown(userId, action, customCooldown = null) {
    const now = Date.now();
    const cooldown = customCooldown || this.getDefaultCooldowns()[action] || 5000;
    const endTime = now + cooldown;

    const key = `${userId}_${action}`;

    // Store in memory for immediate access (old format for backwards compatibility)
    this.tempCooldowns.set(key, endTime);
    
    // Performance: Store in user-indexed structure for O(1) lookup
    if (!this.userCooldowns.has(userId)) {
      this.userCooldowns.set(userId, new Map());
    }
    this.userCooldowns.get(userId).set(action, endTime);

    // Store persistently for longer cooldowns
    if (cooldown > 60_000) { // Only persist cooldowns longer than 1 minute
      this.persistentCooldowns[key] = endTime;
      this.saveCooldowns();
    }

    return endTime;
  }

  // Get remaining cooldown time formatted
  getFormattedCooldown(remaining) {
    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    else {
      return `${seconds}s`;
    }
  }

  // Advanced cooldown management
  setContextCooldown(userId, context, action, cooldown) {
    // Context-aware cooldowns (e.g., different cooldowns per guild)
    const key = `${userId}_${context}_${action}`;
    const endTime = Date.now() + cooldown;

    this.tempCooldowns.set(key, endTime);
    return endTime;
  }

  isOnContextCooldown(userId, context, action) {
    const now = Date.now();
    const key = `${userId}_${context}_${action}`;
    const cooldownEnd = this.tempCooldowns.get(key);

    if (cooldownEnd && now < cooldownEnd) {
      return {
        onCooldown: true,
        remaining: cooldownEnd - now
      };
    }

    return { onCooldown: false };
  }

  // Cooldown exemptions for VIP users or special roles
  checkCooldownExemption(userId, guildId, action) {
    // This would check for VIP roles, premium subscriptions, etc.
    // For now, return false (no exemptions)
    return false;
  }

  // Bulk cooldown management
  getAllUserCooldowns(userId) {
    const now = Date.now();
    const cooldowns = {};

    // Performance: Direct user lookup for O(1) access
    if (this.userCooldowns.has(userId)) {
      const userActions = this.userCooldowns.get(userId);
      for (const [action, endTime] of userActions) {
        if (now < endTime) {
          cooldowns[action] = {
            remaining: endTime - now,
            endTime: endTime
          };
        }
      }
    } else {
      // Fallback: Only check old format if user not found in new structure
      // This ensures backwards compatibility during migration
      for (const [key, endTime] of this.tempCooldowns) {
        if (key.startsWith(`${userId}_`) && now < endTime) {
          const action = key.replace(`${userId}_`, '');
          cooldowns[action] = {
            remaining: endTime - now,
            endTime: endTime
          };
        }
      }
    }

    // Check persistent cooldowns (these can coexist with in-memory cooldowns)
    for (const [key, endTime] of Object.entries(this.persistentCooldowns)) {
      if (key.startsWith(`${userId}_`) && now < endTime) {
        const action = key.replace(`${userId}_`, '');
        if (!cooldowns[action]) {
          cooldowns[action] = {
            remaining: endTime - now,
            endTime: endTime
          };
        }
      }
    }

    return cooldowns;
  }

  clearUserCooldowns(userId) {
    // Performance: Direct user deletion instead of iteration
    this.userCooldowns.delete(userId);
    
    // Clear all cooldowns for a user (admin function)
    for (const [key] of this.tempCooldowns) {
      if (key.startsWith(`${userId}_`)) {
        this.tempCooldowns.delete(key);
      }
    }

    for (const key of Object.keys(this.persistentCooldowns)) {
      if (key.startsWith(`${userId}_`)) {
        delete this.persistentCooldowns[key];
      }
    }

    this.saveCooldowns();
    return true;
  }

  // Adaptive cooldowns based on usage patterns
  getAdaptiveCooldown(userId, action, baseCooldown) {
    // This would analyze user's usage patterns and adjust cooldowns accordingly
    // For example, frequent users might get slightly longer cooldowns to prevent spam
    // VIP users might get shorter cooldowns

    const exemptions = this.checkCooldownExemption(userId, null, action);

    if (exemptions) {
      return Math.floor(baseCooldown * 0.5); // 50% reduction for VIPs
    }

    // For now, return base cooldown
    return baseCooldown;
  }

  // Cooldown statistics and analytics
  getCooldownStats() {
    const now = Date.now();
    const activeCooldowns = {
      memory: 0,
      persistent: 0,
      total: 0
    };

    for (const endTime of this.tempCooldowns.values()) {
      if (now < endTime) activeCooldowns.memory++;
    }

    for (const endTime of Object.values(this.persistentCooldowns)) {
      if (now < endTime) activeCooldowns.persistent++;
    }

    activeCooldowns.total = activeCooldowns.memory + activeCooldowns.persistent;

    return activeCooldowns;
  }

  // Performance: Lazy cleanup - only clean when accessed, not on interval
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // Clean up expired in-memory cooldowns
    // Collect keys to delete to avoid modifying Map during iteration
    const keysToDelete = [];
    for (const [key, endTime] of this.tempCooldowns) {
      if (now >= endTime) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.tempCooldowns.delete(key);
      cleaned++;
    }
    
    // Clean up user-indexed cooldowns
    const usersToClean = [];
    for (const [userId, actions] of this.userCooldowns) {
      const actionsToDelete = [];
      for (const [action, endTime] of actions) {
        if (now >= endTime) {
          actionsToDelete.push(action);
        }
      }
      for (const action of actionsToDelete) {
        actions.delete(action);
        cleaned++;
      }
      // Mark empty user entries for removal
      if (actions.size === 0) {
        usersToClean.push(userId);
      }
    }
    // Remove empty user entries
    for (const userId of usersToClean) {
      this.userCooldowns.delete(userId);
    }

    // Clean up expired persistent cooldowns
    let persistentCleaned = false;
    for (const [key, endTime] of Object.entries(this.persistentCooldowns)) {
      if (now >= endTime) {
        delete this.persistentCooldowns[key];
        persistentCleaned = true;
        cleaned++;
      }
    }

    // Only save if we actually cleaned persistent cooldowns
    if (persistentCleaned) {
      this.saveCooldowns();
    }
    
    return cleaned;
  }

  // Function to determine button cooldown type based on customId
  getButtonCooldownType(customId) {
    if (!customId) return 'button_explore'; // default

    const [action] = customId.split(':');

    if (action.startsWith('explore_')) return 'button_explore';
    if (action.startsWith('combat_')) return 'button_combat';
    if (action.startsWith('inventory_')) return 'button_inventory';
    if (action.startsWith('guild_')) return 'button_guild';
    if (action.startsWith('trade_')) return 'button_trade';
    if (action.startsWith('music_')) return 'button_music';

    return 'button_explore'; // default
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

// Export the function from the class instance

// Auto-cleanup every minute
setInterval(() => {
  cooldownManager.cleanup();
}, 60_000);
