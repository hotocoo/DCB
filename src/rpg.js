import fs from 'fs';
import path from 'path';
import { generate } from './model-client.js';

const FILE = path.join(process.cwd(), 'data', 'rpg.json');

// in-memory cache to reduce fs reads/writes
let cache = null;
// simple per-user locks to avoid concurrent writes
const locks = new Set();

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

export function createCharacter(userId, name) {
  const all = cache || readAll();
  if (all[userId]) return null;
  const char = { name: name || `Player${userId.slice(0,4)}`, hp: 20, maxHp: 20, atk: 5, lvl: 1, xp: 0, skillPoints: 0 };
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

export function resetCharacter(userId) {
  const all = cache || readAll();
  const def = { name: `Player${userId.slice(0,4)}`, hp: 20, maxHp: 20, atk: 5, lvl: 1, xp: 0, skillPoints: 0 };
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
  const damage = Math.max(1, attacker.atk + Math.floor(Math.random() * 6) - 2);
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

