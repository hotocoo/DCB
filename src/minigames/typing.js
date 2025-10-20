const sessions = new Map();

export function startTypingGame(userId, durationSec = 5) {
  const sentence = ['quick brown fox', 'lorem ipsum dolor', 'hello world', 'discord bot game', 'type this fast'][Math.floor(Math.random() * 5)];
  const endAt = Date.now() + durationSec * 1000;
  sessions.set(userId, { sentence, endAt });
  return { sentence, endAt };
}

export function checkTypingAttempt(userId, text) {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() > s.endAt) { sessions.delete(userId); return { ok: false, reason: 'timeout' }; }
  const success = text.trim().toLowerCase() === s.sentence.toLowerCase();
  sessions.delete(userId);
  return { ok: success, expected: s.sentence };
}
