import fs from 'node:fs';
import path from 'node:path';

const GUILDS_FILE = path.join(process.cwd(), 'data', 'guilds.json');

// Guild and Party System for Multiplayer RPG
class GuildManager {
  constructor() {
    this.ensureStorage();
    this.loadGuilds();
  }

  ensureStorage() {
    const dir = path.dirname(GUILDS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(GUILDS_FILE)) {
      fs.writeFileSync(GUILDS_FILE, JSON.stringify({}));
    }
  }

  loadGuilds() {
    try {
      const data = JSON.parse(fs.readFileSync(GUILDS_FILE));
      this.guilds = data;
    }
    catch (error) {
      console.error('Failed to load guilds:', error);
      this.guilds = {};
    }
  }

  saveGuilds() {
    try {
      fs.writeFileSync(GUILDS_FILE, JSON.stringify(this.guilds, null, 2));
    }
    catch (error) {
      console.error('Failed to save guilds:', error);
    }
  }

  // Guild Management Functions
  createGuild(guildName, leaderId, leaderName) {
    if (this.guilds[guildName]) {
      return { success: false, reason: 'guild_name_taken' };
    }

    const guild = {
      name: guildName,
      leader: leaderId,
      members: {
        [leaderId]: {
          name: leaderName,
          role: 'leader',
          joined: Date.now(),
          level: 1,
          contribution: 0
        }
      },
      level: 1,
      experience: 0,
      gold: 0,
      created: Date.now(),
      description: '',
      maxMembers: 10,
      isPublic: true
    };

    this.guilds[guildName] = guild;
    this.saveGuilds();
    return { success: true, guild };
  }

  joinGuild(guildName, userId, userName) {
    const guild = this.guilds[guildName];
    if (!guild) return { success: false, reason: 'guild_not_found' };
    if (!guild.isPublic) return { success: false, reason: 'guild_private' };
    if (guild.members[userId]) return { success: false, reason: 'already_member' };
    if (Object.keys(guild.members).length >= guild.maxMembers) {
      return { success: false, reason: 'guild_full' };
    }

    guild.members[userId] = {
      name: userName,
      role: 'member',
      joined: Date.now(),
      level: 1,
      contribution: 0
    };

    this.saveGuilds();
    return { success: true, guild };
  }

  leaveGuild(guildName, userId) {
    const guild = this.guilds[guildName];
    if (!guild) return { success: false, reason: 'guild_not_found' };
    if (!guild.members[userId]) return { success: false, reason: 'not_member' };
    if (guild.leader === userId) return { success: false, reason: 'leader_cannot_leave' };

    delete guild.members[userId];
    this.saveGuilds();
    return { success: true };
  }

