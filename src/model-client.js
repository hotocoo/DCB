/**
 * Model client for AI-powered content generation.
 * Supports local models and OpenAI API with fallback mechanisms.
 */

import 'dotenv/config';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { getGuild } from './storage.js';
import { logger } from './logger.js';

/**
 * Configuration constants for model clients.
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_LOCAL_URL = process.env.LOCAL_MODEL_URL;
const DEFAULT_LOCAL_API = process.env.LOCAL_MODEL_API || 'openai-compatible';
const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE;
const OPENWEBUI_PATH = process.env.OPENWEBUI_PATH || '/api/chat';

// Request limits and timeouts
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_LENGTH = 2000;

// Rate limiters for external API calls
const openAIRateLimiter = new RateLimiterMemory({
  keyPrefix: 'openai_api',
  points: 100, // 100 requests per hour
  duration: 3600,
});

const localModelRateLimiter = new RateLimiterMemory({
  keyPrefix: 'local_model_api',
  points: 500, // 500 requests per hour (higher for local)
  duration: 3600,
});

/**
 * Calls a local AI model with the given prompt.
 * @param {string} prompt - The prompt to send to the model
 * @param {string} url - The model API URL
 * @param {string} api - The API type ('openai-compatible', 'openwebui', or 'generic')
 * @returns {Promise<string>} The model's response
 */
async function callLocalModel(prompt, url = DEFAULT_LOCAL_URL, api = DEFAULT_LOCAL_API) {
  if (!url) {
    throw new Error('No local model URL configured');
  }

  // Rate limiting for local model API
  try {
    await localModelRateLimiter.consume('local_model_api');
  }
  catch (error) {
    const waitTime = Math.round(error.msBeforeNext / 1000);
    throw new Error(`Rate limit exceeded. Try again in ${waitTime} seconds.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    logger.debug('Calling local model', { url, api, promptLength: prompt.length });

    if (api === 'openai-compatible') {
      const response = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LOCAL_MODEL_TOKEN || 'not-needed'}`
        },
        body: JSON.stringify({
          model: process.env.LOCAL_MODEL_NAME || 'default-model',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 512,
          temperature: 0.7
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local model API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ??
                     data.result ??
                     data.response ??
                     'No response generated from local model';

      logger.debug('Local model response received', { contentLength: content.length });
      return content;
    }

    if (api === 'openwebui') {
      const base = OPENWEBUI_BASE || url;
      const endpoint = `${base.replace(/\/$/, '')}${OPENWEBUI_PATH}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenWebUI API error (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      const content = data.response ?? data.output ?? data.result ?? 'No response from OpenWebUI';
      logger.debug('OpenWebUI response received', { contentLength: content.length });
      return content;
    }

    // Generic endpoint fallback
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: 512,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Generic API error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    const content = data.result ?? data.output ?? data.response ?? data.text ?? 'No response from generic API';
    logger.debug('Generic API response received', { contentLength: content.length });
    return content;

  }
  catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`Local model request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }

    logger.error('Local model error', error);
    throw new Error(`Local model connection failed: ${error.message}`);
  }
}

/**
 * Calls OpenAI API with the given messages.
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} The AI response
 */
async function callOpenAI(messages) {
  if (!OPENAI_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Rate limiting for OpenAI API
  try {
    await openAIRateLimiter.consume('openai_api');
  }
  catch (error) {
    const waitTime = Math.round(error.msBeforeNext / 1000);
    throw new Error(`Rate limit exceeded. Try again in ${waitTime} seconds.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    logger.debug('Calling OpenAI API', { messageCount: messages.length });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 512,
        temperature: 0.8,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? 'No response generated';

    logger.debug('OpenAI response received', { contentLength: content.length });
    return content.slice(0, MAX_RESPONSE_LENGTH); // Limit response length

  }
  catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }

    logger.error('OpenAI API error', error);
    throw new Error(`OpenAI connection failed: ${error.message}`);
  }
}

/**
 * Generates AI content using available models with fallback mechanisms.
 * @param {string} guildId - Guild ID for configuration lookup
 * @param {string} prompt - The prompt to generate content for
 * @returns {Promise<string>} Generated content
 */
export async function generate(guildId, prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Invalid prompt provided');
  }

  const guildCfg = guildId ? getGuild(guildId) : null;
  const url = guildCfg?.modelUrl || DEFAULT_LOCAL_URL;
  const api = guildCfg?.modelApi || DEFAULT_LOCAL_API;

  logger.debug('Generating content', { guildId, promptLength: prompt.length, url, api });

  // Try local model first if configured
  if (url) {
    try {
      const response = await callLocalModel(prompt, url, api);
      if (response && response.length > 0) {
        logger.info('Local model response generated successfully');
        return response;
      }
    }
    catch (error) {
      logger.warn('Local model failed, trying OpenAI fallback', error);
    }
  }

  // Try OpenAI if available
  if (OPENAI_KEY) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are Pulse, an advanced AI Discord bot. Provide creative, engaging responses for RPG narration and storytelling. Keep responses under 500 characters.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await callOpenAI(messages);
      if (response && response.length > 0) {
        logger.info('OpenAI response generated successfully');
        return response;
      }
    }
    catch (error) {
      logger.error('OpenAI fallback failed', error);
    }
  }

  // Enhanced fallback with creative responses
  const fallbackResponses = [
    'In the mystical realm, ancient forces stir as our hero approaches...',
    'The adventure continues with unexpected twists and hidden dangers...',
    'Legends speak of great treasures waiting for worthy champions...',
    'Dark magic swirls as the hero faces their greatest challenge yet...',
    'The gods watch as fate unfolds in this epic tale...',
    'Mysterious energies pulse through the air, revealing new possibilities...'
  ];

  const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  logger.info('Using fallback response for content generation');
  return fallback;
}
