/**
 * Snake mini-game
 * @fileoverview Classic snake game implementation for Discord
 */

import { logger } from '../logger.js';
import { metrics } from '../utils/metrics.js';

const BOARD_SIZE = 10;
const DIRECTIONS = {
  '⬆️': { x: 0, y: -1 },
  '⬇️': { x: 0, y: 1 },
  '⬅️': { x: -1, y: 0 },
  '➡️': { x: 1, y: 0 }
};

/**
 * Active snake games
 */
const games = new Map();

/**
 * Snake game class
 */
class SnakeGame {
  constructor(userId) {
    this.userId = userId;
    this.snake = [{ x: 5, y: 5 }];
    this.direction = { x: 1, y: 0 };
    this.food = this.spawnFood();
    this.score = 0;
    this.gameOver = false;
    this.lastUpdate = Date.now();
  }

  /**
   * Spawns food at a random location
   */
  spawnFood() {
    let food;
    do {
      food = {
        x: Math.floor(Math.random() * BOARD_SIZE),
        y: Math.floor(Math.random() * BOARD_SIZE)
      };
    } while (this.snake.some(segment => segment.x === food.x && segment.y === food.y));
    
    return food;
  }

  /**
   * Updates the game state
   */
  update() {
    if (this.gameOver) return;

    const head = { ...this.snake[0] };
    head.x += this.direction.x;
    head.y += this.direction.y;

    // Check wall collision
    if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE) {
      this.gameOver = true;
      return;
    }

    // Check self collision
    if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
      this.gameOver = true;
      return;
    }

    this.snake.unshift(head);

    // Check food collision
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.food = this.spawnFood();
    } else {
      this.snake.pop();
    }

    this.lastUpdate = Date.now();
  }

  /**
   * Changes snake direction
   * @param {Object} newDirection - New direction
   */
  changeDirection(newDirection) {
    // Prevent reversing
    if (this.direction.x === -newDirection.x && this.direction.y === -newDirection.y) {
      return;
    }
    this.direction = newDirection;
  }

  /**
   * Renders the game board
   * @returns {string} Rendered board
   */
  render() {
    let board = '';
    
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const isSnake = this.snake.some(segment => segment.x === x && segment.y === y);
        const isHead = this.snake[0].x === x && this.snake[0].y === y;
        const isFood = this.food.x === x && this.food.y === y;

        if (isHead) {
          board += '🟢';
        } else if (isSnake) {
          board += '🟩';
        } else if (isFood) {
          board += '🍎';
        } else {
          board += '⬛';
        }
      }
      board += '\\n';
    }

    return board;
  }

  /**
   * Gets game status message
   * @returns {string} Status message
   */
  getStatus() {
    if (this.gameOver) {
      return \`Game Over! Final Score: \${this.score}\\nSnake Length: \${this.snake.length}\`;
    }
    return \`Score: \${this.score} | Length: \${this.snake.length}\\n\\nUse arrow buttons to move!\`;
  }
}

/**
 * Starts a new snake game
 * @param {string} userId - User ID
 * @returns {SnakeGame} New game instance
 */
export function startGame(userId) {
  if (games.has(userId)) {
    const existing = games.get(userId);
    if (!existing.gameOver) {
      throw new Error('You already have an active snake game!');
    }
  }

  const game = new SnakeGame(userId);
  games.set(userId, game);
  
  metrics.collector.increment('minigame_started', 1, { game: 'snake' });
  logger.info('Snake game started', { userId });
  
  return game;
}

/**
 * Gets a user's active game
 * @param {string} userId - User ID
 * @returns {SnakeGame|null} Game instance or null
 */
export function getGame(userId) {
  return games.get(userId) || null;
}

/**
 * Handles player move
 * @param {string} userId - User ID
 * @param {string} direction - Direction emoji
 * @returns {SnakeGame} Updated game instance
 */
export function move(userId, direction) {
  const game = games.get(userId);
  if (!game) {
    throw new Error('No active game found!');
  }

  if (game.gameOver) {
    throw new Error('Game is over! Start a new game with /snake');
  }

  const directionVector = DIRECTIONS[direction];
  if (directionVector) {
    game.changeDirection(directionVector);
  }

  game.update();

  if (game.gameOver) {
    metrics.collector.histogram('minigame_score', game.score, { game: 'snake' });
    logger.info('Snake game ended', { userId, score: game.score, length: game.snake.length });
  }

  return game;
}

/**
 * Ends a game
 * @param {string} userId - User ID
 */
export function endGame(userId) {
  games.delete(userId);
}

/**
 * Auto-updates all active games
 */
export function autoUpdateGames() {
  const now = Date.now();
  
  for (const [userId, game] of games.entries()) {
    // Auto-update if no input for 30 seconds
    if (now - game.lastUpdate > 30000 && !game.gameOver) {
      game.update();
    }
    
    // Clean up old games
    if (game.gameOver && now - game.lastUpdate > 300000) {
      games.delete(userId);
    }
  }
}

// Auto-update every 5 seconds
setInterval(autoUpdateGames, 5000);

export default { startGame, getGame, move, endGame };
