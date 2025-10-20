import 'dotenv/config';
import { getGuild } from './storage.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL; // e.g. http://host.docker.internal:8000
const LOCAL_MODEL_API = process.env.LOCAL_MODEL_API || 'openai-compatible';
const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE; // optional base URL override
const OPENWEBUI_PATH = process.env.OPENWEBUI_PATH || '/api/chat';

async function callLocalModel(prompt, url = LOCAL_MODEL_URL, api = LOCAL_MODEL_API) {
  // Try to be compatible with OpenAI-like local endpoints
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
      // OpenWebUI expects {prompt: '...'} at /api/chat or similar, adjust via OPENWEBUI_BASE/OPENWEBUI_PATH
      const base = OPENWEBUI_BASE || url;
      const fulld = `${base.replace(/\/$/, '')}${OPENWEBUI_PATH}`;
      const res = await fetch(fulld, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Try common response shapes
      return data.response ?? data.output ?? data.result ?? null;
    }

    // simple generic endpoint that returns {result: 'text'}
    const res = await fetch(LOCAL_MODEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.result ?? data.output ?? null;
  } catch (err) {
    console.error('Local model error', err);
    throw err;
  }
}

// Simple in-memory storage for conversation history and cooldowns
const conversationMap = new Map();
const cooldownMap = new Map();

export async function respondWithOpenAI(prompt) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export async function handleMessage(message) {
  // Ignore bots
  if (message.author.bot) return null;

  const isDM = message.channel.type === 1 || message.channel?.type === 'DM';

  // Only respond to DMs or mentions
  const isMention = message.mentions && message.mentions.has && message.mentions.has(message.client.user.id);
  if (!isDM && !isMention) return null;

  const raw = message.content.replace(/<@!?.+?>/g, '').trim() || '';

  // support a user command to clear conversation context
  if (raw.toLowerCase() === '!clear') {
    conversationMap.delete(message.author.id);
    return 'Conversation cleared.';
  }

  const prompt = raw;

  // per-user cooldown (ms)
  const COOLDOWN_MS = Number(process.env.CHAT_COOLDOWN_MS || 1500);
  const last = cooldownMap.get(message.author.id) || 0;
  const now = Date.now();
  if (now - last < COOLDOWN_MS) return null;
  cooldownMap.set(message.author.id, now);

  // Determine per-guild overrides
  const guildCfg = message.guildId ? getGuild(message.guildId) : null;
  const useLocalUrl = guildCfg?.modelUrl || LOCAL_MODEL_URL;
  const useLocalApi = guildCfg?.modelApi || LOCAL_MODEL_API;
  const chatEnabled = guildCfg?.chatEnabled ?? true;
  const playEnabled = guildCfg?.playEnabled ?? true;

  if (message.guildId && !chatEnabled) return null;

  // Build conversation history if available
  const history = conversationMap.get(message.author.id) || [];
  history.push({ role: 'user', content: prompt });
  // Trim history to last N messages
  const MAX_HISTORY = Number(process.env.CHAT_MAX_HISTORY || 6);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  // Prefer local model if provided
  // Playful triggers handled before handing off to models (if enabled)
  if (playEnabled) {
    const playReply = handlePlayfulPrompt(prompt, message);
    if (playReply) return playReply;
  }

  if (useLocalUrl) {
    try {
      const inPrompt = history.map(h => `${h.role}: ${h.content}`).join('\n');
      const out = await callLocalModel(inPrompt || 'Hello', useLocalUrl, useLocalApi);
      // store assistant response in history
      if (out) history.push({ role: 'assistant', content: out });
      conversationMap.set(message.author.id, history);
      return out ?? "I couldn't generate a response from the local model.";
    } catch (err) {
      console.error('Local model failed, falling back', err);
    }
  }

  if (OPENAI_KEY) {
    try {
    const messages = history.map(h => ({ role: h.role, content: h.content }));
    messages.push({ role: 'user', content: prompt || 'Hello' });
    const reply = await respondWithOpenAI(messages.map(m => m.content).join('\n') || 'Hello');
      if (reply) history.push({ role: 'assistant', content: reply });
      conversationMap.set(message.author.id, history);
      return reply ?? "I couldn't generate a response.";
    } catch (err) {
      console.error('OpenAI API error', err);
      return "Sorry, I couldn't reach the AI service.";
    }
  }

  // Fallback: simple echo + hint
  return `You said: ${prompt || message.content}`;
}

// Playful helpers: parse commands in free text and respond directly
function handlePlayfulPrompt(text, message) {
  const lower = text.toLowerCase();

  // 8ball: starts with 8ball or 'magic 8' or contains '?'
  if (lower.startsWith('8ball') || lower.startsWith('8-ball') || /\b8 ball\b/.test(lower)) {
    return eightBallReply();
  }

  // rps: 'rps <choice>' or 'rock/paper/scissors' direct
  const rpsMatch = lower.match(/\brps\s+(rock|paper|scissors)\b/) || lower.match(/\b(rock|paper|scissors)\b/);
  if (rpsMatch) {
    const userChoice = rpsMatch[1];
    return playRPS(userChoice);
  }

  // roll: 'roll 2d6' or '2d6' or 'roll d20'
  const rollMatch = lower.match(/(\d+)?d(\d+)/);
  if (rollMatch) {
    const n = Number(rollMatch[1] || 1);
    const sides = Number(rollMatch[2]);
    return rollDice(n, sides, message.user?.username || message.author.username);
  }

  // joke request
  if (/(tell me a joke|joke|make me laugh)/.test(lower)) {
    return randomJoke();
  }

  // prompt to play
  if (/\b(play|game|let's play|wanna play)\b/.test(lower)) {
    return `Wanna play? Try /rps <rock|paper|scissors>, /roll 2d6, or /8ball <question> — or DM me directly and say "roll 1d20" or "rps rock".`;
  }

  return null;
}

function eightBallReply() {
  const answers = [
    'It is certain.', 'Without a doubt.', 'You may rely on it.', 'Ask again later.',
    'Better not tell you now.', 'My reply is no.', 'Very doubtful.'
  ];
  return answers[Math.floor(Math.random() * answers.length)];
}

function playRPS(userChoice) {
  const choices = ['rock', 'paper', 'scissors'];
  const bot = choices[Math.floor(Math.random() * 3)];
  let result = 'tie';
  if ((userChoice === 'rock' && bot === 'scissors') || (userChoice === 'paper' && bot === 'rock') || (userChoice === 'scissors' && bot === 'paper')) result = 'you win';
  else if (userChoice !== bot) result = 'you lose';
  return `You chose ${userChoice}, I chose ${bot} — ${result}`;
}

function rollDice(n, sides, username) {
  const rolls = Array.from({ length: Math.min(100, n) }, () => 1 + Math.floor(Math.random() * sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  return `${username} rolled ${n}d${sides}: [${rolls.join(', ')}] = ${sum}`;
}

function randomJoke() {
  const jokes = [
    "I told my computer I needed a break, and it said: 'No problem — I'll go to sleep.'",
    'Why do programmers prefer dark mode? Because light attracts bugs!',
    "Why did the developer go broke? Because he used up all his cache."
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}
