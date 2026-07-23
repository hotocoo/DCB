/* eslint-disable unicorn/no-process-exit, brace-style, max-statements */
// CLI import smoke-test. Exits with the verdict code; the cosmetic
// no-process-exit rule is for libraries, not for a one-shot script.
console.log('Testing imports...');

let failed = 0;

// Test rateJoke from entertainment.js
try {
  const { rateJoke } = await import('../src/entertainment.js');
  console.log('rateJoke imported successfully');
}
catch (error) {
  failed++;
  console.log('rateJoke import failed:', error.message || error);
}

// Test getPerformanceRating and sendMemoryBoard from memory.js
try {
  const { getPerformanceRating, sendMemoryBoard } = await import('../src/commands/memory.js');
  console.log('Memory functions imported successfully');
}
catch (error) {
  failed++;
  console.log('Memory functions import failed:', error.message || error);
}

// Test makeConnect4Move and sendConnect4Board from connect4.js
try {
  const { makeConnect4Move, sendConnect4Board } = await import('../src/commands/connect4.js');
  console.log('Connect4 functions imported successfully');
}
catch (error) {
  failed++;
  console.log('Connect4 functions import failed:', error.message || error);
}

// Test checkWinner, formatBoard, and getAIMove from tictactoe.js
try {
  const { checkWinner, formatBoard, getAIMove } = await import('../src/commands/tictactoe.js');
  console.log('TicTacToe functions imported successfully');
}
catch (error) {
  failed++;
  console.log('TicTacToe functions import failed:', error.message || error);
}

// Test getInventoryValue from rpg.js
try {
  const { getInventoryValue } = await import('../src/rpg.js');
  console.log('getInventoryValue imported successfully');
}
catch (error) {
  failed++;
  console.log('getInventoryValue import failed:', error.message || error);
}

// Always exit explicitly. Without this, the Node event loop stays alive
// after the imports complete (chat.js's setInterval timer, the stdio
// pipe handles, etc.) and the script hangs for ~60s before being
// killed by the test runner's timeout.
process.exit(failed > 0 ? 1 : 0);