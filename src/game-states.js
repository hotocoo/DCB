// Game state storage - shared between main bot and command files
// This breaks circular dependencies by providing a separate module

// Hangman game states: userId -> gameState
export const hangmanGames = new Map();

// Wordle game states: userId -> gameState
export const wordleGames = new Map();

// Guess game states: userId -> gameState
export const guessGames = new Map();

// Combat game states: userId -> gameState
export const combatGames = new Map();

// Exploration game states: userId -> gameState
export const explorationGames = new Map();

// Connect4 game states: gameId -> gameState
export const connect4Games = new Map();

// Typing game attempts for minigame
// Trivia game states: gameId -> gameState
export const triviaGames = new Map();

// Tic-Tac-Toe game states: gameId -> gameState
export const tttGames = new Map();

// Poll game states: messageId -> pollData
export const pollGames = new Map();

// Memory game states: messageId -> gameState
export const memoryGames = new Map();

// Typing game attempts for minigame
export const typingAttempts = new Map();

/**
 * Cleanup expired game states. Games with no activity past their timeout are removed.
 */
export function cleanupExpiredGameStates() {
  const now = Date.now();

  // Per-type timeouts (ms): interactive games expire faster than passive state
  const timeouts = {
    hangman: 30 * 60 * 1000,       // 30 min
    wordle: 30 * 60 * 1000,        // 30 min
    guess: 15 * 60 * 1000,         // 15 min
    combat: 20 * 60 * 1000,        // 20 min
    exploration: 15 * 60 * 1000,   // 15 min
    connect4: 30 * 60 * 1000,      // 30 min
    trivia: 10 * 60 * 1000,        // 10 min
    ttt: 15 * 60 * 1000,           // 15 min
    poll: 120 * 60 * 1000,         // 2 hours (polls are passive)
    memory: 15 * 60 * 1000,        // 15 min
    typing: 5 * 60 * 1000,         // 5 min
  };

  const maps = [
    { map: hangmanGames, type: 'hangman' }, { map: wordleGames, type: 'wordle' },
    { map: guessGames, type: 'guess' }, { map: combatGames, type: 'combat' },
    { map: explorationGames, type: 'exploration' }, { map: connect4Games, type: 'connect4' },
    { map: triviaGames, type: 'trivia' }, { map: tttGames, type: 'ttt' },
    { map: pollGames, type: 'poll' }, { map: memoryGames, type: 'memory' },
    { map: typingAttempts, type: 'typing' },
  ];

  let cleaned = 0;
  for (const { map, type } of maps) {
    const maxAge = timeouts[type] || 2 * 60 * 60 * 1000; // fallback 2h
    for (const [key, state] of map.entries()) {
      if (!state) {
        map.delete(key);
        cleaned++;
        continue;
      }
      const lastActivity = state.lastActivity || state.createdAt || state.startTime || state.timestamp || 0;
      if (lastActivity > 0 && now - lastActivity > maxAge) {
        map.delete(key);
        cleaned++;
      }
    }
  }
  return cleaned;
}

// Auto-cleanup every 5 minutes (more frequent for shorter timeouts). unref() so this doesn't block process exit in tests/scripts.
const gameStatesCleanupInterval = setInterval(cleanupExpiredGameStates, 5 * 60 * 1000);
if (typeof gameStatesCleanupInterval.unref === 'function') gameStatesCleanupInterval.unref();
