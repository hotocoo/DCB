import fs from 'node:fs';
import path from 'node:path';

import { generate } from './model-client.js';
import { logger } from './logger.js';
import { sanitizeInput, validateString } from './validation.js';
import { CommandError } from './errorHandler.js';
import { getDb } from './database.js';

// Ensure user exists in users table for FK references
function ensureUser(uid) {
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(uid);
  } catch (_) {}
}


const OLD_RPG_JSON = path.join(process.cwd(), 'data', 'rpg.json');
const OLD_PLAYERS_DIR = path.join(process.cwd(), 'data', 'players');

// Character classes with unique abilities and stat bonuses
const CHARACTER_CLASSES = {
  warrior: {
    name: 'Warrior',
    description: 'Strong melee fighter with high HP and defense',
    baseStats: { hp: 25, maxHp: 25, mp: 10, maxMp: 10, atk: 7, def: 3, spd: 1 },
    statGrowth: { hp: 3, maxHp: 3, mp: 1, maxMp: 1, atk: 2, def: 1, spd: 0 },
    abilities: ['Power Strike', 'Shield Block', 'Battle Cry'],
    color: 0xff_00_00,
  },
  mage: {
    name: 'Mage',
    description: 'Powerful spellcaster with magic attacks',
    baseStats: { hp: 15, maxHp: 15, mp: 30, maxMp: 30, atk: 10, def: 1, spd: 2 },
    statGrowth: { hp: 1, maxHp: 1, mp: 4, maxMp: 4, atk: 3, def: 0, spd: 1 },
    abilities: ['Fireball', 'Magic Shield', 'Mana Surge'],
    color: 0x99_33_ff,
  },
  rogue: {
    name: 'Rogue',
    description: 'Fast and agile with critical strike chance',
    baseStats: { hp: 18, maxHp: 18, mp: 15, maxMp: 15, atk: 6, def: 2, spd: 4 },
    statGrowth: { hp: 2, maxHp: 2, mp: 2, maxMp: 2, atk: 2, def: 1, spd: 2 },
    abilities: ['Backstab', 'Dodge', 'Sprint'],
    color: 0x33_33_33,
  },
  paladin: {
    name: 'Paladin',
    description: 'Holy warrior with healing and protective abilities',
    baseStats: { hp: 22, maxHp: 22, mp: 20, maxMp: 20, atk: 5, def: 4, spd: 1 },
    statGrowth: { hp: 3, maxHp: 3, mp: 3, maxMp: 3, atk: 1, def: 2, spd: 0 },
    abilities: ['Holy Strike', 'Heal', 'Divine Shield'],
    color: 0xff_d7_00,
  },
};

// Safe user-id validation for DB use (no path traversal)
function safeUserId(userId) {
  if (typeof userId !== 'string' || !userId || userId.length > 64) throw new Error('Invalid user id');
  if (!/^[\w-]+$/.test(userId)) throw new Error('Invalid user id');
  return userId;
}

// Migration: load old JSON players into SQLite characters table once on startup
let migrated = false;
function migrateFromJson() {
  if (migrated) return;
  migrated = true;

  const db = getDb();
  let count = 0;

  // Try legacy single-file rpg.json first
  try {
    // fs already imported
    if (fs.existsSync(OLD_RPG_JSON)) {
      const oldData = JSON.parse(fs.readFileSync(OLD_RPG_JSON, 'utf8')) || {};
      for (const [uid, c] of Object.entries(oldData)) {
        ensureDefaults(c);
        upsertChar(db, uid, c);
        count++;
      }
      fs.copyFileSync(OLD_RPG_JSON, OLD_RPG_JSON + '.bak');
      fs.unlinkSync(OLD_RPG_JSON);
    }
  } catch (err) { logger.error('RPG JSON migration failed (old rpg.json)', err); }

  // Try per-user files from data/players/
  try {
    // fs already imported
    if (fs.existsSync(OLD_PLAYERS_DIR)) {
      for (const file of fs.readdirSync(OLD_PLAYERS_DIR).filter((f) => f.endsWith('.json'))) {
        const uid = path.basename(file, '.json');
        const c = JSON.parse(fs.readFileSync(path.join(OLD_PLAYERS_DIR, file), 'utf8')) || {};
        ensureDefaults(c);
        upsertChar(db, uid, c);
        count++;
      }
    }
  } catch (err) { logger.error('RPG JSON migration failed (players dir)', err); }

  if (count > 0) logger.info(`Migrated ${count} RPG characters to SQLite`);
}

