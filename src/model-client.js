import 'dotenv/config';
import { getGuild } from './storage.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_LOCAL_URL = process.env.LOCAL_MODEL_URL;
const DEFAULT_LOCAL_API = process.env.LOCAL_MODEL_API || 'openai-compatible';
const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE;
const OPENWEBUI_PATH = process.env.OPENWEBUI_PATH || '/api/chat';

async function callLocalModel(prompt, url = DEFAULT_LOCAL_URL, api = DEFAULT_LOCAL_API) {
  if (!url) throw new Error('No local model URL configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
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
      return data.choices?.[0]?.message?.content ??
             data.result ??
             data.response ??
             'No response generated from local model';
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
      return data.response ?? data.output ?? data.result ?? 'No response from OpenWebUI';
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
    return data.result ?? data.output ?? data.response ?? data.text ?? 'No response from generic API';

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('Local model request timed out after 30 seconds');
    }

    console.error('Local model error:', err.message);
    throw new Error(`Local model connection failed: ${err.message}`);
  }
}

async function callOpenAI(messages) {
  if (!OPENAI_KEY) throw new Error('OpenAI API key not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
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
    return data.choices?.[0]?.message?.content?.trim() ?? 'No response generated';

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('OpenAI request timed out after 30 seconds');
    }

    console.error('OpenAI API error:', err.message);
    throw new Error(`OpenAI connection failed: ${err.message}`);
  }
}

export async function generate(guildId, prompt) {
  const guildCfg = guildId ? getGuild(guildId) : null;
  const url = guildCfg?.modelUrl || DEFAULT_LOCAL_URL;
  const api = guildCfg?.modelApi || DEFAULT_LOCAL_API;

  // Try local model first if configured
  if (url) {
    try {
      const response = await callLocalModel(prompt, url, api);
      if (response && response.length > 0) {
        console.log('Local model response generated successfully');
        return response;
      }
    } catch (err) {
      console.warn('Local model failed, trying OpenAI fallback:', err.message);
    }
  }

  // Try OpenAI if available
  if (OPENAI_KEY) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are ULTRA, an advanced AI Discord bot. Provide creative, engaging responses for RPG narration and storytelling. Keep responses under 500 characters.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await callOpenAI(messages);
      if (response && response.length > 0) {
        console.log('OpenAI response generated successfully');
        return response;
      }
    } catch (err) {
      console.error('OpenAI fallback failed:', err.message);
    }
  }

  // Enhanced fallback with creative responses
  const fallbackResponses = [
    "In the mystical realm, ancient forces stir as our hero approaches...",
    "The adventure continues with unexpected twists and hidden dangers...",
    "Legends speak of great treasures waiting for worthy champions...",
    "Dark magic swirls as the hero faces their greatest challenge yet...",
    "The gods watch as fate unfolds in this epic tale...",
    "Mysterious energies pulse through the air, revealing new possibilities..."
  ];

  const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  console.log('Using fallback response for RPG generation');
  return fallback;
}
