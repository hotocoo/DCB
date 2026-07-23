import fs from 'node:fs';
import path from 'node:path';

import { logger } from './logger.js';

const MODERATION_FILE = path.join(process.cwd(), 'data', 'moderation.json');

// Advanced Moderation and Administration System
class ModerationManager {
  constructor() {
    this.ensureStorage();
    this.loadModerationData();
    this.warningCache = new Map();
  }

  ensureStorage() {
    const dir = path.dirname(MODERATION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(MODERATION_FILE)) {
      fs.writeFileSync(
        MODERATION_FILE,
        JSON.stringify({
          warnings: {},
          bans: {},
          mutes: {},
          kicks: {},
          mod_actions: [],
          auto_mod: {
            enabled: true,
            spam_detection: true,
            caps_detection: true,
            link_detection: false,
            invite_detection: true,
            bad_words: [],
          },
        }),
      );
    }
  }

  loadModerationData() {
    try {
      const data = JSON.parse(fs.readFileSync(MODERATION_FILE));
      this.moderationData = data;
    } catch (error) {
      logger.error('Failed to load moderation data', error);
      this.moderationData = {
        warnings: {},
        bans: {},
        mutes: {},
        kicks: {},
        mod_actions: [],
      };
    }
  }

  saveModerationData() {
    try {
      fs.writeFileSync(MODERATION_FILE, JSON.stringify(this.moderationData, undefined, 2));
    } catch (error) {
      logger.error('Failed to save moderation data', error);
    }
  }

  // Helper: ensure a nested object path exists, then return it.
  ensureNested(container, ...keys) {
    let cursor = container;
    for (const key of keys) {
      const hasKey = Object.hasOwn(cursor, key);
      // eslint-disable-next-line security/detect-object-injection -- key existence checked via Object.hasOwn above
      const existing = hasKey ? cursor[key] : undefined;
      if (!hasKey || existing === null || typeof existing !== 'object') {
        // eslint-disable-next-line security/detect-object-injection -- key existence checked via Object.hasOwn above
        cursor[key] = {};
      }
      // eslint-disable-next-line security/detect-object-injection -- key existence checked via Object.hasOwn above
      cursor = cursor[key];
    }
    return cursor;
  }

  // Advanced Warning System
  warnUser(guildId, userId, options = {}) {
    const { moderatorId, reason, severity = 'medium' } = options;
    const guildWarnings = this.ensureNested(this.moderationData.warnings, guildId);
    if (!Object.hasOwn(guildWarnings, userId)) {
      // eslint-disable-next-line security/detect-object-injection -- userId guarded by Object.hasOwn
      guildWarnings[userId] = [];
    }

    const warning = {
      id: `warn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      severity,
      timestamp: Date.now(),
      active: true,
    };

    // eslint-disable-next-line security/detect-object-injection -- userId guarded by Object.hasOwn
    guildWarnings[userId].push(warning);

    // Log moderation action
    this.logModAction({ guildId, action: 'warn', targetUserId: userId, moderatorId, reason });

    this.saveModerationData();
    return warning;
  }

  getUserWarnings(guildId, userId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    return this.moderationData.warnings[guildId]?.[userId] || [];
  }

  removeWarning(guildId, userId, warningId, moderatorId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    const warnings = this.moderationData.warnings[guildId]?.[userId];
    if (!warnings) return false;

    const warningIndex = warnings.findIndex((w) => w.id === warningId);
    if (warningIndex === -1) return false;

    // eslint-disable-next-line security/detect-object-injection -- warningIndex bounds-checked via findIndex
    warnings[warningIndex].active = false;
    // eslint-disable-next-line security/detect-object-injection -- warningIndex bounds-checked via findIndex
    warnings[warningIndex].removedBy = moderatorId;
    // eslint-disable-next-line security/detect-object-injection -- warningIndex bounds-checked via findIndex
    warnings[warningIndex].removedAt = Date.now();

    this.logModAction({
      guildId,
      action: 'remove_warning',
      targetUserId: userId,
      moderatorId,
      reason: `Removed warning: ${warningId}`,
    });
    this.saveModerationData();
    return true;
  }

  // Advanced Mute System
  muteUser(guildId, userId, options = {}) {
    const { moderatorId, reason, duration = 3_600_000 } = options;
    const guildMutes = this.ensureNested(this.moderationData.mutes, guildId);

    const mute = {
      id: `mute_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      duration,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      active: true,
    };

    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    guildMutes[userId] = mute;
    this.logModAction({
      guildId,
      action: 'mute',
      targetUserId: userId,
      moderatorId,
      reason: `${reason} (${Math.round(duration / 60_000)}m)`,
    });

    this.saveModerationData();
    return mute;
  }

