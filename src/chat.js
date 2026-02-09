/**
 * Chat module for Pulse Bot.
 * Handles AI-powered conversations and direct message interactions with enhanced error handling and performance monitoring.
 *
 * @fileoverview Advanced chat system with multiple AI providers, conversation memory, and fallback mechanisms.
 * @author Pulse Bot Development Team
 * @version 3.0.1
 * @license MIT
 */

import 'dotenv/config';
import { getGuild } from './storage.js';
import { logger, logError } from './logger.js';
import { postJSON } from './utils/apiClient.js';
import { Cache } from './utils/cache.js';
import { config } from './utils/config.js';
import { metrics } from './utils/metrics.js';

/**
 * Configuration constants for chat functionality.
 */
const OPENAI_KEY = config.ai.openaiApiKey;
const LOCAL_MODEL_URL = config.ai.localModelUrl;
const LOCAL_MODEL_API = config.ai.localModelApi;
const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE;
const OPENWEBUI_PATH = process.env.OPENWEBUI_PATH || '/api/chat';

// Chat configuration with environment variable support
const DEFAULT_CHAT_COOLDOWN_MS = Number.parseInt(process.env.CHAT_COOLDOWN_MS || '2000', 10);
const DEFAULT_MAX_HISTORY = Number.parseInt(process.env.CHAT_MAX_HISTORY || '8', 10);
const MAX_RESPONSE_LENGTH = Number.parseInt(process.env.MAX_RESPONSE_LENGTH || '2000', 10);
const MAX_PROMPT_LENGTH = Number.parseInt(process.env.MAX_PROMPT_LENGTH || '1000', 10);
const AI_MAX_TOKENS = config.ai.maxTokens || 512;
const AI_TEMPERATURE = config.ai.temperature;

// Initialize response cache with 1 hour TTL
const responseCache = new Cache('chatResponses', {
  ttl: 3_600_000, // 1 hour
  maxSize: 500
});

// Performance limits
const MAX_CONVERSATION_MEMORY_MB = 50; // Limit memory usage
const CLEANUP_INTERVAL_MS = 300_000; // 5 minutes cleanup

/**
 * Calls a local AI model with enhanced error handling and timeout protection.
 * @param {string} prompt - The prompt to send to the model
 * @param {string} [url] - The model endpoint URL
 * @param {string} [api] - The API type ('openai-compatible', 'openwebui', etc.)
 * @returns {Promise<string|null>} The model response or null if failed
 */
