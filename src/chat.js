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
  try {
    // Ignore bots
    if (message.author.bot) return null;

    const isDM = message.channel.type === 1 || message.channel?.type === 'DM';

    // Only respond to DMs or mentions
    const isMention = message.mentions && message.mentions.has && message.mentions.has(message.client.user.id);
    if (!isDM && !isMention) return null;

    const raw = message.content.replace(/<@!?.+?>/g, '').trim() || '';

    // Support user commands
    if (raw.toLowerCase() === '!clear') {
      conversationMap.delete(message.author.id);
      return '🧹 Conversation cleared! Starting fresh.';
    }

    if (raw.toLowerCase() === '!help') {
      return '🤖 **Available Commands:**\n• `!clear` - Clear conversation history\n• `!status` - Check bot status\n• `!commands` - List all commands\n• Just chat normally for AI responses!';
    }

    if (raw.toLowerCase() === '!status') {
      const guilds = message.client.guilds.cache.size;
      const users = message.client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
      return `🤖 **Bot Status:**\n• Servers: ${guilds}\n• Users: ${users}\n• AI: ${OPENAI_KEY ? 'OpenAI ✓' : LOCAL_MODEL_URL ? 'Local Model ✓' : 'Basic Chat ✓'}\n• Version: ULTRA v3.0`;
    }

    if (raw.toLowerCase() === '!commands') {
      return '📚 **All Commands:**\n• `/help` - Dynamic help system\n• `/rpg` - RPG adventures\n• `/trivia` - Quiz games\n• `/music` - Music system\n• `/guild` - Guild management\n• `/trade` - Trading system\n• `/profile` - User profiles\n• `/achievements` - Achievement system\n• And many more! Use `/help` for details.';
    }

    const prompt = raw;

    // Enhanced cooldown system
    const COOLDOWN_MS = Number(process.env.CHAT_COOLDOWN_MS || 2000);
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

    // Build enhanced conversation history
    const history = conversationMap.get(message.author.id) || [];
    history.push({ role: 'user', content: prompt });

    // Trim history to last N messages
    const MAX_HISTORY = Number(process.env.CHAT_MAX_HISTORY || 8);
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

    // Enhanced personality and context
    const contextPrompt = `You are ULTRA, an advanced AI Discord bot with many features including RPG games, trivia, music, trading, and more. You have a friendly, helpful personality and love to engage users in conversation.

Current context:
- User: ${message.author.username}
- Channel: ${isDM ? 'Direct Message' : message.channel.name}
- Server: ${message.guild?.name || 'Direct Message'}
- Time: ${new Date().toLocaleString()}

Previous conversation:
${history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n')}

User's message: ${prompt}

Respond naturally and helpfully. If they're asking about bot features, mention relevant commands. Keep responses engaging but not too long.`;

    // Try local model first if configured
    if (useLocalUrl) {
      try {
        const response = await callLocalModel(contextPrompt, useLocalUrl, useLocalApi);
        if (response) {
          // Clean and format response
          const cleanResponse = response.trim().substring(0, 2000);
          history.push({ role: 'assistant', content: cleanResponse });
          conversationMap.set(message.author.id, history);

          // Log successful AI response
          logger.info('Local model response generated', {
            user: message.author.username,
            responseLength: cleanResponse.length,
            model: useLocalApi
          });

          return cleanResponse;
        }
      } catch (err) {
        logger.warn('Local model failed, falling back to OpenAI', {
          error: err.message,
          user: message.author.username
        });
      }
    }

    // Try OpenAI if available
    if (OPENAI_KEY) {
      try {
        const messages = [
          {
            role: 'system',
            content: 'You are ULTRA, an advanced AI Discord bot with RPG games, trivia, music, trading, and many other features. Be friendly, helpful, and engaging. Keep responses under 2000 characters.'
          },
          ...history.map(h => ({ role: h.role, content: h.content }))
        ];

        const reply = await respondWithOpenAI(messages);
        if (reply) {
          const cleanReply = reply.trim().substring(0, 2000);
          history.push({ role: 'assistant', content: cleanReply });
          conversationMap.set(message.author.id, history);

          // Log successful OpenAI response
          logger.info('OpenAI response generated', {
            user: message.author.username,
            responseLength: cleanReply.length
          });

          return cleanReply;
        }
      } catch (err) {
        logger.error('OpenAI API failed', err, {
          user: message.author.username,
          promptLength: prompt.length
        });
      }
    }

    // Enhanced fallback with more personality
    const fallbackResponses = [
      `💭 I'm thinking... "${prompt}" is an interesting message! While my AI brain is loading, did you know you can use /rpg to start an adventure?`,
      `🤔 Processing your message: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}". My neural networks are warming up! Try /help to explore all features.`,
      `🧠 Analyzing: "${prompt}". I'm getting smarter every day! Meanwhile, you can play /trivia or start an RPG adventure with /rpg.`,
      `⚡ "${prompt}" - fascinating input! While I'm connecting to my AI core, why not try /music to play some tunes?`
    ];

    const fallbackResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

    // Store basic response in history
    history.push({ role: 'assistant', content: fallbackResponse });
    conversationMap.set(message.author.id, history);

    return fallbackResponse;

  } catch (error) {
    logger.error('Chat message handling failed', error, {
      user: message.author.username,
      messageLength: message.content.length,
      channel: message.channel.name
    });

    return '🤖 Oops! Something went wrong processing your message. Please try again.';
  }
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