  unmuteUser(guildId, userId, moderatorId, reason = 'Manual unmute') {
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    const mute = this.moderationData.mutes[guildId]?.[userId];
    if (!mute) return false;

    mute.active = false;
    mute.unmutedBy = moderatorId;
    mute.unmutedAt = Date.now();
    mute.unmuteReason = reason;

    this.logModAction({ guildId, action: 'unmute', targetUserId: userId, moderatorId, reason });
    this.saveModerationData();
    return true;
  }

  isUserMuted(guildId, userId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    const mute = this.moderationData.mutes[guildId]?.[userId];
    if (!mute || !mute.active) return false;

    if (Date.now() > mute.endTime) {
      mute.active = false;
      this.saveModerationData();
      return false;
    }

    return {
      muted: true,
      endTime: mute.endTime,
      reason: mute.reason,
      remaining: mute.endTime - Date.now(),
    };
  }

  // Advanced Ban System
  banUser(guildId, userId, options = {}) {
    const { moderatorId, reason, duration } = options; // undefined = permanent
    const guildBans = this.ensureNested(this.moderationData.bans, guildId);

    const ban = {
      id: `ban_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      duration,
      startTime: Date.now(),
      endTime: duration ? Date.now() + duration : undefined,
      permanent: !duration,
      active: true,
    };

    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    guildBans[userId] = ban;
    this.logModAction({ guildId, action: 'ban', targetUserId: userId, moderatorId, reason });

    this.saveModerationData();
    return ban;
  }

  unbanUser(guildId, userId, moderatorId, reason = 'Manual unban') {
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    const ban = this.moderationData.bans[guildId]?.[userId];
    if (!ban) return false;

    ban.active = false;
    ban.unbannedBy = moderatorId;
    ban.unbannedAt = Date.now();
    ban.unbanReason = reason;

    this.logModAction({ guildId, action: 'unban', targetUserId: userId, moderatorId, reason });
    this.saveModerationData();
    return true;
  }

  isUserBanned(guildId, userId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    const ban = this.moderationData.bans[guildId]?.[userId];
    if (!ban || !ban.active) return false;

    if (ban.endTime && Date.now() > ban.endTime) {
      ban.active = false;
      this.saveModerationData();
      return false;
    }

    return {
      banned: true,
      permanent: ban.permanent,
      reason: ban.reason,
      remaining: ban.endTime ? ban.endTime - Date.now() : undefined,
    };
  }

  // Kick System
  kickUser(guildId, userId, options = {}) {
    const { moderatorId, reason } = options;
    const guildKicks = this.ensureNested(this.moderationData.kicks, guildId);
    if (!Object.hasOwn(guildKicks, userId)) {
      // eslint-disable-next-line security/detect-object-injection -- userId guarded by Object.hasOwn
      guildKicks[userId] = [];
    }

    const kick = {
      id: `kick_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      timestamp: Date.now(),
    };

    // eslint-disable-next-line security/detect-object-injection -- userId guarded by Object.hasOwn
    guildKicks[userId].push(kick);
    this.logModAction({ guildId, action: 'kick', targetUserId: userId, moderatorId, reason });

    this.saveModerationData();
    return kick;
  }

  // Moderation Action Logging
  logModAction(options = {}) {
    const { guildId, action, targetUserId, moderatorId, reason } = options;
    const modAction = {
      id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      guildId,
      action,
      targetUserId,
      moderatorId,
      reason,
      timestamp: Date.now(),
    };

    this.moderationData.mod_actions.push(modAction);

    // Keep only last 1000 actions
    if (this.moderationData.mod_actions.length > 1000) {
      this.moderationData.mod_actions = this.moderationData.mod_actions.slice(-1000);
    }

    this.saveModerationData();
    return modAction;
  }

