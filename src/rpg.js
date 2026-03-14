import fs from 'node:fs';
import path from 'node:path';

import { generate } from './model-client.js';
import { logger } from './logger.js';
import { inputValidator, sanitizeInput, validateString, validateNumber } from './validation.js';
import { CommandError } from './errorHandler.js';

const PLAYERS_DIR = path.join(process.cwd(), 'data', 'players');

// in-memory cache to reduce fs reads/writes
let cache = null;
// simple per-user locks to avoid concurrent writes
const locks = new Set();

// Character classes with unique abilities and stat bonuses
const CHARACTER_CLASSES = {
  warrior: {
    name: 'Warrior',
    description: 'Strong melee fighter with high HP and defense',
    baseStats: { hp: 25, maxHp: 25, mp: 10, maxMp: 10, atk: 7, def: 3, spd: 1 },
    statGrowth: { hp: 3, maxHp: 3, mp: 1, maxMp: 1, atk: 2, def: 1, spd: 0 },
    abilities: ['Power Strike', 'Shield Block', 'Battle Cry'],
    color: 0xFF_00_00
  },
  mage: {
    name: 'Mage',
    description: 'Powerful spellcaster with magic attacks',
    baseStats: { hp: 15, maxHp: 15, mp: 30, maxMp: 30, atk: 10, def: 1, spd: 2 },
    statGrowth: { hp: 1, maxHp: 1, mp: 4, maxMp: 4, atk: 3, def: 0, spd: 1 },
    abilities: ['Fireball', 'Magic Shield', 'Mana Surge'],
    color: 0x99_33_FF
  },
  rogue: {
    name: 'Rogue',
    description: 'Fast and agile with critical strike chance',
    baseStats: { hp: 18, maxHp: 18, mp: 15, maxMp: 15, atk: 6, def: 2, spd: 4 },
    statGrowth: { hp: 2, maxHp: 2, mp: 2, maxMp: 2, atk: 2, def: 1, spd: 2 },
    abilities: ['Backstab', 'Dodge', 'Sprint'],
    color: 0x33_33_33
  },
  paladin: {
    name: 'Paladin',
    description: 'Holy warrior with healing and protective abilities',
    baseStats: { hp: 22, maxHp: 22, mp: 20, maxMp: 20, atk: 5, def: 4, spd: 1 },
    statGrowth: { hp: 3, maxHp: 3, mp: 3, maxMp: 3, atk: 1, def: 2, spd: 0 },
    abilities: ['Holy Strike', 'Heal', 'Divine Shield'],
    color: 0xFF_D7_00
  }
};

function ensureDir() {
  if (!fs.existsSync(PLAYERS_DIR)) fs.mkdirSync(PLAYERS_DIR, { recursive: true });
}

