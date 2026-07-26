import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { logger } from './logger.js';

const OLD_PROFILES_DIR = path.join(process.cwd(), 'data', 'players');

function safeUserId(userId) {
  if (typeof userId !== 'string' || !userId || userId.length > 64) throw new Error('Invalid user id');
  if (!/^[\w-]+$/.test(userId)) throw new Error('Invalid user id');
  return userId;
}

let migrated = false;

function migrateFromJson() {
  if (migrated) return;
  migrated = true;

  const db = getDb();
  let count = 0;

  try {
    if (!fs.existsSync(OLD_PROFILES_DIR)) return;

    for (const file of fs.readdirSync(OLD_PROFILES_DIR).filter((f) => f.endsWith('.json'))) {
      const uid = path.basename(file, '.json');
      const filePath = path.join(OLD_PROFILES_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.profile) {
          db.prepare('INSERT OR REPLACE INTO profiles (user_id, profile_data) VALUES (?, ?)').run(uid, JSON.stringify(data.profile));
          count++;
        }
      } catch (err) { logger.error(`Failed to migrate profile ${uid}`, err); }
    }

    if (count > 0) {
      try { fs.writeFileSync(OLD_PROFILES_DIR + '/.migrated', 'migrated'); } catch {}
      logger.info(`Migrated ${count} profiles to SQLite`);
    }
  } catch (err) { logger.error('Profile JSON migration failed', err); }
}

function ensureUser(uid) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(uid);
}

// Default profile factory - returns fresh stats structure
function createDefaultProfile(userId, username) {
  return {
    userId,
    username: username || 'Player',
    displayName: username || 'Player',
    bio: '',
    avatar: undefined,
    badges: [],
    preferences: { theme: 'default', privacy: 'public', notifications: true, language: 'en' },
    statistics: {
      rpg: { characters_created: 0, total_level: 0, highest_level: 0, bosses_defeated: 0, items_collected: 0, gold_earned: 0, quests_completed: 0, locations_unlocked: 0, guild_memberships: 0 },
      games: { trivia_correct: 0, trivia_games_played: 0, hangman_wins: 0, hangman_games_played: 0, memory_games_completed: 0, memory_best_score: 0, coin_flips: 0, coin_heads_streak: 0, polls_created: 0, polls_votes_received: 0 },
      social: { guilds_created: 0, guilds_joined: 0, parties_created: 0, trades_completed: 0, achievements_earned: 0, friends_added: 0, reputation: 0 },
      activity: { commands_used: 0, messages_sent: 0, buttons_clicked: 0, first_seen: Date.now(), last_seen: Date.now(), total_session_time: 0, favorite_command: undefined, streak_days: 0 },
    },
    customization: { title: undefined, border_color: '#0099FF', profile_banner: undefined, card_style: 'modern', show_statistics: true, show_badges: true, show_activity: false },
    achievements: [],
    milestones: [],
    created: Date.now(),
    updated: Date.now(),
  };
}

export function getOrCreateProfile(userId, username) {
  migrateFromJson();
  const uid = safeUserId(userId);
  ensureUser(uid);
  const db = getDb();
  let row = db.prepare('SELECT profile_data FROM profiles WHERE user_id = ?').get(uid);

  if (!row) {
    const profile = createDefaultProfile(uid, username);
    db.prepare('INSERT INTO profiles (user_id, profile_data) VALUES (?, ?)').run(uid, JSON.stringify(profile));
    row = { profile_data: JSON.stringify(profile) };
  } else {
    let profile;
    try { profile = JSON.parse(row.profile_data); } catch { profile = createDefaultProfile(uid, username); }

    if (!profile || !profile.userId) { profile = createDefaultProfile(uid, username); }
    else if (username && profile.username !== username) { profile.username = username; profile.updated = Date.now(); db.prepare('UPDATE profiles SET profile_data = ? WHERE user_id = ?').run(JSON.stringify(profile), uid); }

    return profile || createDefaultProfile(uid, username);
  }

  try { return JSON.parse(row.profile_data); } catch { return createDefaultProfile(uid, username); }
}

export function hasProfile(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const db = getDb();
  return !!db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid);
}

