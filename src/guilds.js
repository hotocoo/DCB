import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { logger } from './logger.js';
import { sanitizeInput } from './validation.js';

const OLD_GUILDS_FILE = path.join(process.cwd(), 'data', 'guilds.json');

// Parties are ephemeral in-memory (don't need crash persistence)
const parties = new Map();

function migrateFromJson() {
  const db = getDb();
  if (!db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="guilds"').get()) {
    try {
      if (fs.existsSync(OLD_GUILDS_FILE)) {
        const data = JSON.parse(fs.readFileSync(OLD_GUILDS_FILE, 'utf8')) || {};
        for (const [name, guild] of Object.entries(data)) {
          db.prepare('INSERT INTO guilds (name, guild_data) VALUES (?, ?)').run(name, JSON.stringify(guild));
        }
        logger.info(`Migrated ${Object.keys(data).length} guilds to SQLite`);
      }
    } catch (err) { logger.error('Guild migration failed', err instanceof Error ? err : new Error(String(err))); }
  }
}

export function createGuild(guildName, leaderId, leaderName) {
  migrateFromJson();
  const name = sanitizeInput(guildName).slice(0, 64);
  if (!name || name.length < 2) return { success: false, reason: 'invalid_name' };

  const db = getDb();
  if (db.prepare('SELECT name FROM guilds WHERE name = ?').get(name)) {
    return { success: false, reason: 'guild_name_taken' };
  }

  const guild = {
    name, leader: leaderId, members: { [leaderId]: { name: leaderName || 'Player', role: 'leader', joined: Date.now(), level: 1, contribution: 0 } },
    level: 1, experience: 0, gold: 0, created: Date.now(), description: '', maxMembers: 10, isPublic: true,
  };

  db.prepare('INSERT INTO guilds (name, guild_data) VALUES (?, ?)').run(name, JSON.stringify(guild));
  return { success: true, guild };
}

export function joinGuild(guildName, userId, userName) {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare('SELECT guild_data FROM guilds WHERE name = ?').get(guildName);
  if (!row) return { success: false, reason: 'guild_not_found' };

  let guild;
  try { guild = JSON.parse(row.guild_data); } catch { return { success: false, reason: 'corrupted_data' }; }

  if (!guild.isPublic) return { success: false, reason: 'guild_private' };
  if (guild.members[userId]) return { success: false, reason: 'already_member' };
  if (Object.keys(guild.members).length >= guild.maxMembers) return { success: false, reason: 'guild_full' };

  guild.members[userId] = { name: userName || 'Player', role: 'member', joined: Date.now(), level: 1, contribution: 0 };
  db.prepare('UPDATE guilds SET guild_data = ? WHERE name = ?').run(JSON.stringify(guild), guildName);
  return { success: true, guild };
}

export function leaveGuild(guildName, userId) {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare('SELECT guild_data FROM guilds WHERE name = ?').get(guildName);
  if (!row) return { success: false, reason: 'guild_not_found' };

  let guild;
  try { guild = JSON.parse(row.guild_data); } catch { return { success: false, reason: 'corrupted_data' }; }

  if (!guild.members[userId]) return { success: false, reason: 'not_member' };
  if (guild.leader === userId) return { success: false, reason: 'leader_cannot_leave' };

  delete guild.members[userId];
  db.prepare('UPDATE guilds SET guild_data = ? WHERE name = ?').run(JSON.stringify(guild), guildName);
  return { success: true };
}

