import fs from 'fs';
import path from 'path';
import { generate } from './model-client.js';

const FILE = path.join(process.cwd(), 'data', 'rpg.json');

// in-memory cache to reduce fs reads/writes
let cache = null;
// simple per-user locks to avoid concurrent writes
const locks = new Set();

// Character classes with unique abilities and stat bonuses
const CHARACTER_CLASSES = {
  warrior: {
    name: 'Warrior',
    description: 'Strong melee fighter with high HP and defense',
    baseStats: { hp: 25, maxHp: 25, atk: 7, def: 3, spd: 1 },
    statGrowth: { hp: 3, maxHp: 3, atk: 2, def: 1, spd: 0 },
    abilities: ['Power Strike', 'Shield Block', 'Battle Cry'],
    color: 0xFF0000
  },
  mage: {
    name: 'Mage',
    description: 'Powerful spellcaster with magic attacks',
    baseStats: { hp: 15, maxHp: 15, atk: 10, def: 1, spd: 2 },
    statGrowth: { hp: 1, maxHp: 1, atk: 3, def: 0, spd: 1 },
    abilities: ['Fireball', 'Magic Shield', 'Mana Surge'],
    color: 0x9933FF
  },
  rogue: {
    name: 'Rogue',
    description: 'Fast and agile with critical strike chance',
    baseStats: { hp: 18, maxHp: 18, atk: 6, def: 2, spd: 4 },
    statGrowth: { hp: 2, maxHp: 2, atk: 2, def: 1, spd: 2 },
    abilities: ['Backstab', 'Dodge', 'Sprint'],
    color: 0x333333
  },
  paladin: {
    name: 'Paladin',
    description: 'Holy warrior with healing and protective abilities',
    baseStats: { hp: 22, maxHp: 22, atk: 5, def: 4, spd: 1 },
    statGrowth: { hp: 3, maxHp: 3, atk: 1, def: 2, spd: 0 },
    abilities: ['Holy Strike', 'Heal', 'Divine Shield'],
    color: 0xFFD700
  }
};

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
    // migrate / ensure defaults for older characters
    for (const k of Object.keys(raw)) {
      const c = raw[k] || {};
      if (typeof c.xp === 'undefined') c.xp = 0;
      if (typeof c.lvl === 'undefined') c.lvl = levelFromXp(c.xp);
      if (typeof c.skillPoints === 'undefined') c.skillPoints = 0;
      if (typeof c.hp === 'undefined') c.hp = 20;
      if (typeof c.maxHp === 'undefined') c.maxHp = 20;
      if (typeof c.atk === 'undefined') c.atk = 5;
      if (typeof c.def === 'undefined') c.def = 2;
      if (typeof c.spd === 'undefined') c.spd = 2;
      if (typeof c.class === 'undefined') c.class = 'warrior';
      if (typeof c.abilities === 'undefined') c.abilities = CHARACTER_CLASSES[c.class]?.abilities || CHARACTER_CLASSES.warrior.abilities;
      if (typeof c.color === 'undefined') c.color = CHARACTER_CLASSES[c.class]?.color || CHARACTER_CLASSES.warrior.color;
      if (typeof c.inventory === 'undefined') c.inventory = {};
      if (typeof c.equipped_weapon === 'undefined') c.equipped_weapon = null;
      if (typeof c.equipped_armor === 'undefined') c.equipped_armor = null;
      if (typeof c.gold === 'undefined') c.gold = 0;
      raw[k] = c;
    }
    cache = raw;
    return raw;
  } catch (err) {
    console.error('Failed to read rpg storage', err);
    return {};
  }
}

function writeAll(obj) {
  ensureDir();
  // atomic write: write to temp file then rename
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
  cache = obj;
}

