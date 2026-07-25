import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { logger } from './logger.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'athena.db');

let db;

/**
 * Initialize SQLite database with schema and migrations.
 * Called once at bot startup before commands load.
 */
export function initializeDatabase() {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH, { verbose: (msg) => logger.debug('[SQL]', msg) });

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    // Foreign key enforcement
    db.pragma('foreign_keys = ON');

    createTables();
    runMigrations();

    logger.success(`Database initialized at ${DB_PATH}`);
  } catch (error) {
    logger.error('Failed to initialize database', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

function ensureDb() {
  if (!db) {
    logger.warn('Database not initialized, initializing now');
    initializeDatabase();
  }
  return db;
}

export function getDb() {
  return ensureDb();
}

/**
 * Create all core tables with proper indexes.
 */
function createTables() {
  const queries = [
    // Core user table — single source of truth for each Discord user
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT DEFAULT '',
      discriminator TEXT DEFAULT '0',
      guild_id TEXT,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // RPG character data — one per user
    `CREATE TABLE IF NOT EXISTS characters (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Adventurer',
      char_class TEXT NOT NULL DEFAULT 'warrior',
      lvl INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      skill_points INTEGER NOT NULL DEFAULT 0,
      hp INTEGER NOT NULL DEFAULT 20,
      max_hp INTEGER NOT NULL DEFAULT 20,
      mp INTEGER NOT NULL DEFAULT 10,
      max_mp INTEGER NOT NULL DEFAULT 10,
      atk INTEGER NOT NULL DEFAULT 5,
      def INTEGER NOT NULL DEFAULT 2,
      spd INTEGER NOT NULL DEFAULT 2,
      abilities TEXT NOT NULL DEFAULT '[]',
      color INTEGER NOT NULL DEFAULT 16711680,
      inventory TEXT NOT NULL DEFAULT '{}',
      equipped_weapon TEXT,
      equipped_armor TEXT,
      gold INTEGER NOT NULL DEFAULT 0,
      daily_explorations INTEGER NOT NULL DEFAULT 0,
      last_daily_reset INTEGER NOT NULL DEFAULT 0,
      session_xp_gained INTEGER NOT NULL DEFAULT 0,
      last_session_reset INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // Economy balances and transactions
    `CREATE TABLE IF NOT EXISTS economy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      details TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // User balances — denormalized for fast reads
    `CREATE TABLE IF NOT EXISTS balances (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // Businesses owned by users
    `CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      income INTEGER NOT NULL DEFAULT 25,
      last_collected INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      upgrades INTEGER NOT NULL DEFAULT 0,
      employees INTEGER NOT NULL DEFAULT 1
    )`,

    // Investments owned by users
    `CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      rate REAL NOT NULL DEFAULT 0.05,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      maturity INTEGER NOT NULL,
      returned INTEGER,
      matured_at INTEGER
    )`,

    // Cooldowns — key-value with TTL
    `CREATE TABLE IF NOT EXISTS cooldowns (
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, action)
    )`,

    // Moderation records
    `CREATE TABLE IF NOT EXISTS moderation (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT DEFAULT '',
      duration INTEGER,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // Active mutes (quick lookup)
    `CREATE TABLE IF NOT EXISTS active_mutes (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      reason TEXT DEFAULT '',
      PRIMARY KEY (guild_id, user_id)
    )`,

    // Guild configuration
    `CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      config TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // Profiles — user settings and stats
    `CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings TEXT NOT NULL DEFAULT '{}',
      stats TEXT NOT NULL DEFAULT '{}',
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,

    // Achievements
    `CREATE TABLE IF NOT EXISTS achievements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      unlocked_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (user_id, achievement_id)
    )`,

    // Indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_economy_user ON economy(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_moderation_guild_user ON moderation(guild_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cooldowns_expires ON cooldowns(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_investments_maturity ON investments(maturity, status)`,

    // Migration tracking
    `CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ];

  for (const q of queries) {
    db.exec(q);
  }
}

/**
 * Run any pending migrations.
 */
function runMigrations() {
  // Auto-migrate from old JSON files on first run if they exist
  migrateFromJson();
}

/**
 * Migrate data from legacy JSON storage files to SQLite.
 * Only runs if the tables are empty and old JSON files exist.
 */
function migrateFromJson() {
  const isEmpty = db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c === 0;
  if (!isEmpty) return; // Already has data

  logger.info('Running JSON-to-SQLite migration');

  try {
    migrateCooldowns();
    migrateEconomy();
    migrateModeration();
    migrateGuilds();
    migrateProfiles();
    migrateAchievements();
    logger.success('JSON migration completed successfully');
  } catch (error) {
    logger.error('JSON migration failed', error instanceof Error ? error : new Error(String(error)));
  }
}

function safeJsonRead(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data.trim() ? JSON.parse(data) : {};
  } catch (error) {
    logger.error(`Failed to read ${filePath}`, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

function migrateCooldowns() {
  const data = safeJsonRead(path.join(DB_DIR, 'cooldowns.json'));
  if (!data || typeof data !== 'object') return;

  const insert = db.prepare(`INSERT OR IGNORE INTO cooldowns (user_id, action, expires_at) VALUES (?, ?, ?)`);
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.userId, row.action, row.expiresAt);
    }
  });

  const now = Date.now();
  const rows = [];
  for (const [key, expiresAt] of Object.entries(data)) {
    if (expiresAt > now) {
      const parts = key.split('_');
      const userId = parts[0];
      const action = parts.slice(1).join('_');
      rows.push({ userId, action, expiresAt: Number(expiresAt) });
    }
  }

  if (rows.length > 0) {
    tx(rows);
    logger.info(`Migrated ${rows.length} active cooldowns`);
  }
}

function migrateEconomy() {
  const data = safeJsonRead(path.join(DB_DIR, 'economy.json'));
  if (!data || typeof data !== 'object') return;

  // Migrate balances
  const upsertBalance = db.prepare(`INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)`);
  for (const [userId, amount] of Object.entries(data.userBalances || {})) {
    ensureUser(userId);
    upsertBalance.run(userId, Number(amount));
  }

  // Migrate transactions
  const insertTx = db.prepare(`INSERT INTO economy (user_id, type, amount, details) VALUES (?, ?, ?, ?)`);
  for (const txn of data.transactions || []) {
    const userId = txn.user || txn.from || '';
    if (!userId) continue;
    ensureUser(userId);
    insertTx.run(
      userId,
      txn.type || 'unknown',
      Number(txn.amount) || 0,
      JSON.stringify({ from: txn.from, to: txn.to, item: txn.item, quantity: txn.quantity }),
    );
  }

  // Migrate businesses
  const insertBiz = db.prepare(`INSERT OR IGNORE INTO businesses (id, user_id, type, level, income, last_collected, upgrades, employees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const userId in data.businessData || {}) {
    ensureUser(userId);
    for (const biz of data.businessData[userId]) {
      insertBiz.run(
        biz.id, userId, biz.type, biz.level, biz.income, biz.lastCollected, biz.upgrades, biz.employees,
      );
    }
  }

  // Migrate investments
  const investInsert = db.prepare(`INSERT OR IGNORE INTO investments (id, user_id, type, amount, rate, status, created_at, maturity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const userId in data.investments || {}) {
    ensureUser(userId);
    for (const inv of data.investments[userId]) {
      investInsert.run(
        inv.id, userId, typeof inv.type === 'object' ? inv.type?.name || 'unknown' : String(inv.type),
        Number(inv.amount) || 0, Number(inv.rate) || 0.05, inv.status || 'active',
        inv.created, inv.maturity,
      );
    }
  }

  logger.info(`Migrated economy: ${Object.keys(data.userBalances || {})}} balances, ${(data.transactions || []).length} transactions`);
}

function migrateModeration() {
  const data = safeJsonRead(path.join(DB_DIR, 'moderation.json'));
  if (!data || typeof data !== 'object') return;

  const insert = db.prepare(`INSERT OR IGNORE INTO moderation (id, guild_id, user_id, moderator_id, type, reason, duration) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let count = 0;

  for (const guildId in data.records || {}) {
    for (const userId in data.records[guildId]) {
      for (const record of data.records[guildId][userId]) {
        insert.run(
          record.id, guildId, userId, record.moderatorId || '',
          record.type || 'unknown', record.reason || '', record.duration || null,
        );
        count++;
      }
    }
  }

  logger.info(`Migrated ${count} moderation records`);
}

