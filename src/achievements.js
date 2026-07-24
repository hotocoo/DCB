import fs from 'node:fs';
import path from 'node:path';

import { logger } from './logger.js';

const ACHIEVEMENTS_FILE = path.join(process.cwd(), 'data', 'achievements.json');

// Achievement definitions with wholesome and creative themes
const ACHIEVEMENT_DEFINITIONS = {
  // RPG Achievements
  first_character: {
    id: 'first_character',
    name: '🎮 Born to Adventure',
    description: 'Create your first RPG character',
    icon: '🎭',
    category: 'rpg',
    rarity: 'common',
    points: 10,
    condition: (stats) => stats.characters_created >= 1,
  },
  class_master: {
    id: 'class_master',
    name: '🏆 Class Act',
    description: 'Try all character classes',
    icon: '👑',
    category: 'rpg',
    rarity: 'rare',
    points: 50,
    condition: (stats) => stats.classes_tried >= 4,
  },
  dragon_slayer: {
    id: 'dragon_slayer',
    name: "🐲 Dragon's Bane",
    description: 'Defeat 10 boss monsters',
    icon: '⚔️',
    category: 'rpg',
    rarity: 'epic',
    points: 100,
    condition: (stats) => stats.bosses_defeated >= 10,
  },
  treasure_hunter: {
    id: 'treasure_hunter',
    name: '💎 Hidden Riches',
    description: 'Find 50 items while exploring',
    icon: '💰',
    category: 'rpg',
    rarity: 'rare',
    points: 75,
    condition: (stats) => stats.items_found >= 50,
  },

  // Game Achievements
  trivia_master: {
    id: 'trivia_master',
    name: '🧠 Knowledge Seeker',
    description: 'Answer 100 trivia questions correctly',
    icon: '🎓',
    category: 'games',
    rarity: 'epic',
    points: 150,
    condition: (stats) => stats.trivia_correct >= 100,
  },
  memory_champion: {
    id: 'memory_champion',
    name: '🧩 Mind Palace',
    description: 'Complete 20 memory games',
    icon: '🏛️',
    category: 'games',
    rarity: 'rare',
    points: 80,
    condition: (stats) => stats.memory_games_completed >= 20,
  },
  hangman_legend: {
    id: 'hangman_legend',
    name: '🔤 Word Wizard',
    description: 'Win 50 hangman games',
    icon: '📚',
    category: 'games',
    rarity: 'epic',
    points: 120,
    condition: (stats) => stats.hangman_wins >= 50,
  },

  // Social Achievements
  poll_creator: {
    id: 'poll_creator',
    name: '📊 Voice of the People',
    description: 'Create 10 polls',
    icon: '🗳️',
    category: 'social',
    rarity: 'common',
    points: 25,
    condition: (stats) => stats.polls_created >= 10,
  },
  community_helper: {
    id: 'community_helper',
    name: '🤝 Helpful Soul',
    description: 'Help other users 25 times',
    icon: '🌟',
    category: 'social',
    rarity: 'rare',
    points: 60,
    condition: (stats) => stats.help_actions >= 25,
  },

  // Special Achievements
  bot_friend: {
    id: 'bot_friend',
    name: '💬 Chatty Companion',
    description: 'Have 500 conversations with the bot',
    icon: '💕',
    category: 'special',
    rarity: 'legendary',
    points: 200,
    condition: (stats) => stats.messages_sent >= 500,
  },
  early_adopter: {
    id: 'early_adopter',
    name: '🚀 Pioneer',
    description: 'Be among the first to use all new features',
    icon: '⭐',
    category: 'special',
    rarity: 'legendary',
    points: 300,
    condition: (stats) => stats.features_tried >= 10,
  },

  // Fun Achievements
  lucky_duck: {
    id: 'lucky_duck',
    name: '🍀 Fortunate Soul',
    description: 'Get heads 10 times in a row on coin flips',
    icon: '🎰',
    category: 'fun',
    rarity: 'epic',
    points: 90,
    condition: (stats) => stats.coin_heads_streak >= 10,
  },
  weather_watcher: {
    id: 'weather_watcher',
    name: '🌤️ Weather Wise',
    description: 'Check weather for 20 different locations',
    icon: '🌍',
    category: 'fun',
    rarity: 'common',
    points: 30,
    condition: (stats) => stats.weather_checks >= 20,
  },
};