function upsertChar(db, userId, c) {
  ensureUser(userId);
  safeUserId(userId);
  db.prepare(`INSERT OR REPLACE INTO characters
    (user_id, name, char_class, lvl, xp, skill_points, hp, max_hp, mp, max_mp, atk, def, spd,
     abilities, color, inventory, equipped_weapon, equipped_armor, gold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    userId, c.name || 'Adventurer', c.class || 'warrior', c.lvl || 1, c.xp || 0,
    c.skillPoints || 0, (c.hp ?? c.maxHp) || 20, c.maxHp || 20, (c.mp ?? c.maxMp) || 10,
    c.maxMp || 10, c.atk || 5, c.def || 2, c.spd || 2, JSON.stringify(c.abilities || []),
    c.color || 16711680, JSON.stringify(c.inventory || {}), c.equipped_weapon || null,
    c.equipped_armor || null, c.gold || 0,
  );
}

function ensureDefaults(c) {
  if (c.xp === undefined) c.xp = 0;
  if (c.lvl === undefined) c.lvl = levelFromXp(c.xp);
  if (c.skillPoints === undefined) c.skillPoints = 0;
  if (c.hp === undefined) c.hp = c.maxHp || 20;
  if (c.maxHp === undefined) c.maxHp = 20;
  if (c.mp === undefined) c.mp = c.maxMp || 10;
  if (c.maxMp === undefined) c.maxMp = 10;
  if (c.atk === undefined) c.atk = 5;
  if (c.def === undefined) c.def = 2;
  if (c.spd === undefined) c.spd = 2;
  if (c.class === undefined) c.class = 'warrior';
  const cd = CHARACTER_CLASSES[c.class] || CHARACTER_CLASSES.warrior;
  if (!c.abilities) c.abilities = cd.abilities;
  if (!c.color) c.color = cd.color;
  if (!c.inventory) c.inventory = {};
  if (c.gold === undefined) c.gold = 0;
}

// Row → character object converter for consistent API
function rowToChar(row) {
  return {
    name: row.name,
    class: row.char_class,
    lvl: row.lvl || 1,
    xp: row.xp || 0,
    skillPoints: row.skill_points ?? (row.skillPoints || 0),
    hp: row.hp || 20, maxHp: (row.max_hp ?? row.maxHp) || 20,
    mp: row.mp || 10, maxMp: (row.max_mp ?? row.maxMp) || 10,
    atk: row.atk || 5, def: row.def || 2, spd: row.spd || 2,
    abilities: JSON.parse(row.abilities || '[]'),
    color: row.color ?? 16711680,
    inventory: JSON.parse(row.inventory || '{}'),
    equipped_weapon: row.equipped_weapon || undefined,
    equipped_armor: row.equipped_armor || undefined,
    gold: row.gold || 0,
    dailyExplorations: (row.daily_explorations ?? row.dailyExplorations) || 0,
    lastDailyReset: (row.last_daily_reset ?? row.lastDailyReset) || Date.now(),
    sessionXpGained: (row.session_xp_gained ?? row.sessionXpGained) || 0,
    lastSessionReset: (row.last_session_reset ?? row.lastSessionReset) || Date.now(),
  };
}

export function createCharacter(userId, name, charClass = 'warrior') {
  migrateFromJson();
  if (!userId || typeof userId !== 'string') throw new CommandError('Invalid user ID', 'INVALID_ARGUMENT');
  const uid = safeUserId(userId);
  const sanitizedName = sanitizeInput(name || `Player${uid.slice(0, 4)}`);
  const nameValidation = validateString(sanitizedName, { minLength: 2, maxLength: 32 });
  if (!nameValidation.valid) throw new CommandError(nameValidation.reason, 'INVALID_ARGUMENT');
  if (!charClass || typeof charClass !== 'string') throw new CommandError('Invalid character class', 'INVALID_ARGUMENT');
  const cd = CHARACTER_CLASSES[charClass];
  if (!cd) throw new CommandError(`Invalid character class: ${charClass}. Available classes: warrior, mage, rogue, paladin`, 'INVALID_ARGUMENT');

  ensureUser(uid);
  const db = getDb();
  const existing = db.prepare('SELECT user_id FROM characters WHERE user_id = ?').get(uid);
  if (existing) throw new CommandError('Character already exists for this user', 'ALREADY_EXISTS');

  const char = {
    name: sanitizedName, class: charClass, ...cd.baseStats, lvl: 1, xp: 0,
    skillPoints: 0, abilities: [...cd.abilities], color: cd.color, inventory: {},
    equipped_weapon: undefined, equipped_armor: undefined, gold: 0,
  };

  upsertChar(db, uid, char);
  logger.info('Character created', { userId: uid, name: sanitizedName, class: charClass });
  return char;
}

export function levelFromXp(xp) {
  return Math.floor(1 + (xp || 0) / 20);
}

export function applyXp(userId, char, amount = 0) {
  const oldLvl = char.lvl || levelFromXp(char.xp || 0);
  const oldXp = char.xp || 0;
  char.xp = oldXp + (amount || 0);
  const newLvl = levelFromXp(char.xp);
  let gained = 0;
  if (newLvl > oldLvl) {
    gained = newLvl - oldLvl;
    char.skillPoints = (char.skillPoints || 0) + gained;
    char.lvl = newLvl;
    char.hp = char.maxHp || 20;
    char.mp = char.maxMp || 10;
    logger.info('Level up', { userId, oldLvl, newLvl, gained, xp: char.xp });
  } else {
    char.lvl = newLvl;
  }
  char.sessionXpGained = (char.sessionXpGained || 0) + amount;
  return { char, oldLvl, newLvl, gained };
}

export function getCharacter(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const db = getDb();
  const row = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(uid);
  if (!row) return;
  return rowToChar(row);
}

export function saveCharacter(userId, char) {
  migrateFromJson();
  const uid = safeUserId(userId);
  ensureUser(uid);
  const db = getDb();
  upsertChar(db, uid, char);
  return true;
}

export function getAllCharacters() {
  migrateFromJson();
  const db = getDb();
  const rows = db.prepare('SELECT * FROM characters').all();
  return rows.map(rowToChar);
}

export function resetCharacter(userId, charClass = 'warrior') {
  migrateFromJson();
  const uid = safeUserId(userId);
  ensureUser(uid);
  const cd = CHARACTER_CLASSES[charClass];
  const def = {
    name: `Player${uid.slice(0, 4)}`, class: charClass, ...cd.baseStats, lvl: 1, xp: 0,
    skillPoints: 0, abilities: [...cd.abilities], color: cd.color, inventory: {},
    equipped_weapon: undefined, equipped_armor: undefined, gold: 0,
  };
  const db = getDb();
  upsertChar(db, uid, def);
  return def;
}

export function deleteCharacter(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const db = getDb();
  db.prepare('DELETE FROM characters WHERE user_id = ?').run(uid);
  return true;
}

export function getLeaderboard(limit = 10, offset = 0) {
  migrateFromJson();
  const db = getDb();
  return db.prepare(`SELECT c.*, u.id AS user_id FROM characters c JOIN users u ON c.user_id=u.id ORDER BY c.lvl DESC, c.xp DESC LIMIT ? OFFSET ?`)
    .all(limit, offset).map(rowToChar);
}

export function getLeaderboardCount() {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM characters').get();
  return row?.c || 0;
}

export function encounterMonster(lvl = 1) {
  const types = ['goblin', 'orc', 'wolf', 'skeleton', 'slime'];
  const type = types[Math.floor(Math.random() * types.length)];
  return {
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${lvl > 3 ? 'Champion' : lvl > 1 ? 'Warrior' : ''}`,
    type, level: Math.max(1, lvl + (Math.random() * 2 - 1)),
    hp: 15 + lvl * 5, maxHp: 15 + lvl * 5, atk: 3 + lvl * 2, def: 1 + lvl, xpReward: 8 + lvl * 4, goldReward: 3 + Math.floor(Math.random() * (lvl * 3)),
  };
}

