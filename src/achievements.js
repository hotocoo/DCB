import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { logger } from './logger.js';

const OLD_ACH_FILE = path.join(process.cwd(), 'data', 'achievements.json');

// Achievement definitions — static, never change
export const ACHIEVEMENT_DEFINITIONS = {
  first_character: { id: 'first_character', name: '🎮 Born to Adventure', description: 'Create your first RPG character', icon: '🎭', category: 'rpg', rarity: 'common', points: 10, condition: (s) => s.characters_created >= 1 },
  class_master: { id: 'class_master', name: '🏆 Class Act', description: 'Try all character classes', icon: '👑', category: 'rpg', rarity: 'rare', points: 50, condition: (s) => s.classes_tried >= 4 },
  dragon_slayer: { id: 'dragon_slayer', name: "🐲 Dragon's Bane", description: 'Defeat 10 boss monsters', icon: '⚔️', category: 'rpg', rarity: 'epic', points: 100, condition: (s) => s.bosses_defeated >= 10 },
  treasure_hunter: { id: 'treasure_hunter', name: '💎 Hidden Riches', description: 'Find 50 items while exploring', icon: '💰', category: 'rpg', rarity: 'rare', points: 75, condition: (s) => s.items_found >= 50 },
  trivia_master: { id: 'trivia_master', name: '🧠 Knowledge Seeker', description: 'Answer 100 trivia questions correctly', icon: '🎓', category: 'games', rarity: 'epic', points: 150, condition: (s) => s.trivia_correct >= 100 },
  memory_champion: { id: 'memory_champion', name: '🧩 Mind Palace', description: 'Complete 20 memory games', icon: '🏛️', category: 'games', rarity: 'rare', points: 80, condition: (s) => s.memory_games_completed >= 20 },
  hangman_legend: { id: 'hangman_legend', name: '🔤 Word Wizard', description: 'Win 50 hangman games', icon: '📚', category: 'games', rarity: 'epic', points: 120, condition: (s) => s.hangman_wins >= 50 },
  poll_creator: { id: 'poll_creator', name: '📊 Voice of the People', description: 'Create 10 polls', icon: '🗳️', category: 'social', rarity: 'common', points: 25, condition: (s) => s.polls_created >= 10 },
  community_helper: { id: 'community_helper', name: '🤝 Helpful Soul', description: 'Help other users 25 times', icon: '🌟', category: 'social', rarity: 'rare', points: 60, condition: (s) => s.help_actions >= 25 },
  bot_friend: { id: 'bot_friend', name: '💬 Chatty Companion', description: 'Have 500 conversations with the bot', icon: '💕', category: 'special', rarity: 'legendary', points: 200, condition: (s) => s.messages_sent >= 500 },
  early_adopter: { id: 'early_adopter', name: '🚀 Pioneer', description: 'Be among the first to use all new features', icon: '⭐', category: 'special', rarity: 'legendary', points: 300, condition: (s) => s.features_tried >= 10 },
  lucky_duck: { id: 'lucky_duck', name: '🍀 Fortunate Soul', description: 'Get heads 10 times in a row on coin flips', icon: '🎰', category: 'fun', rarity: 'epic', points: 90, condition: (s) => s.coin_streak >= 10 },
  weather_watcher: { id: 'weather_watcher', name: '🌤️ Weather Wise', description: 'Check weather for 20 different locations', icon: '🌍', category: 'fun', rarity: 'common', points: 30, condition: (s) => s.weather_checks >= 20 },
};

export const ACHIEVEMENT_RARITIES = {
  common: { name: 'Common', color: 0x8b_8b_8b, multiplier: 1 },
  rare: { name: 'Rare', color: 0x4c_af_50, multiplier: 1.5 },
  epic: { name: 'Epic', color: 0x9c_27_b0, multiplier: 2 },
  legendary: { name: 'Legendary', color: 0xff_98_00, multiplier: 3 },
};

