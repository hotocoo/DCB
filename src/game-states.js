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
 * Cleanup expired game states. Games with no activity for >2 hours are removed.
 */
export function cleanupExpiredGameStates() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours

  const maps = [
    hangmanGames, wordleGames, guessGames, combatGames, explorationGames,
    connect4Games, triviaGames, tttGames, pollGames, memoryGames, typingAttempts,
  ];

  let cleaned = 0;
  for (const map of maps) {
    for (const [key, state] of map.entries()) {
      const lastActivity = state.lastActivity || state.createdAt || state.startTime || state.timestamp || 0;
      if (lastActivity > 0 && now - lastActivity > maxAge) {
        map.delete(key);
        cleaned++;
      }
    }
  }
  return cleaned;
}

// Auto-cleanup every 30 minutes. unref() so this doesn't block process exit in tests/scripts.
const gameStatesCleanupInterval = setInterval(cleanupExpiredGameStates, 30 * 60 * 1000);
if (typeof gameStatesCleanupInterval.unref === 'function') gameStatesCleanupInterval.unref();
