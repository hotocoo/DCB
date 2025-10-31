/**
 * Chat module for Discord bot.
 * Handles AI-powered conversations and direct message interactions.
 */

import 'dotenv/config';
import { getGuild } from './storage.js';
import { logger } from './logger.js';

/**
 * Configuration constants for chat functionality.
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL;
const LOCAL_MODEL_API = process.env.LOCAL_MODEL_API || 'openai-compatible';
const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE;
const OPENWEBUI_PATH = process.env.OPENWEBUI_PATH || '/api/chat';

// Chat configuration
const DEFAULT_CHAT_COOLDOWN_MS = 2000;
const DEFAULT_MAX_HISTORY = 8;
const MAX_RESPONSE_LENGTH = 2000;
const MAX_PROMPT_LENGTH = 1000;

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

// In-memory storage for conversation history and cooldowns
const conversationMap = new Map();
const cooldownMap = new Map();

/**
 * Sends a prompt to OpenAI and returns the response.
 * @param {Array|string} messages - Chat messages or single prompt string
 * @returns {Promise<string|null>} AI response or null if failed
 */
export async function respondWithOpenAI(messages) {
  if (!OPENAI_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  // Convert single prompt to messages format
  const messageArray = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }];

  logger.debug('Calling OpenAI API', { messageCount: messageArray.length });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messageArray,
      max_tokens: 300,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  logger.debug('OpenAI response received', { contentLength: content?.length || 0 });
  return content || null;
}

/**
 * Handles incoming Discord messages for chat functionality.
 * @param {object} message - Discord message object
 * @returns {Promise<string|null>} Response message or null if no response needed
 */
export async function handleMessage(message) {
  try {
    // Ignore bots and system messages
    if (message.author.bot || message.system) {
      return null;
    }

    const isDM = message.channel.type === 1 || message.channel?.type === 'DM';

    // Only respond to DMs or mentions
    const isMention = message.mentions && message.mentions.has && message.mentions.has(message.client.user.id);
    if (!isDM && !isMention) {
      return null;
    }

    const raw = message.content.replace(/<@!?.+?>/g, '').trim() || '';

    logger.debug('Processing chat message', {
      userId: message.author.id,
      username: message.author.username,
      isDM,
      isMention,
      messageLength: message.content.length,
      processedLength: raw.length
    });

    // Handle special commands
    const commandResponse = handleSpecialCommands(raw, message);
    if (commandResponse) {
      return commandResponse;
    }

    const prompt = raw;

    // Check cooldown system
    const COOLDOWN_MS = Number(process.env.CHAT_COOLDOWN_MS || DEFAULT_CHAT_COOLDOWN_MS);
    const lastInteraction = cooldownMap.get(message.author.id) || 0;
    const now = Date.now();

    if (now - lastInteraction < COOLDOWN_MS) {
      logger.debug('Chat cooldown active', {
        userId: message.author.id,
        remainingMs: COOLDOWN_MS - (now - lastInteraction)
      });
      return null;
    }

    cooldownMap.set(message.author.id, now);

    // Get guild configuration
    const guildCfg = message.guild?.id ? getGuild(message.guild.id) : null;
    const useLocalUrl = guildCfg?.modelUrl || LOCAL_MODEL_URL;
    const useLocalApi = guildCfg?.modelApi || LOCAL_MODEL_API;
    const chatEnabled = guildCfg?.chatEnabled ?? true;

    if (message.guild?.id && !chatEnabled) {
      logger.debug('Chat disabled for guild', { guildId: message.guild.id });
      return null;
    }

    // Get and update conversation history
    let history = conversationMap.get(message.author.id) || [];
    history.push({ role: 'user', content: prompt.substring(0, MAX_PROMPT_LENGTH) });

    // Trim history to prevent memory issues
    const MAX_HISTORY = Number(process.env.CHAT_MAX_HISTORY || DEFAULT_MAX_HISTORY);
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    // Generate AI response
    const response = await generateChatResponse(prompt, message, history, {
      useLocalUrl,
      useLocalApi,
      isDM
    });

    // Update conversation history with response
    if (response) {
      history.push({ role: 'assistant', content: response.substring(0, MAX_RESPONSE_LENGTH) });
      conversationMap.set(message.author.id, history);
    }

    return response;

  } catch (error) {
    logger.error('Chat message handling failed', error, {
      userId: message.author.id,
      username: message.author.username,
      messageLength: message.content.length,
      channelName: message.channel.name,
      isDM
    });

    return '🤖 Oops! Something went wrong processing your message. Please try again.';
  }
}

