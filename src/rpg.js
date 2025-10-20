import fs from 'fs';
import path from 'path';
import { generate } from './model-client.js';

const FILE = path.join(process.cwd(), 'data', 'rpg.json');

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
    return raw;
  } catch (err) {
    console.error('Failed to read rpg storage', err);
    return {};
  }
}

function writeAll(obj) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export function createCharacter(userId, name) {
  const all = readAll();
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
  const all = readAll();
  return all[userId] || null;
}

export function saveCharacter(userId, char) {
  const all = readAll();
  all[userId] = char;
  writeAll(all);
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