const ACHIEVEMENT_RARITIES = {
  common: { name: 'Common', color: 0x8b_8b_8b, multiplier: 1 },
  rare: { name: 'Rare', color: 0x4c_af_50, multiplier: 1.5 },
  epic: { name: 'Epic', color: 0x9c_27_b0, multiplier: 2 },
  legendary: { name: 'Legendary', color: 0xff_98_00, multiplier: 3 },
};

class AchievementManager {
  constructor() {
    this.ensureStorage();
    this.loadAchievements();
  }

  ensureStorage() {
    const dir = path.dirname(ACHIEVEMENTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(ACHIEVEMENTS_FILE)) {
      fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify({}));
    }
  }

  loadAchievements() {
    try {
      const data = JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE));
      this.userAchievements = data;
    } catch (error) {
      logger.error('Failed to load achievements:', error);
      this.userAchievements = {};
    }
  }

  saveAchievements() {
    try {
      fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify(this.userAchievements, null, 2));
    } catch (error) {
      logger.error('Failed to save achievements:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  getUserStats(userId) {
    if (!this.userAchievements[userId]) {
      this.userAchievements[userId] = {
        achievements: [],
        stats: {
          characters_created: 0,
          classes_tried: 0,
          bosses_defeated: 0,
          items_found: 0,
          trivia_correct: 0,
          memory_games_completed: 0,
          hangman_wins: 0,
          polls_created: 0,
          help_actions: 0,
          messages_sent: 0,
          features_tried: 0,
          coin_streak: 0,
          weather_checks: 0,
        },
        total_points: 0,
        level: 1,
      };
    }
    return this.userAchievements[userId];
  }

  updateStats(userId, statUpdates) {
    const userData = this.getUserStats(userId);

    // Update stats
    for (const [stat, value] of Object.entries(statUpdates)) {
      if (typeof userData.stats[stat] === 'number') {
        userData.stats[stat] += value;
      }
    }

    // Check for new achievements
    const newAchievements = this.checkAchievements(userId);

    // Update total points and level
    userData.total_points = userData.achievements.reduce((total, achievementId) => {
      const achievement = ACHIEVEMENT_DEFINITIONS[achievementId];
      return total + (achievement ? achievement.points : 0);
    }, 0);

    userData.level = Math.floor(userData.total_points / 100) + 1;

    this.saveAchievements();
    return { newAchievements, userData };
  }

  checkAchievements(userId) {
    const userData = this.getUserStats(userId);
    const stats = userData.stats;
    const earnedAchievements = userData.achievements;
    const newAchievements = [];

    for (const [achievementId, achievement] of Object.entries(ACHIEVEMENT_DEFINITIONS)) {
      if (!earnedAchievements.includes(achievementId) && achievement.condition(stats)) {
        earnedAchievements.push(achievementId);
        newAchievements.push(achievement);
      }
    }

    return newAchievements;
  }

  getAchievementInfo(achievementId) {
    return ACHIEVEMENT_DEFINITIONS[achievementId] || null;
  }

  getAllAchievements() {
    return ACHIEVEMENT_DEFINITIONS;
  }

  getUserAchievements(userId) {
    return this.getUserStats(userId)
      .achievements.map((id) => ACHIEVEMENT_DEFINITIONS[id])
      .filter(Boolean);
  }

  getLeaderboard(limit = 10) {
    return Object.entries(this.userAchievements)
      .map(([userId, data]) => ({
        userId,
        total_points: data.total_points,
        level: data.level,
        achievements_count: data.achievements.length,
      }))
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, limit);
  }
}

// Export singleton instance
export const achievementManager = new AchievementManager();

// Convenience functions
export function updateUserStats(userId, statUpdates) {
  return achievementManager.updateStats(userId, statUpdates);
}

export function getUserStats(userId) {
  return achievementManager.getUserStats(userId);
}

export function checkUserAchievements(userId) {
  return achievementManager.checkAchievements(userId);
}

export function getAchievementInfo(achievementId) {
  return achievementManager.getAchievementInfo(achievementId);
}

export function getAllAchievements() {
  return achievementManager.getAllAchievements();
}

export function getUserAchievements(userId) {
  return achievementManager.getUserAchievements(userId);
}

export function getAchievementLeaderboard(limit = 10) {
  return achievementManager.getLeaderboard(limit);
}

export { ACHIEVEMENT_RARITIES };
