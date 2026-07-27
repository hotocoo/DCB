/**
 * Daily login reward and streak tracking.
 */

import { getDb } from './database.js';
import { logger } from './logger.js';

function ensureUser(userId) {
  try { const db = getDb(); db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(userId); } catch (_) {}
}

// Reward tiers by streak length
const REWARD_TIERS = [
  { min: 1, xp: 50, gold: 20 },
  { min: 3, xp: 100, gold: 50 },
  { min: 7, xp: 250, gold: 150 },
  { min: 14, xp: 500, gold: 350 },
  { min: 30, xp: 1000, gold: 750 },
];

function getTodayStart() { return new Date().setHours(0, 0, 0, 0); }

export function getDailyState(userId) {
  ensureUser(userId);
  const db = getDb();
  const row = db.prepare('SELECT data FROM daily_rewards WHERE user_id=?').get(userId);
  const data = row ? JSON.parse(row.data) : {};
  const todayStart = getTodayStart();

  // Handle missed days: if last claim was before yesterday, streak resets
  let { streak = 0, lastClaim = 0 } = data;
  const yesterdayStart = new Date(todayStart - 86_400_000);
  if (lastClaim < yesterdayStart) {
    streak = 0;
  }

  // Claimed today already?
  const claimedToday = lastClaim >= todayStart;

  return {
    streak,
    claimedToday,
    lastClaim,
    nextReward: getNextReward(streak + (claimedToday ? 0 : 1)),
  };
}

function getNextReward(streak) {
  let tier = REWARD_TIERS[0];
  for (const t of REWARD_TIERS) { if (streak >= t.min) tier = t; }
  return { xp: tier.xp, gold: tier.gold, streak };
}

export async function claimDaily(userId) {
  ensureUser(userId);
  const state = getDailyState(userId);
  if (state.claimedToday) return { success: false, reason: 'already_claimed', message: 'You already claimed today\'s reward!' };

  const db = getDb();
  const nextStreak = state.streak + 1;
  const reward = getNextReward(nextStreak);

  // Update daily_rewards table
  let data = { streak: nextStreak, lastClaim: Date.now() };
  try {
    data = JSON.parse(db.prepare('SELECT data FROM daily_rewards WHERE user_id=?').get(userId)?.data || '{}');
  } catch { /* ignore */ }
  data.streak = nextStreak;
  data.lastClaim = Date.now();
  db.prepare('INSERT OR REPLACE INTO daily_rewards (user_id, data) VALUES (?, ?)').run(userId, JSON.stringify(data));

  // Apply XP to RPG character if exists
  try {
    const charModule = await import('./rpg.js');
    const char = charModule.getCharacter?.(userId);
    if (char && charModule.applyXp && charModule.saveCharacter) {
      charModule.applyXp(userId, char, reward.xp);
      // Add gold to character
      char.gold = (char.gold || 0) + reward.gold;
      charModule.saveCharacter(userId, char);
    }
  } catch (_) { /* ignore */ }

  return { success: true, reward, streak: nextStreak, message: `🎁 Daily Reward! Streak: ${nextStreak} days. +${reward.xp} XP, +${reward.gold} Gold!` };
}

export function getDailyLeaderboard(limit = 10) {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT data FROM daily_rewards ORDER BY CAST(json_extract(data,"$.streak") AS INTEGER) DESC LIMIT ?').all(limit);
    return rows.map((r) => JSON.parse(r.data || '{}')).filter((d) => d.streak > 0).slice(0, limit);
  } catch (err) { logger.error('daily leaderboard error', err instanceof Error ? err : new Error(String(err))); return []; }
}

// Create daily_rewards table if not exists
function ensureTable() {
  const db = getDb();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS daily_rewards (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
  } catch (err) { logger.error('daily_rewards table creation failed', err instanceof Error ? err : new Error(String(err))); }
}

ensureTable();