export function createCharacter(userId, name, charClass = 'warrior') {
  const all = cache || readAll();
  if (all[userId]) return null;

  const classData = CHARACTER_CLASSES[charClass];
  if (!classData) throw new Error(`Invalid character class: ${charClass}`);

  const char = {
    name: name || `Player${userId.slice(0,4)}`,
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

  all[userId] = char;
  writeAll(all);
  return char;
}

export function levelFromXp(xp) {
  // simple formula: 20 XP per level, starting at level 1
  return Math.floor(1 + (xp || 0) / 20);
}

// apply xp to character in-memory and grant skill points for levels gained
export function applyXp(userId, char, amount = 0) {
  const oldLvl = char.lvl || levelFromXp(char.xp || 0);
  char.xp = (char.xp || 0) + (amount || 0);
  const newLvl = levelFromXp(char.xp);
  let gained = 0;
  if (newLvl > oldLvl) {
    gained = newLvl - oldLvl;
    char.skillPoints = (char.skillPoints || 0) + gained;
    char.lvl = newLvl;
  } else {
    char.lvl = newLvl;
  }
  return { char, oldLvl, newLvl, gained };
}

export function getCharacter(userId) {
  const all = cache || readAll();
  return all[userId] || null;
}

export function saveCharacter(userId, char) {
  const all = cache || readAll();
  all[userId] = char;
  writeAll(all);
}

export function getAllCharacters() {
  return cache || readAll();
}

export function resetCharacter(userId, charClass = 'warrior') {
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

export function getLeaderboard(limit = 10, offset = 0) {
  const all = cache || readAll();
  const arr = Object.entries(all).map(([id, c]) => ({ id, name: c.name, lvl: c.lvl || 1, xp: c.xp || 0, atk: c.atk || 0 }));
  arr.sort((a, b) => { if (b.lvl !== a.lvl) return b.lvl - a.lvl; if (b.xp !== a.xp) return b.xp - a.xp; return b.atk - a.atk; });
  return arr.slice(offset, offset + limit);
}

export function getLeaderboardCount() {
  const all = cache || readAll();
  return Object.keys(all).length;
}

export function encounterMonster(lvl = 1) {
  const monster = { name: `Goblin L${lvl}`, hp: 10 + lvl * 3, atk: 3 + lvl, lvl };
  return monster;
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
    return 0; // Miss
  }

  defender.hp -= damage;
  return damage;
}

export async function narrate(guildId, prompt, fallback) {
  try {
    const out = await generate(guildId, prompt);
    return out || fallback || '';
  } catch (err) {
    console.error('Narration failed', err);
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
  'mithril_ingot': { name: 'Mithril Ingot', type: 'material', rarity: 'legendary', value: 2000, description: 'Lightweight and incredibly strong' }
};

const ITEM_RARITIES = {
  common: { color: 0x8B8B8B, chance: 50 },
  uncommon: { color: 0x4CAF50, chance: 25 },
  rare: { color: 0x2196F3, chance: 15 },
  legendary: { color: 0xFF9800, chance: 10 }
};

export function generateRandomItem(level = 1) {
  const rarityRoll = Math.random() * 100;
  let selectedRarity = 'common';

  for (const [rarity, data] of Object.entries(ITEM_RARITIES)) {
    if (rarityRoll <= data.chance) {
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
    return ITEMS['health_potion']; // Fallback
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
    gold_ore: 5, mithril_ingot: 25
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
    char.atk -= ITEMS[char.equipped_weapon].atk || 0;
  }

  if (item.type === 'armor' && char.equipped_armor) {
    addItemToInventory(userId, char.equipped_armor, 1);
    char.def -= ITEMS[char.equipped_armor].def || 0;
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
  removeItemFromInventory(userId, itemId, 1);

  writeAll(all);
  return { success: true, char };
}

export function unequipItem(userId, slot) {
  const all = cache || readAll();
  const char = all[userId];

  if (!char) return { success: false, reason: 'no_character' };

  let itemId = null;
  if (slot === 'weapon' && char.equipped_weapon) {
    itemId = char.equipped_weapon;
    char.atk -= ITEMS[itemId].atk || 0;
    char.equipped_weapon = null;
  } else if (slot === 'armor' && char.equipped_armor) {
    itemId = char.equipped_armor;
    char.def -= ITEMS[itemId].def || 0;
    char.equipped_armor = null;
  } else {
    return { success: false, reason: 'no_item_equipped' };
  }

  if (itemId) {
    addItemToInventory(userId, itemId, 1);
  }

  writeAll(all);
  return { success: true, char };
}

export function bossEncounter(lvl = 5) {
  return { name: `Dragon L${lvl}`, hp: 50 + lvl * 20, atk: 8 + lvl * 2, lvl };
}

// simple quest storage inside RPG file
function readQuests() {
  const p = path.join(process.cwd(), 'data', 'quests.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch { return {}; }
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
    { title: `Earn ${100 + level * 50} Gold`, desc: `Accumulate ${100 + level * 50} gold through various activities.`, requirement: 'gold_earned', amount: 100 + level * 50 }
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

export function completeQuest(userId, questId) {
  const all = readQuests();
  const arr = all[userId] || [];
  const q = arr.find(x => x.id === Number(questId));
  if (!q) return null;
  q.status = 'completed';
  writeQuests(all);
  return q;
}

export function generateRandomQuest(userId, level = 1) {
  const all = readQuests();
  all[userId] = all[userId] || [];
  const questTypes = [
    { title: `Slay ${5 + level * 2} Goblins`, desc: `Defeat ${5 + level * 2} goblins in combat.`, requirement: 'goblins_defeated', amount: 5 + level * 2 },
    { title: `Collect ${3 + level} Health Potions`, desc: `Gather ${3 + level} health potions from exploration.`, requirement: 'potions_collected', amount: 3 + level },
    { title: `Reach Level ${level + 5}`, desc: `Gain enough XP to reach level ${level + 5}.`, requirement: 'level_reached', amount: level + 5 },
    { title: `Earn ${100 + level * 50} Gold`, desc: `Accumulate ${100 + level * 50} gold through various activities.`, requirement: 'gold_earned', amount: 100 + level * 50 }
  ];

  const randomType = questTypes[Math.floor(Math.random() * questTypes.length)];
  const q = { id: Date.now(), title: randomType.title, desc: randomType.desc, status: 'open', requirement: randomType.requirement, amount: randomType.amount };
  all[userId].push(q);
  writeQuests(all);
  return q;
}

// Spend skill points for a character and persist change
export function spendSkillPoints(userId, stat, amount = 1) {
  if (locks.has(userId)) return { success: false, reason: 'locked' };
  locks.add(userId);
  try {
    const all = cache || readAll();
    const char = all[userId];
  if (!char) return { success: false, reason: 'no_character' };
  const pts = char.skillPoints || 0;
  if (amount <= 0) return { success: false, reason: 'invalid_amount' };
  if (pts < amount) return { success: false, reason: 'not_enough_points', have: pts };

  if (stat === 'hp') {
    char.hp = Math.min((char.hp || 0) + amount * 2, char.maxHp || 20);
  } else if (stat === 'maxhp') {
    char.maxHp = (char.maxHp || 20) + amount * 5;
    char.hp = Math.min((char.hp || 0) + amount * 2, char.maxHp);
  } else if (stat === 'atk') {
    char.atk = (char.atk || 5) + amount;
  } else if (stat === 'def') {
    char.def = (char.def || 2) + amount;
  } else if (stat === 'spd') {
    char.spd = (char.spd || 2) + amount;
  } else {
    return { success: false, reason: 'unknown_stat' };
  }

  char.skillPoints = pts - amount;
  all[userId] = char;
  writeAll(all);
  return { success: true, char };
  } finally {
    locks.delete(userId);
  }
}