  // Party Management Functions
  createParty(leaderId, leaderName) {
    const partyId = `party_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const party = {
      id: partyId,
      leader: leaderId,
      members: {
        [leaderId]: {
          name: leaderName,
          role: 'leader',
          joined: Date.now()
        }
      },
      maxMembers: 4,
      quest: null,
      created: Date.now(),
      isActive: true
    };

    // Store party in memory (could be persisted to file)
    this.parties = this.parties || {};
    this.parties[partyId] = party;

    return { success: true, party };
  }

  joinParty(partyId, userId, userName) {
    const party = this.parties?.[partyId];
    if (!party) return { success: false, reason: 'party_not_found' };
    if (!party.isActive) return { success: false, reason: 'party_disbanded' };
    if (party.members[userId]) return { success: false, reason: 'already_in_party' };
    if (Object.keys(party.members).length >= party.maxMembers) {
      return { success: false, reason: 'party_full' };
    }

    party.members[userId] = {
      name: userName,
      role: 'member',
      joined: Date.now()
    };

    return { success: true, party };
  }

  leaveParty(partyId, userId) {
    const party = this.parties?.[partyId];
    if (!party) return { success: false, reason: 'party_not_found' };
    if (!party.members[userId]) return { success: false, reason: 'not_in_party' };

    delete party.members[userId];

    // Disband party if no members left
    if (Object.keys(party.members).length === 0) {
      delete this.parties[partyId];
    }
    else if (party.leader === userId) {
      // Transfer leadership to another member
      const newLeader = Object.keys(party.members)[0];
      party.leader = newLeader;
      party.members[newLeader].role = 'leader';
    }

    return { success: true };
  }

  // Guild Statistics and Leaderboards
  getGuildLeaderboard(limit = 10) {
    return Object.entries(this.guilds)
      .map(([name, guild]) => ({
        name,
        level: guild.level,
        memberCount: Object.keys(guild.members).length,
        gold: guild.gold,
        experience: guild.experience
      }))
      .sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
        return b.gold - a.gold;
      })
      .slice(0, limit);
  }

  getUserGuild(userId) {
    for (const [guildName, guild] of Object.entries(this.guilds)) {
      if (guild.members[userId]) {
        return { guildName, ...guild };
      }
    }
    return null;
  }

  getUserParty(userId) {
    if (!this.parties) return null;

    for (const [partyId, party] of Object.entries(this.parties)) {
      if (party.members[userId]) {
        return { partyId, ...party };
      }
    }
    return null;
  }

  // Guild Economy
  contributeToGuild(guildName, userId, amount) {
    const guild = this.guilds[guildName];
    if (!guild) return { success: false, reason: 'guild_not_found' };
    if (!guild.members[userId]) return { success: false, reason: 'not_member' };

    const member = guild.members[userId];
    if (member.gold < amount) return { success: false, reason: 'insufficient_gold' };

    member.gold -= amount;
    guild.gold += amount;
    member.contribution += amount;

    // Check for level up
    const expGain = Math.floor(amount / 10);
    guild.experience += expGain;

    const newLevel = Math.floor(guild.experience / 100) + 1;
    if (newLevel > guild.level) {
      guild.level = newLevel;
      guild.maxMembers += 2; // Increase max members
    }

    this.saveGuilds();
    return { success: true, guild, expGain };
  }

  // Guild vs Guild Features
  declareGuildWar(challengerGuild, targetGuild, challengerLeader) {
    if (challengerGuild === targetGuild) {
      return { success: false, reason: 'cannot_war_self' };
    }

    const challenger = this.guilds[challengerGuild];
    const target = this.guilds[targetGuild];

    if (!challenger || !target) {
      return { success: false, reason: 'guild_not_found' };
    }

    if (challenger.leader !== challengerLeader) {
      return { success: false, reason: 'not_guild_leader' };
    }

    // Simple war system - could be expanded
    const warId = `war_${Date.now()}`;
    const war = {
      id: warId,
      challenger: challengerGuild,
      target: targetGuild,
      declared: Date.now(),
      status: 'active',
      winner: null
    };

    this.guildWars = this.guildWars || {};
    this.guildWars[warId] = war;

    return { success: true, war };
  }
}

// Export singleton instance
export const guildManager = new GuildManager();

// Convenience functions
export function createGuild(guildName, leaderId, leaderName) {
  return guildManager.createGuild(guildName, leaderId, leaderName);
}

export function joinGuild(guildName, userId, userName) {
  return guildManager.joinGuild(guildName, userId, userName);
}

export function leaveGuild(guildName, userId) {
  return guildManager.leaveGuild(guildName, userId);
}

export function createParty(leaderId, leaderName) {
  return guildManager.createParty(leaderId, leaderName);
}

export function joinParty(partyId, userId, userName) {
  return guildManager.joinParty(partyId, userId, userName);
}

export function leaveParty(partyId, userId) {
  return guildManager.leaveParty(partyId, userId);
}

export function getUserGuild(userId) {
  return guildManager.getUserGuild(userId);
}

export function getUserParty(userId) {
  return guildManager.getUserParty(userId);
}

export function getGuildLeaderboard(limit = 10) {
  return guildManager.getGuildLeaderboard(limit);
}

export function contributeToGuild(guildName, userId, amount) {
  return guildManager.contributeToGuild(guildName, userId, amount);
}