function migrateFromJson() {
  const db = getDb();
  if (!db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="achievements"').get()) return;
  if (!fs.existsSync(OLD_ACH_FILE)) return;

  try {
    const data = JSON.parse(fs.readFileSync(OLD_ACH_FILE, 'utf8')) || {};
    for (const [uid, info] of Object.entries(data)) {
      db.prepare('INSERT OR REPLACE INTO achievements (user_id, achievement_data) VALUES (?, ?)').run(uid, JSON.stringify(info));
    }
    logger.info(`Migrated ${Object.keys(data).length} user achievement sets to SQLite`);
  } catch (err) { logger.error('Achievement migration failed', err instanceof Error ? err : new Error(String(err))); }
}

function getDefaultData() {
  return { achievements: [], stats: { characters_created: 0, classes_tried: 0, bosses_defeated: 0, items_found: 0, trivia_correct: 0, memory_games_completed: 0, hangman_wins: 0, polls_created: 0, help_actions: 0, messages_sent: 0, features_tried: 0, coin_streak: 0, weather_checks: 0, games: { tictactoe_wins: 0, tictactoe_games: 0 } }, total_points: 0, level: 1 };
}

function getUserData(userId) {
  migrateFromJson();
  const db = getDb();
  let row; try { row = db.prepare('SELECT achievement_data FROM achievements WHERE user_id = ?').get(userId); } catch { return getDefaultData(); }
  let data; try { data = JSON.parse(row?.achievement_data || '{}'); } catch { data = {}; }
  if (!data.achievements) Object.assign(data, getDefaultData());
  return data;
}

function saveUserData(userId, data) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO achievements (user_id, achievement_data) VALUES (?, ?)').run(userId, JSON.stringify(data));
}

export function updateStats(userId, statUpdates) {
  const user = getUserData(userId);

  for (const [key, value] of Object.entries(statUpdates)) {
    if (typeof value === 'number' && typeof user.stats[key] === 'number') user.stats[key] += value;
    else if (value && typeof value === 'object') {
      if (!user.stats[key] || typeof user.stats[key] !== 'object') user.stats[key] = {};
      for (const [subKey, subValue] of Object.entries(value)) {
        if (typeof subValue === 'number') { if (typeof user.stats[key][subKey] !== 'number') user.stats[key][subKey] = 0; user.stats[key][subKey] += subValue; }
      }
    }
  }

  const newAchievements = checkUserAchievements(userId);
  user.total_points = user.achievements.reduce((t, id) => t + (ACHIEVEMENT_DEFINITIONS[id]?.points || 0), 0);
  user.level = Math.floor(user.total_points / 100) + 1;

  saveUserData(userId, user);
  return { newAchievements, userData: user };
}

export function getUserStats(userId) { return getUserData(userId); }

export function checkUserAchievements(userId) {
  const user = getUserData(userId);
  const earned = [];
  for (const [id, def] of Object.entries(ACHIEVEMENT_DEFINITIONS)) { if (!user.achievements.includes(id) && def.condition(user.stats)) { user.achievements.push(id); earned.push(def); } }
  if (earned.length) saveUserData(userId, user);
  return earned;
}

export function getAchievementInfo(id) { return ACHIEVEMENT_DEFINITIONS[id] || null; }
export function getAllAchievements() { return ACHIEVEMENT_DEFINITIONS; }

export function getUserAchievements(userId) {
  const user = getUserData(userId);
  return user.achievements.map((id) => ACHIEVEMENT_DEFINITIONS[id]).filter(Boolean);
}

export function getAchievementLeaderboard(limit = 10) {
  migrateFromJson();
  const db = getDb();
  const entries = [];
  for (const row of db.prepare('SELECT * FROM achievements').all()) {
    try {
      const d = JSON.parse(row.achievement_data);
      entries.push({ userId: row.user_id, total_points: d.total_points || 0, level: d.level || 1, achievements_count: d.achievements?.length || 0 });
    } catch {}
  }
  return entries.sort((a, b) => b.total_points - a.total_points).slice(0, limit);
}

// Backward-compatible singleton API for callers using achievementManager.*
// Alias for backwards compatibility
export function updateUserStats(userId, statUpdates) {
  return updateStats(userId, statUpdates);
}

export const achievementManager = { updateStats, getUserStats, checkUserAchievements, getAchievementInfo, getAllAchievements, getUserAchievements };