export function updateProfile(userId, updates) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const profile = getOrCreateProfile(uid);
  if (updates.preferences) profile.preferences = { ...profile.preferences, ...updates.preferences };
  if (updates.customization) profile.customization = { ...profile.customization, ...updates.customization };
  if (updates.displayName !== undefined) profile.displayName = updates.displayName;
  if (updates.bio !== undefined) profile.bio = updates.bio;
  profile.updated = Date.now();
  const db = getDb();
  db.prepare('UPDATE profiles SET profile_data = ? WHERE user_id = ?').run(JSON.stringify(profile), uid);
  return profile;
}

export function updateStatistics(userId, category, statUpdates) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const profile = getOrCreateProfile(uid);
  for (const [stat, value] of Object.entries(statUpdates)) {
    if (profile.statistics[category] && typeof profile.statistics[category][stat] === 'number') {
      profile.statistics[category][stat] += value;
      updateDerivedStats(profile, category, stat, value);
    }
  }
  profile.updated = Date.now();
  const db = getDb();
  db.prepare('UPDATE profiles SET profile_data = ? WHERE user_id = ?').run(JSON.stringify(profile), uid);
  return profile;
}

function updateDerivedStats(profile, category, stat, value) {
  switch (category) {
    case 'rpg':
      if (stat === 'bosses_defeated') profile.statistics.social.reputation += value * 2;
      break;
    case 'games':
      if (stat === 'trivia_correct') {
        const totalGames = profile.statistics.games.trivia_games_played;
        if (totalGames > 0) profile.statistics.games.trivia_accuracy = (profile.statistics.games.trivia_correct / totalGames) * 100;
      }
      break;
    case 'social':
      if (stat === 'trades_completed') profile.statistics.social.reputation += value;
      break;
  }
}

export function awardBadge(userId, badgeId, badgeData) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const profile = getOrCreateProfile(uid);
  if (!profile.badges.some((b) => b.id === badgeId)) {
    profile.badges.push({ id: badgeId, ...badgeData, awarded: Date.now() });
    profile.updated = Date.now();
    const db = getDb();
    db.prepare('UPDATE profiles SET profile_data = ? WHERE user_id = ?').run(JSON.stringify(profile), uid);
    return true;
  }
  return false;
}

export function removeBadge(userId, badgeId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const profile = getOrCreateProfile(uid);
  const idx = profile.badges.findIndex((b) => b.id === badgeId);
  if (idx !== -1) {
    profile.badges.splice(idx, 1);
    profile.updated = Date.now();
    const db = getDb();
    db.prepare('UPDATE profiles SET profile_data = ? WHERE user_id = ?').run(JSON.stringify(profile), uid);
    return true;
  }
  return false;
}

export function getProfileAnalytics(userId) {
  migrateFromJson();
  const profile = getOrCreateProfile(safeUserId(userId));
  const stats = profile.statistics;
  const activityScore = Math.min(100, stats.activity.commands_used * 2 + stats.activity.messages_sent * 1 + stats.activity.buttons_clicked * 0.5 + stats.social.reputation * 0.1);
  const engagementLevel = calculateEngagementLevel(stats);
  const mostActiveCategory = Object.entries({
    rpg: stats.rpg.total_level + stats.rpg.bosses_defeated * 10 + stats.rpg.items_collected * 2,
    games: stats.games.trivia_correct * 3 + stats.games.hangman_wins * 5 + stats.games.memory_games_completed * 4,
    social: stats.social.guilds_created * 20 + stats.social.trades_completed * 8 + stats.social.reputation,
  }).sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';

  return { activityScore, engagementLevel, mostActiveCategory, totalPlayTime: Math.round(stats.activity.total_session_time / 3_600_000), accountAge: Math.round((Date.now() - stats.activity.first_seen) / (24 * 60 * 60 * 1000)), favoriteCommand: stats.activity.favorite_command, streakDays: stats.activity.streak_days };
}

