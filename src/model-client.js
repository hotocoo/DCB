import 'dotenv/config';
import { getGuild } from './storage.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_LOCAL_URL = process.env.LOCAL_MODEL_URL;
const DEFAULT_LOCAL_API = process.env.LOCAL_MODEL_API || 'openai-compatible';
const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE;
const OPENWEBUI_PATH = process.env.OPENWEBUI_PATH || '/api/chat';

async function callLocalModel(prompt, url = DEFAULT_LOCAL_URL, api = DEFAULT_LOCAL_API) {
  if (!url) throw new Error('No local model URL');
  try {
    if (api === 'openai-compatible') {
      const res = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-oss-20b', messages: [{ role: 'user', content: prompt }], max_tokens: 512 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? data.result ?? null;
    }

    if (api === 'openwebui') {
      const base = OPENWEBUI_BASE || url;
      const fulld = `${base.replace(/\/$/, '')}${OPENWEBUI_PATH}`;
      const res = await fetch(fulld, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.response ?? data.output ?? data.result ?? null;
    }

    // generic endpoint
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.result ?? data.output ?? null;
  } catch (err) {
    console.error('Model client local error', err);
    throw err;
  }
}

async function callOpenAI(prompt) {
  if (!OPENAI_KEY) throw new Error('No OpenAI key');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export async function generate(guildId, prompt) {
  const guildCfg = guildId ? getGuild(guildId) : null;
  const url = guildCfg?.modelUrl || DEFAULT_LOCAL_URL;
  const api = guildCfg?.modelApi || DEFAULT_LOCAL_API;

  if (url) {
    try {
      const out = await callLocalModel(prompt, url, api);
      if (out) return out;
    } catch (err) {
      console.error('Local model failed for RPG generation, falling back', err.message);
    }
  }

  if (OPENAI_KEY) {
    try {
      const out = await callOpenAI(prompt);
      if (out) return out;
    } catch (err) {
      console.error('OpenAI fallback failed', err.message);
    }
  }

  // final fallback
  return null;
}
