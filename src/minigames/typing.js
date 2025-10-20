const sessions = new Map();

export function startTypingGame(userId, durationSec = 5, sentence = null) {
  const sentencePool = ['quick brown fox', 'lorem ipsum dolor', 'hello world', 'discord bot game', 'type this fast'];
  const chosen = sentence || sentencePool[Math.floor(Math.random() * sentencePool.length)];
  const endAt = Date.now() + durationSec * 1000;
  sessions.set(userId, { sentence: chosen, endAt });
  return { sentence: chosen, endAt };
}

export function startTypingGameWithSentence(userId, sentence, durationSec = 6) {
  return startTypingGame(userId, durationSec, sentence);
}

export function checkTypingAttempt(userId, text) {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() > s.endAt) { sessions.delete(userId); return { ok: false, reason: 'timeout' }; }
  const success = text.trim().toLowerCase() === s.sentence.toLowerCase();
  sessions.delete(userId);
  return { ok: success, expected: s.sentence };
}
