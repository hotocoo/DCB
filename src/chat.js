import 'dotenv/config';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL; // e.g. http://host.docker.internal:8000
const LOCAL_MODEL_API = process.env.LOCAL_MODEL_API || 'openai-compatible';

async function callLocalModel(prompt) {
  // Try to be compatible with OpenAI-like local endpoints
  try {
    if (LOCAL_MODEL_API === 'openai-compatible') {
      const res = await fetch(`${LOCAL_MODEL_URL.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-oss-20b', messages: [{ role: 'user', content: prompt }], max_tokens: 512 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? data.result ?? null;
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

  const prompt = message.content.replace(/<@!?.+?>/g, '').trim() || '';

  // Prefer local model if provided
  if (LOCAL_MODEL_URL) {
    try {
      const out = await callLocalModel(prompt || 'Hello');
      return out ?? "I couldn't generate a response from the local model.";
    } catch (err) {
      console.error('Local model failed, falling back', err);
    }
  }

  if (OPENAI_KEY) {
    try {
      const reply = await respondWithOpenAI(prompt || 'Hello');
      return reply ?? "I couldn't generate a response.";
    } catch (err) {
      console.error('OpenAI API error', err);
      return "Sorry, I couldn't reach the AI service.";
    }
  }

  // Fallback: simple echo + hint
  return `You said: ${prompt || message.content}`;
}