async function callLocalModel(prompt, url = LOCAL_MODEL_URL, api = LOCAL_MODEL_API) {
  if (!url) {
    throw new Error('Local model URL not configured');
  }

  const startTime = Date.now();

  try {
    let endpoint, body, data;

    if (api === 'openai-compatible') {
      endpoint = `${url.replace(/\/$/, '')}/v1/chat/completions`;
      body = {
        model: 'gpt-oss-20b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: AI_MAX_TOKENS,
        temperature: AI_TEMPERATURE
      };

      data = await postJSON(endpoint, body, {
        headers: { 'User-Agent': 'Pulse-Bot/3.0.1' }
      }, {
        timeout: 30_000,
        retries: 2
      });

      const response = data.choices?.[0]?.message?.content ?? data.result ?? null;

      if (!response || typeof response !== 'string') {
        throw new Error('Invalid or empty response from local model');
      }

      metrics.recordAPICall('local_model', Date.now() - startTime, 200);
      return response.trim();
    }
    else if (api === 'openwebui') {
      const base = OPENWEBUI_BASE || url;
      if (!base) {
        throw new Error('OpenWebUI base URL not configured');
      }

      endpoint = `${base.replace(/\/$/, '')}${OPENWEBUI_PATH}`;
      body = { prompt };

      data = await postJSON(endpoint, body, {
        headers: { 'User-Agent': 'Pulse-Bot/3.0.1' }
      }, {
        timeout: 30_000,
        retries: 2
      });

      const response = data.response ?? data.output ?? data.result ?? null;

      if (!response || typeof response !== 'string') {
        throw new Error('Invalid or empty response from OpenWebUI');
      }

      metrics.recordAPICall('openwebui', Date.now() - startTime, 200);
      return response.trim();
    }
    else {
      // Generic endpoint fallback
      body = { prompt };

      data = await postJSON(url, body, {
        headers: { 'User-Agent': 'Pulse-Bot/3.0.1' }
      }, {
        timeout: 30_000,
        retries: 2
      });

      const response = data.result ?? data.output ?? null;

      if (!response || typeof response !== 'string') {
        throw new Error('Invalid or empty response from generic model');
      }

      metrics.recordAPICall('generic_model', Date.now() - startTime, 200);
      return response.trim();
    }
  }
  catch (error) {
    metrics.recordAPICall('local_model', Date.now() - startTime, 500);
    logger.error('Local model error', error instanceof Error ? error : new Error(String(error)));
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// In-memory storage for conversation history and cooldowns with memory management
const conversationMap = new Map();
const cooldownMap = new Map();

// Memory management - periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  // Clean up old cooldowns
  for (const [userId, timestamp] of cooldownMap.entries()) {
    if (now - timestamp > maxAge) {
      cooldownMap.delete(userId);
    }
  }

  // Clean up old conversations (keep recent ones)
  let totalMemory = 0;
  for (const [userId, history] of conversationMap.entries()) {
    // Estimate memory usage (rough calculation)
    const memoryEstimate = JSON.stringify(history).length * 2; // UTF-16 estimate
    totalMemory += memoryEstimate;

    // Remove old conversations if memory usage is too high
    if (totalMemory > MAX_CONVERSATION_MEMORY_MB * 1024 * 1024) {
      conversationMap.delete(userId);
    }
  }

  if (totalMemory > MAX_CONVERSATION_MEMORY_MB * 1024 * 1024 * 0.8) {
    logger.warn('High conversation memory usage detected', {
      totalMemoryMB: (totalMemory / (1024 * 1024)).toFixed(2),
      conversations: conversationMap.size,
      cooldowns: cooldownMap.size
    });
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Sends a prompt to OpenAI and returns the response with enhanced error handling.
 * @param {Array<{role: string, content: string}>|string} messages - Chat messages or single prompt string
 * @returns {Promise<string|null>} AI response or null if failed
 */
export async function respondWithOpenAI(messages) {
  if (!OPENAI_KEY) {
    throw new Error('OPENAI_API_KEY not set. Please configure your OpenAI API key in .env file.');
  }

  // Convert single prompt to messages format
  const messageArray = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }];

  logger.debug('Calling OpenAI API', { messageCount: messageArray.length });

  // Check cache first
  const cacheKey = `openai:${JSON.stringify(messageArray)}`;
  const cached = responseCache.get(cacheKey);
  if (cached) {
    logger.debug('OpenAI cache hit', { cacheKey: cacheKey.slice(0, 50) });
    metrics.recordCacheAccess('openai_responses', true);
    return cached;
  }
  metrics.recordCacheAccess('openai_responses', false);

  const startTime = Date.now();

  try {
    const requestBody = {
      model: config.ai.defaultModel || 'gpt-4o-mini',
      messages: messageArray,
      max_tokens: AI_MAX_TOKENS,
      temperature: AI_TEMPERATURE,
    };

    const data = await postJSON('https://api.openai.com/v1/chat/completions', requestBody, {
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'User-Agent': 'Pulse-Bot/3.0.1'
      }
    }, {
      timeout: 60_000,
      retries: 2
    });

    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    // Cache successful response
    responseCache.set(cacheKey, content, 1_800_000); // 30 minutes

    const duration = Date.now() - startTime;
    metrics.recordAPICall('openai', duration, 200);
    logger.debug('OpenAI response received', { contentLength: content.length, duration });

    return content;
  }
  catch (error) {
    const duration = Date.now() - startTime;
    metrics.recordAPICall('openai', duration, 500);
    logger.error('OpenAI API error', error instanceof Error ? error : new Error(String(error)));
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Handles incoming Discord messages for chat functionality.
 * @param {object} message - Discord message object
 * @returns {Promise<string|null>} Response message or null if no response needed
 */
export async function handleMessage(message) {
  const isDM = message.channel.type === 1 || message.channel?.type === 'DM';

  try {
    // Ignore bots and system messages
    if (message.author.bot || message.system) {
      return null;
    }

    // Only respond to DMs or mentions
    const isMention = message.mentions && message.mentions.has && message.mentions.has(message.client.user.id);
    if (!isDM && !isMention) {
      return null;
    }

    const raw = message.content.replaceAll(/<@!?.+?>/g, '').trim() || '';

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
    const COOLDOWN_MS = config.performance.cacheExpiry ? DEFAULT_CHAT_COOLDOWN_MS : Number(process.env.CHAT_COOLDOWN_MS || DEFAULT_CHAT_COOLDOWN_MS);
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
    history.push({ role: 'user', content: prompt.slice(0, Math.max(0, MAX_PROMPT_LENGTH)) });

    // Trim history to prevent memory issues
    const MAX_HISTORY = Number(process.env.CHAT_MAX_HISTORY || DEFAULT_MAX_HISTORY);
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    // Generate AI response with metrics tracking
    const chatStartTime = Date.now();
    const response = await generateChatResponse(prompt, message, history, {
      useLocalUrl,
      useLocalApi,
      isDM
    });
    metrics.collector.histogram('chat_response_time_ms', Date.now() - chatStartTime);

    // Update conversation history with response
    if (response) {
      history.push({ role: 'assistant', content: response.slice(0, Math.max(0, MAX_RESPONSE_LENGTH)) });
      conversationMap.set(message.author.id, history);
    }

    return response;

  }
  catch (error) {
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
    const aiStatus = OPENAI_KEY ? 'OpenAI ✓' : (LOCAL_MODEL_URL ? 'Local Model ✓' : 'Basic Chat ✓');

    return `🤖 **Bot Status:**\n• Servers: ${guilds}\n• Users: ${users}\n• AI: ${aiStatus}\n• Version: Pulse v3.0`;
  }

  if (lowerCommand === '!commands') {
    return '📚 **All Commands:**\n• `/help` - Dynamic help system\n• `/rpg` - RPG adventures\n• `/trivia` - Quiz games\n• `/music` - Music system\n• `/guild` - Guild management\n• `/trade` - Trading system\n• `/profile` - User profiles\n• `/achievements` - Achievement system\n• And many more! Use `/help` for details.';
  }

  // Check for playful prompts (8ball, rps, dice rolls, jokes)
  const playfulResponse = handlePlayfulPrompt(command, message);
  if (playfulResponse) {
    logger.debug('Playful prompt handled', { userId: message.author.id, command: command.slice(0, 50) });
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
  const contextPrompt = `You are Pulse, an advanced AI Discord bot with many features including RPG games, trivia, music, trading, and more. You have a friendly, helpful personality and love to engage users in conversation.

Current context:
- User: ${message.author.username}
- Channel: ${isDM ? 'Direct Message' : message.channel.name}
- Server: ${message.guild?.name || 'Direct Message'}
- Time: ${new Date().toLocaleString()}

Previous conversation:
${history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n')}

User's message: ${prompt}

Respond naturally and helpfully. If they're asking about bot features, mention relevant commands. Keep responses engaging but not too long.`;

  // Check cache for similar prompts
  const promptCacheKey = `prompt:${message.author.id}:${prompt.slice(0, 100)}`;
  const cachedPromptResponse = responseCache.get(promptCacheKey);
  if (cachedPromptResponse) {
    logger.debug('Using cached chat response', { userId: message.author.id });
    metrics.recordCacheAccess('chat_prompts', true);
    return cachedPromptResponse;
  }
  metrics.recordCacheAccess('chat_prompts', false);

  // Try local model first if configured
  if (useLocalUrl) {
    try {
      logger.debug('Attempting local model for chat', { userId: message.author.id });
      const response = await callLocalModel(contextPrompt, useLocalUrl, useLocalApi);
      if (response) {
        const cleanResponse = response.trim().slice(0, Math.max(0, MAX_RESPONSE_LENGTH));

        // Cache the response
        responseCache.set(promptCacheKey, cleanResponse, 600_000); // 10 minutes

        logger.info('Local model chat response generated', {
          userId: message.author.id,
          responseLength: cleanResponse.length,
          model: useLocalApi
        });
        return cleanResponse;
      }
    }
    catch (error) {
      logger.warn('Local model failed for chat, falling back to OpenAI', {
        error: error.message,
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
          content: 'You are Pulse, an advanced AI Discord bot with RPG games, trivia, music, trading, and many other features. Be friendly, helpful, and engaging. Keep responses under 2000 characters.'
        },
        ...history.map(h => ({ role: h.role, content: h.content }))
      ];

      const reply = await respondWithOpenAI(messages);
      if (reply) {
        const cleanReply = reply.trim().slice(0, Math.max(0, MAX_RESPONSE_LENGTH));

        // Cache the response
        responseCache.set(promptCacheKey, cleanReply, 600_000); // 10 minutes

        logger.info('OpenAI chat response generated', {
          userId: message.author.id,
          responseLength: cleanReply.length
        });
        return cleanReply;
      }
    }
    catch (error) {
      logger.error('OpenAI API failed for chat', error, {
        userId: message.author.id,
        promptLength: prompt.length
      });
    }
  }

  // Fallback responses
  const fallbackResponses = [
    `💭 I'm thinking... "${prompt}" is an interesting message! While my AI brain is loading, did you know you can use /rpg to start an adventure?`,
    `🤔 Processing your message: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}". My neural networks are warming up! Try /help to explore all features.`,
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
    return 'Wanna play? Try /rps <rock|paper|scissors>, /roll 2d6, or /8ball <question> — or DM me directly and say "roll 1d20" or "rps rock".';
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
  }
  else if (userChoice !== bot) {
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
    'Why did the developer go broke? Because he used up all his cache.'
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}
