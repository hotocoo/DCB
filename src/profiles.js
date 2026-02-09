import fs from 'node:fs';
import path from 'node:path';

const PROFILES_DIR = path.join(process.cwd(), 'data', 'players');

// Advanced User Profile and Statistics System
class ProfileManager {
  constructor() {
    this.ensureStorage();
    this.profiles = {};
    // Performance: Use profileCache for recently accessed profiles with TTL
    this.profileCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this.CACHE_MAX_SIZE = 100; // Max 100 cached profiles
    // Performance: Lazy load profiles on-demand instead of loading all at startup
  }

  ensureStorage() {
    if (!fs.existsSync(PROFILES_DIR)) {
      fs.mkdirSync(PROFILES_DIR, { recursive: true });
    }
  }
  
  // Performance: Cache management helpers with proper LRU behavior
  _getCachedProfile(userId) {
    const cached = this.profileCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Move to end for LRU behavior
      this.profileCache.delete(userId);
      this.profileCache.set(userId, cached);
      return cached.profile;
    }
    // Clean expired entry
    if (cached) {
      this.profileCache.delete(userId);
    }
    return null;
  }
  
  _setCachedProfile(userId, profile) {
    // Evict oldest entry (first in Map) if cache is full - true LRU behavior
    if (this.profileCache.size >= this.CACHE_MAX_SIZE && !this.profileCache.has(userId)) {
      const firstKey = this.profileCache.keys().next().value;
      this.profileCache.delete(firstKey);
    }
    
    // Remove and re-add to move to end (most recently used)
    if (this.profileCache.has(userId)) {
      this.profileCache.delete(userId);
    }
    
    this.profileCache.set(userId, {
      profile,
      timestamp: Date.now()
    });
  }
  
  // Performance: Load single profile on-demand instead of all at startup
  _loadSingleProfile(userId) {
    const filePath = path.join(PROFILES_DIR, `${userId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath));
        if (data.profile) {
          return data.profile;
        }
      }
      catch (error) {
        console.error(`Failed to load profile for ${userId}:`, error);
      }
    }
    return null;
  }

  loadProfiles() {
    this.profiles = {};
    if (!fs.existsSync(PROFILES_DIR)) return;

    const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const userId = path.basename(file, '.json');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file)));
        if (data.profile) {
          this.profiles[userId] = data.profile;
        }
      }
      catch (error) {
        console.error(`Failed to load profile for ${userId}:`, error);
      }
    }
  }

  saveProfile(userId, profile) {
    this.ensureStorage();
    const filePath = path.join(PROFILES_DIR, `${userId}.json`);
    const data = {
      profile,
      exported: Date.now(),
      version: '1.0'
    };
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      // Performance: Update cache on save
      this._setCachedProfile(userId, profile);
    }
    catch (error) {
      console.error(`Failed to save profile for ${userId}:`, error);
    }
  }

  saveProfiles() {
    // Profiles are now saved individually by saveProfile
    // This method can be kept for compatibility but doesn't need to do anything
  }

  // Advanced Profile Creation and Management
  getOrCreateProfile(userId, username) {
    // Performance: Check cache first
    let profile = this._getCachedProfile(userId);
    if (profile) {
      return profile;
    }
    
    // Check in-memory profiles
    if (this.profiles[userId]) {
      this._setCachedProfile(userId, this.profiles[userId]);
      return this.profiles[userId];
    }
    
    // Performance: Load single profile instead of all profiles
    profile = this._loadSingleProfile(userId);
    if (profile) {
      this.profiles[userId] = profile;
      this._setCachedProfile(userId, profile);
      return profile;
    }
    
    // Create new profile
    this.profiles[userId] = {
      userId,
      username,
      displayName: username,
      bio: '',
      avatar: null,
      badges: [],
      preferences: {
        theme: 'default',
        privacy: 'public',
        notifications: true,
        language: 'en'
      },
      statistics: {
        // RPG Stats
        rpg: {
          characters_created: 0,
          total_level: 0,
          highest_level: 0,
          bosses_defeated: 0,
          items_collected: 0,
          gold_earned: 0,
          quests_completed: 0,
          locations_unlocked: 0,
          guild_memberships: 0
        },
        // Game Stats
        games: {
          trivia_correct: 0,
          trivia_games_played: 0,
          hangman_wins: 0,
          hangman_games_played: 0,
          memory_games_completed: 0,
          memory_best_score: 0,
          coin_flips: 0,
          coin_heads_streak: 0,
          polls_created: 0,
          polls_votes_received: 0
        },
        // Social Stats
        social: {
          guilds_created: 0,
          guilds_joined: 0,
          parties_created: 0,
          trades_completed: 0,
          achievements_earned: 0,
          friends_added: 0,
          reputation: 0
        },
        // Activity Stats
        activity: {
          commands_used: 0,
          messages_sent: 0,
          buttons_clicked: 0,
          first_seen: Date.now(),
          last_seen: Date.now(),
          total_session_time: 0,
          favorite_command: null,
          streak_days: 0
        }
      },
      customization: {
        title: null,
        border_color: '#0099FF',
        profile_banner: null,
        card_style: 'modern',
        show_statistics: true,
        show_badges: true,
        show_activity: false
      },
      achievements: [],
      milestones: [],
      created: Date.now(),
      updated: Date.now()
    };
    
    // Cache the newly created profile
    this._setCachedProfile(userId, this.profiles[userId]);

    // Update username if changed
    if (this.profiles[userId].username !== username) {
      this.profiles[userId].username = username;
      this.profiles[userId].updated = Date.now();
      this.saveProfile(userId, this.profiles[userId]);
    }

    return this.profiles[userId];
  }

  updateProfile(userId, updates) {
    const profile = this.getOrCreateProfile(userId);

    // Deep merge updates
    if (updates.preferences) {
      profile.preferences = { ...profile.preferences, ...updates.preferences };
    }
    if (updates.customization) {
      profile.customization = { ...profile.customization, ...updates.customization };
    }
    if (updates.displayName !== undefined) {
      profile.displayName = updates.displayName;
    }
    if (updates.bio !== undefined) {
      profile.bio = updates.bio;
    }

    profile.updated = Date.now();
    this.saveProfile(userId, profile);
    return profile;
  }

  // Statistics Tracking
  updateStatistics(userId, category, statUpdates) {
    const profile = this.getOrCreateProfile(userId);

    for (const [stat, value] of Object.entries(statUpdates)) {
      if (profile.statistics[category] && typeof profile.statistics[category][stat] === 'number') {
        profile.statistics[category][stat] += value;

        // Update derived statistics
        this.updateDerivedStats(profile, category, stat, value);
      }
    }

    profile.updated = Date.now();
    this.saveProfile(userId, profile);
    return profile;
  }

  updateDerivedStats(profile, category, stat, value) {
    switch (category) {
      case 'rpg': {
        if (stat === 'characters_created') {
          // Update total characters across all classes
        }
        if (stat === 'bosses_defeated') {
          profile.statistics.social.reputation += value * 2;
        }
        break;
      }

      case 'games': {
        if (stat === 'trivia_correct') {
          const totalGames = profile.statistics.games.trivia_games_played;
          if (totalGames > 0) {
            profile.statistics.games.trivia_accuracy = (profile.statistics.games.trivia_correct / totalGames) * 100;
          }
        }
        break;
      }

      case 'social': {
        if (stat === 'trades_completed') {
          profile.statistics.social.reputation += value;
        }
        break;
      }
    }
  }

  // Badge System
  awardBadge(userId, badgeId, badgeData) {
    const profile = this.getOrCreateProfile(userId);

    if (!profile.badges.find(b => b.id === badgeId)) {
      profile.badges.push({
        id: badgeId,
        ...badgeData,
        awarded: Date.now()
      });

      this.saveProfile(userId, profile);
      return true;
    }

    return false;
  }

  removeBadge(userId, badgeId) {
    const profile = this.getOrCreateProfile(userId);
    const badgeIndex = profile.badges.findIndex(b => b.id === badgeId);

    if (badgeIndex !== -1) {
      profile.badges.splice(badgeIndex, 1);
      this.saveProfile(userId, profile);
      return true;
    }

    return false;
  }

  // Profile Analytics
  getProfileAnalytics(userId) {
    const profile = this.getOrCreateProfile(userId);
    const stats = profile.statistics;

    // Calculate activity score
    const activityScore = Math.min(100,
      (stats.activity.commands_used * 2) +
      (stats.activity.messages_sent * 1) +
      (stats.activity.buttons_clicked * 0.5) +
      (stats.social.reputation * 0.1)
    );

    // Calculate engagement level
    const engagementLevel = this.calculateEngagementLevel(stats);

    // Find most active category
    const categoryActivity = {
      rpg: stats.rpg.total_level + (stats.rpg.bosses_defeated * 10) + (stats.rpg.items_collected * 2),
      games: (stats.games.trivia_correct * 3) + (stats.games.hangman_wins * 5) + (stats.games.memory_games_completed * 4),
      social: (stats.social.guilds_created * 20) + (stats.social.trades_completed * 8) + stats.social.reputation
    };

    const mostActiveCategory = Object.entries(categoryActivity)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    return {
      activityScore,
      engagementLevel,
      mostActiveCategory,
      totalPlayTime: Math.round(stats.activity.total_session_time / 3_600_000), // Convert to hours
      accountAge: Math.round((Date.now() - stats.activity.first_seen) / (24 * 60 * 60 * 1000)), // Days
      favoriteCommand: stats.activity.favorite_command,
      streakDays: stats.activity.streak_days
    };
  }

  calculateEngagementLevel(stats) {
    const totalActions = stats.activity.commands_used + stats.activity.messages_sent + stats.activity.buttons_clicked;

    if (totalActions > 1000) return 'Legendary';
    if (totalActions > 500) return 'Expert';
    if (totalActions > 200) return 'Advanced';
    if (totalActions > 100) return 'Intermediate';
    if (totalActions > 50) return 'Active';
    if (totalActions > 10) return 'Casual';
    return 'Newcomer';
  }

  // Profile Comparison System
  compareProfiles(userId1, userId2) {
    const profile1 = this.getOrCreateProfile(userId1);
    const profile2 = this.getOrCreateProfile(userId2);

    const stats1 = profile1.statistics;
    const stats2 = profile2.statistics;

    const comparison = {
      rpg: this.compareCategory(stats1.rpg, stats2.rpg),
      games: this.compareCategory(stats1.games, stats2.games),
      social: this.compareCategory(stats1.social, stats2.social),
      activity: this.compareCategory(stats1.activity, stats2.activity)
    };

    return {
      profiles: [profile1, profile2],
      comparison,
      winner: this.determineWinner(comparison)
    };
  }

  compareCategory(stats1, stats2) {
    const comparison = {};

    for (const stat of Object.keys(stats1)) {
      if (typeof stats1[stat] === 'number' && typeof stats2[stat] === 'number') {
        comparison[stat] = {
          user1: stats1[stat],
          user2: stats2[stat],
          difference: stats1[stat] - stats2[stat]
        };
      }
    }

    return comparison;
  }

  determineWinner(comparison) {
    let score1 = 0;
    let score2 = 0;

    for (const category of Object.values(comparison)) {
      for (const stat of Object.values(category)) {
        if (stat.difference > 0) score1++;
        else if (stat.difference < 0) score2++;
      }
    }

    if (score1 > score2) return 'user1';
    if (score2 > score1) return 'user2';
    return 'tie';
  }

  // Profile Search and Discovery
  searchProfiles(searchTerm, limit = 10) {
    const matchingProfiles = [];
    // Performance: Cache lowercased search term
    const lowerSearchTerm = searchTerm.toLowerCase();

    for (const profile of Object.values(this.profiles)) {
      if (profile.preferences.privacy === 'private') continue;

      // Performance: Only lowercase once per profile, avoid repeated toLowerCase()
      const searchFields = `${profile.username} ${profile.displayName} ${profile.bio}`.toLowerCase();

      if (searchFields.includes(lowerSearchTerm)) {
        matchingProfiles.push(profile);
        // Performance: Early exit when we have enough matches
        if (matchingProfiles.length >= limit) break;
      }
    }

    return matchingProfiles;
  }

  // Profile Leaderboards
  getLeaderboard(category, stat, limit = 10) {
    const leaderboard = [];

    for (const profile of Object.values(this.profiles)) {
      if (profile.preferences.privacy === 'private') continue;

      const value = profile.statistics[category]?.[stat];
      if (typeof value === 'number' && value > 0) {
        leaderboard.push({
          userId: profile.userId,
          username: profile.username,
          displayName: profile.displayName,
          value,
          level: this.getUserLevel(profile)
        });
      }
    }

    // Full sort and slice - partial sort would be more efficient for small limits
    // but adds complexity. Current approach is clear and fast enough for typical use.
    return leaderboard
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  getUserLevel(profile) {
    const totalPoints = profile.achievements.length * 10 +
                       profile.statistics.rpg.total_level +
                       profile.statistics.games.trivia_correct +
                       profile.statistics.social.reputation;

    return Math.floor(totalPoints / 100) + 1;
  }

  // Profile Export and Backup
  exportProfile(userId) {
    const profile = this.getOrCreateProfile(userId);

    return {
      profile: profile,
      exported: Date.now(),
      version: '1.0'
    };
  }

  importProfile(userId, profileData) {
    if (profileData.version !== '1.0') {
      return { success: false, reason: 'incompatible_version' };
    }

    this.profiles[userId] = profileData.profile;
    this.saveProfile(userId, profileData.profile);

    return { success: true };
  }

  // Profile Privacy and Security
  setPrivacySettings(userId, privacySettings) {
    const profile = this.getOrCreateProfile(userId);

    if (privacySettings.privacy) {
      profile.preferences.privacy = privacySettings.privacy;
    }

    if (privacySettings.show_statistics !== undefined) {
      profile.customization.show_statistics = privacySettings.show_statistics;
    }

    if (privacySettings.show_badges !== undefined) {
      profile.customization.show_badges = privacySettings.show_badges;
    }

    profile.updated = Date.now();
    this.saveProfile(userId, profile);
    return profile;
  }

  // Advanced Profile Features
  generateProfileInsights(userId) {
    const profile = this.getOrCreateProfile(userId);
    const analytics = this.getProfileAnalytics(userId);

    const insights = [];

    // Activity insights
    if (analytics.activityScore > 80) {
      insights.push("🌟 You're incredibly active in the community!");
    }
    else if (analytics.activityScore > 50) {
      insights.push("🎯 You're a dedicated bot user!");
    }

    // Category insights
    switch (analytics.mostActiveCategory) {
      case 'rpg': {
        insights.push('⚔️ You love RPG adventures!');

        break;
      }
      case 'games': {
        insights.push('🎮 Games are your passion!');

        break;
      }
      case 'social': {
        insights.push('🤝 You thrive on social interactions!');

        break;
      }
    // No default
    }

    // Achievement insights
    const achievementCount = profile.achievements.length;
    if (achievementCount >= 10) {
      insights.push(`🏆 Achievement Hunter! You've earned ${achievementCount} achievements!`);
    }

    // Streak insights
    if (analytics.streakDays > 7) {
      insights.push(`🔥 ${analytics.streakDays} day streak! You're on fire!`);
    }

    return insights;
  }

  // Profile Milestones
  checkMilestones(userId) {
    const profile = this.getOrCreateProfile(userId);
    const newMilestones = [];

    const milestones = [
      { id: 'first_command', name: '🚀 First Steps', description: 'Used your first command', requirement: 'activity.commands_used >= 1' },
      { id: 'social_butterfly', name: '🦋 Social Butterfly', description: 'Joined 5 guilds', requirement: 'social.guilds_joined >= 5' },
      { id: 'rpg_master', name: '🏅 RPG Master', description: 'Reached level 50 in RPG', requirement: 'rpg.highest_level >= 50' },
      { id: 'trivia_expert', name: '🧠 Trivia Expert', description: 'Answered 1000 questions correctly', requirement: 'games.trivia_correct >= 1000' },
      { id: 'trading_mogul', name: '💎 Trading Mogul', description: 'Completed 100 trades', requirement: 'social.trades_completed >= 100' }
    ];

    for (const milestone of milestones) {
      if (!profile.milestones.find(m => m.id === milestone.id) && // Simple requirement check (in real implementation, use more sophisticated evaluation)
        this.evaluateRequirement(profile, milestone.requirement)) {
        profile.milestones.push({
          id: milestone.id,
          name: milestone.name,
          description: milestone.description,
          achieved: Date.now()
        });
        newMilestones.push(milestone);
      }
    }

    if (newMilestones.length > 0) {
      profile.updated = Date.now();
      this.saveProfile(userId, profile);
    }

    return newMilestones;
  }

  evaluateRequirement(profile, requirement) {
    try {
      // Improved requirement evaluator with basic expression parsing
      const stats = profile.statistics;

      // Replace stat paths with actual values, e.g., 'rpg.highest_level' -> stats.rpg.highest_level
      const expression = requirement.replaceAll(/(\w+(?:\.\w+)*)/g, (match) => {
        const keys = match.split('.');
        let value = stats;
        for (const key of keys) {
          value = value?.[key];
        }
        return typeof value === 'number' ? value : `'${value}'`;
      });

      // Use a safe evaluator for basic comparisons
      return this.safeEval(expression);
    }
    catch {
      return false;
    }
  }

  safeEval(expr) {
    // Basic safe evaluator for simple expressions like '>= 5', '== 100', etc.
    // This is still limited but safer than full eval
    const match = expr.match(/^(\d+)(==|!=|>=|<=|>|<)(\d+)$/);
    if (match) {
      const [, left, op, right] = match;
      const l = Number.parseInt(left);
      const r = Number.parseInt(right);
      switch (op) {
        case '==': { return l == r;
        }
        case '!=': { return l != r;
        }
        case '>=': { return l >= r;
        }
        case '<=': { return l <= r;
        }
        case '>': { return l > r;
        }
        case '<': { return l < r;
        }
      }
    }
    return false;
  }

  // Profile Customization
  setProfileTheme(userId, theme) {
    const validThemes = ['default', 'dark', 'light', 'colorful', 'minimal'];
    if (!validThemes.includes(theme)) {
      return { success: false, reason: 'invalid_theme' };
    }

    return this.updateProfile(userId, {
      customization: { theme }
    });
  }

  setProfileTitle(userId, title) {
    if (title.length > 50) {
      return { success: false, reason: 'title_too_long' };
    }

    return this.updateProfile(userId, { title });
  }
}

