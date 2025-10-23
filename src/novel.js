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
  if (!text) {
    // Fallback to a template-based chapter
    const templates = [
      `Chapter ${chapIndex}: The Journey Begins\n\nIn the world of ${novel.title}, our hero embarks on an epic adventure. Guided by the context of ${novel.prompt}, they face challenges and discover new horizons.`,
      `Chapter ${chapIndex}: Unexpected Twists\n\nAs the story unfolds in ${novel.title}, surprises await. Building on ${novel.prompt}, the narrative takes a thrilling turn.`,
      `Chapter ${chapIndex}: Deep Reflections\n\nOur characters in ${novel.title} pause to reflect. Drawing from ${novel.prompt}, they grow and evolve.`
    ];
    const fallbackText = templates[chapIndex % templates.length];
    const chapter = { index: chapIndex, text: fallbackText };
    novel.chapters.push(chapter);
    const all = readAll(); all[novelId] = novel; writeAll(all);
    return chapter;
  }
  const chapter = { index: chapIndex, text };
  novel.chapters.push(chapter);
  const all = readAll(); all[novelId] = novel; writeAll(all);
  return chapter;
}
