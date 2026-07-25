import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { logger } from './logger.js';
import { generateRandomItem } from './rpg.js';
import { getUserAchievements } from './achievements.js';
import { getCharacter } from './rpg.js';

const OLD_LOC_FILE = path.join(process.cwd(), 'data', 'locations.json');

// Static location definitions - never change, never need persistence
const LOCATIONS = {
  whispering_woods: { id: 'whispering_woods', name: '🌲 Whispering Woods', description: 'Ancient trees whisper secrets of old magic', type: 'exploration', level: 1, encounters: ['friendly_npc', 'easy_monster', 'treasure_chest', 'magic_spring'], ai_prompt: 'Describe a mystical forest...', rewards: { xp: 5, gold: 10, items: ['health_potion', 'magic_crystal'] }, color: 0x22_8b_22, emoji: '🌲' },
  crystal_caverns: { id: 'crystal_caverns', name: '💎 Crystal Caverns', description: 'Shimmering crystals light the underground passages', type: 'dungeon', level: 3, encounters: ['crystal_golem', 'treasure_room', 'dark_pit', 'magic_circle'], ai_prompt: 'Describe a breathtaking cavern...', rewards: { xp: 15, gold: 25, items: ['mana_potion', 'magic_staff', 'crystal_shard'] }, color: 0x93_70_db, emoji: '💎' },
  volcano_summit: { id: 'volcano_summit', name: '🌋 Volcano Summit', description: 'The peak where fire and earth meet the sky', type: 'raid', level: 8, encounters: ['fire_elemental', 'lava_golem', 'phoenix_nest', 'ancient_altar'], ai_prompt: 'Describe a dramatic volcanic landscape...', rewards: { xp: 50, gold: 100, items: ['fire_sword', 'phoenix_feather', 'dragon_scale'] }, color: 0xff_45_00, emoji: '🌋' },
  forgotten_temple: { id: 'forgotten_temple', name: '🏛️ Forgotten Temple', description: 'Ancient ruins holding divine secrets', type: 'dungeon', level: 12, encounters: ['stone_guardian', 'curse_trap', 'blessed_shrine', 'divine_relic'], ai_prompt: 'Describe mysterious ancient ruins...', rewards: { xp: 75, gold: 150, items: ['holy_amulet', 'ancient_scroll', 'divine_blessing'] }, color: 0xda_a5_20, emoji: '🏛️' },
  shadow_realm: { id: 'shadow_realm', name: '🌑 Shadow Realm', description: 'A dimension where light fears to tread', type: 'raid', level: 20, encounters: ['shadow_beast', 'void_walker', 'dark_portal', 'essence_crystal'], ai_prompt: 'Describe a terrifying realm...', rewards: { xp: 200, gold: 500, items: ['shadow_blade', 'void_crystal', 'legendary_blade'] }, color: 0x2f_2f_4f, emoji: '🌑' },
  celestial_spire: { id: 'celestial_spire', name: '⭐ Celestial Spire', description: 'The highest point where mortals meet the divine', type: 'legendary', level: 25, encounters: ['celestial_guardian', 'star_dragon', 'divine_trial', 'cosmic_artifact'], ai_prompt: 'Describe a breathtaking tower...', rewards: { xp: 500, gold: 1000, items: ['celestial_armor', 'star_fragment', 'godly_relic'] }, color: 0xff_d7_00, emoji: '⭐' },
};