function calculateEngagementLevel(stats) {
  const total = stats.activity.commands_used + stats.activity.messages_sent + stats.activity.buttons_clicked;
  if (total > 1000) return 'Legendary';
  if (total > 500) return 'Expert';
  if (total > 200) return 'Advanced';
  if (total > 100) return 'Intermediate';
  if (total > 50) return 'Active';
  if (total > 10) return 'Casual';
  return 'Newcomer';
}

export function compareProfiles(userId1, userId2) {
  migrateFromJson();
  const profile1 = getOrCreateProfile(safeUserId(userId1));
  const profile2 = getOrCreateProfile(safeUserId(userId2));
  const comparison = { rpg: compareCategory(profile1.statistics.rpg, profile2.statistics.rpg), games: compareCategory(profile1.statistics.games, profile2.statistics.games), social: compareCategory(profile1.statistics.social, profile2.statistics.social) };

  let score1 = 0, score2 = 0;
  for (const cat of Object.values(comparison)) {
    for (const stat of Object.values(cat)) { if (stat.difference > 0) score1++; else if (stat.difference < 0) score2++; }
  }

  return { profiles: [profile1, profile2], comparison, winner: score1 > score2 ? 'user1' : score2 > score1 ? 'user2' : 'tie' };
}

function compareCategory(s1, s2) {
  const cmp = {};
  for (const k of Object.keys(s1)) { if (typeof s1[k] === 'number' && typeof s2[k] === 'number') cmp[k] = { user1: s1[k], user2: s2[k], difference: s1[k] - s2[k] }; }
  return cmp;
}

export function searchProfiles(searchTerm, limit = 10) {
  migrateFromJson();
  const db = getDb();
  const term = searchTerm.toLowerCase();
  const profiles = [];
  for (const row of db.prepare('SELECT * FROM profiles').all()) {
    try {
      const p = JSON.parse(row.profile_data);
      if (p.preferences.privacy === 'private') continue;
      if ([p.username, p.displayName, p.bio].join(' ').toLowerCase().includes(term)) profiles.push(p);
      if (profiles.length >= limit) break;
    } catch {}
  }
  return profiles;
}

export function getLeaderboard(category, stat, limit = 10) {
  migrateFromJson();
  const db = getDb();
  const results = [];
  for (const row of db.prepare('SELECT * FROM profiles').all()) {
    try {
      const p = JSON.parse(row.profile_data);
      if (p.preferences.privacy === 'private') continue;
      const val = p.statistics[category]?.[stat];
      if (typeof val === 'number' && val > 0) results.push({ userId: p.userId, username: p.username, displayName: p.displayName, value: val, level: getUserLevel(p) });
    } catch {}
  }
  return results.sort((a, b) => b.value - a.value).slice(0, limit);
}

function getUserLevel(profile) {
  return Math.floor((profile.achievements.length * 10 + profile.statistics.rpg.total_level + profile.statistics.games.trivia_correct + profile.statistics.social.reputation) / 100) + 1;
}

export function exportProfile(userId) {
  migrateFromJson();
  const profile = getOrCreateProfile(safeUserId(userId));
  return { profile, exported: Date.now(), version: '1.0' };
}

export function importProfile(userId, profileData) {
  migrateFromJson();
  if (profileData.version !== '1.0') return { success: false, reason: 'incompatible_version' };
  const uid = safeUserId(userId);
  ensureUser(uid);
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO profiles (user_id, profile_data) VALUES (?, ?)').run(uid, JSON.stringify(profileData.profile));
  return { success: true };
}

export function setPrivacySettings(userId, privacySettings) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const profile = getOrCreateProfile(uid);
  if (privacySettings.privacy) profile.preferences.privacy = privacySettings.privacy;
  if (privacySettings.show_statistics !== undefined) profile.customization.show_statistics = privacySettings.show_statistics;
  if (privacySettings.show_badges !== undefined) profile.customization.show_badges = privacySettings.show_badges;
  profile.updated = Date.now();
  const db = getDb();
  db.prepare('UPDATE profiles SET profile_data = ? WHERE user_id = ?').run(JSON.stringify(profile), uid);
  return profile;
}

// Test helper: reset a user's profile to default
export function resetUserProfilesData(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const db = getDb();
  db.prepare('DELETE FROM profiles WHERE user_id = ?').run(uid);
  return true;
}
