import fs from 'fs';
import path from 'path';

const LOCATIONS_FILE = path.join(process.cwd(), 'data', 'locations.json');

// Epic RPG Locations and Dungeons System
class LocationManager {
  constructor() {
    this.ensureStorage();
    this.loadLocations();
  }

  ensureStorage() {
    const dir = path.dirname(LOCATIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(LOCATIONS_FILE)) {
      fs.writeFileSync(LOCATIONS_FILE, JSON.stringify({}));
    }
  }

  loadLocations() {
    try {
      const data = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
      this.locations = data;
    } catch (error) {
      console.error('Failed to load locations:', error);
      this.locations = {};
    }
  }

  saveLocations() {
    try {
      fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(this.locations, null, 2));
    } catch (error) {
      console.error('Failed to save locations:', error);
    }
  }

  // Epic Location Definitions
  getLocations() {
    return {
      // Starting Areas
      'whispering_woods': {
        id: 'whispering_woods',
        name: '🌲 Whispering Woods',
        description: 'Ancient trees whisper secrets of old magic',
        type: 'exploration',
        level: 1,
        encounters: ['friendly_npc', 'easy_monster', 'treasure_chest', 'magic_spring'],
        ai_prompt: 'Describe a mystical forest with ancient trees that seem to whisper secrets. Include ambient sounds and magical elements.',
        rewards: { xp: 5, gold: 10, items: ['health_potion', 'magic_crystal'] },
        color: 0x228B22,
        emoji: '🌲',
        unlocked: true
      },

      'crystal_caverns': {
        id: 'crystal_caverns',
        name: '💎 Crystal Caverns',
        description: 'Shimmering crystals light the underground passages',
        type: 'dungeon',
        level: 3,
        encounters: ['crystal_golem', 'treasure_room', 'dark_pit', 'magic_circle'],
        ai_prompt: 'Describe a breathtaking cavern filled with glowing crystals of various colors. Include echoes and mystical energies.',
        rewards: { xp: 15, gold: 25, items: ['mana_potion', 'magic_staff', 'crystal_shard'] },
        color: 0x9370DB,
        emoji: '💎',
        unlocked: false
      },

      'volcano_summit': {
        id: 'volcano_summit',
        name: '🌋 Volcano Summit',
        description: 'The peak where fire and earth meet the sky',
        type: 'raid',
        level: 8,
        encounters: ['fire_elemental', 'lava_golem', 'phoenix_nest', 'ancient_altar'],
        ai_prompt: 'Describe a dramatic volcanic landscape with rivers of lava, intense heat, and the raw power of nature.',
        rewards: { xp: 50, gold: 100, items: ['fire_sword', 'phoenix_feather', 'dragon_scale'] },
        color: 0xFF4500,
        emoji: '🌋',
        unlocked: false
      },

      'forgotten_temple': {
        id: 'forgotten_temple',
        name: '🏛️ Forgotten Temple',
        description: 'Ancient ruins holding divine secrets',
        type: 'dungeon',
        level: 12,
        encounters: ['stone_guardian', 'curse_trap', 'blessed_shrine', 'divine_relic'],
        ai_prompt: 'Describe mysterious ancient ruins overgrown with vines, filled with mystical symbols and divine energy.',
        rewards: { xp: 75, gold: 150, items: ['holy_amulet', 'ancient_scroll', 'divine_blessing'] },
        color: 0xDAA520,
        emoji: '🏛️',
        unlocked: false
      },

      'shadow_realm': {
        id: 'shadow_realm',
        name: '🌑 Shadow Realm',
        description: 'A dimension where light fears to tread',
        type: 'raid',
        level: 20,
        encounters: ['shadow_beast', 'void_walker', 'dark_portal', 'essence_crystal'],
        ai_prompt: 'Describe a terrifying realm of pure darkness where shadows come alive and whisper forbidden knowledge.',
        rewards: { xp: 200, gold: 500, items: ['shadow_blade', 'void_crystal', 'legendary_blade'] },
        color: 0x2F2F4F,
        emoji: '🌑',
        unlocked: false
      },

      'celestial_spire': {
        id: 'celestial_spire',
        name: '⭐ Celestial Spire',
        description: 'The highest point where mortals meet the divine',
        type: 'legendary',
        level: 25,
        encounters: ['celestial_guardian', 'star_dragon', 'divine_trial', 'cosmic_artifact'],
        ai_prompt: 'Describe a breathtaking tower reaching into the heavens, surrounded by stars and cosmic phenomena.',
        rewards: { xp: 500, gold: 1000, items: ['celestial_armor', 'star_fragment', 'godly_relic'] },
        color: 0xFFD700,
        emoji: '⭐',
        unlocked: false
      }
    };
  }

  // Advanced Exploration System
  exploreLocation(userId, locationId) {
    const locations = this.getLocations();
    const location = locations[locationId];

    if (!location) {
      return { success: false, reason: 'location_not_found' };
    }

    if (!location.unlocked) {
      return { success: false, reason: 'location_locked' };
    }

    // Generate random encounter based on location
    const encounter = this.generateEncounter(location);

    return {
      success: true,
      location,
      encounter,
      narrative: this.generateLocationNarrative(location, encounter)
    };
  }

  generateEncounter(location) {
    const encounters = location.encounters;
    const randomEncounter = encounters[Math.floor(Math.random() * encounters.length)];

    return {
      type: randomEncounter,
      difficulty: location.level,
      rewards: this.calculateEncounterRewards(randomEncounter, location.level),
      description: this.getEncounterDescription(randomEncounter, location.level)
    };
  }

  getEncounterDescription(encounterType, level) {
    const descriptions = {
      // Friendly encounters
      'friendly_npc': `A wise traveler offers guidance and shares ancient knowledge from their journeys.`,
      'magic_spring': `Crystal-clear water glows with restorative magic, healing wounds and granting wisdom.`,
      'blessed_shrine': `A sacred altar radiates divine energy, offering blessings to worthy adventurers.`,

      // Combat encounters
      'easy_monster': `A curious forest creature emerges, more frightened than dangerous.`,
      'crystal_golem': `Animated crystals form a humanoid shape, defending the cavern's treasures.`,
      'fire_elemental': `Living flames dance with destructive beauty, born from the volcano's heart.`,
      'stone_guardian': `An ancient statue awakens, sworn to protect the temple's secrets.`,
      'shadow_beast': `Darkness coalesces into a terrifying creature from your deepest fears.`,
      'celestial_guardian': `A being of pure starlight descends to test your worthiness.`,

      // Treasure encounters
      'treasure_chest': `An ornate chest glows with magical energy, promising valuable rewards.`,
      'treasure_room': `A chamber filled with precious artifacts and forgotten wealth.`,
      'ancient_altar': `A mystical altar holds offerings from civilizations long past.`,

      // Special encounters
      'dark_pit': `A seemingly bottomless pit exhales cold, malevolent air.`,
      'magic_circle': `Glowing runes form a perfect circle of arcane power.`,
      'phoenix_nest': `A magnificent nest made of golden flames and precious materials.`,
      'divine_relic': `A holy artifact pulses with celestial energy.`,
      'dark_portal': `A swirling vortex connects to realms beyond mortal comprehension.`,
      'cosmic_artifact': `An otherworldly object defies the laws of reality.`
    };

    return descriptions[encounterType] || `An mysterious encounter awaits in this location.`;
  }

  calculateEncounterRewards(encounterType, level) {
    const baseRewards = {
      xp: level * 5,
      gold: level * 3,
      items: []
    };

    // Add special rewards based on encounter type
    if (encounterType.includes('treasure') || encounterType.includes('altar') || encounterType.includes('relic')) {
      baseRewards.items.push('random_item');
      baseRewards.gold *= 2;
    }

    if (encounterType.includes('magic') || encounterType.includes('divine') || encounterType.includes('celestial')) {
      baseRewards.xp *= 2;
    }

    return baseRewards;
  }

  generateLocationNarrative(location, encounter) {
    // This would typically use AI to generate dynamic narratives
    return {
      entry: `You arrive at ${location.name}. ${location.description}`,
      encounter: `As you explore deeper, you encounter: ${encounter.description}`,
      rewards: `Completing this encounter may reward: ${encounter.rewards.xp} XP and ${encounter.rewards.gold} gold.`
    };
  }

  // Location Unlocking System
  unlockLocation(userId, locationId) {
    const locations = this.getLocations();
    const location = locations[locationId];

    if (!location) {
      return { success: false, reason: 'location_not_found' };
    }

    if (location.unlocked) {
      return { success: false, reason: 'already_unlocked' };
    }

    // Check if user meets requirements
    // This would integrate with character stats and achievements
    location.unlocked = true;
    this.saveLocations();

    return {
      success: true,
      location,
      message: `🏆 **Location Unlocked!** ${location.emoji} ${location.name}\n${location.description}`
    };
  }

  // Dungeon Progression System
  enterDungeon(userId, locationId) {
    const locations = this.getLocations();
    const location = locations[locationId];

    if (!location || location.type !== 'dungeon') {
      return { success: false, reason: 'not_a_dungeon' };
    }

    if (!location.unlocked) {
      return { success: false, reason: 'dungeon_locked' };
    }

    // Generate dungeon instance with multiple floors/rooms
    const dungeonInstance = {
      id: `dungeon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      locationId,
      userId,
      currentFloor: 1,
      maxFloors: Math.min(10, location.level + 3),
      completed: false,
      startTime: Date.now(),
      progress: []
    };

    return {
      success: true,
      dungeon: dungeonInstance,
      location,
      firstRoom: this.generateDungeonRoom(location, 1)
    };
  }

  generateDungeonRoom(location, floor) {
    const roomTypes = ['combat', 'treasure', 'puzzle', 'rest', 'boss'];
    const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];

    return {
      floor,
      type: roomType,
      description: this.getRoomDescription(roomType, location, floor),
      challenge: this.generateRoomChallenge(roomType, location.level, floor),
      rewards: this.calculateRoomRewards(roomType, location.level, floor)
    };
  }

  getRoomDescription(roomType, location, floor) {
    const descriptions = {
      combat: `Floor ${floor} contains hostile creatures defending their territory.`,
      treasure: `Floor ${floor} holds ancient treasures waiting to be discovered.`,
      puzzle: `Floor ${floor} presents a mystical puzzle that must be solved.`,
      rest: `Floor ${floor} offers a safe haven to recover and prepare.`,
      boss: `Floor ${floor} - The final challenge! A powerful guardian awaits.`
    };

    return descriptions[roomType] || `Floor ${floor} presents an unknown challenge.`;
  }

  generateRoomChallenge(roomType, baseLevel, floor) {
    const level = baseLevel + (floor - 1);

    switch (roomType) {
      case 'combat':
        return {
          type: 'monster',
          name: `Dungeon Guardian (Level ${level})`,
          hp: 50 + (level * 10),
          atk: 8 + level,
          def: 2 + Math.floor(level / 3),
          spd: 2 + Math.floor(level / 4)
        };

      case 'puzzle':
        return {
          type: 'riddle',
          riddle: this.generateRiddle(level),
          answer: this.getRiddleAnswer()
        };

      case 'treasure':
        return {
          type: 'lock',
          difficulty: level,
          trap_chance: Math.min(50, level * 5)
        };

      default:
        return { type: 'none' };
    }
  }

  calculateRoomRewards(roomType, baseLevel, floor) {
    const level = baseLevel + (floor - 1);

    switch (roomType) {
      case 'combat':
        return { xp: level * 10, gold: level * 5, items: ['random_item'] };
      case 'treasure':
        return { xp: level * 5, gold: level * 15, items: ['rare_item', 'gold_bonus'] };
      case 'puzzle':
        return { xp: level * 20, gold: level * 8, items: ['skill_book'] };
      case 'boss':
        return { xp: level * 50, gold: level * 30, items: ['legendary_item', 'boss_loot'] };
      default:
        return { xp: level * 3, gold: level * 2 };
    }
  }

  generateRiddle(level) {
    const riddles = [
      "I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?",
      "I have keys but no locks. I have space but no room. You can enter, but you can't go outside. What am I?",
      "The more you take, the more you leave behind. What am I?",
      "I am not alive, but I grow; I don't have lungs, but I need air; I don't have a mouth, but water kills me. What am I?",
      "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?"
    ];

    return riddles[Math.floor(Math.random() * riddles.length)];
  }

  getRiddleAnswer() {
    // This would return the correct answer for riddle verification
    return "echo";
  }

  // Location Discovery System
  async discoverLocation(userId, locationId) {
    const locations = this.getLocations();
    const location = locations[locationId];

    if (!location) {
      return { success: false, reason: 'location_not_found' };
    }

    // Check discovery requirements
    const requirements = this.getDiscoveryRequirements(locationId);

    const canUnlock = await this.checkRequirements(userId, requirements);

    return {
      success: true,
      location,
      requirements,
      canUnlock
    };
  }

  getDiscoveryRequirements(locationId) {
    const requirements = {
      'crystal_caverns': { level: 3, achievements: ['first_character'] },
      'volcano_summit': { level: 8, achievements: ['dragon_slayer'] },
      'forgotten_temple': { level: 12, achievements: ['treasure_hunter'] },
      'shadow_realm': { level: 20, achievements: ['class_master'] },
      'celestial_spire': { level: 25, achievements: ['bot_friend'] }
    };

    return requirements[locationId] || {};
  }

  async checkRequirements(userId, requirements) {
    // Check if user meets the requirements
    const { getCharacter, getUserAchievements } = await import('./rpg.js');
    const { getUserAchievements: getAch } = await import('./achievements.js');

    const char = getCharacter(userId);
    if (!char) return false;

    if (requirements.level && char.lvl < requirements.level) return false;

    if (requirements.achievements && requirements.achievements.length > 0) {
      const userAch = getAch(userId);
      const hasRequired = requirements.achievements.every(achId => userAch.find(a => a.id === achId));
      if (!hasRequired) return false;
    }

    return true;
  }
}

// Export singleton instance
export const locationManager = new LocationManager();

// Convenience functions
export function exploreLocation(userId, locationId) {
  return locationManager.exploreLocation(userId, locationId);
}

export function unlockLocation(userId, locationId) {
  return locationManager.unlockLocation(userId, locationId);
}

export function enterDungeon(userId, locationId) {
  return locationManager.enterDungeon(userId, locationId);
}

export async function discoverLocation(userId, locationId) {
  return await locationManager.discoverLocation(userId, locationId);
}

export function getLocations() {
  return locationManager.getLocations();
}