  getModActions(guildId, limit = 50) {
    return this.moderationData.mod_actions
      .filter((action) => action.guildId === guildId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Advanced Auto-Moderation
  checkAutoMod(guildId, message, userId) {
    const autoMod = this.moderationData.auto_mod;
    if (!autoMod.enabled) return { triggered: false };

    const violations = [];

    // Spam detection
    if (autoMod.spam_detection) {
      const spamCheck = this.checkSpam(message, userId);
      if (spamCheck.triggered) violations.push(spamCheck);
    }

    // Caps detection
    if (autoMod.caps_detection) {
      const capsCheck = this.checkCaps(message);
      if (capsCheck.triggered) violations.push(capsCheck);
    }

    // Bad words detection
    if (autoMod.bad_words.length > 0) {
      const badWordsCheck = this.checkBadWords(message, autoMod.bad_words);
      if (badWordsCheck.triggered) violations.push(badWordsCheck);
    }

    return {
      triggered: violations.length > 0,
      violations,
    };
  }

  checkSpam(message, userId) {
    const now = Date.now();
    const recentMessages = this.warningCache.get(`${userId}_messages`) || [];

    // Check for repeated messages
    const repeatedMessages = recentMessages.filter((msg) => msg.content === message.content && now - msg.timestamp < 10_000);

    if (repeatedMessages.length >= 3) {
      return {
        triggered: true,
        type: 'spam',
        severity: 'medium',
        reason: 'Repeated messages detected',
      };
    }

    // Add current message to cache
    recentMessages.push({ content: message.content, timestamp: now });
    if (recentMessages.length > 10) {
      recentMessages.shift(); // Keep only last 10 messages
    }
    this.warningCache.set(`${userId}_messages`, recentMessages);

    return { triggered: false };
  }

  checkCaps(message) {
    const content = typeof message === 'string' ? message : message.content;
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;

    if (capsRatio > 0.7 && content.length > 10) {
      return {
        triggered: true,
        type: 'caps',
        severity: 'low',
        reason: 'Excessive capital letters',
      };
    }

    return { triggered: false };
  }

  checkBadWords(message, badWords) {
    const lowerMessage = message.toLowerCase();

    for (const word of badWords) {
      if (lowerMessage.includes(word.toLowerCase())) {
        return {
          triggered: true,
          type: 'bad_words',
          severity: 'high',
          reason: `Inappropriate language: ${word}`,
        };
      }
    }

    return { triggered: false };
  }

  // Role Management
  assignRole(options = {}) {
    const { guildId, userId, roleId, moderatorId, reason } = options;
    return this.logModAction({
      guildId,
      action: 'role_assign',
      targetUserId: userId,
      moderatorId,
      reason: `${reason} (Role: ${roleId})`,
    });
  }

  removeRole(options = {}) {
    const { guildId, userId, roleId, moderatorId, reason } = options;
    return this.logModAction({
      guildId,
      action: 'role_remove',
      targetUserId: userId,
      moderatorId,
      reason: `${reason} (Role: ${roleId})`,
    });
  }

  // Message Management
  deleteMessage(options = {}) {
    const { guildId, channelId, moderatorId, reason } = options;
    return this.logModAction({
      guildId,
      action: 'message_delete',
      targetUserId: undefined,
      moderatorId,
      reason: `${reason} (Channel: ${channelId})`,
    });
  }

  // User Statistics for Moderation
  getUserModStats(guildId, userId) {
    const warnings = this.getUserWarnings(guildId, userId).filter((w) => w.active);
    // eslint-disable-next-line security/detect-object-injection -- guildId/userId are function parameters
    const kicks = this.moderationData.kicks[guildId]?.[userId]?.length || 0;
    const mutesEntry =
      Object.hasOwn(this.moderationData.mutes, guildId) &&
      // eslint-disable-next-line security/detect-object-injection -- guildId guarded by Object.hasOwn
      this.moderationData.mutes[guildId]?.[userId];
    const mutes = mutesEntry
      ? // eslint-disable-next-line security/detect-object-injection -- userId from optional chain above
        this.moderationData.mutes[guildId][userId].active
        ? 1
        : 0
      : 0;
    const bansEntry =
      Object.hasOwn(this.moderationData.bans, guildId) &&
      // eslint-disable-next-line security/detect-object-injection -- guildId guarded by Object.hasOwn
      this.moderationData.bans[guildId]?.[userId];
    const bans = bansEntry
      ? // eslint-disable-next-line security/detect-object-injection -- userId from optional chain above
        this.moderationData.bans[guildId][userId].active
        ? 1
        : 0
      : 0;

    return {
      warnings: warnings.length,
      kicks,
      mutes,
      bans,
      total_actions: warnings.length + kicks + mutes + bans,
      risk_level: this.calculateRiskLevel(warnings, kicks, mutes, bans),
    };
  }

  calculateRiskLevel(warnings, kicks, mutes, bans) {
    let riskScore = 0;
    riskScore += warnings * 1; // 1 point per warning
    riskScore += kicks * 3; // 3 points per kick
    riskScore += mutes * 2; // 2 points per mute
    riskScore += bans * 5; // 5 points per ban

    if (riskScore >= 15) return 'critical';
    if (riskScore >= 10) return 'high';
    if (riskScore >= 5) return 'medium';
    if (riskScore >= 1) return 'low';
    return 'none';
  }

  // Advanced Filtering System
  shouldFilterMessage(message, guildId) {
    const autoMod = this.moderationData.auto_mod;

    // Check for Discord invites
    if (autoMod.invite_detection && /discord\.gg\/\w+/.test(message.content)) {
      return { filter: true, reason: 'Discord invite detected' };
    }

    // Check for excessive mentions
    const mentionCount = (message.content.match(/<@!?(\d+)>/g) || []).length;
    if (mentionCount > 5) {
      return { filter: true, reason: 'Excessive mentions' };
    }

    return { filter: false };
  }

  // Cleanup expired punishments and caches
  cleanup() {
    const now = Date.now();

    // Clean up expired mutes
    // eslint-disable-next-line security/detect-object-injection -- keys iterated from Object.keys
    for (const guildId of Object.keys(this.moderationData.mutes)) {
      // eslint-disable-next-line security/detect-object-injection -- guildId from Object.keys iteration
      const guildBucket = this.moderationData.mutes[guildId];
      for (const userId of Object.keys(guildBucket)) {
        // eslint-disable-next-line security/detect-object-injection -- userId from Object.keys iteration
        const mute = guildBucket[userId];
        if (mute.active && mute.endTime && now > mute.endTime) {
          mute.active = false;
        }
      }
    }

    // Clean up expired bans
    // eslint-disable-next-line security/detect-object-injection -- keys iterated from Object.keys
    for (const guildId of Object.keys(this.moderationData.bans)) {
      // eslint-disable-next-line security/detect-object-injection -- guildId from Object.keys iteration
      const guildBucket = this.moderationData.bans[guildId];
      for (const userId of Object.keys(guildBucket)) {
        // eslint-disable-next-line security/detect-object-injection -- userId from Object.keys iteration
        const ban = guildBucket[userId];
        if (ban.active && ban.endTime && now > ban.endTime) {
          ban.active = false;
        }
      }
    }

    // Clean up warning cache for inactive users (older than 1 hour)
    const cleanupThreshold = 60 * 60 * 1000; // 1 hour
    for (const [key, messages] of this.warningCache.entries()) {
      const recentMessages = messages.filter((msg) => now - msg.timestamp < cleanupThreshold);
      if (recentMessages.length === 0) {
        this.warningCache.delete(key);
        logger.warn(`[MODERATION] Cleaned up warning cache for key: ${key}`);
      } else {
        this.warningCache.set(key, recentMessages);
      }
    }

    // Clean up old moderation actions (keep only last 500)
    if (this.moderationData.mod_actions.length > 500) {
      this.moderationData.mod_actions = this.moderationData.mod_actions.slice(-500);
    }

    this.saveModerationData();
  }

  // Test/Cleanup helper: wipe a user's moderation history across all
  // guilds. Removes them from `warnings[guildId]`, scrubs any actions
  // in `mod_actions` that target them, and clears any mute/ban state.
  // Used by automated tests to keep `data/moderation.json` from
  // accumulating test artifacts.
  resetUser(userId) {
    if (!userId || typeof userId !== 'string') return false;
    let removed = false;

    // warnings: shape is { [guildId]: { [userId]: [warnings] } }
    for (const [guildId, users] of Object.entries(this.moderationData.warnings || {})) {
      if (users && Object.prototype.hasOwnProperty.call(users, userId)) {
        delete this.moderationData.warnings[guildId][userId];
        removed = true;
        // Tidy empty guild buckets so the file stays small.
        if (Object.keys(this.moderationData.warnings[guildId]).length === 0) {
          delete this.moderationData.warnings[guildId];
        }
      }
    }

    // mutes: shape is { [guildId]: { [userId]: { until, reason } } }
    if (this.moderationData.mutes) {
      for (const [guildId, users] of Object.entries(this.moderationData.mutes)) {
        if (users && Object.prototype.hasOwnProperty.call(users, userId)) {
          delete this.moderationData.mutes[guildId][userId];
          removed = true;
          if (Object.keys(this.moderationData.mutes[guildId]).length === 0) {
            delete this.moderationData.mutes[guildId];
          }
        }
      }
    }

    // bans: shape is { [guildId]: { [userId]: { reason, bannedBy } } }
    if (this.moderationData.bans) {
      for (const [guildId, users] of Object.entries(this.moderationData.bans)) {
        if (users && Object.prototype.hasOwnProperty.call(users, userId)) {
          delete this.moderationData.bans[guildId][userId];
          removed = true;
          if (Object.keys(this.moderationData.bans[guildId]).length === 0) {
            delete this.moderationData.bans[guildId];
          }
        }
      }
    }

    // mod_actions: array of records; scrub any that involve the user as
    // target or moderator. NOTE: mod_action records use `targetUserId`
    // (not `userId`) as the field name — see ModerationManager.logModAction.
    if (Array.isArray(this.moderationData.mod_actions)) {
      const before = this.moderationData.mod_actions.length;
      this.moderationData.mod_actions = this.moderationData.mod_actions.filter((a) => a.targetUserId !== userId && a.moderatorId !== userId);
      if (this.moderationData.mod_actions.length !== before) removed = true;
    }

    if (removed) this.saveModerationData();
    return removed;
  }
}

// Export singleton instance
export const moderationManager = new ModerationManager();

// Convenience functions
export function warnUser(guildId, userId, options = {}) {
  return moderationManager.warnUser(guildId, userId, options);
}

export function muteUser(guildId, userId, options = {}) {
  return moderationManager.muteUser(guildId, userId, options);
}

export function banUser(guildId, userId, options = {}) {
  return moderationManager.banUser(guildId, userId, options);
}

export function kickUser(guildId, userId, options = {}) {
  return moderationManager.kickUser(guildId, userId, options);
}

export function isUserMuted(guildId, userId) {
  return moderationManager.isUserMuted(guildId, userId);
}

export function isUserBanned(guildId, userId) {
  return moderationManager.isUserBanned(guildId, userId);
}

export function getUserWarnings(guildId, userId) {
  return moderationManager.getUserWarnings(guildId, userId);
}

export function checkAutoMod(guildId, message, userId) {
  return moderationManager.checkAutoMod(guildId, message, userId);
}

export function getModActions(guildId, limit = 50) {
  return moderationManager.getModActions(guildId, limit);
}

export function getUserModStats(guildId, userId) {
  return moderationManager.getUserModStats(guildId, userId);
}

export function unmuteUser(guildId, userId, moderatorId, reason = 'Manual unmute') {
  return moderationManager.unmuteUser(guildId, userId, moderatorId, reason);
}

export function unbanUser(guildId, userId, moderatorId, reason = 'Manual unban') {
  return moderationManager.unbanUser(guildId, userId, moderatorId, reason);
}

// Test/Cleanup helper exposed at the module level. See
// ModerationManager.resetUser for details.
export function resetUserModerationData(userId) {
  return moderationManager.resetUser(userId);
}

// Auto-cleanup every 5 minutes. `unref()` is needed so this timer
// doesn't keep the Node event loop alive in one-shot scripts / CI tests.
const moderationCleanupInterval = setInterval(
  () => {
    moderationManager.cleanup();
  },
  5 * 60 * 1000,
);
if (typeof moderationCleanupInterval.unref === 'function') {
  moderationCleanupInterval.unref();
}