export function createParty(leaderId, leaderName) {
  const partyId = `party_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const party = {
    id: partyId, leader: leaderId, members: { [leaderId]: { name: leaderName || 'Player', role: 'leader', joined: Date.now() } },
    maxMembers: 4, quest: undefined, created: Date.now(), isActive: true,
  };
  parties.set(partyId, party);
  return { success: true, party };
}

export function joinParty(partyId, userId, userName) {
  const party = parties.get(partyId);
  if (!party) return { success: false, reason: 'party_not_found' };
  if (!party.isActive) return { success: false, reason: 'party_disbanded' };
  if (party.members[userId]) return { success: false, reason: 'already_in_party' };
  if (Object.keys(party.members).length >= party.maxMembers) return { success: false, reason: 'party_full' };

  party.members[userId] = { name: userName || 'Player', role: 'member', joined: Date.now() };
  return { success: true, party };
}

export function leaveParty(partyId, userId) {
  const party = parties.get(partyId);
  if (!party) return { success: false, reason: 'party_not_found' };
  if (!party.members[userId]) return { success: false, reason: 'not_in_party' };

  delete party.members[userId];

  if (Object.keys(party.members).length === 0) {
    parties.delete(partyId);
  } else if (party.leader === userId) {
    const newLeader = Object.keys(party.members)[0];
    party.leader = newLeader;
    party.members[newLeader].role = 'leader';
  }

  return { success: true };
}

export function getGuildLeaderboard(limit = 10) {
  migrateFromJson();
  const db = getDb();
  const results = [];
  for (const row of db.prepare('SELECT * FROM guilds').all()) {
    try {
      const g = JSON.parse(row.guild_data);
      results.push({ name: g.name, level: g.level || 1, memberCount: Object.keys(g.members).length, gold: g.gold || 0, experience: g.experience || 0 });
    } catch {}
  }
  return results.sort((a, b) => b.level - a.level || b.memberCount - a.memberCount || b.gold - a.gold).slice(0, limit);
}

export function getUserGuild(userId) {
  migrateFromJson();
  const db = getDb();
  for (const row of db.prepare('SELECT * FROM guilds').all()) {
    try {
      const g = JSON.parse(row.guild_data);
      if (g.members[userId]) return { guildName: g.name, ...g };
    } catch {}
  }
  return; // no guild
}

export function getUserParty(userId) {
  for (const party of parties.values()) {
    if (party.members[userId]) return { partyId: party.id, ...party };
  }
  return;
}

export function contributeToGuild(guildName, userId, amount) {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare('SELECT guild_data FROM guilds WHERE name = ?').get(guildName);
  if (!row) return { success: false, reason: 'guild_not_found' };

  let guild;
  try { guild = JSON.parse(row.guild_data); } catch { return { success: false, reason: 'corrupted_data' }; }

  if (!guild.members[userId]) return { success: false, reason: 'not_member' };

  const member = guild.members[userId];
  member.contribution += amount;
  guild.gold += amount;
  const expGain = Math.floor(amount / 10);
  guild.experience += expGain;

  const newLevel = Math.floor(guild.experience / 100) + 1;
  if (newLevel > guild.level) {
    guild.level = newLevel;
    guild.maxMembers += 2;
  }

  db.prepare('UPDATE guilds SET guild_data = ? WHERE name = ?').run(JSON.stringify(guild), guildName);
  return { success: true, guild, expGain };
}

export function declareGuildWar(challengerGuild, targetGuild, challengerLeader) {
  if (challengerGuild === targetGuild) return { success: false, reason: 'cannot_war_self' };
  migrateFromJson();
  const db = getDb();

  const chRow = db.prepare('SELECT guild_data FROM guilds WHERE name = ?').get(challengerGuild);
  const tgRow = db.prepare('SELECT guild_data FROM guilds WHERE name = ?').get(targetGuild);
  if (!chRow || !tgRow) return { success: false, reason: 'guild_not_found' };

  let challenger, target;
  try { challenger = JSON.parse(chRow.guild_data); } catch { return { success: false, reason: 'corrupted_data' }; }
  try { target = JSON.parse(tgRow.guild_data); } catch { return { success: false, reason: 'corrupted_data' }; }

  if (challenger.leader !== challengerLeader) return { success: false, reason: 'not_guild_leader' };

  const warId = `war_${Date.now()}`;
  const war = { id: warId, challenger: challengerGuild, target: targetGuild, declared: Date.now(), status: 'active', winner: undefined };

  // Store wars in memory — future expansion point for persistence
  if (!globalThis.guildWars) globalThis.guildWars = new Map();
  globalThis.guildWars.set(warId, war);

  return { success: true, war };
}

// For backward compatibility with existing imports
export const guildManager = {
  createGuild, joinGuild, leaveGuild, createParty, joinParty, leaveParty, getGuildLeaderboard,
  getUserGuild, getUserParty, contributeToGuild, declareGuildWar,
};
