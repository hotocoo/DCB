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
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
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
  const char = { name: name || `Player${userId.slice(0,4)}`, hp: 20, maxHp: 20, atk: 5, lvl: 1, xp: 0 };
  all[userId] = char;
  writeAll(all);
  return char;
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