export function fightTurn(attacker, defender) {
  const baseDmg = Math.max(1, attacker.atk - defender.def);
  const variance = Math.floor(Math.random() * 4) - 1;
  const damage = Math.max(0, baseDmg + variance);
  defender.hp = Math.max(0, defender.hp - damage);
  return { damage, critical: false };
}

export async function narrate(guildId, prompt, fallback) {
  try {
    const result = await generate(`You are an RPG narrator. Be concise (under 150 words). Narrate this event dramatically:\n\n${prompt}`, { systemMessage: 'RPG dungeon master style.' });
    return typeof result === 'string' ? result : fallback;
  } catch (err) { logger.error('RPG narrate failed', err); return fallback; }
}

export function randomEventType() {
  const types = ['combat', 'treasure', 'event', 'rest', 'trap'];
  const weights = [40, 25, 15, 12, 8];
  let rand = Math.random() * 100;
  for (let i = 0; i < types.length; i++) { rand -= weights[i]; if (rand <= 0) return types[i]; }
  return 'combat';
}

export function getCharacterClasses() { return CHARACTER_CLASSES; }

export function getClassInfo(charClass) { return CHARACTER_CLASSES[charClass] || null; }

function generateRandomItem(level = 1) {
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const rarityWeights = [60, 25, 10, 4, 1];
  let rand = Math.random() * 100;
  let rarity = 'common';
  for (let i = 0; i < rarities.length; i++) { rand -= rarityWeights[i]; if (rand <= 0) { rarity = rarities[i]; break; } }

  const types = ['weapon', 'armor', 'consumable'];
  const type = types[Math.floor(Math.random() * types.length)];
  let name, power, quantity;
  if (type === 'weapon') {
    const prefixes = ['Rusty', 'Iron', 'Steel', 'Silver', 'Golden', 'Crystal'];
    const bases = ['Sword', 'Axe', 'Mace', 'Dagger'];
    const p = prefixes[Math.min(level - 1, prefixes.length - 1)];
    name = `${p} ${bases[Math.floor(Math.random() * bases.length)]}`;
    power = level * (rarity === 'common' ? 2 : rarity === 'uncommon' ? 3 : rarity === 'rare' ? 5 : rarity === 'epic' ? 8 : 12);
    quantity = 1;
  } else if (type === 'armor') {
    const bases = ['Shield', 'Armor', 'Helmet'];
    name = `Enchanted ${bases[Math.floor(Math.random() * bases.length)]}`;
    power = level * (rarity === 'common' ? 2 : rarity === 'uncommon' ? 3 : rarity === 'rare' ? 5 : rarity === 'epic' ? 8 : 12);
    quantity = 1;
  } else {
    const bases = ['Health Potion', 'Mana Potion', 'Strength Elixir'];
    name = bases[Math.floor(Math.random() * bases.length)];
    power = level * 5;
    quantity = 1 + Math.floor(Math.random() * 3);
  }

  return { id: `${type}_${name.toLowerCase().replace(/\s+/g, '_')}`, name, type, rarity, power, quantity, value: Math.floor(power * (rarity === 'common' ? 1 : rarity === 'uncommon' ? 2 : rarity === 'rare' ? 5 : rarity === 'epic' ? 10 : 20)) };
}

