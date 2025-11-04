console.log('Testing imports...');

// Test rateJoke from entertainment.js
try {
    const { rateJoke } = await import('../src/entertainment.js');
    console.log('rateJoke imported successfully');
} catch (e) {
    console.log('rateJoke import failed:', e.message || e);
}

// Test getPerformanceRating and sendMemoryBoard from memory.js
try {
    const { getPerformanceRating, sendMemoryBoard } = await import('../src/commands/memory.js');
    console.log('Memory functions imported successfully');
} catch (e) {
    console.log('Memory functions import failed:', e.message || e);
}

// Test makeConnect4Move and sendConnect4Board from connect4.js
try {
    const { makeConnect4Move, sendConnect4Board } = await import('../src/commands/connect4.js');
    console.log('Connect4 functions imported successfully');
} catch (e) {
    console.log('Connect4 functions import failed:', e.message || e);
}

// Test checkWinner, formatBoard, and getAIMove from tictactoe.js
try {
    const { checkWinner, formatBoard, getAIMove } = await import('../src/commands/tictactoe.js');
    console.log('TicTacToe functions imported successfully');
} catch (e) {
    console.log('TicTacToe functions import failed:', e.message || e);
}

// Test getInventoryValue from rpg.js
try {
    const { getInventoryValue } = await import('../src/rpg.js');
    console.log('getInventoryValue imported successfully');
} catch (e) {
    console.log('getInventoryValue import failed:', e.message || e);
}