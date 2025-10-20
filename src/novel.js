import fs from 'fs';
import path from 'path';
import { generate } from './model-client.js';

const FILE = path.join(process.cwd(), 'data', 'novels.json');

function ensureDir() { const dir = path.dirname(FILE); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function readAll() { ensureDir(); if (!fs.existsSync(FILE)) return {}; try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { return {}; } }
function writeAll(obj) { ensureDir(); fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8'); }

export function listNovels() { return Object.keys(readAll()); }

export function createNovel(ownerId, title, prompt) {
  const all = readAll();
  const id = `novel-${Date.now()}`;
  all[id] = { id, title: title || `Untitled ${Date.now()}`, owner: ownerId, prompt: prompt || '', chapters: [] };
  writeAll(all);
  return all[id];
}

export function getNovel(id) { const all = readAll(); return all[id] || null; }

export async function generateChapter(guildId, novelId) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  const chapIndex = novel.chapters.length + 1;
  const prompt = `Write chapter ${chapIndex} of the light novel titled "${novel.title}". Context: ${novel.prompt}. Keep it short (~300 words).`;
  const text = await generate(guildId, prompt);
  const chapter = { index: chapIndex, text: text || `A short chapter placeholder for ${novel.title}.` };
  novel.chapters.push(chapter);
  const all = readAll(); all[novelId] = novel; writeAll(all);
  return chapter;
}
