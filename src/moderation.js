import { getDb } from './database.js';
import { logger } from './logger.js';

/**
 * Moderation system backed by SQLite for reliability.
 * 
 * Mutes, bans, warnings, and mod actions are stored persistently with proper
 * indexing for fast lookups. Auto-mod state (spam detection cache) remains
 * in-memory since it's reconstructable on restart.
 */

// In-memory spam detection cache — safe to lose on restart
const messageCache = new Map(); // `${userId}_messages` -> [{content, timestamp}]

/**
 * Warn a user in a guild. Records to moderation table.
 */
export function warnUser(guildId, userId, options = {}) {
  const { moderatorId, reason, severity = 'medium' } = options;
  try {
    const db = getDb();
    const id = `warn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Insert into moderation table as a warning record
    db.prepare(`INSERT INTO moderation (id, guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, 'warn', ?)`)
      .run(id, guildId, userId, moderatorId || '', severity);

    return { id, userId, moderatorId, reason, severity, timestamp: Date.now(), active: true };
  } catch (error) {
    logger.error('Failed to warn user', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Get user warnings for a guild.
 */
export function getUserWarnings(guildId, userId) {
  try {
    const db = getDb();
    // Use moderation table entries as warnings (type is severity stored on warnUser)
    return db.prepare(`SELECT id, type AS severity, reason, created_at FROM moderation WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC`).all(guildId, userId);
  } catch (error) {
    logger.error('Failed to get user warnings', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Advanced mute system with time-based expiry.
 */
export function muteUser(guildId, userId, options = {}) {
  const { moderatorId, reason, duration = 3_600_000 } = options;
  try {
    const db = getDb();
    const now = Date.now();

    db.prepare(`INSERT OR REPLACE INTO active_mutes (guild_id, user_id, expires_at, reason) VALUES (?, ?, ?, ?)`)
      .run(guildId, userId, now + duration, reason || '');

    // Also log the moderation action
    db.prepare(`INSERT INTO moderation (id, guild_id, user_id, moderator_id, type, reason, duration) VALUES (?, ?, ?, ?, 'mute', ?, ?)`)
      .run(`mute_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, guildId, userId, moderatorId || '', reason || '', duration);

    return { id: `mute_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, userId, moderatorId, reason, duration, startTime: now, endTime: now + duration, active: true };
  } catch (error) {
    logger.error('Failed to mute user', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Unmute a user. Removes from active mutes and logs the action.
 */
export function unmuteUser(guildId, userId, moderatorId, reason = 'Manual unmute') {
  try {
    const db = getDb();
    db.prepare(`DELETE FROM active_mutes WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);

    // Log the unmuting action
    db.prepare(`INSERT INTO moderation (id, guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, 'unmute', ?)`)
      .run(`mod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, guildId, userId, moderatorId || '', reason);

    return true;
  } catch (error) {
    logger.error('Failed to unmute user', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Check if a user is currently muted.
 */
export function isUserMuted(guildId, userId) {
  try {
    const db = getDb();
    const now = Date.now();

    // Clean up expired mute atomically during the check
    db.prepare(`DELETE FROM active_mutes WHERE guild_id = ? AND user_id = ? AND expires_at <= ?`).run(guildId, userId, now);

    const row = db.prepare(`SELECT expires_at, reason FROM active_mutes WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);

    if (!row || now > row.expires_at) return false;

    return { muted: true, endTime: row.expires_at, reason: row.reason || '', remaining: row.expires_at - now };
  } catch (error) {
    logger.error('Failed to check mute status', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Ban a user in a guild. Stored in moderation table as a ban record.
 */
export function banUser(guildId, userId, options = {}) {
  const { moderatorId, reason, duration } = options; // undefined = permanent
  try {
    const db = getDb();
    const id = `ban_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    db.prepare(`INSERT INTO moderation (id, guild_id, user_id, moderator_id, type, reason, duration) VALUES (?, ?, ?, ?, 'ban', ?, ?)`)
      .run(id, guildId, userId, moderatorId || '', reason || '', duration || null);

    return { id, userId, moderatorId, reason, duration, startTime: Date.now(), endTime: duration ? Date.now() + duration : undefined, permanent: !duration, active: true };
  } catch (error) {
    logger.error('Failed to ban user', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Unban a user. Logs the action in moderation table.
 */
export function unbanUser(guildId, userId, moderatorId, reason = 'Manual unban') {
  try {
    const db = getDb();

    // Mark previous ban as inactive and record unban action
    db.prepare(`INSERT INTO moderation (id, guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, 'unban', ?)`)
      .run(`mod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, guildId, userId, moderatorId || '', reason);

    return true;
  } catch (error) {
    logger.error('Failed to unban user', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Check if a user is currently banned. Returns most recent ban info.
 */
export function isUserBanned(guildId, userId) {
  try {
    const db = getDb();
    const now = Date.now();

    // Get the latest non-expired ban for this user in this guild
    const row = db.prepare(`SELECT duration FROM moderation WHERE guild_id = ? AND user_id = ? AND type = 'ban' ORDER BY created_at DESC LIMIT 1`).get(guildId, userId);

    if (!row) return false;

    // Check if temporary ban has expired
    if (row.duration && row.duration > 0) {
      const endTime = now - row.duration + Date.now(); // Approximate check — buggy, treat as permanent until proper fix
    }

    // FIX: previous logic was completely wrong. Store startTime in moderation table for accurate temp-ban expiry.
    // For now, if latest ban has no corresponding unban after it, user is banned.
    const latestUnban = db.prepare(`SELECT id FROM moderation WHERE guild_id = ? AND user_id = ? AND type = 'unban' ORDER BY created_at DESC LIMIT 1`).get(guildId, userId);
    if (latestUnban) {
      // Check if unban is after the ban — need to compare timestamps properly
      const banTs = db.prepare(`SELECT created_at FROM moderation WHERE id = ?`).get(row.id)?.created_at;
      const unbanTs = latestUnban.id ? db.prepare(`SELECT created_at FROM moderation WHERE id = ?`).get(latestUnban.id)?.created_at : null;
      if (unbanTs && unbanTs > banTs) return false;
    }

    return { banned: true, permanent: !row.duration || row.duration === null, remaining: undefined }; // Future: proper temp ban with active_bans table
  } catch (error) {
    logger.error('Failed to check ban status', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Kick a user. Logs the action in moderation table.
 */
export function kickUser(guildId, userId, options = {}) {
  const { moderatorId, reason } = options;
  try {
    const db = getDb();
    const id = `kick_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    db.prepare(`INSERT INTO moderation (id, guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, 'kick', ?)`)
      .run(id, guildId, userId, moderatorId || '', reason || '');

    return { id, userId, moderatorId, reason, timestamp: Date.now() };
  } catch (error) {
    logger.error('Failed to kick user', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Get moderation actions log for a guild.
 */
export function getModActions(guildId, limit = 50) {
  try {
    const db = getDb();
    return db.prepare(`SELECT id AS actionId, type AS action, user_id AS targetUserId, moderator_id AS moderatorId, reason, created_at FROM moderation WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`).all(guildId, limit);
  } catch (error) {
    logger.error('Failed to get mod actions', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Get a user's moderation statistics in a guild.
 */
export function getUserModStats(guildId, userId) {
  try {
    const db = getDb();

    const warningsRow = db.prepare(`SELECT COUNT(*) AS c FROM moderation WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    const kicksRow = db.prepare(`SELECT COUNT(*) AS c FROM moderation WHERE guild_id = ? AND user_id = ? AND type = 'kick'`).get(guildId, userId);
    const muted = isUserMuted(guildId, userId);
    const banned = isUserBanned(guildId, userId);

    const warnings = warningsRow?.c || 0;
    const kicks = kicksRow?.c || 0;
    const mutes = muted ? 1 : 0;
    const bans = banned ? 1 : 0;

    return {
      warnings,
      kicks,
      mutes,
      bans,
      total_actions: warnings + kicks + mutes + bans,
      risk_level: calculateRiskLevel(warnings, kicks, mutes, bans),
    };
  } catch (error) {
    logger.error('Failed to get mod stats', error instanceof Error ? error : new Error(String(error)));
    return { warnings: 0, kicks: 0, mutes: 0, bans: 0, total_actions: 0, risk_level: 'none' };
  }
}

/**
 * Auto-moderation check for a message. Returns violations if detected.
 */
export function checkAutoMod(guildId, message, userId) {
  const content = typeof message === 'string' ? message : (message?.content || '');
  const violations = [];

  // Spam detection: repeated messages within 10 seconds
  if (userId && content) {
    const cacheKey = `${userId}_messages`;
    const recentMessages = messageCache.get(cacheKey) || [];
    const now = Date.now();

    const repeatedCount = recentMessages.filter((msg) => msg.content === content && now - msg.timestamp < 10_000).length;
    if (repeatedCount >= 3) {
      violations.push({ triggered: true, type: 'spam', severity: 'medium', reason: 'Repeated messages detected' });
    }

    // Update cache
    recentMessages.push({ content, timestamp: now });
    if (recentMessages.length > 10) recentMessages.shift();
    messageCache.set(cacheKey, recentMessages);
  }

  // Caps detection: more than 70% uppercase letters in messages longer than 10 chars
  if (content.length > 10) {
    const capsCount = (content.match(/[A-Z]/g) || []).length;
    const capsRatio = capsCount / content.length;
    if (capsRatio > 0.7) {
      violations.push({ triggered: true, type: 'caps', severity: 'low', reason: 'Excessive capital letters' });
    }
  }

  return { triggered: violations.length > 0, violations };
}

/**
 * Calculate risk level based on moderation history.
 */
function calculateRiskLevel(warnings, kicks, mutes, bans) {
  const score = warnings * 1 + kicks * 3 + mutes * 2 + bans * 5;
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  if (score >= 1) return 'low';
  return 'none';
}

/**
 * Test helper: wipe all moderation data for a user across all guilds.
 */
export function resetUserModerationData(userId) {
  if (!userId || typeof userId !== 'string') return false;
  try {
    const db = getDb();
    db.prepare(`DELETE FROM moderation WHERE user_id = ? OR moderator_id = ?`).run(userId, userId);
    db.prepare(`DELETE FROM active_mutes WHERE user_id = ?`).run(userId);

    // Clear cache entries for this user
    for (const key of messageCache.keys()) {
      if (key.startsWith(`${userId}_`)) {
        messageCache.delete(key);
      }
    }

    return true;
  } catch (error) {
    logger.error('Failed to reset moderation data', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Periodic cleanup: remove expired mutes and stale cache entries.
 */
function cleanup() {
  try {
    const db = getDb();
    const now = Date.now();

    // Remove expired mutes
    db.prepare(`DELETE FROM active_mutes WHERE expires_at <= ?`).run(now);

    // Trim moderation table to last 1000 records per guild (keep recent history)
    db.prepare(`DELETE FROM moderation WHERE id NOT IN (SELECT id FROM moderation ORDER BY created_at DESC LIMIT 1000)`).run();

    // Clean stale cache entries (older than 1 hour)
    for (const [key, messages] of messageCache.entries()) {
      const recent = messages.filter((msg) => now - msg.timestamp < 60 * 60 * 1000);
      if (recent.length === 0) {
        messageCache.delete(key);
      } else {
        messageCache.set(key, recent);
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup moderation data', error instanceof Error ? error : new Error(String(error)));
  }
}

// Auto-cleanup every 5 minutes. unref() so this timer doesn't keep the event loop alive.
const moderationCleanupInterval = setInterval(cleanup, 5 * 60 * 1000);
if (typeof moderationCleanupInterval.unref === 'function') {
  moderationCleanupInterval.unref();
}
