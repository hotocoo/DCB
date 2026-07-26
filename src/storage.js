/**
 * Storage utilities for Discord bot data persistence.
 * Uses SQLite (better-sqlite3) as primary storage with JSON migration support.
 */

import { initializeDatabase, getDb, shutdownDatabase } from './database.js';
import { logger } from './logger.js';

export { initializeDatabase, shutdownDatabase };

const DATA_DIR = process.cwd() + '/data';

/**
 * Gets guild data by ID.
 * @param {string} id - Guild ID
 * @returns {object|null} Guild data or null if not found
 */
export function getGuild(id) {
  if (!id) return null;
  try {
    const db = getDb();
    const row = db.prepare("SELECT config FROM guilds WHERE id = ?").get(id);
    return row?.config ? JSON.parse(row.config) : null;
  } catch (error) {
    logger.error('Failed to read guild', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Sets guild data by ID.
 * @param {string} id - Guild ID
 * @param {object} data - Guild data to store
 * @returns {boolean} True if successful, false otherwise
 */
export function setGuild(id, data) {
  if (!id || typeof id !== 'string') return false;
  if (!data || typeof data !== 'object') return false;
  try {
    const db = getDb();
    const existing = db.prepare("SELECT config FROM guilds WHERE id = ?").get(id);
    const merged = { ...(existing?.config ? JSON.parse(existing.config) : {}), ...data, lastUpdated: new Date().toISOString() };
    db.prepare("INSERT OR REPLACE INTO guilds (id, name, config, updated_at) VALUES (?, ?, ?, ?)").run(
      id, merged.name || '', JSON.stringify(merged), new Date().toISOString(),
    );
    return true;
  } catch (error) {
    logger.error('Failed to set guild', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}