export function getItemInfo(itemId) {
  // Return metadata for known item types
  const type = itemId.split('_')[0];
  const rarityWeights = { common: 1, uncommon: 2, rare: 5, epic: 10, legendary: 20 };
  return { id: itemId, type, exists: true };
}

export function getItemRarityInfo(rarity) {
  const info = { common: { color: '#FFFFFF', name: 'Common' }, uncommon: { color: '#00FF00', name: 'Uncommon' }, rare: { color: '#0000FF', name: 'Rare' }, epic: { color: '#A020F0', name: 'Epic' }, legendary: { color: '#FF8C00', name: 'Legendary' } };
  return info[rarity] || info.common;
}

export function addItemToInventory(userId, itemId, quantity = 1) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return false;
  if (!char.inventory[itemId]) char.inventory[itemId] = { name: itemId, quantity: 0 };
  char.inventory[itemId].quantity += quantity;
  saveCharacter(uid, char);
  return true;
}

export function removeItemFromInventory(userId, itemId, quantity = 1) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char || !char.inventory[itemId] || char.inventory[itemId].quantity < quantity) return false;
  char.inventory[itemId].quantity -= quantity;
  if (char.inventory[itemId].quantity <= 0) delete char.inventory[itemId];
  saveCharacter(uid, char);
  return true;
}