/**
 * Handles special chat commands.
 * @param {string} command - The command text
 * @param {object} message - Discord message object
 * @returns {string|null} Command response or null if not a special command
 */
function handleSpecialCommands(command, message) {
  const lowerCommand = command.toLowerCase();

  if (lowerCommand === '!clear') {
    conversationMap.delete(message.author.id);
    logger.info('Conversation cleared', { userId: message.author.id });
    return '🧹 Conversation cleared! Starting fresh.';
  }

  if (lowerCommand === '!help') {
    return '🤖 **Available Commands:**\n• `!clear` - Clear conversation history\n• `!status` - Check bot status\n• `!commands` - List all commands\n• Just chat normally for AI responses!';
  }

  if (lowerCommand === '!status') {
    const guilds = message.client.guilds.cache.size;
    const users = message.client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
    const aiStatus = OPENAI_KEY ? 'OpenAI ✓' : LOCAL_MODEL_URL ? 'Local Model ✓' : 'Basic Chat ✓';

    return `🤖 **Bot Status:**\n• Servers: ${guilds}\n• Users: ${users}\n• AI: ${aiStatus}\n• Version: ULTRA v3.0`;
  }

  if (lowerCommand === '!commands') {
    return '📚 **All Commands:**\n• `/help` - Dynamic help system\n• `/rpg` - RPG adventures\n• `/trivia` - Quiz games\n• `/music` - Music system\n• `/guild` - Guild management\n• `/trade` - Trading system\n• `/profile` - User profiles\n• `/achievements` - Achievement system\n• And many more! Use `/help` for details.';
  }

  // Check for playful prompts (8ball, rps, dice rolls, jokes)
  const playfulResponse = handlePlayfulPrompt(command, message);
  if (playfulResponse) {
    logger.debug('Playful prompt handled', { userId: message.author.id, command: command.substring(0, 50) });
    return playfulResponse;
  }

  return null;
}

/**
 * Generates a chat response using available AI models.
 * @param {string} prompt - User prompt
 * @param {object} message - Discord message object
 * @param {Array} history - Conversation history
 * @param {object} options - Configuration options
 * @returns {Promise<string|null>} AI response or null
 */
