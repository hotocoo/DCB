/**
 * Interaction handlers module — delegates to domain-specific submodules.
 * 
 * Structure:
 * - wordle-data.js: Wordle word list (~600 words)
 * - interaction-router.js: Main router, rate limiting, circuit breaker, safe reply helpers
 * - button-handlers.js: All Discord button interactions (combat, explore, inventory, etc.)
 * - modal-handlers.js: All Discord modal submissions (guesses, trades, etc.)
 */

export { handleInteraction } from './interaction-router.js';
