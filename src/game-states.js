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
export const typingAttempts = new Map();