export function getInventory(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return {};
  return { ...char.inventory };
}

export function getInventoryValue(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const inv = getInventory(uid);
  let total = 0;
  for (const [id, item] of Object.entries(inv)) {
    const info = getItemInfo(id);
    total += (info.value || 1) * (item.quantity || 1);
  }
  return total;
}

export function useConsumableItem(userId, itemId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char || !char.inventory[itemId]) return false;
  removeItemFromInventory(uid, itemId, 1);
  return true;
}

export function equipItem(userId, itemId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char || !char.inventory[itemId]) return false;
  const info = getItemInfo(itemId);
  if (info.type === 'weapon') char.equipped_weapon = itemId;
  else if (info.type === 'armor') char.equipped_armor = itemId;
  saveCharacter(uid, char);
  return true;
}

export function unequipItem(userId, slot) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return false;
  if (slot === 'weapon') char.equipped_weapon = undefined;
  else if (slot === 'armor') char.equipped_armor = undefined;
  saveCharacter(uid, char);
  return true;
}

export function getCraftingRecipes() {
  return [
    { id: 'health_potion', name: 'Health Potion', materials: { herb: 3 }, output: { itemId: 'consumable_health_potion', quantity: 2 } },
    { id: 'iron_sword', name: 'Iron Sword', materials: { iron_ore: 5, wood: 2 }, output: { itemId: 'weapon_iron_sword', quantity: 1 } },
  ];
}

export function canCraftItem(userId, itemId) {
  // Simplified check — real implementation validates material requirements
  return true;
}

export function craftItem(userId, itemId) {
  migrateFromJson();
  const char = getCharacter(safeUserId(userId));
  if (!char) return false;
  addItemToInventory(userId, itemId, 1);
  return true;
}

export function bossEncounter(lvl = 5) {
  return { name: `Boss ${lvl === 5 ? 'Dragon' : lvl < 5 ? 'Orc Lord' : 'Demon King'}`, level: lvl + 2, hp: 100 + lvl * 20, maxHp: 100 + lvl * 20, atk: 10 + lvl * 3, def: 5 + lvl, xpReward: 50 + lvl * 10, goldReward: 25 + lvl * 5 };
}

export function createQuest(userId, title, desc) {
  // Quest system placeholder — future expansion point
  return { id: `quest_${Date.now()}`, title: sanitizeInput(title), description: sanitizeInput(desc) };
}

export function generateRandomQuest(userId, level = 1) {
  const quests = [
    { title: 'Defeat the Goblin Chief', desc: 'Clear out the goblin infestation in the nearby forest.' },
    { title: 'Find Lost Treasures', desc: 'Explore ancient ruins and retrieve lost artifacts.' },
    { title: 'Escort the Merchant', desc: 'Protect a traveling merchant from bandits.' },
  ];
  return quests[Math.floor(Math.random() * quests.length)];
}

export function listQuests(userId) {
  return []; // Quest storage not implemented yet — future expansion
}

export function completeQuest(userId, questId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return false;
  applyXp(uid, char, 20);
  saveCharacter(uid, char);
  return true;
}

export function spendSkillPoints(userId, stat, amount = 1) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char || char.skillPoints < amount) return false;
  char.skillPoints -= amount;
  char[stat] = (char[stat] || 0) + amount;
  saveCharacter(uid, char);
  return true;
}

export function checkDailyLimit(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return { available: false };
  const todayStart = new Date().setHours(0, 0, 0, 0);
  if ((char.lastDailyReset || 0) < todayStart) { char.dailyExplorations = 0; char.lastDailyReset = todayStart; saveCharacter(uid, char); }
  return { available: (char.dailyExplorations || 0) < 5 };
}

export function incrementDailyExploration(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return false;
  char.dailyExplorations = (char.dailyExplorations || 0) + 1;
  saveCharacter(uid, char);
  return true;
}

export function checkSessionXpCap(userId) {
  migrateFromJson();
  const uid = safeUserId(userId);
  const char = getCharacter(uid);
  if (!char) return { available: false };
  const sessionStart = new Date().setHours(new Date().getHours(), 0, 0, 0);
  if ((char.lastSessionReset || 0) < sessionStart) { char.sessionXpGained = 0; char.lastSessionReset = sessionStart; }
  return { available: (char.sessionXpGained || 0) < 500 };
}
