import fs from 'node:fs';
import path from 'node:path';

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
      fs.writeFileSync(MODERATION_FILE, JSON.stringify({
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
          bad_words: []
        }
      }));
    }
  }

  loadModerationData() {
    try {
      const data = JSON.parse(fs.readFileSync(MODERATION_FILE));
      this.moderationData = data;
    }
    catch (error) {
      console.error('Failed to load moderation data:', error);
      this.moderationData = {
        warnings: {},
        bans: {},
        mutes: {},
        kicks: {},
        mod_actions: []
      };
    }
  }

  saveModerationData() {
    try {
      fs.writeFileSync(MODERATION_FILE, JSON.stringify(this.moderationData, null, 2));
    }
    catch (error) {
      console.error('Failed to save moderation data:', error);
    }
  }

  // Advanced Warning System
  warnUser(guildId, userId, moderatorId, reason, severity = 'medium') {
    if (!this.moderationData.warnings[guildId]) {
      this.moderationData.warnings[guildId] = {};
    }
    if (!this.moderationData.warnings[guildId][userId]) {
      this.moderationData.warnings[guildId][userId] = [];
    }

    const warning = {
      id: `warn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      severity,
      timestamp: Date.now(),
      active: true
    };

    this.moderationData.warnings[guildId][userId].push(warning);

    // Log moderation action
    this.logModAction(guildId, 'warn', userId, moderatorId, reason);

    this.saveModerationData();
    return warning;
  }

  getUserWarnings(guildId, userId) {
    return this.moderationData.warnings[guildId]?.[userId] || [];
  }

  removeWarning(guildId, userId, warningId, moderatorId) {
    const warnings = this.moderationData.warnings[guildId]?.[userId];
    if (!warnings) return false;

    const warningIndex = warnings.findIndex(w => w.id === warningId);
    if (warningIndex === -1) return false;

    warnings[warningIndex].active = false;
    warnings[warningIndex].removedBy = moderatorId;
    warnings[warningIndex].removedAt = Date.now();

    this.logModAction(guildId, 'remove_warning', userId, moderatorId, `Removed warning: ${warningId}`);
    this.saveModerationData();
    return true;
  }

  // Advanced Mute System
  muteUser(guildId, userId, moderatorId, reason, duration = 3_600_000) { // 1 hour default
    if (!this.moderationData.mutes[guildId]) {
      this.moderationData.mutes[guildId] = {};
    }

    const mute = {
      id: `mute_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      duration,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      active: true
    };

    this.moderationData.mutes[guildId][userId] = mute;
    this.logModAction(guildId, 'mute', userId, moderatorId, `${reason} (${Math.round(duration / 60_000)}m)`);

    this.saveModerationData();
    return mute;
  }

  unmuteUser(guildId, userId, moderatorId, reason = 'Manual unmute') {
    const mute = this.moderationData.mutes[guildId]?.[userId];
    if (!mute) return false;

    mute.active = false;
    mute.unmutedBy = moderatorId;
    mute.unmutedAt = Date.now();
    mute.unmuteReason = reason;

    this.logModAction(guildId, 'unmute', userId, moderatorId, reason);
    this.saveModerationData();
    return true;
  }

  isUserMuted(guildId, userId) {
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
      remaining: mute.endTime - Date.now()
    };
  }

  // Advanced Ban System
  banUser(guildId, userId, moderatorId, reason, duration = null) { // null = permanent
    if (!this.moderationData.bans[guildId]) {
      this.moderationData.bans[guildId] = {};
    }

    const ban = {
      id: `ban_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      duration,
      startTime: Date.now(),
      endTime: duration ? Date.now() + duration : null,
      permanent: !duration,
      active: true
    };

    this.moderationData.bans[guildId][userId] = ban;
    this.logModAction(guildId, 'ban', userId, moderatorId, reason);

    this.saveModerationData();
    return ban;
  }

  unbanUser(guildId, userId, moderatorId, reason = 'Manual unban') {
    const ban = this.moderationData.bans[guildId]?.[userId];
    if (!ban) return false;

    ban.active = false;
    ban.unbannedBy = moderatorId;
    ban.unbannedAt = Date.now();
    ban.unbanReason = reason;

    this.logModAction(guildId, 'unban', userId, moderatorId, reason);
    this.saveModerationData();
    return true;
  }

  isUserBanned(guildId, userId) {
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
      remaining: ban.endTime ? ban.endTime - Date.now() : null
    };
  }

  // Kick System
  kickUser(guildId, userId, moderatorId, reason) {
    if (!this.moderationData.kicks[guildId]) {
      this.moderationData.kicks[guildId] = {};
    }
    if (!this.moderationData.kicks[guildId][userId]) {
      this.moderationData.kicks[guildId][userId] = [];
    }

    const kick = {
      id: `kick_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      moderatorId,
      reason,
      timestamp: Date.now()
    };

    this.moderationData.kicks[guildId][userId].push(kick);
    this.logModAction(guildId, 'kick', userId, moderatorId, reason);

    this.saveModerationData();
    return kick;
  }

  // Moderation Action Logging
  logModAction(guildId, action, targetUserId, moderatorId, reason) {
    const modAction = {
      id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      guildId,
      action,
      targetUserId,
      moderatorId,
      reason,
      timestamp: Date.now()
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
      .filter(action => action.guildId === guildId)
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
      violations
    };
  }

  checkSpam(message, userId) {
    const now = Date.now();
    const recentMessages = this.warningCache.get(`${userId}_messages`) || [];

    // Check for repeated messages
    const repeatedMessages = recentMessages.filter(msg =>
      msg.content === message.content && now - msg.timestamp < 10_000
    );

    if (repeatedMessages.length >= 3) {
      return {
        triggered: true,
        type: 'spam',
        severity: 'medium',
        reason: 'Repeated messages detected'
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
        reason: 'Excessive capital letters'
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
          reason: `Inappropriate language: ${word}`
        };
      }
    }

    return { triggered: false };
  }

  // Role Management
  assignRole(guildId, userId, roleId, moderatorId, reason) {
    return this.logModAction(guildId, 'role_assign', userId, moderatorId, `${reason} (Role: ${roleId})`);
  }

  removeRole(guildId, userId, roleId, moderatorId, reason) {
    return this.logModAction(guildId, 'role_remove', userId, moderatorId, `${reason} (Role: ${roleId})`);
  }

  // Message Management
  deleteMessage(guildId, channelId, messageId, moderatorId, reason) {
    return this.logModAction(guildId, 'message_delete', null, moderatorId, `${reason} (Channel: ${channelId})`);
  }

  // User Statistics for Moderation
  getUserModStats(guildId, userId) {
    const warnings = this.getUserWarnings(guildId, userId).filter(w => w.active);
    const kicks = this.moderationData.kicks[guildId]?.[userId]?.length || 0;
    const mutes = this.moderationData.mutes[guildId]?.[userId] ?
      (this.moderationData.mutes[guildId][userId].active ? 1 : 0) : 0;
    const bans = this.moderationData.bans[guildId]?.[userId] ?
      (this.moderationData.bans[guildId][userId].active ? 1 : 0) : 0;

    return {
      warnings: warnings.length,
      kicks,
      mutes,
      bans,
      total_actions: warnings.length + kicks + mutes + bans,
      risk_level: this.calculateRiskLevel(warnings, kicks, mutes, bans)
    };
  }

  calculateRiskLevel(warnings, kicks, mutes, bans) {
    let riskScore = 0;
    riskScore += warnings * 1;  // 1 point per warning
    riskScore += kicks * 3;     // 3 points per kick
    riskScore += mutes * 2;     // 2 points per mute
    riskScore += bans * 5;      // 5 points per ban

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
    for (const guildId in this.moderationData.mutes) {
      for (const userId in this.moderationData.mutes[guildId]) {
        const mute = this.moderationData.mutes[guildId][userId];
        if (mute.active && mute.endTime && now > mute.endTime) {
          mute.active = false;
        }
      }
    }

    // Clean up expired bans
    for (const guildId in this.moderationData.bans) {
      for (const userId in this.moderationData.bans[guildId]) {
        const ban = this.moderationData.bans[guildId][userId];
        if (ban.active && ban.endTime && now > ban.endTime) {
          ban.active = false;
        }
      }
    }

    // Clean up warning cache for inactive users (older than 1 hour)
    const cleanupThreshold = 60 * 60 * 1000; // 1 hour
    for (const [key, messages] of this.warningCache.entries()) {
      const recentMessages = messages.filter(msg => now - msg.timestamp < cleanupThreshold);
      if (recentMessages.length === 0) {
        this.warningCache.delete(key);
        console.log(`[MODERATION] Cleaned up warning cache for key: ${key}`);
      }
      else {
        this.warningCache.set(key, recentMessages);
      }
    }

    // Clean up old moderation actions (keep only last 500)
    if (this.moderationData.mod_actions.length > 500) {
      this.moderationData.mod_actions = this.moderationData.mod_actions.slice(-500);
    }

    this.saveModerationData();
  }
}

// Export singleton instance
export const moderationManager = new ModerationManager();

// Convenience functions
export function warnUser(guildId, userId, moderatorId, reason, severity = 'medium') {
  return moderationManager.warnUser(guildId, userId, moderatorId, reason, severity);
}

export function muteUser(guildId, userId, moderatorId, reason, duration = 3_600_000) {
  return moderationManager.muteUser(guildId, userId, moderatorId, reason, duration);
}

export function banUser(guildId, userId, moderatorId, reason, duration = null) {
  return moderationManager.banUser(guildId, userId, moderatorId, reason, duration);
}

export function kickUser(guildId, userId, moderatorId, reason) {
  return moderationManager.kickUser(guildId, userId, moderatorId, reason);
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

// Auto-cleanup every 5 minutes
setInterval(() => {
  moderationManager.cleanup();
}, 5 * 60 * 1000);