// Export singleton instance
export const profileManager = new ProfileManager();

// Convenience functions
export function getOrCreateProfile(userId, username) {
  return profileManager.getOrCreateProfile(userId, username);
}

export function updateProfile(userId, updates) {
  return profileManager.updateProfile(userId, updates);
}

export function updateStatistics(userId, category, statUpdates) {
  return profileManager.updateStatistics(userId, category, statUpdates);
}

export function awardBadge(userId, badgeId, badgeData) {
  return profileManager.awardBadge(userId, badgeId, badgeData);
}

export function getProfileAnalytics(userId) {
  return profileManager.getProfileAnalytics(userId);
}

export function compareProfiles(userId1, userId2) {
  return profileManager.compareProfiles(userId1, userId2);
}

export function searchProfiles(searchTerm, limit = 10) {
  return profileManager.searchProfiles(searchTerm, limit);
}

export function getLeaderboard(category, stat, limit = 10) {
  return profileManager.getLeaderboard(category, stat, limit);
}

export function exportProfile(userId) {
  return profileManager.exportProfile(userId);
}

export function importProfile(userId, profileData) {
  return profileManager.importProfile(userId, profileData);
}

export function generateProfileInsights(userId) {
  return profileManager.generateProfileInsights(userId);
}

export function checkMilestones(userId) {
  return profileManager.checkMilestones(userId);
}