// Persistent data: user's unlocked locations stored in database
function migrateFromJson() {
  const db = getDb();
  if (!db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="unlocked_locations"').get()) return;
  if (!fs.existsSync(OLD_LOC_FILE)) return;

  try {
    const data = JSON.parse(fs.readFileSync(OLD_LOC_FILE, 'utf8')) || {};
    for (const [uid, locs] of Object.entries(data)) {
      for (const locId of (Array.isArray(locs) ? locs : [])) {
        db.prepare('INSERT OR IGNORE INTO unlocked_locations (user_id, location_id) VALUES (?, ?)').run(uid, locId);
      }
    }
    logger.info(`Migrated unlocked locations for ${Object.keys(data).length} users`);
  } catch (err) { logger.error('Locations migration failed', err instanceof Error ? err : new Error(String(err))); }
}

export function getLocations() { return LOCATIONS; }

// Encounter generation helpers
const ENCOUNTER_DESCRIPTIONS = {
  friendly_npc: 'A wise traveler offers guidance and shares ancient knowledge.', magic_spring: 'Crystal-clear water glows with restorative magic.', blessed_shrine: 'A sacred altar radiates divine energy.', easy_monster: 'A curious forest creature emerges, more frightened than dangerous.', crystal_golem: "Animated crystals form a humanoid shape.", fire_elemental: "Living flames dance with destructive beauty.", stone_guardian: "An ancient statue awakens to protect secrets.", shadow_beast: 'Darkness coalesces into a terrifying creature.', celestial_guardian: 'A being of pure starlight descends.', treasure_chest: 'An ornate chest glows with magical energy.', treasure_room: 'A chamber filled with precious artifacts.', ancient_altar: 'A mystical altar holds forgotten offerings.', dark_pit: 'A bottomless pit exhales cold, malevolent air.', magic_circle: 'Glowing runes form a perfect circle of arcane power.', phoenix_nest: 'A magnificent nest made of golden flames.', divine_relic: 'A holy artifact pulses with celestial energy.', dark_portal: 'A swirling vortex connects to distant realms.', cosmic_artifact: 'An otherworldly object defies reality.', void_walker: 'A being from between dimensions emerges.', lava_golem: "A creature of molten rock blocks your path.", star_dragon: "A legendary beast wreathed in starlight appears.",
};

function calculateEncounterRewards(encounterType, level) {
  const base = { xp: level * 5, gold: level * 3, items: [] };
  if (/treasure|altar|relic/i.test(encounterType)) { base.items.push('random_item'); base.gold *= 2; }
  if (/magic|divine|celestial/i.test(encounterType)) base.xp *= 2;
  return base;
}

export function exploreLocation(userId, locationId) {
  const loc = LOCATIONS[locationId];
  if (!loc) return { success: false, reason: 'not_found' };
  if (!isLocationUnlocked(userId, locationId)) return { success: false, reason: 'locked' };

  const encounterType = loc.encounters[Math.floor(Math.random() * loc.encounters.length)];
  const encounter = { type: encounterType, difficulty: loc.level, rewards: calculateEncounterRewards(encounterType, loc.level), description: ENCOUNTER_DESCRIPTIONS[encounterType] || 'A mysterious encounter awaits.' };

  return { success: true, location: loc, encounter, narrative: { entry: `You arrive at ${loc.name}. ${loc.description}`, encounter: `You encounter: ${encounter.description}`, rewards: `${encounter.rewards.xp} XP and ${encounter.rewards.gold} gold available.` } };
}

// Location unlock system (stored persistently now)
function isLocationUnlocked(userId, locationId) {
  if (LOCATIONS[locationId]?.level <= 1) return true; // Starting area always unlocked
  migrateFromJson();
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM unlocked_locations WHERE user_id = ? AND location_id = ?').get(userId, locationId);
}

export function unlockLocation(userId, locationId) {
  const loc = LOCATIONS[locationId];
  if (!loc) return { success: false, reason: 'not_found' };
  if (isLocationUnlocked(userId, locationId)) return { success: false, reason: 'already_unlocked' };

  migrateFromJson();
  const db = getDb();
  db.prepare('INSERT INTO unlocked_locations (user_id, location_id) VALUES (?, ?)').run(userId, locationId);

  return { success: true, location: loc, message: `🏆 Location Unlocked! ${loc.emoji} ${loc.name}\n${loc.description}` };
}

// Dungeon system - ephemeral instances with generated rooms
export function enterDungeon(userId, locationId) {
  const loc = LOCATIONS[locationId];
  if (!loc || loc.type !== 'dungeon') return { success: false, reason: 'not_dungeon' };
  if (!isLocationUnlocked(userId, locationId)) return { success: false, reason: 'locked' };

  const instance = { id: `dungeon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, locationId, userId, currentFloor: 1, maxFloors: Math.min(10, loc.level + 3), completed: false, startTime: Date.now(), progress: [] };

  return { success: true, dungeon: instance, location: loc, firstRoom: generateDungeonRoom(loc, 1) };
}

function generateDungeonRoom(location, floor) {
  const types = ['combat', 'treasure', 'puzzle', 'rest', 'boss'];
  const type = types[Math.floor(Math.random() * types.length)];
  return { floor, type, description: getRoomDescription(type, location, floor), challenge: generateRoomChallenge(type, location.level, floor), rewards: calculateRoomRewards(type, location.level, floor) };
}

function getRoomDescription(roomType, location, floor) {
  switch (roomType) { case 'combat': return `Floor ${floor}: Hostile creatures defend their territory.`; case 'treasure': return `Floor ${floor}: Ancient treasures await discovery.`; case 'puzzle': return `Floor ${floor}: A mystical puzzle must be solved.`; case 'rest': return `Floor ${floor}: A safe haven to recover.`; case 'boss': return `Floor ${floor}: The final challenge!`; default: return `Floor ${floor}: Unknown challenge.`; }
}

function generateRoomChallenge(roomType, baseLevel, floor) {
  const level = baseLevel + (floor - 1);
  switch (roomType) { case 'combat': return { type: 'monster', name: `Dungeon Guardian Lvl ${level}`, hp: 50 + level * 10, atk: 8 + level, def: 2 + Math.floor(level / 3), spd: 2 + Math.floor(level / 4) }; case 'puzzle': return { type: 'riddle', riddle: RIDDLES[Math.floor(Math.random() * RIDDLES.length)] }; case 'treasure': return { type: 'lock', difficulty: level, trap_chance: Math.min(50, level * 5) }; default: return { type: 'none' }; }
}

function calculateRoomRewards(roomType, baseLevel, floor) {
  const level = baseLevel + (floor - 1);
  switch (roomType) { case 'combat': return { xp: level * 10, gold: level * 5, items: ['random_item'] }; case 'treasure': return { xp: level * 5, gold: level * 15, items: ['rare_item', 'gold_bonus'] }; case 'puzzle': return { xp: level * 20, gold: level * 8, items: ['skill_book'] }; case 'boss': return { xp: level * 50, gold: level * 30, items: ['legendary_item', 'boss_loot'] }; default: return { xp: level * 3, gold: level * 2 }; }
}

const RIDDLES = [
  'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind.',
  "I have keys but no locks. You can enter but can't go outside.",
  'The more you take, the more you leave behind.',
  "I don't have lungs but need air. Water kills me.",
  'I have cities but no houses, mountains but no trees, water but no fish.',
];

// Location discovery with requirements checking
const DISCOVERY_REQUIREMENTS = { crystal_caverns: { level: 3, achievements: ['first_character'] }, volcano_summit: { level: 8, achievements: ['dragon_slayer'] }, forgotten_temple: { level: 12, achievements: ['treasure_hunter'] }, shadow_realm: { level: 20, achievements: ['class_master'] }, celestial_spire: { level: 25, achievements: ['bot_friend'] } };

export async function discoverLocation(userId, locationId) {
  const loc = LOCATIONS[locationId];
  if (!loc) return { success: false, reason: 'not_found' };

  const reqs = DISCOVERY_REQUIREMENTS[locationId] || {};
  const char = getCharacter(userId);
  if (!char || reqs.level && char.lvl < reqs.level) return { success: true, location: loc, requirements: reqs, canUnlock: false };

  if (reqs.achievements?.length > 0) {
    const userAch = getUserAchievements(userId);
    if (!reqs.achievements.every((id) => userAch.some((a) => a.id === id))) return { success: true, location: loc, requirements: reqs, canUnlock: false };
  }

  return { success: true, location: loc, requirements: reqs, canUnlock: true };
}

// Backward-compatible singleton API
export const locationManager = { exploreLocation, unlockLocation, enterDungeon, discoverLocation, getLocations };