function migrateGuilds() {
  // Main guilds.json (bot configuration per guild)
  const data = safeJsonRead(path.join(DB_DIR, 'guilds.json'));
  if (!data || typeof data !== 'object') return;

  const upsert = db.prepare(`INSERT OR REPLACE INTO guilds (id, name, config, updated_at) VALUES (?, ?, ?, ?)`);
  for (const [guildId, guildData] of Object.entries(data)) {
    upsert.run(
      guildId,
      typeof guildData === 'object' && guildData.name || '',
      JSON.stringify(guildData),
      new Date().toISOString(),
    );
  }

  logger.info(`Migrated ${Object.keys(data).length} guild configurations`);
}

function migrateProfiles() {
  const data = safeJsonRead(path.join(DB_DIR, 'profiles.json'));
  if (!data || typeof data !== 'object') return;

  const upsertProfile = db.prepare(`INSERT OR REPLACE INTO profiles (user_id, settings, stats) VALUES (?, ?, ?)`);
  let count = 0;

  for (const [userId, profile] of Object.entries(data)) {
    ensureUser(userId);
    if (typeof profile === 'object') {
      upsertProfile.run(userId, JSON.stringify(profile.settings || {}), JSON.stringify(profile.stats || {}));
      count++;
    }
  }

  logger.info(`Migrated ${count} profiles`);
}

function migrateAchievements() {
  const data = safeJsonRead(path.join(DB_DIR, 'achievements.json'));
  if (!data || typeof data !== 'object') return;

  const insert = db.prepare(`INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)`);
  let count = 0;

  for (const [userId, achs] of Object.entries(data)) {
    ensureUser(userId);
    if (Array.isArray(achs)) {
      for (const a of achs) {
        insert.run(userId, typeof a === 'string' ? a : a.id || '');
        count++;
      }
    }
  }

  logger.info(`Migrated ${count} achievements`);
}

/**
 * Ensure user row exists (for FK constraints). No-op if already present.
 */
function ensureUser(userId) {
  db.prepare(`INSERT OR IGNORE INTO users (id) VALUES (?)`).run(userId);
}

export function shutdownDatabase() {
  try {
    db?.close();
    logger.info('Database closed');
  } catch (error) {
    logger.error('Error closing database', error instanceof Error ? error : new Error(String(error)));
  }
}

// Export convenience wrappers for common operations
export function getBalance(userId) {
  const row = db.prepare("SELECT amount FROM balances WHERE user_id = ?").get(userId);
  return row?.amount || 0;
}

export function setBalance(userId, amount) {
  ensureUser(userId);
  db.prepare("INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)").run(userId, Math.max(0, Number(amount)));
}

export function addBalance(userId, amount) {
  const current = getBalance(userId);
  setBalance(userId, current + Number(amount));
}

export function subtractBalance(userId, amount) {
  const current = getBalance(userId);
  setBalance(userId, current - Number(amount));
}