async function generateChatResponse(prompt, message, history, options) {
  const { useLocalUrl, useLocalApi, isDM } = options;

  // Build enhanced context prompt
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
      logger.debug('Attempting local model for chat', { userId: message.author.id });
      const response = await callLocalModel(contextPrompt, useLocalUrl, useLocalApi);
      if (response) {
        const cleanResponse = response.trim().substring(0, MAX_RESPONSE_LENGTH);
        logger.info('Local model chat response generated', {
          userId: message.author.id,
          responseLength: cleanResponse.length,
          model: useLocalApi
        });
        return cleanResponse;
      }
    } catch (err) {
      logger.warn('Local model failed for chat, falling back to OpenAI', {
        error: err.message,
        userId: message.author.id
      });
    }
  }

  // Try OpenAI if available
  if (OPENAI_KEY) {
    try {
      logger.debug('Attempting OpenAI for chat', { userId: message.author.id });
      const messages = [
        {
          role: 'system',
          content: 'You are ULTRA, an advanced AI Discord bot with RPG games, trivia, music, trading, and many other features. Be friendly, helpful, and engaging. Keep responses under 2000 characters.'
        },
        ...history.map(h => ({ role: h.role, content: h.content }))
      ];

      const reply = await respondWithOpenAI(messages);
      if (reply) {
        const cleanReply = reply.trim().substring(0, MAX_RESPONSE_LENGTH);
        logger.info('OpenAI chat response generated', {
          userId: message.author.id,
          responseLength: cleanReply.length
        });
        return cleanReply;
      }
    } catch (err) {
      logger.error('OpenAI API failed for chat', err, {
        userId: message.author.id,
        promptLength: prompt.length
      });
    }
  }

  // Fallback responses
  const fallbackResponses = [
    `💭 I'm thinking... "${prompt}" is an interesting message! While my AI brain is loading, did you know you can use /rpg to start an adventure?`,
    `🤔 Processing your message: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}". My neural networks are warming up! Try /help to explore all features.`,
    `🧠 Analyzing: "${prompt}". I'm getting smarter every day! Meanwhile, you can play /trivia or start an RPG adventure with /rpg.`,
    `⚡ "${prompt}" - fascinating input! While I'm connecting to my AI core, why not try /music to play some tunes?`
  ];

  const fallbackResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  logger.debug('Using fallback chat response', { userId: message.author.id });
  return fallbackResponse;
}

/**
 * Handles playful prompts and mini-games in chat.
 * @param {string} text - User input text
 * @param {object} message - Discord message object
 * @returns {string|null} Response or null if not a playful prompt
 */
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
    return playRPS(userChoice, message.author.username);
  }

  // roll: 'roll 2d6' or '2d6' or 'roll d20'
  const rollMatch = lower.match(/(\d+)?d(\d+)/);
  if (rollMatch) {
    const n = Number(rollMatch[1] || 1);
    const sides = Number(rollMatch[2]);
    return rollDice(n, sides, message.author.username);
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

/**
 * Generates a Magic 8-Ball response.
 * @returns {string} 8-ball answer
 */
function eightBallReply() {
  const answers = [
    'It is certain.', 'Without a doubt.', 'You may rely on it.', 'Ask again later.',
    'Better not tell you now.', 'My reply is no.', 'Very doubtful.'
  ];
  return answers[Math.floor(Math.random() * answers.length)];
}

/**
 * Plays Rock-Paper-Scissors.
 * @param {string} userChoice - User's choice (rock/paper/scissors)
 * @param {string} username - User's name for response
 * @returns {string} Game result
 */
function playRPS(userChoice, username) {
  const choices = ['rock', 'paper', 'scissors'];
  const bot = choices[Math.floor(Math.random() * 3)];
  let result = 'tie';

  if ((userChoice === 'rock' && bot === 'scissors') ||
      (userChoice === 'paper' && bot === 'rock') ||
      (userChoice === 'scissors' && bot === 'paper')) {
    result = 'you win';
  } else if (userChoice !== bot) {
    result = 'you lose';
  }

  return `${username} chose ${userChoice}, I chose ${bot} — ${result}!`;
}

/**
 * Rolls dice and returns the result.
 * @param {number} n - Number of dice
 * @param {number} sides - Number of sides per die
 * @param {string} username - User's name for response
 * @returns {string} Dice roll result
 */
function rollDice(n, sides, username) {
  const maxDice = 100; // Prevent abuse
  const actualDice = Math.min(maxDice, Math.max(1, n));
  const rolls = Array.from({ length: actualDice }, () => 1 + Math.floor(Math.random() * sides));
  const sum = rolls.reduce((a, b) => a + b, 0);

  return `${username} rolled ${actualDice}d${sides}: [${rolls.join(', ')}] = ${sum}`;
}

/**
 * Returns a random joke.
 * @returns {string} A random joke
 */
function randomJoke() {
  const jokes = [
    "I told my computer I needed a break, and it said: 'No problem — I'll go to sleep.'",
    'Why do programmers prefer dark mode? Because light attracts bugs!',
    "Why did the developer go broke? Because he used up all his cache."
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}
