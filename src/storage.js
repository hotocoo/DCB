import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'guilds.json');

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readAll() {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch (err) {
    console.error('Failed to read storage', err);
    return {};
  }
}

export function writeAll(obj) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export function getGuild(id) {
  const all = readAll();
  return all[id] || null;
}

export function setGuild(id, data) {
  const all = readAll();
  all[id] = { ...(all[id] || {}), ...data };
  writeAll(all);
}