function readAll() {
  ensureDir();
  const all = {};

  // Migrate from old data/rpg.json if it exists
  const oldFile = path.join(process.cwd(), 'data', 'rpg.json');
  if (fs.existsSync(oldFile)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(oldFile)) || {};
      console.log(`[RPG DEBUG] Migrating ${Object.keys(oldData).length} characters from old rpg.json`);
      for (const [userId, char] of Object.entries(oldData)) {
        // Ensure defaults
        if (char.xp === undefined) char.xp = 0;
        if (char.lvl === undefined) char.lvl = levelFromXp(char.xp);
        if (char.skillPoints === undefined) char.skillPoints = 0;
        if (char.hp === undefined) char.hp = 20;
        if (char.maxHp === undefined) char.maxHp = 20;
        if (char.mp === undefined) char.mp = 10;
        if (char.maxMp === undefined) char.maxMp = 10;
        if (char.atk === undefined) char.atk = 5;
        if (char.def === undefined) char.def = 2;
        if (char.spd === undefined) char.spd = 2;
        if (char.class === undefined) char.class = 'warrior';
        if (char.abilities === undefined) char.abilities = CHARACTER_CLASSES[char.class]?.abilities || CHARACTER_CLASSES.warrior.abilities;
        if (char.color === undefined) char.color = CHARACTER_CLASSES[char.class]?.color || CHARACTER_CLASSES.warrior.color;
        if (char.inventory === undefined) char.inventory = {};
        if (char.equipped_weapon === undefined) char.equipped_weapon = null;
        if (char.equipped_armor === undefined) char.equipped_armor = null;
        if (char.gold === undefined) char.gold = 0;
        if (char.dailyExplorations === undefined) char.dailyExplorations = 0;
        if (char.lastDailyReset === undefined) char.lastDailyReset = Date.now();
        if (char.sessionXpGained === undefined) char.sessionXpGained = 0;
        if (char.lastSessionReset === undefined) char.lastSessionReset = Date.now();
        if (char.createdAt === undefined) char.createdAt = Date.now();
        all[userId] = char;
        // Save to individual file
        const filePath = path.join(PLAYERS_DIR, `${userId}.json`);
        const tmp = `${filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(char, null, 2), 'utf8');
        fs.renameSync(tmp, filePath);
      }
      // Backup and remove old file
      fs.copyFileSync(oldFile, `${oldFile}.bak`);
      fs.unlinkSync(oldFile);
      console.log('[RPG DEBUG] Migration completed, old file backed up');
    }
    catch (error) {
      console.error('Failed to migrate old RPG data:', error);
    }
  }

  // Read all player files from data/players/
  if (fs.existsSync(PLAYERS_DIR)) {
    const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const userId = path.basename(file, '.json');
      try {
        const char = JSON.parse(fs.readFileSync(path.join(PLAYERS_DIR, file))) || {};
        // migrate / ensure defaults for older characters
        if (char.xp === undefined) char.xp = 0;
        if (char.lvl === undefined) char.lvl = levelFromXp(char.xp);
        if (char.skillPoints === undefined) char.skillPoints = 0;
        if (char.hp === undefined) char.hp = 20;
        if (char.maxHp === undefined) char.maxHp = 20;
        if (char.mp === undefined) char.mp = 10;
        if (char.maxMp === undefined) char.maxMp = 10;
        if (char.atk === undefined) char.atk = 5;
        if (char.def === undefined) char.def = 2;
        if (char.spd === undefined) char.spd = 2;
        if (char.class === undefined) char.class = 'warrior';
        if (char.abilities === undefined) char.abilities = CHARACTER_CLASSES[char.class]?.abilities || CHARACTER_CLASSES.warrior.abilities;
        if (char.color === undefined) char.color = CHARACTER_CLASSES[char.class]?.color || CHARACTER_CLASSES.warrior.color;
        if (char.inventory === undefined) char.inventory = {};
        if (char.equipped_weapon === undefined) char.equipped_weapon = null;
        if (char.equipped_armor === undefined) char.equipped_armor = null;
        if (char.gold === undefined) char.gold = 0;
        if (char.dailyExplorations === undefined) char.dailyExplorations = 0;
        if (char.lastDailyReset === undefined) char.lastDailyReset = Date.now();
        if (char.sessionXpGained === undefined) char.sessionXpGained = 0;
        if (char.lastSessionReset === undefined) char.lastSessionReset = Date.now();
        all[userId] = char;
      }
      catch (error) {
        console.error(`Failed to read player data for ${userId}`, error);
      }
    }
  }

  cache = all;
  return all;
}

function writeAll(obj) {
  ensureDir();
  try {
    // Save each user's data to individual files
    for (const [userId, char] of Object.entries(obj)) {
      const filePath = path.join(PLAYERS_DIR, `${userId}.json`);
      const tmp = `${filePath}.tmp`;
      console.log(`[RPG DEBUG] Writing player data: ${filePath}`);
      fs.writeFileSync(tmp, JSON.stringify(char, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    }
    cache = obj;
  }
  catch (error) {
    console.error('Failed to write RPG data:', error);
    // Attempt to restore from cache if available
    if (cache) {
      console.log('Restoring from cache after write failure');
    }
    else {
      throw new Error(`Failed to save RPG data: ${error.message}`);
    }
  }
}

export function createCharacter(userId, name, charClass = 'warrior') {
  // Validate inputs
  if (!userId || typeof userId !== 'string') {
    throw new CommandError('Invalid user ID', 'INVALID_ARGUMENT');
  }

  const sanitizedName = sanitizeInput(name || `Player${userId.slice(0,4)}`);
  const nameValidation = validateString(sanitizedName, { minLength: 2, maxLength: 32 });
  if (!nameValidation.valid) {
    throw new CommandError(nameValidation.reason, 'INVALID_ARGUMENT');
  }

  // Validate character class
  if (!charClass || typeof charClass !== 'string') {
    throw new CommandError('Invalid character class', 'INVALID_ARGUMENT');
  }

  const classData = CHARACTER_CLASSES[charClass];
  if (!classData) {
    throw new CommandError(`Invalid character class: ${charClass}. Available classes: warrior, mage, rogue, paladin`, 'INVALID_ARGUMENT');
  }

  if (locks.has(userId)) {
    throw new CommandError('Character creation already in progress', 'RATE_LIMITED');
  }

  locks.add(userId);
  try {
    const all = cache || readAll();
    if (all[userId]) {
      throw new CommandError('Character already exists for this user', 'ALREADY_EXISTS');
    }

    const char = {
      name: sanitizedName,
      class: charClass,
      ...classData.baseStats,
      lvl: 1,
      xp: 0,
      skillPoints: 0,
      abilities: [...classData.abilities],
      color: classData.color,
      inventory: {},
      equipped_weapon: null,
      equipped_armor: null,
      gold: 0,
      createdAt: Date.now()
    };

    all[userId] = char;
    writeAll(all);

    logger.info('Character created', { userId, name: sanitizedName, class: charClass });
    return char;
  }
  finally {
    locks.delete(userId);
  }
}

export function levelFromXp(xp) {
  // simple formula: 20 XP per level, starting at level 1
  return Math.floor(1 + (xp || 0) / 20);
}

// apply xp to character in-memory and grant skill points for levels gained
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
    // Restore HP and MP on level up
    char.hp = char.maxHp || 20;
    char.mp = char.maxMp || 10;
    logger.info('Level up', { userId, oldLvl, newLvl, gained, xp: char.xp });
  }
  else {
    char.lvl = newLvl;
  }

  // Track session XP gained
  char.sessionXpGained = (char.sessionXpGained || 0) + amount;

  logger.debug('XP applied', { userId, oldXp, amount, newXp: char.xp, oldLvl, newLvl, skillPointsGained: gained });
  return { char, oldLvl, newLvl, gained };
}

export function getCharacter(userId) {
  // Try cache first
  if (cache && cache[userId]) {
    return cache[userId];
  }

  // Otherwise read from file
  ensureDir();
  const filePath = path.join(PLAYERS_DIR, `${userId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const char = JSON.parse(fs.readFileSync(filePath)) || {};
    // migrate / ensure defaults for older characters
    if (char.xp === undefined) char.xp = 0;
    if (char.lvl === undefined) char.lvl = levelFromXp(char.xp);
    if (char.skillPoints === undefined) char.skillPoints = 0;
    if (char.hp === undefined) char.hp = 20;
    if (char.maxHp === undefined) char.maxHp = 20;
    if (char.mp === undefined) char.mp = 10;
    if (char.maxMp === undefined) char.maxMp = 10;
    if (char.atk === undefined) char.atk = 5;
    if (char.def === undefined) char.def = 2;
    if (char.spd === undefined) char.spd = 2;
    if (char.class === undefined) char.class = 'warrior';
    if (char.abilities === undefined) char.abilities = CHARACTER_CLASSES[char.class]?.abilities || CHARACTER_CLASSES.warrior.abilities;
    if (char.color === undefined) char.color = CHARACTER_CLASSES[char.class]?.color || CHARACTER_CLASSES.warrior.color;
    if (char.inventory === undefined) char.inventory = {};
    if (char.equipped_weapon === undefined) char.equipped_weapon = null;
    if (char.equipped_armor === undefined) char.equipped_armor = null;
    if (char.gold === undefined) char.gold = 0;
    if (char.dailyExplorations === undefined) char.dailyExplorations = 0;
    if (char.lastDailyReset === undefined) char.lastDailyReset = Date.now();
    if (char.sessionXpGained === undefined) char.sessionXpGained = 0;
    if (char.lastSessionReset === undefined) char.lastSessionReset = Date.now();

    // Update cache
    if (cache) {
      cache[userId] = char;
    }
    else {
      cache = { [userId]: char };
    }

    return char;
  }
  catch (error) {
    console.error(`Failed to read character data for ${userId}`, error);
    return null;
  }
}

export function saveCharacter(userId, char) {
  if (locks.has(userId)) {
    console.warn(`Save operation blocked for user ${userId} - already locked`);
    return false;
  }
  locks.add(userId);
  try {
    // Save directly to individual file
    ensureDir();
    const filePath = path.join(PLAYERS_DIR, `${userId}.json`);
    const tmp = `${filePath}.tmp`;
    console.log(`[RPG DEBUG] Writing character data: ${filePath}`);
    fs.writeFileSync(tmp, JSON.stringify(char, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);

    // Update cache if it exists
    if (cache) {
      cache[userId] = char;
    }
    return true;
  }
  finally {
    locks.delete(userId);
  }
}

export function getAllCharacters() {
  return cache || readAll();
}

export function resetCharacter(userId, charClass = 'warrior') {
  if (locks.has(userId)) return null;

  locks.add(userId);
  try {
    const all = cache || readAll();
    const classData = CHARACTER_CLASSES[charClass];
    const def = {
      name: `Player${userId.slice(0,4)}`,
      class: charClass,
      ...classData.baseStats,
      lvl: 1,
      xp: 0,
      skillPoints: 0,
      abilities: [...classData.abilities],
      color: classData.color,
      inventory: {},
      equipped_weapon: null,
      equipped_armor: null,
      gold: 0
    };
    all[userId] = def;
    writeAll(all);
    return def;
  }
  finally {
    locks.delete(userId);
  }
}

export function deleteCharacter(userId) {
  if (locks.has(userId)) return false;

  locks.add(userId);
  try {
    const all = cache || readAll();
    if (!all[userId]) return false;
    delete all[userId];
    writeAll(all);
    return true;
  }
  finally {
    locks.delete(userId);
  }
}

export function getLeaderboard(limit = 10, offset = 0) {
  const all = cache || readAll();
  const arr = Object.entries(all).map(([id, c]) => ({ id, name: c.name, lvl: c.lvl || 1, xp: c.xp || 0, atk: c.atk || 0 }));
  arr.sort((a, b) => {
    if (b.lvl !== a.lvl) return b.lvl - a.lvl; if (b.xp !== a.xp) return b.xp - a.xp; return b.atk - a.atk;
  });
  return arr.slice(offset, offset + limit);
}

export function getLeaderboardCount() {
  const all = cache || readAll();
  return Object.keys(all).length;
}

export function encounterMonster(lvl = 1) {
  return { name: `Goblin L${lvl}`, hp: 10 + lvl * 3, atk: 3 + lvl, lvl };
}

export function fightTurn(attacker, defender) {
  // Calculate damage with new stats
  let damage = Math.max(1, attacker.atk + Math.floor(Math.random() * 6) - 2);

  // Apply defense reduction (each point of defense reduces damage by 0.5)
  const defense = defender.def || 2;
  damage = Math.max(1, damage - Math.floor(defense * 0.5));

  // Speed affects hit chance (higher speed = higher chance to hit)
  const speed = attacker.spd || 2;
  const hitChance = Math.min(95, 50 + speed * 10); // 50-95% hit chance based on speed
  const hitRoll = Math.floor(Math.random() * 100);

  if (hitRoll >= hitChance) {
    logger.debug('Attack missed', { speed, hitChance, hitRoll });
    return 0; // Miss
  }

  defender.hp -= damage;
  logger.debug('Attack hit', { damage, attackerHp: attacker.hp, defenderHp: defender.hp });
  return damage;
}

export async function narrate(guildId, prompt, fallback) {
  try {
    const out = await generate(guildId, prompt);
    return out || fallback || '';
  }
  catch (error) {
    console.error('Narration failed', error);
    return fallback || '';
  }
}

export function randomEventType() {
  const types = ['monster', 'treasure', 'trap', 'npc'];
  return types[Math.floor(Math.random() * types.length)];
}

export function getCharacterClasses() {
  return CHARACTER_CLASSES;
}

export function getClassInfo(charClass) {
  return CHARACTER_CLASSES[charClass] || null;
}

// Item and Inventory System
const ITEMS = {
  // Weapons
  'rusty_sword': { name: 'Rusty Sword', type: 'weapon', rarity: 'common', atk: 3, value: 10, description: 'A worn but serviceable blade' },
  'iron_sword': { name: 'Iron Sword', type: 'weapon', rarity: 'uncommon', atk: 7, value: 50, description: 'A well-crafted iron blade' },
  'magic_staff': { name: 'Magic Staff', type: 'weapon', rarity: 'rare', atk: 12, value: 200, description: 'Channels magical energy' },
  'legendary_blade': { name: 'Legendary Blade', type: 'weapon', rarity: 'legendary', atk: 20, value: 1000, description: 'A blade of ancient power' },

  // Armor
  'leather_armor': { name: 'Leather Armor', type: 'armor', rarity: 'common', def: 2, value: 15, description: 'Basic protective gear' },
  'chain_mail': { name: 'Chain Mail', type: 'armor', rarity: 'uncommon', def: 5, value: 75, description: 'Interlinked metal rings' },
  'plate_armor': { name: 'Plate Armor', type: 'armor', rarity: 'rare', def: 10, value: 300, description: 'Heavy steel protection' },
  'dragon_armor': { name: 'Dragon Armor', type: 'armor', rarity: 'legendary', def: 18, value: 1500, description: 'Forged from dragon scales' },

  // Consumables
  'health_potion': { name: 'Health Potion', type: 'consumable', rarity: 'common', hp_restore: 20, value: 25, description: 'Restores 20 HP' },
  'mana_potion': { name: 'Mana Potion', type: 'consumable', rarity: 'uncommon', mp_restore: 30, value: 40, description: 'Restores 30 MP' },
  'revive_crystal': { name: 'Revive Crystal', type: 'consumable', rarity: 'rare', revive: true, value: 150, description: 'Brings you back from defeat' },

  // Materials
  'iron_ore': { name: 'Iron Ore', type: 'material', rarity: 'common', value: 5, description: 'Raw iron for crafting' },
  'magic_crystal': { name: 'Magic Crystal', type: 'material', rarity: 'rare', value: 100, description: 'Contains magical energy' },
  'dragon_scale': { name: 'Dragon Scale', type: 'material', rarity: 'legendary', value: 500, description: 'Priceless crafting material' },
  'gold_ore': { name: 'Gold Ore', type: 'material', rarity: 'uncommon', value: 50, description: 'Shiny gold for high-value crafting' },
  'mithril_ingot': { name: 'Mithril Ingot', type: 'material', rarity: 'legendary', value: 2000, description: 'Lightweight and incredibly strong' },
  'wood': { name: 'Wood', type: 'material', rarity: 'common', value: 2, description: 'Basic building material' },
  'leather': { name: 'Leather', type: 'material', rarity: 'common', value: 3, description: 'Tough animal hide' },
  'gemstone': { name: 'Gemstone', type: 'material', rarity: 'rare', value: 150, description: 'Sparkling precious stone' }
};

// Crafting recipes
const CRAFTING_RECIPES = {
  'iron_sword': {
    materials: { 'iron_ore': 3, 'wood': 1 },
    description: 'Craft an iron sword from iron ore and wood',
    required_level: 3
  },
  'chain_mail': {
    materials: { 'iron_ore': 5, 'leather': 2 },
    description: 'Craft chain mail armor from iron and leather',
    required_level: 4
  },
  'health_potion': {
    materials: { 'magic_crystal': 1, 'wood': 1 },
    description: 'Craft a health potion using magic and wood',
    required_level: 1
  },
  'mana_potion': {
    materials: { 'magic_crystal': 2, 'gemstone': 1 },
    description: 'Craft a mana potion using crystals and gems',
    required_level: 5
  },
  'magic_staff': {
    materials: { 'wood': 2, 'magic_crystal': 3, 'gemstone': 1 },
    description: 'Craft a powerful magic staff',
    required_level: 8
  },
  'plate_armor': {
    materials: { 'iron_ore': 8, 'leather': 3, 'mithril_ingot': 1 },
    description: 'Craft heavy plate armor',
    required_level: 10
  }
};

const ITEM_RARITIES = {
  common: { color: 0x8B_8B_8B, chance: 50 },
  uncommon: { color: 0x4C_AF_50, chance: 25 },
  rare: { color: 0x21_96_F3, chance: 15 },
  legendary: { color: 0xFF_98_00, chance: 10 }
};

export function generateRandomItem(level = 1) {
  const rarityRoll = Math.random() * 100;
  let selectedRarity = 'common';

  // Adjust rarity chances based on level
  const adjustedRarities = { ...ITEM_RARITIES };
  if (level >= 20) {
    adjustedRarities.legendary.chance += 5;
    adjustedRarities.rare.chance += 5;
    adjustedRarities.uncommon.chance += 5;
    adjustedRarities.common.chance -= 15;
  }
  else if (level >= 10) {
    adjustedRarities.rare.chance += 3;
    adjustedRarities.uncommon.chance += 3;
    adjustedRarities.common.chance -= 6;
  }

  let cumulativeChance = 0;
  for (const [rarity, data] of Object.entries(adjustedRarities)) {
    cumulativeChance += data.chance;
    if (rarityRoll <= cumulativeChance) {
      selectedRarity = rarity;
      break;
    }
  }

  // Filter items by rarity and level-appropriate types
  const availableItems = Object.entries(ITEMS).filter(([key, item]) =>
    item.rarity === selectedRarity &&
    (level >= getItemLevelRequirement(key))
  );

  if (availableItems.length === 0) {
    console.warn(`No items available for rarity ${selectedRarity} at level ${level}, falling back to health_potion`);
    return { id: 'health_potion', ...ITEMS['health_potion'] };
  }

  const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
  return { id: randomItem[0], ...randomItem[1] };
}

function getItemLevelRequirement(itemKey) {
  const levelReqs = {
    rusty_sword: 1, iron_sword: 3, magic_staff: 8, legendary_blade: 15,
    leather_armor: 1, chain_mail: 4, plate_armor: 10, dragon_armor: 20,
    health_potion: 1, mana_potion: 5, revive_crystal: 12,
    iron_ore: 1, magic_crystal: 7, dragon_scale: 18,
    gold_ore: 5, mithril_ingot: 25,
    wood: 1, leather: 1, gemstone: 10
  };
  return levelReqs[itemKey] || 1;
}

export function getItemInfo(itemId) {
  return ITEMS[itemId] || null;
}

export function getItemRarityInfo(rarity) {
  return ITEM_RARITIES[rarity] || ITEM_RARITIES.common;
}

// Inventory Management Functions
export function addItemToInventory(userId, itemId, quantity = 1) {
  const all = cache || readAll();
  const char = all[userId];

  if (!char) return { success: false, reason: 'no_character' };

  char.inventory = char.inventory || {};
  char.inventory[itemId] = (char.inventory[itemId] || 0) + quantity;

  writeAll(all);
  return { success: true, char };
}

export function removeItemFromInventory(userId, itemId, quantity = 1) {
  const all = cache || readAll();
  const char = all[userId];

  if (!char) return { success: false, reason: 'no_character' };
  if (!char.inventory || !char.inventory[itemId]) return { success: false, reason: 'item_not_found' };

  const currentQuantity = char.inventory[itemId];
  if (currentQuantity < quantity) return { success: false, reason: 'insufficient_quantity' };

  char.inventory[itemId] -= quantity;
  if (char.inventory[itemId] <= 0) delete char.inventory[itemId];

  writeAll(all);
  return { success: true, char };
}

export function getInventory(userId) {
  const all = cache || readAll();
  const char = all[userId];

  if (!char || !char.inventory) return {};

  return char.inventory;
}

export function getInventoryValue(userId) {
  const inventory = getInventory(userId);
  let totalValue = 0;

  for (const [itemId, quantity] of Object.entries(inventory)) {
    const item = ITEMS[itemId];
    if (item) {
      totalValue += item.value * quantity;
    }
  }

  return totalValue;
}

export function useConsumableItem(userId, itemId) {
  const item = ITEMS[itemId];
  if (!item || item.type !== 'consumable') {
    return { success: false, reason: 'not_consumable' };
  }

  const all = cache || readAll();
  const char = all[userId];

  if (!char) return { success: false, reason: 'no_character' };

  // Check if item is in inventory
  if (!char.inventory || !char.inventory[itemId]) {
    return { success: false, reason: 'item_not_in_inventory' };
  }

  // Apply item effects
  let effects = {};
  if (item.hp_restore) {
    const oldHp = char.hp;
    char.hp = Math.min(char.maxHp, char.hp + item.hp_restore);
    effects.hp_restored = char.hp - oldHp;
  }

  if (item.mp_restore) {
    const oldMp = char.mp;
    char.mp = Math.min(char.maxMp, char.mp + item.mp_restore);
    effects.mp_restored = char.mp - oldMp;
  }

  if (item.revive) {
    char.hp = char.maxHp;
    effects.revive = true;
  }

  // Remove item from inventory
  char.inventory[itemId]--;
  if (char.inventory[itemId] <= 0) delete char.inventory[itemId];

  writeAll(all);
  return { success: true, char, effects };
}

export function equipItem(userId, itemId) {
  const item = ITEMS[itemId];
  if (!item || (item.type !== 'weapon' && item.type !== 'armor')) {
    return { success: false, reason: 'not_equippable' };
  }

  const all = cache || readAll();
  const char = all[userId];

  if (!char) return { success: false, reason: 'no_character' };
  if (!char.inventory || !char.inventory[itemId]) {
    return { success: false, reason: 'item_not_in_inventory' };
  }

  // Unequip current item of same type
  if (item.type === 'weapon' && char.equipped_weapon) {
    addItemToInventory(userId, char.equipped_weapon, 1);
    if (ITEMS[char.equipped_weapon]) {
      char.atk -= ITEMS[char.equipped_weapon].atk || 0;
    }
  }

  if (item.type === 'armor' && char.equipped_armor) {
    addItemToInventory(userId, char.equipped_armor, 1);
    if (ITEMS[char.equipped_armor]) {
      char.def -= ITEMS[char.equipped_armor].def || 0;
    }
  }

  // Equip new item
  if (item.type === 'weapon') {
    char.equipped_weapon = itemId;
    char.atk += item.atk || 0;
  }

  if (item.type === 'armor') {
    char.equipped_armor = itemId;
    char.def += item.def || 0;
  }

  // Remove from inventory
  const removeResult = removeItemFromInventory(userId, itemId, 1);
  if (!removeResult.success) {
    logger.error('Failed to remove item from inventory during equip', { userId, itemId });
    return { success: false, reason: 'inventory_error' };
  }

  writeAll(all);
  logger.info('Item equipped', { userId, itemId, type: item.type });
  return { success: true, char };
}

export function unequipItem(userId, slot) {
  const all = cache || readAll();
  const char = all[userId];

  if (!char) return { success: false, reason: 'no_character' };

  let itemId = null;
  if (slot === 'weapon' && char.equipped_weapon) {
    itemId = char.equipped_weapon;
    if (ITEMS[itemId]) {
      char.atk -= ITEMS[itemId].atk || 0;
    }
    char.equipped_weapon = null;
  }
  else if (slot === 'armor' && char.equipped_armor) {
    itemId = char.equipped_armor;
    if (ITEMS[itemId]) {
      char.def -= ITEMS[itemId].def || 0;
    }
    char.equipped_armor = null;
  }
  else {
    return { success: false, reason: 'no_item_equipped' };
  }

  if (itemId) {
    const addResult = addItemToInventory(userId, itemId, 1);
    if (!addResult.success) {
      logger.error('Failed to add item to inventory during unequip', { userId, itemId });
      return { success: false, reason: 'inventory_error' };
    }
  }

  writeAll(all);
  logger.info('Item unequipped', { userId, slot, itemId });
  return { success: true, char };
}

// Crafting System
export function getCraftingRecipes() {
  return CRAFTING_RECIPES;
}

export function canCraftItem(userId, itemId) {
  const recipe = CRAFTING_RECIPES[itemId];
  if (!recipe) return { success: false, reason: 'not_craftable' };

  const character = getCharacter(userId);
  if (!character) return { success: false, reason: 'no_character' };
  if (character.lvl < recipe.required_level) {
    return { success: false, reason: 'level_too_low', required: recipe.required_level };
  }

  const inventory = getInventory(userId);

  // Check if all required materials are available
  for (const [materialId, requiredQuantity] of Object.entries(recipe.materials)) {
    if (!inventory[materialId] || inventory[materialId] < requiredQuantity) {
      return { success: false, reason: 'missing_materials', missing: materialId };
    }
  }

  return { success: true };
}

export function craftItem(userId, itemId) {
  const canCraft = canCraftItem(userId, itemId);
  if (!canCraft.success) return canCraft;

  const recipe = CRAFTING_RECIPES[itemId];
  const character = getCharacter(userId);
  if (!character) return { success: false, reason: 'no_character' };

  const inventory = getInventory(userId);

  // Remove materials
  for (const [materialId, requiredQuantity] of Object.entries(recipe.materials)) {
    const removeResult = removeItemFromInventory(userId, materialId, requiredQuantity);
    if (!removeResult.success) {
      logger.error('Failed to remove material during crafting', { userId, itemId, materialId, required: requiredQuantity });
      return { success: false, reason: 'material_removal_failed' };
    }
  }

  // Add crafted item
  const addResult = addItemToInventory(userId, itemId, 1);
  if (!addResult.success) {
    logger.error('Failed to add crafted item to inventory', { userId, itemId });
    return { success: false, reason: 'item_add_failed' };
  }

  // Award XP for crafting
  const xpReward = Math.floor(character.lvl * 2);
  const xpResult = applyXp(userId, character, xpReward);

  logger.info('Item crafted successfully', { userId, itemId, xpGained: xpReward });
  return {
    success: true,
    char: character,
    xpGained: xpReward,
    item: ITEMS[itemId]
  };
}

export function bossEncounter(lvl = 5) {
  return { name: `Dragon L${lvl}`, hp: 50 + lvl * 20, atk: 8 + lvl * 2, lvl };
}

// simple quest storage inside RPG file
function readQuests() {
  const p = path.join(process.cwd(), 'data', 'quests.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p)) || {};
  }
  catch {
    return {};
  }
}

function writeQuests(q) {
  const p = path.join(process.cwd(), 'data', 'quests.json');
  if (!fs.existsSync(path.dirname(p))) fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(q, null, 2), 'utf8');
}

export function createQuest(userId, title, desc) {
  const all = readQuests();
  all[userId] = all[userId] || [];
  const q = { id: Date.now(), title, desc, status: 'open' };
  all[userId].push(q);
  writeQuests(all);
  return q;
}

export function generateRandomQuest(userId, level = 1) {
  const questTypes = [
    { title: `Slay ${5 + level * 2} Goblins`, desc: `Defeat ${5 + level * 2} goblins in combat.`, requirement: 'goblins_defeated', amount: 5 + level * 2 },
    { title: `Collect ${3 + level} Health Potions`, desc: `Gather ${3 + level} health potions from exploration.`, requirement: 'potions_collected', amount: 3 + level },
    { title: `Reach Level ${level + 5}`, desc: `Gain enough XP to reach level ${level + 5}.`, requirement: 'level_reached', amount: level + 5 },
    { title: `Earn ${100 + level * 50} Gold`, desc: `Accumulate ${100 + level * 50} gold through various activities.`, requirement: 'gold_earned', amount: 100 + level * 50 },
    { title: `Explore ${2 + level} Locations`, desc: `Discover and explore ${2 + level} new locations.`, requirement: 'locations_explored', amount: 2 + level },
    { title: `Craft ${1 + level} Items`, desc: `Use materials to craft ${1 + level} new items.`, requirement: 'items_crafted', amount: 1 + level }
  ];

  const randomType = questTypes[Math.floor(Math.random() * questTypes.length)];
  const quest = createQuest(userId, randomType.title, randomType.desc);
  quest.requirement = randomType.requirement;
  quest.amount = randomType.amount;

  // Update the quest in storage
  const all = readQuests();
  const userQuests = all[userId] || [];
  const index = userQuests.findIndex(q => q.id === quest.id);
  if (index !== -1) {
    userQuests[index] = quest;
    all[userId] = userQuests;
    writeQuests(all);
  }

  return quest;
}

export function listQuests(userId) {
  const all = readQuests();
  return all[userId] || [];
}

function calculateQuestXpReward(quest) {
  const baseXp = 50; // Base XP for completing any quest
  const typeMultipliers = {
    'goblins_defeated': 2,
    'potions_collected': 1.5,
    'level_reached': 3,
    'gold_earned': 1,
    'locations_explored': 2.5,
    'items_crafted': 2
  };

  const multiplier = typeMultipliers[quest.requirement] || 1;
  const levelBonus = (quest.amount || 1) * 2;

  return Math.floor(baseXp * multiplier + levelBonus);
}

function calculateQuestGoldReward(quest) {
  const baseGold = 25; // Base gold for completing any quest
  const typeMultipliers = {
    'goblins_defeated': 1.5,
    'potions_collected': 1,
    'level_reached': 2,
    'gold_earned': 0, // No gold for gold-earning quests
    'locations_explored': 1.8,
    'items_crafted': 1.2
  };

  const multiplier = typeMultipliers[quest.requirement] || 1;
  const levelBonus = (quest.amount || 1);

  return Math.floor(baseGold * multiplier + levelBonus * 5);
}

export function completeQuest(userId, questId) {
  const all = readQuests();
  const arr = all[userId] || [];
  const q = arr.find(x => x.id === Number(questId));
  if (!q) return null;
  q.status = 'completed';
  writeQuests(all);

  // Award XP based on quest type and level
  const xpReward = calculateQuestXpReward(q);
  const goldReward = calculateQuestGoldReward(q);

  // Apply XP and gold rewards
  const char = getCharacter(userId);
  if (char) {
    applyXp(userId, char, xpReward);
    char.gold = (char.gold || 0) + goldReward;
    saveCharacter(userId, char);
  }

  return { ...q, xpReward, goldReward };
}

// Removed duplicate function

// Spend skill points for a character and persist change
export function spendSkillPoints(userId, stat, amount = 1) {
  // Validate inputs
  if (!userId || typeof userId !== 'string') {
    throw new CommandError('Invalid user ID', 'INVALID_ARGUMENT');
  }

  if (!stat || typeof stat !== 'string') {
    throw new CommandError('Invalid stat specified', 'INVALID_ARGUMENT');
  }

  const amountValidation = validateNumber(amount, { min: 1, max: 100, integer: true, positive: true });
  if (!amountValidation.valid) {
    throw new CommandError(amountValidation.reason, 'INVALID_ARGUMENT');
  }

  // Validate stat type
  const validStats = ['hp', 'maxhp', 'mp', 'maxmp', 'atk', 'def', 'spd'];
  if (!validStats.includes(stat)) {
    throw new CommandError(`Invalid stat. Must be one of: ${validStats.join(', ')}`, 'INVALID_ARGUMENT');
  }

  if (locks.has(userId)) {
    throw new CommandError('Character update already in progress', 'RATE_LIMITED');
  }

  locks.add(userId);
  try {
    const all = cache || readAll();
    const char = all[userId];

    if (!char) {
      throw new CommandError('Character not found', 'NOT_FOUND');
    }

    const pts = char.skillPoints || 0;
    if (pts < amount) {
      throw new CommandError(`Not enough skill points. Have: ${pts}, Need: ${amount}`, 'INSUFFICIENT_FUNDS');
    }

    // Apply stat changes with validation
    switch (stat) {
      case 'hp': {
        const currentHp = char.hp || 0;
        const maxHp = char.maxHp || 20;
        char.hp = Math.min(currentHp + amount * 2, maxHp);

        break;
      }
      case 'maxhp': {
        char.maxHp = (char.maxHp || 20) + amount * 5;
        char.hp = Math.min((char.hp || 0) + amount * 2, char.maxHp);

        break;
      }
      case 'mp': {
        const currentMp = char.mp || 0;
        const maxMp = char.maxMp || 10;
        char.mp = Math.min(currentMp + amount * 3, maxMp);

        break;
      }
      case 'maxmp': {
        char.maxMp = (char.maxMp || 10) + amount * 5;
        char.mp = Math.min((char.mp || 0) + amount * 3, char.maxMp);

        break;
      }
      case 'atk': {
        char.atk = (char.atk || 5) + amount;

        break;
      }
      case 'def': {
        char.def = (char.def || 2) + amount;

        break;
      }
      case 'spd': {
        char.spd = (char.spd || 2) + amount;

        break;
      }
    // No default
    }

    char.skillPoints = pts - amount;
    all[userId] = char;
    writeAll(all);

    logger.info('Skill points spent', { userId, stat, amount, newValue: char[stat] });
    return { success: true, char };
  }
  finally {
    locks.delete(userId);
  }
}

// Function to check daily exploration limit
export function checkDailyLimit(userId) {
  const all = cache || readAll();
  const char = all[userId];
  if (!char) return { allowed: false, reason: 'no_character' };

  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  // Check if we need to reset daily count
  if (now - (char.lastDailyReset || 0) >= dayInMs) {
    char.dailyExplorations = 0;
    char.lastDailyReset = now;
    writeAll(all);
  }

  const maxDaily = 10; // 10 explorations per day
  const used = char.dailyExplorations || 0;
  const allowed = used < maxDaily;

  return {
    allowed,
    used,
    max: maxDaily,
    remaining: maxDaily - used,
    resetTime: char.lastDailyReset
  };
}

// Function to increment daily exploration count
export function incrementDailyExploration(userId) {
  const all = cache || readAll();
  const char = all[userId];
  if (!char) return { success: false, reason: 'no_character' };

  // Check daily limit first
  const check = checkDailyLimit(userId);
  if (!check.allowed) {
    return { success: false, reason: 'daily_limit_reached' };
  }

  char.dailyExplorations = (char.dailyExplorations || 0) + 1;
  writeAll(all);

  return { success: true, newCount: char.dailyExplorations };
}

// Function to check session XP cap
export function checkSessionXpCap(userId) {
  const all = cache || readAll();
  const char = all[userId];
  if (!char) return { allowed: false, reason: 'no_character' };

  const now = Date.now();
  const sessionDurationMs = 24 * 60 * 60 * 1000; // 24 hours

  // Check if we need to reset session XP
  if (now - (char.lastSessionReset || 0) >= sessionDurationMs) {
    char.sessionXpGained = 0;
    char.lastSessionReset = now;
    writeAll(all);
  }

  const maxSessionXp = 1000; // 1000 XP per session
  const used = char.sessionXpGained || 0;
  const allowed = used < maxSessionXp;

  return {
    allowed,
    used,
    max: maxSessionXp,
    remaining: maxSessionXp - used,
    resetTime: char.lastSessionReset
  };
}

